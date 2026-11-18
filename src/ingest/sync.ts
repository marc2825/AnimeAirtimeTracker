/**
 * Ingest orchestration: plan → fetch → parse/validate → normalize → import → record coverage.
 * One ImportRun per CLI invocation; raw bodies and every HTTP attempt are persisted for audit/replay.
 */
import { gzipSync } from "node:zlib";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { TRACKED_CHANNELS } from "@/domain/coverage";

import { addStats, emptyBroadcastStats, ensureTitleStubs, importBroadcasts, upsertTitles, upsertTrackedChannels, type BroadcastImportStats } from "./importer";
import type { OverridesFile } from "./overrides";
import { chunk, halveWindow, splitRange, toLastUpdateSinceParam, toRangeParam, windowDurationMs, type TimeWindow } from "./plan";
import { SyoboiClient, type FetchAttemptLog, type ResponseCache, type SyoboiClientOptions } from "./syoboi/client";
import { NormalizeError, extractSlotLabels, normalizeProgram, normalizeTitle, sha256, SOURCE_SYOBOI, type NormalizedBroadcast } from "./syoboi/normalize";
import { PROG_LOOKUP_ROW_CAP, parseChGroupLookup, parseChLookup, parseProgLookup, parseTitleLookup, type Rejected, type SyoboiProgram } from "./syoboi/parse";

export const TITLE_FIELDS =
  "TID,LastUpdate,Title,ShortTitle,TitleYomi,TitleEN,Comment,Cat,TitleFlag,FirstYear,FirstMonth,FirstEndYear,FirstEndMonth,FirstCh";
const PROGRAM_FIELDS = "LastUpdate,PID,TID,StTime,StOffset,EdTime,Count,SubTitle,ProgComment,Flag,Deleted,Warn,ChID,Revision";
const MIN_SPLIT_WINDOW_MS = 6 * 60 * 60 * 1000;
export const CURSOR_PROGRAMS = "syoboi:programs:lastUpdate";
export const CURSOR_TITLES = "syoboi:titles:lastUpdate";

export interface IngestContext {
  prisma: PrismaClient;
  client: SyoboiClient;
  overrides: OverridesFile;
  importRunId: number;
  now: () => Date;
  log: (message: string) => void;
}

export interface RangeSyncStats extends BroadcastImportStats {
  windows: number;
  rejectedRows: number;
  normalizeErrors: number;
  titlesFetched: number;
  titleStubs: number;
}

/** In-process cache honouring Cache-Control max-age (avoids re-requesting identical URLs within one run). */
export class MemoryResponseCache implements ResponseCache {
  private readonly entries = new Map<string, { body: string; expiresAt: number }>();
  async get(url: string, now: Date): Promise<string | null> {
    const entry = this.entries.get(url);
    return entry && entry.expiresAt > now.getTime() ? entry.body : null;
  }
  async set(url: string, body: string, maxAgeSeconds: number, now: Date): Promise<void> {
    this.entries.set(url, { body, expiresAt: now.getTime() + maxAgeSeconds * 1000 });
  }
}

/** Persist each HTTP attempt (FetchLog) and each distinct response body (RawPayload, gzip). */
export function createAttemptRecorder(prisma: PrismaClient, importRunId: number) {
  return async (attempt: FetchAttemptLog) => {
    let payloadHash: string | null = null;
    if (attempt.body !== null) {
      payloadHash = sha256(attempt.body);
      const compressed = gzipSync(Buffer.from(attempt.body, "utf8"));
      await prisma.rawPayload.upsert({
        where: { hash: payloadHash },
        create: { hash: payloadHash, contentType: "text/xml", bytes: Buffer.byteLength(attempt.body), body: new Uint8Array(compressed) },
        update: {}
      });
    }
    const resultCode = attempt.body ? Number(/<Code>(\d+)<\/Code>/.exec(attempt.body)?.[1] ?? Number.NaN) : Number.NaN;
    const rowCount = attempt.body ? (attempt.body.match(/<(?:ProgItem|TitleItem|ChItem|ChGroupItem)[\s>]/g)?.length ?? 0) : null;
    await prisma.fetchLog.create({
      data: {
        importRunId,
        requestKey: attempt.requestKey,
        url: attempt.url,
        attempt: attempt.attempt,
        httpStatus: attempt.httpStatus,
        resultCode: Number.isFinite(resultCode) ? resultCode : null,
        rowCount,
        durationMs: attempt.durationMs,
        bytes: attempt.bytes,
        payloadHash,
        fromCache: attempt.fromCache,
        error: attempt.error
      }
    });
    if (!attempt.fromCache) {
      await prisma.importRun.update({ where: { id: importRunId }, data: { requestCount: { increment: 1 } } });
    }
  };
}

export function createRecordingClient(prisma: PrismaClient, importRunId: number, options: Omit<SyoboiClientOptions, "onAttempt" | "cache">): SyoboiClient {
  return new SyoboiClient({ ...options, cache: new MemoryResponseCache(), onAttempt: createAttemptRecorder(prisma, importRunId) });
}

/** Run `work` inside an ImportRun row, recording status/stats/errors. */
export async function withImportRun<T extends object>(
  prisma: PrismaClient,
  command: string,
  params: Record<string, unknown>,
  work: (importRunId: number) => Promise<{ stats: T; status?: "SUCCEEDED" | "PARTIAL"; range?: TimeWindow }>
): Promise<{ importRunId: number; stats: T }> {
  const run = await prisma.importRun.create({ data: { command, params: params as Prisma.InputJsonValue } });
  try {
    const result = await work(run.id);
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: result.status ?? "SUCCEEDED",
        finishedAt: new Date(),
        stats: result.stats as unknown as Prisma.InputJsonValue,
        rangeStart: result.range?.start,
        rangeEnd: result.range?.end
      }
    });
    return { importRunId: run.id, stats: result.stats };
  } catch (error) {
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
    });
    throw error;
  }
}

export async function syncChannels(ctx: IngestContext): Promise<{ upserted: number; missingInSource: number[] }> {
  const channelsXml = await ctx.client.get({ Command: "ChLookup" }, "ChLookup");
  const groupsXml = await ctx.client.get({ Command: "ChGroupLookup" }, "ChGroupLookup");
  const channels = parseChLookup(channelsXml);
  const groups = parseChGroupLookup(groupsXml);
  const result = await upsertTrackedChannels(ctx.prisma, channels.items, groups.items);
  if (result.missingInSource.length > 0) {
    ctx.log(`warning: tracked ChIDs not found in source: ${result.missingInSource.join(", ")}`);
  }
  return result;
}

interface FetchedWindow {
  window: TimeWindow;
  programs: SyoboiProgram[];
  rejected: Rejected[];
}

/** Fetch one window; if the response hits the 5,000-row cap, split it and refetch the halves. */
export async function fetchProgramWindow(ctx: Pick<IngestContext, "client" | "log">, window: TimeWindow, channelIds: string[]): Promise<FetchedWindow[]> {
  const range = toRangeParam(window);
  const xml = await ctx.client.get(
    { Command: "ProgLookup", ChID: channelIds.join(","), Range: range, Fields: PROGRAM_FIELDS },
    `ProgLookup:Range=${range}:ChID=${channelIds.join(",")}`
  );
  const parsed = parseProgLookup(xml);
  if (parsed.rowCount >= PROG_LOOKUP_ROW_CAP) {
    if (windowDurationMs(window) <= MIN_SPLIT_WINDOW_MS) {
      throw new Error(`ProgLookup still truncated at ${PROG_LOOKUP_ROW_CAP} rows for ${range}; refusing to treat as complete`);
    }
    ctx.log(`window ${range} hit the ${PROG_LOOKUP_ROW_CAP}-row cap; splitting`);
    const [first, second] = halveWindow(window);
    return [...(await fetchProgramWindow(ctx, first, channelIds)), ...(await fetchProgramWindow(ctx, second, channelIds))];
  }
  return [{ window, programs: parsed.items, rejected: parsed.rejected }];
}

/** Fetch and upsert title details for the given TIDs (100 per request, the documented maximum). */
export async function fetchTitles(ctx: IngestContext, tids: string[]): Promise<{ fetched: number; stubs: number }> {
  let fetched = 0;
  const returned = new Set<string>();
  for (const batch of chunk(tids, 100)) {
    const xml = await ctx.client.get({ Command: "TitleLookup", TID: batch.join(","), Fields: TITLE_FIELDS }, `TitleLookup:TID=${batch[0]}..${batch.at(-1)}(${batch.length})`);
    const parsed = parseTitleLookup(xml);
    const normalized = parsed.items.map(normalizeTitle);
    const evidence = new Map(parsed.items.map((item) => [item.TID, extractSlotLabels(item.Comment)]));
    await upsertTitles(ctx.prisma, normalized, ctx.overrides, ctx.now(), evidence);
    for (const title of normalized) returned.add(title.externalId);
    fetched += normalized.length;
    if (parsed.rejected.length > 0) ctx.log(`warning: ${parsed.rejected.length} title rows rejected: ${parsed.rejected[0]?.reason}`);
  }
  const missing = tids.filter((tid) => !returned.has(tid));
  const stubs = await ensureTitleStubs(ctx.prisma, missing);
  return { fetched, stubs };
}

function normalizeAll(programs: SyoboiProgram[], log: (message: string) => void): { broadcasts: NormalizedBroadcast[]; errors: number } {
  const broadcasts: NormalizedBroadcast[] = [];
  let errors = 0;
  for (const program of programs) {
    try {
      broadcasts.push(normalizeProgram(program));
    } catch (error) {
      if (error instanceof NormalizeError || error instanceof RangeError) {
        errors += 1;
        log(`warning: ${error.message}`);
        continue;
      }
      throw error;
    }
  }
  return { broadcasts, errors };
}

async function titlesNeedingDetails(prisma: PrismaClient, tids: string[]): Promise<string[]> {
  const known = await prisma.title.findMany({
    where: { source: SOURCE_SYOBOI, externalId: { in: tids }, detailsFetchedAt: { not: null } },
    select: { externalId: true }
  });
  const knownSet = new Set(known.map((row) => row.externalId));
  return tids.filter((tid) => !knownSet.has(tid));
}

/**
 * Complete (backfill-style) sync of a time range for all tracked channels.
 * All windows are fetched first so unseen titles can be looked up in batches of 100 (fewer requests);
 * then each window is imported in its own transaction and recorded as a CoverageWindow.
 * An interrupted run keeps every window that already committed and can simply be re-run.
 */
export async function syncRange(ctx: IngestContext, range: TimeWindow, options: { maxWindowDays?: number } = {}): Promise<RangeSyncStats> {
  const channelIds = TRACKED_CHANNELS.map((channel) => String(channel.syoboiId));
  const stats: RangeSyncStats = { ...emptyBroadcastStats(), windows: 0, rejectedRows: 0, normalizeErrors: 0, titlesFetched: 0, titleStubs: 0 };

  const fetchedWindows: (FetchedWindow & { broadcasts: NormalizedBroadcast[]; errors: number })[] = [];
  for (const planned of splitRange(range, options.maxWindowDays ?? 7)) {
    for (const fetched of await fetchProgramWindow(ctx, planned, channelIds)) {
      const { broadcasts, errors } = normalizeAll(fetched.programs, ctx.log);
      fetchedWindows.push({ ...fetched, broadcasts, errors });
    }
  }

  const tids = [...new Set(fetchedWindows.flatMap((w) => w.broadcasts.map((b) => b.titleExternalId)))];
  const needDetails = await titlesNeedingDetails(ctx.prisma, tids);
  if (needDetails.length > 0) {
    const titleResult = await fetchTitles(ctx, needDetails);
    stats.titlesFetched += titleResult.fetched;
    stats.titleStubs += titleResult.stubs;
  }

  for (const fetched of fetchedWindows) {
    stats.windows += 1;
    stats.rejectedRows += fetched.rejected.length;
    stats.normalizeErrors += fetched.errors;
    // Rows that failed validation make the window incomplete for absence inference.
    const complete = fetched.rejected.length === 0 && fetched.errors === 0;
    const result = await importBroadcasts(ctx.prisma, fetched.broadcasts, {
      importRunId: ctx.importRunId,
      overrides: ctx.overrides,
      now: ctx.now(),
      completeWindow: complete ? { window: fetched.window, channelExternalIds: channelIds } : undefined
    });
    addStats(stats, { ...result, windows: 0, rejectedRows: 0, normalizeErrors: 0, titlesFetched: 0, titleStubs: 0 });
    if (complete) {
      await ctx.prisma.coverageWindow.create({
        data: { source: SOURCE_SYOBOI, rangeStart: fetched.window.start, rangeEnd: fetched.window.end, channelIds, rowCount: fetched.programs.length, importRunId: ctx.importRunId }
      });
    }
    ctx.log(
      `window ${toRangeParam(fetched.window)}: rows=${fetched.programs.length} created=${result.created} updated=${result.updated} unchanged=${result.unchanged} missing=${result.markedMissing}`
    );
  }
  return stats;
}

export interface UpdateSyncStats extends BroadcastImportStats {
  programRequests: number;
  titlesChanged: number;
  titlesFetched: number;
}

/**
 * Incremental sync using db.php LastUpdate filters (the source's recommended diff mechanism).
 * Partial by nature: absence is never inferred here.
 */
export async function syncUpdates(ctx: IngestContext, since: Date, until: Date): Promise<UpdateSyncStats> {
  const channelIds = TRACKED_CHANNELS.map((channel) => String(channel.syoboiId));
  const stats: UpdateSyncStats = { ...emptyBroadcastStats(), programRequests: 0, titlesChanged: 0, titlesFetched: 0 };

  const programs: SyoboiProgram[] = [];
  const pending: TimeWindow[] = [{ start: since, end: until }];
  while (pending.length > 0) {
    const window = pending.shift()!;
    const lastUpdate = toLastUpdateSinceParam(window.start, window.end);
    const xml = await ctx.client.get({ Command: "ProgLookup", ChID: channelIds.join(","), LastUpdate: lastUpdate, Fields: PROGRAM_FIELDS }, `ProgLookup:LastUpdate=${lastUpdate}`);
    stats.programRequests += 1;
    const parsed = parseProgLookup(xml);
    if (parsed.rowCount >= PROG_LOOKUP_ROW_CAP) {
      if (windowDurationMs(window) <= 60 * 60 * 1000) throw new Error(`LastUpdate window ${lastUpdate} still truncated`);
      pending.unshift(...halveWindow(window));
      continue;
    }
    programs.push(...parsed.items);
  }
  const { broadcasts } = normalizeAll(programs, ctx.log);
  const programTids = [...new Set(broadcasts.map((broadcast) => broadcast.titleExternalId))];

  // Titles updated in the source since the cursor, restricted to titles we already track.
  const changedXml = await ctx.client.get({ Command: "TitleLookup", TID: "*", LastUpdate: toLastUpdateSinceParam(since, until) }, "TitleLookup:changed");
  const changed = parseTitleLookup(changedXml).items.map((item) => item.TID);
  const trackedChanged = (await ctx.prisma.title.findMany({ where: { source: SOURCE_SYOBOI, externalId: { in: changed } }, select: { externalId: true } })).map((row) => row.externalId);
  stats.titlesChanged = trackedChanged.length;

  const toFetch = [...new Set([...(await titlesNeedingDetails(ctx.prisma, programTids)), ...trackedChanged])];
  if (toFetch.length > 0) {
    stats.titlesFetched = (await fetchTitles(ctx, toFetch)).fetched;
  }
  const result = await importBroadcasts(ctx.prisma, broadcasts, { importRunId: ctx.importRunId, overrides: ctx.overrides, now: ctx.now() });
  addStats(stats, { ...result, programRequests: 0, titlesChanged: 0, titlesFetched: 0 });
  return stats;
}

export async function readCursor(prisma: PrismaClient, key: string): Promise<Date | null> {
  const row = await prisma.syncCursor.findUnique({ where: { key } });
  return row ? new Date(row.value) : null;
}

export async function writeCursor(prisma: PrismaClient, key: string, value: Date): Promise<void> {
  await prisma.syncCursor.upsert({ where: { key }, create: { key, value: value.toISOString() }, update: { value: value.toISOString() } });
}

/**
 * Ingest CLI. Talks to Syoboi Calendar only through src/ingest (rate-limited, logged).
 *
 *   npm run ingest -- channels                         # refresh tracked channel metadata (2 requests)
 *   npm run ingest -- season [--season 2026-autumn]    # complete sync of one season (default: current)
 *   npm run ingest -- backfill --from 2024-winter --to 2026-summer
 *   npm run ingest -- recent                           # re-sync anime days today-7 … today+14
 *   npm run ingest -- update                           # incremental via LastUpdate since the last cursor
 *   npm run ingest -- subtitles                        # read episode subtitle lists of titles that lack them
 *   npm run ingest -- derive                           # recompute slots from stored data (no network)
 *   npm run ingest -- status                           # print recent import runs (no network)
 *   npm run ingest -- reparse-titles                   # re-read stored title details for studios/publishers, then derive (no network)
 *
 * `update` and `recent` also run one `subtitles` step (SUBTITLE_BACKFILL_PER_RUN titles, default 500, 0 = off)
 * until every title has its subtitle list; newly seen and changed titles get theirs with their details.
 *
 * Options: --dry-run (print the plan, no requests), --window-days N (default 7)
 * Docs: docs/data-pipeline.md
 */
import { existsSync } from "node:fs";

import pg from "pg";

import { currentSeason, formatSeason, parseSeasonId, seasonInstantRange, seasonsBetween, type Season } from "@/domain/season";
import { animeDayRange, currentAnimeDate, addDays, formatJstDateTime } from "@/domain/time";
import { deriveAll } from "@/ingest/derive";
import { reparseTitleCredits } from "@/ingest/reparse";
import { loadOverrides } from "@/ingest/overrides";
import { splitRange, toRangeParam, type TimeWindow } from "@/ingest/plan";
import { assertValidUserAgent } from "@/ingest/syoboi/client";
import {
  CURSOR_PROGRAMS,
  SUBTITLE_BACKFILL_PER_RUN,
  backfillSubtitles,
  createRecordingClient,
  readCursor,
  syncChannels,
  syncRange,
  syncUpdates,
  withImportRun,
  writeCursor,
  type IngestContext
} from "@/ingest/sync";
import { createPrismaClient, normalizeSslMode } from "@/server/prisma";

if (existsSync(".env")) process.loadEnvFile(".env");

const LOCK_KEY = 727_001; // pg advisory lock id for the ingest job
const CURSOR_SAFETY_MARGIN_MS = 15 * 60 * 1000;

function parseArgs(argv: string[]) {
  const [command = "help", ...rest] = argv;
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (!token.startsWith("--")) continue;
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(token.slice(2), next);
      index += 1;
    } else {
      flags.set(token.slice(2), "true");
    }
  }
  return { command, flags };
}

function requireSeason(value: string | undefined, fallback: Season): Season {
  if (!value) return fallback;
  const season = parseSeasonId(value);
  if (!season) throw new Error(`Invalid season id "${value}" (expected e.g. 2026-autumn)`);
  return season;
}

function printPlan(ranges: TimeWindow[], windowDays: number) {
  let requests = 0;
  for (const range of ranges) {
    for (const window of splitRange(range, windowDays)) {
      requests += 1;
      console.log(`  ProgLookup Range=${toRangeParam(window)}`);
    }
  }
  console.log(`Planned ≥${requests} ProgLookup requests (+ TitleLookup for unseen titles, 100 TIDs each).`);
}

async function withLock<T>(work: () => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: normalizeSslMode(process.env.DATABASE_URL ?? "") });
  await client.connect();
  try {
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
    if (!result.rows[0]?.locked) {
      throw new Error("Another ingest run holds the lock; refusing to overlap runs.");
    }
    return await work();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const windowDays = Number(flags.get("window-days") ?? 7);
  const dryRun = flags.get("dry-run") === "true";
  const log = (message: string) => console.log(`[${formatJstDateTime(new Date())}] ${message}`);

  if (command === "help") {
    console.log("Commands: channels | season | backfill | recent | update | derive | reparse-titles | status. See scripts/ingest.ts header.");
    return;
  }

  const ranges: { label: string; range: TimeWindow }[] = [];
  if (command === "season") {
    const season = requireSeason(flags.get("season"), currentSeason());
    ranges.push({ label: formatSeason(season), range: seasonInstantRange(season) });
  } else if (command === "backfill") {
    const from = requireSeason(flags.get("from"), currentSeason());
    const to = requireSeason(flags.get("to"), currentSeason());
    for (const season of seasonsBetween(from, to)) ranges.push({ label: formatSeason(season), range: seasonInstantRange(season) });
  } else if (command === "recent") {
    const today = currentAnimeDate();
    ranges.push({ label: "recent", range: { start: animeDayRange(addDays(today, -7)).start, end: animeDayRange(addDays(today, 14)).end } });
  }

  if (dryRun) {
    if (ranges.length === 0) throw new Error("--dry-run is supported for season, backfill and recent");
    printPlan(ranges.map((entry) => entry.range), windowDays);
    return;
  }

  const prisma = createPrismaClient();
  try {
    if (command === "status") {
      const runs = await prisma.importRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 });
      for (const run of runs) {
        console.log(`#${run.id} ${run.command.padEnd(9)} ${run.status.padEnd(9)} ${formatJstDateTime(run.startedAt)} requests=${run.requestCount} ${run.error ?? ""}`);
      }
      return;
    }
    if (command === "derive") {
      await withLock(async () => {
        // Asked for by hand: rebuild even when the inputs look unchanged.
        const { stats } = await withImportRun(prisma, "derive", {}, async () => ({ stats: await deriveAll(prisma, { log, force: true }) }));
        log(`derive done: ${JSON.stringify(stats)}`);
      });
      return;
    }
    if (command === "reparse-titles") {
      await withLock(async () => {
        const { stats } = await withImportRun(prisma, "reparse-titles", {}, async () => {
          const reparsed = await reparseTitleCredits(prisma, log);
          // Credits are an input of the slot rebuild: derive notices the change through its fingerprint.
          return { stats: { ...reparsed, derive: await deriveAll(prisma, { log }) } };
        });
        log(`reparse-titles done: ${JSON.stringify(stats)}`);
      });
      return;
    }
    if (!["channels", "season", "backfill", "recent", "update", "subtitles"].includes(command)) {
      throw new Error(`Unknown command "${command}"`);
    }

    const userAgent = process.env.SYOBOI_USER_AGENT;
    assertValidUserAgent(userAgent);
    const minIntervalMs = Number(process.env.SYOBOI_MIN_INTERVAL_MS ?? 3000);
    const overrides = await loadOverrides();

    // An unset repository variable arrives as an empty string: that means the default, not 0.
    const subtitleSetting = process.env.SUBTITLE_BACKFILL_PER_RUN?.trim();
    const subtitleLimit = subtitleSetting ? Number(subtitleSetting) : SUBTITLE_BACKFILL_PER_RUN;
    /** One backfill step as its own import run (its requests are counted and shown on /status). */
    const runSubtitles = async () => {
      if (!Number.isInteger(subtitleLimit) || subtitleLimit <= 0) return;
      const { stats } = await withImportRun<object>(prisma, "subtitles", { limit: subtitleLimit }, async (importRunId) => {
        const client = createRecordingClient(prisma, importRunId, { userAgent, minIntervalMs });
        const ctx: IngestContext = { prisma, client, overrides, importRunId, now: () => new Date(), log };
        return { stats: { ...(await backfillSubtitles(ctx, subtitleLimit)), requests: client.requestCount } };
      });
      log(`subtitles done: ${JSON.stringify(stats)}`);
    };

    if (command === "subtitles") {
      await withLock(runSubtitles);
      return;
    }

    await withLock(async () => {
      const startedAt = new Date();
      const { stats } = await withImportRun<object>(prisma, command, Object.fromEntries(flags), async (importRunId) => {
        const client = createRecordingClient(prisma, importRunId, { userAgent, minIntervalMs });
        const ctx: IngestContext = { prisma, client, overrides, importRunId, now: () => new Date(), log };
        const channelCount = await prisma.channel.count({ where: { isTracked: true } });
        if (command === "channels" || channelCount === 0) {
          const result = await syncChannels(ctx);
          log(`channels: upserted ${result.upserted}`);
          if (command === "channels") return { stats: result };
        }
        if (command === "update") {
          const since = await readCursor(prisma, CURSOR_PROGRAMS);
          if (!since) throw new Error("No sync cursor yet. Run `npm run ingest -- season` first.");
          const stats = await syncUpdates(ctx, since, startedAt);
          await writeCursor(prisma, CURSOR_PROGRAMS, new Date(startedAt.getTime() - CURSOR_SAFETY_MARGIN_MS));
          return { stats, range: { start: since, end: startedAt } };
        }
        const totals: Record<string, number> = {};
        for (const entry of ranges) {
          log(`syncing ${entry.label}`);
          const stats = await syncRange(ctx, entry.range, { maxWindowDays: windowDays });
          for (const [key, value] of Object.entries(stats)) totals[key] = (totals[key] ?? 0) + value;
        }
        // A complete sync that includes "now" is a valid starting point for incremental updates.
        const coversNow = ranges.some((entry) => entry.range.start <= startedAt && startedAt < entry.range.end);
        const cursor = await readCursor(prisma, CURSOR_PROGRAMS);
        if (coversNow && !cursor) await writeCursor(prisma, CURSOR_PROGRAMS, new Date(startedAt.getTime() - CURSOR_SAFETY_MARGIN_MS));
        return {
          stats: { ...totals, requests: client.requestCount },
          range: { start: ranges[0]!.range.start, end: ranges.at(-1)!.range.end }
        };
      });
      log(`${command} done: ${JSON.stringify(stats)}`);
      if (command === "update" || command === "recent") await runSubtitles();
      const derived = await withImportRun(prisma, "derive", { after: command }, async () => ({ stats: await deriveAll(prisma, { log }) }));
      log(`derive done: ${JSON.stringify(derived.stats)}`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});

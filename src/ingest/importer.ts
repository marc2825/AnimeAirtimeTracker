/**
 * Database writes for ingested Syoboi data. Invariants (tested in importer.db.test.ts):
 * - idempotent: re-importing identical data creates no rows and no revisions
 * - non-destructive: nothing is physically deleted; source deletions set `deleted`, absences set `missingSince`
 *   and absence is only inferred for windows that were fetched completely
 * - every semantic change is recorded as a BroadcastRevision
 * - manual overrides win over source values and survive re-imports
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { TRACKED_CHANNELS } from "@/domain/coverage";
import { classifyRerun } from "@/domain/flags";
import { isoDateToDbDate } from "@/domain/time";

import { indexBroadcastOverrides, indexTitleOverrides, type OverridesFile } from "./overrides";
import type { TimeWindow } from "./plan";
import { SOURCE_SYOBOI, type NormalizedBroadcast, type NormalizedTitle } from "./syoboi/normalize";
import type { SyoboiChannel, SyoboiChannelGroup } from "./syoboi/parse";

type Tx = Prisma.TransactionClient;

export interface BroadcastImportStats {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  skippedUntrackedChannel: number;
  rejectedMissingTitle: number;
  markedMissing: number;
}

export function emptyBroadcastStats(): BroadcastImportStats {
  return { received: 0, created: 0, updated: 0, unchanged: 0, skippedUntrackedChannel: 0, rejectedMissingTitle: 0, markedMissing: 0 };
}

export function addStats<T extends object>(target: T, delta: T): T {
  for (const key of Object.keys(delta) as (keyof T)[]) {
    (target[key] as unknown as number) = ((target[key] as unknown as number) ?? 0) + (delta[key] as unknown as number);
  }
  return target;
}

/** Upsert tracked channels, refreshing source names/URLs. Untracked source channels are not stored. */
export async function upsertTrackedChannels(
  prisma: PrismaClient,
  channels: SyoboiChannel[],
  groups: SyoboiChannelGroup[]
): Promise<{ upserted: number; missingInSource: number[] }> {
  const sourceById = new Map(channels.map((channel) => [Number(channel.ChID), channel]));
  const groupById = new Map(groups.map((group) => [group.ChGID, group.ChGroupName]));
  const missingInSource: number[] = [];
  let upserted = 0;
  for (const tracked of TRACKED_CHANNELS) {
    const source = sourceById.get(tracked.syoboiId);
    if (!source) {
      missingInSource.push(tracked.syoboiId);
    }
    const data = {
      slug: tracked.slug,
      name: tracked.name,
      shortName: tracked.shortName,
      medium: tracked.medium,
      area: tracked.area,
      network: tracked.network,
      isTracked: true,
      sortOrder: tracked.sortOrder,
      sourceGroupId: source?.ChGID ?? null,
      sourceGroupName: source?.ChGID ? (groupById.get(source.ChGID) ?? null) : null,
      url: source?.ChURL?.trim() || null
    };
    await prisma.channel.upsert({
      where: { source_externalId: { source: SOURCE_SYOBOI, externalId: String(tracked.syoboiId) } },
      create: { source: SOURCE_SYOBOI, externalId: String(tracked.syoboiId), ...data },
      update: data
    });
    upserted += 1;
  }
  return { upserted, missingInSource };
}

/** Make sure tracked channel rows exist without contacting the source (fixtures, tests). */
export async function ensureTrackedChannelRows(prisma: PrismaClient): Promise<void> {
  await upsertTrackedChannels(prisma, [], []);
}

export async function upsertTitles(
  prisma: PrismaClient,
  titles: NormalizedTitle[],
  overrides: OverridesFile,
  now: Date,
  evidence: Map<string, { label: string; evidence: string }[]> = new Map()
): Promise<{ created: number; updated: number; unchanged: number }> {
  const titleOverrides = indexTitleOverrides(overrides);
  const existing = await prisma.title.findMany({
    where: { source: SOURCE_SYOBOI, externalId: { in: titles.map((title) => title.externalId) } },
    select: { externalId: true, contentHash: true }
  });
  const existingHash = new Map(existing.map((row) => [row.externalId, row.contentHash]));
  const stats = { created: 0, updated: 0, unchanged: 0 };

  await prisma.$transaction(
    async (tx) => {
      for (const title of titles) {
        const override = titleOverrides.get(title.externalId) ?? {};
        const data = {
          name: (override.name as string | undefined) ?? title.name,
          shortName: title.shortName,
          yomi: title.yomi,
          nameEn: title.nameEn,
          sourceCategory: "sourceCategory" in override ? (override.sourceCategory as number | null) : title.sourceCategory,
          firstYear: title.firstYear,
          firstMonth: title.firstMonth,
          firstEndYear: title.firstEndYear,
          firstEndMonth: title.firstEndMonth,
          firstChannelText: title.firstChannelText,
          officialUrl: "officialUrl" in override ? (override.officialUrl as string | null) : title.officialUrl,
          slotLabels: title.slotLabels,
          slotEvidence: (evidence.get(title.externalId) ?? []) as Prisma.InputJsonValue,
          seriesKey: "seriesKey" in override ? (override.seriesKey as string | null) : title.seriesKey,
          sourceUpdatedAt: title.sourceUpdatedAt,
          detailsFetchedAt: now,
          contentHash: title.contentHash
        };
        if (!existingHash.has(title.externalId)) {
          stats.created += 1;
        } else if (existingHash.get(title.externalId) !== title.contentHash) {
          stats.updated += 1;
        } else {
          stats.unchanged += 1;
        }
        await tx.title.upsert({
          where: { source_externalId: { source: SOURCE_SYOBOI, externalId: title.externalId } },
          create: { source: SOURCE_SYOBOI, externalId: title.externalId, slug: title.externalId, ...data },
          update: data
        });
      }
    },
    { timeout: 120_000 }
  );
  return stats;
}

/** Placeholder title rows for TIDs whose details could not be fetched yet (shown as 「タイトル情報未取得」). */
export async function ensureTitleStubs(prisma: PrismaClient, externalIds: string[]): Promise<number> {
  if (externalIds.length === 0) return 0;
  const result = await prisma.title.createMany({
    data: externalIds.map((externalId) => ({
      source: SOURCE_SYOBOI,
      externalId,
      slug: externalId,
      name: `TID ${externalId}`
    })),
    skipDuplicates: true
  });
  return result.count;
}

const snapshotSelect = {
  id: true,
  externalId: true,
  contentHash: true,
  titleId: true,
  channelId: true,
  startAt: true,
  endAt: true,
  startOffsetSeconds: true,
  episodeNumber: true,
  episodeLabel: true,
  subtitle: true,
  comment: true,
  flagNote: true,
  flagNew: true,
  flagFinal: true,
  flagRerun: true,
  warn: true,
  deleted: true,
  isRerun: true,
  rerunBasis: true
} satisfies Prisma.BroadcastSelect;

type BroadcastSnapshotRow = Prisma.BroadcastGetPayload<{ select: typeof snapshotSelect }>;

interface RevisionSnapshot {
  titleId: number;
  channelId: number;
  startAt: string;
  endAt: string;
  startOffsetSeconds: number | null;
  episodeNumber: number | null;
  episodeLabel: string | null;
  subtitle: string | null;
  comment: string | null;
  flags: { note: boolean; isNew: boolean; isFinal: boolean; rerun: boolean };
  warn: number | null;
  deleted: boolean;
}

function snapshotOf(row: Omit<BroadcastSnapshotRow, "id" | "externalId" | "contentHash" | "isRerun" | "rerunBasis">): RevisionSnapshot {
  return {
    titleId: row.titleId,
    channelId: row.channelId,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    startOffsetSeconds: row.startOffsetSeconds,
    episodeNumber: row.episodeNumber,
    episodeLabel: row.episodeLabel,
    subtitle: row.subtitle,
    comment: row.comment,
    flags: { note: row.flagNote, isNew: row.flagNew, isFinal: row.flagFinal, rerun: row.flagRerun },
    warn: row.warn,
    deleted: row.deleted
  };
}

export function classifyChange(before: RevisionSnapshot, after: RevisionSnapshot): "DELETED" | "RESTORED" | "RESCHEDULED" | "FLAGS_CHANGED" | "UPDATED" {
  if (!before.deleted && after.deleted) return "DELETED";
  if (before.deleted && !after.deleted) return "RESTORED";
  if (before.startAt !== after.startAt || before.endAt !== after.endAt || before.channelId !== after.channelId) return "RESCHEDULED";
  if (JSON.stringify(before.flags) !== JSON.stringify(after.flags)) return "FLAGS_CHANGED";
  return "UPDATED";
}

export interface CompleteWindow {
  window: TimeWindow;
  channelExternalIds: string[];
}

/**
 * Import normalized broadcasts in a single transaction.
 * When `completeWindow` is given, the batch is the complete set of airings for those channels in that window,
 * so tracked airings starting inside it that were not returned get `missingSince` set.
 */
export async function importBroadcasts(
  prisma: PrismaClient,
  broadcasts: NormalizedBroadcast[],
  options: { importRunId: number | null; overrides: OverridesFile; now: Date; completeWindow?: CompleteWindow }
): Promise<BroadcastImportStats> {
  const stats = emptyBroadcastStats();
  stats.received = broadcasts.length;
  const rerunOverrides = indexBroadcastOverrides(options.overrides);

  const channels = await prisma.channel.findMany({ where: { source: SOURCE_SYOBOI, isTracked: true }, select: { id: true, externalId: true } });
  const channelIdByExternal = new Map(channels.map((channel) => [channel.externalId, channel.id]));
  const titleIds = [...new Set(broadcasts.map((broadcast) => broadcast.titleExternalId))];
  const titles = await prisma.title.findMany({
    where: { source: SOURCE_SYOBOI, externalId: { in: titleIds } },
    select: { id: true, externalId: true, firstEndYear: true, firstEndMonth: true }
  });
  const titleByExternal = new Map(titles.map((title) => [title.externalId, title]));

  // Deduplicate by PID (a program can be returned by two adjacent windows); last one wins.
  const byPid = new Map(broadcasts.map((broadcast) => [broadcast.externalId, broadcast]));
  const pids = [...byPid.keys()];

  await prisma.$transaction(
    async (tx: Tx) => {
      const existingRows = await tx.broadcast.findMany({ where: { source: SOURCE_SYOBOI, externalId: { in: pids } }, select: snapshotSelect });
      const existingByPid = new Map(existingRows.map((row) => [row.externalId, row]));
      const toCreate: Prisma.BroadcastCreateManyInput[] = [];
      const touchIds: number[] = [];

      for (const broadcast of byPid.values()) {
        const channelId = channelIdByExternal.get(broadcast.channelExternalId);
        if (channelId === undefined) {
          stats.skippedUntrackedChannel += 1;
          continue;
        }
        const title = titleByExternal.get(broadcast.titleExternalId);
        if (!title) {
          stats.rejectedMissingTitle += 1;
          continue;
        }
        const [year, month] = broadcast.animeDate.split("-").map(Number) as [number, number];
        let rerun = classifyRerun({
          flagRerun: broadcast.flagRerun,
          airingYear: year,
          airingMonth: month,
          firstEndYear: title.firstEndYear,
          firstEndMonth: title.firstEndMonth
        });
        const manual = rerunOverrides.get(broadcast.externalId);
        if (manual !== undefined) rerun = { isRerun: manual, basis: "MANUAL" };

        const data = {
          titleId: title.id,
          channelId,
          startAt: broadcast.startAt,
          endAt: broadcast.endAt,
          startOffsetSeconds: broadcast.startOffsetSeconds,
          animeDate: isoDateToDbDate(broadcast.animeDate),
          animeWeekday: broadcast.animeWeekday,
          animeStartMinute: broadcast.animeStartMinute,
          durationMinutes: broadcast.durationMinutes,
          episodeNumber: broadcast.episodeNumber,
          episodeLabel: broadcast.episodeLabel,
          subtitle: broadcast.subtitle,
          comment: broadcast.comment,
          flagNote: broadcast.flagNote,
          flagNew: broadcast.flagNew,
          flagFinal: broadcast.flagFinal,
          flagRerun: broadcast.flagRerun,
          isRerun: rerun.isRerun,
          rerunBasis: rerun.basis,
          warn: broadcast.warn,
          deleted: broadcast.deleted,
          sourceRevision: broadcast.sourceRevision,
          sourceUpdatedAt: broadcast.sourceUpdatedAt,
          contentHash: broadcast.contentHash,
          lastSeenAt: options.now,
          missingSince: null
        };

        const existing = existingByPid.get(broadcast.externalId);
        if (!existing) {
          toCreate.push({ source: SOURCE_SYOBOI, externalId: broadcast.externalId, firstSeenAt: options.now, ...data });
          continue;
        }
        if (existing.contentHash === broadcast.contentHash) {
          if (existing.isRerun !== rerun.isRerun || existing.rerunBasis !== rerun.basis) {
            await tx.broadcast.update({ where: { id: existing.id }, data: { isRerun: rerun.isRerun, rerunBasis: rerun.basis, lastSeenAt: options.now, missingSince: null } });
          } else {
            touchIds.push(existing.id);
          }
          stats.unchanged += 1;
          continue;
        }
        const before = snapshotOf(existing);
        const after = snapshotOf({ ...data, titleId: title.id, channelId });
        await tx.broadcast.update({ where: { id: existing.id }, data });
        await tx.broadcastRevision.create({
          data: {
            broadcastId: existing.id,
            importRunId: options.importRunId,
            observedAt: options.now,
            changeType: classifyChange(before, after),
            before: before as unknown as Prisma.InputJsonValue,
            after: after as unknown as Prisma.InputJsonValue
          }
        });
        stats.updated += 1;
      }

      if (toCreate.length > 0) {
        const created = await tx.broadcast.createManyAndReturn({ data: toCreate, select: snapshotSelect });
        await tx.broadcastRevision.createMany({
          data: created.map((row) => ({
            broadcastId: row.id,
            importRunId: options.importRunId,
            observedAt: options.now,
            changeType: "CREATED" as const,
            after: snapshotOf(row) as unknown as Prisma.InputJsonValue
          }))
        });
        stats.created += created.length;
      }
      if (touchIds.length > 0) {
        await tx.broadcast.updateMany({ where: { id: { in: touchIds } }, data: { lastSeenAt: options.now, missingSince: null } });
      }

      if (options.completeWindow) {
        const windowChannelIds = options.completeWindow.channelExternalIds
          .map((externalId) => channelIdByExternal.get(externalId))
          .filter((id): id is number => id !== undefined);
        const missing = await tx.broadcast.updateMany({
          where: {
            source: SOURCE_SYOBOI,
            channelId: { in: windowChannelIds },
            startAt: { gte: options.completeWindow.window.start, lt: options.completeWindow.window.end },
            externalId: { notIn: pids },
            missingSince: null
          },
          data: { missingSince: options.now }
        });
        stats.markedMissing = missing.count;
      }
    },
    { timeout: 180_000, maxWait: 20_000 }
  );

  return stats;
}

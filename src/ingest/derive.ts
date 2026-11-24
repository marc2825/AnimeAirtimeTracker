/**
 * Derived data, recomputed from stored source data (no network to the source).
 *
 * Neon bills the data the database sends out, and derive runs after every scheduled import, so it never reads
 * every airing (that was ≈ 42 MB per run):
 * - rerun classification is one UPDATE inside the database (src/domain/flags.ts `classifyRerun`, same rule);
 * - slots are rebuilt from airing groups the database aggregates (≈ 40k rows instead of ≈ 230k airings), and the
 *   rebuild is skipped when a fingerprint of every input, computed in the database, has not changed.
 */
import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { RERUN_AGE_THRESHOLD_MONTHS } from "@/domain/flags";
import { deriveSlots, SLOT_RULE_VERSION, type AiringGroup, type SlotInputTitle } from "@/domain/slots";
import { isoDateToDbDate, toAnimeTime } from "@/domain/time";

import { loadOverrides, loadSlotRegistry } from "./overrides";
import { chunk } from "./plan";

/** SyncCursor key holding the fingerprint of the inputs of the last slot rebuild. */
export const SLOT_INPUTS_CURSOR = "derive:slot-inputs";

/**
 * Same rule as `classifyRerun` (flag 再 → FLAG; first run ended more than RERUN_AGE_THRESHOLD_MONTHS months before
 * the airing month → AGE; else NONE), applied where the stored result differs. MANUAL rows are left alone.
 */
export async function reclassifyReruns(prisma: PrismaClient): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "Broadcast" AS b
    SET "isRerun" = c.basis <> 'NONE', "rerunBasis" = c.basis::"RerunBasis", "updatedAt" = now()
    FROM (
      SELECT b2.id,
        CASE
          WHEN b2."flagRerun" THEN 'FLAG'
          WHEN t."firstEndYear" IS NOT NULL AND t."firstEndYear" <> 0 AND t."firstEndMonth" BETWEEN 1 AND 12
            AND (EXTRACT(YEAR FROM b2."animeDate")::int * 12 + EXTRACT(MONTH FROM b2."animeDate")::int - 1)
              - (t."firstEndYear" * 12 + t."firstEndMonth" - 1) > ${RERUN_AGE_THRESHOLD_MONTHS}::int
            THEN 'AGE'
          ELSE 'NONE'
        END AS basis
      FROM "Broadcast" AS b2
      JOIN "Title" AS t ON t.id = b2."titleId"
      WHERE b2."rerunBasis" <> 'MANUAL'
    ) AS c
    WHERE b.id = c.id AND (b."rerunBasis"::text <> c.basis OR b."isRerun" <> (c.basis <> 'NONE'))`;
}

/**
 * Regular airings (not reruns, not deleted, not missing) on tracked channels, grouped as `groupAirings` does:
 * season = year × 10 + quarter of the anime date.
 */
const AIRING_GROUPS = Prisma.sql`
  SELECT b."titleId" AS "titleId", b."channelId" AS "channelId",
    EXTRACT(YEAR FROM b."animeDate")::int * 10 + (EXTRACT(MONTH FROM b."animeDate")::int - 1) / 3 + 1 AS "seasonOrdinal",
    b."animeWeekday" AS weekday, b."animeStartMinute" AS "startMinute", b."durationMinutes" AS "durationMinutes",
    count(*)::int AS count, min(b."startAt") AS "firstStartAt", max(b."startAt") AS "lastStartAt"
  FROM "Broadcast" AS b
  JOIN "Channel" AS ch ON ch.id = b."channelId" AND ch."isTracked"
  WHERE NOT b.deleted AND NOT b."isRerun" AND b."missingSince" IS NULL
  GROUP BY 1, 2, 3, 4, 5, 6`;

export async function readAiringGroups(prisma: PrismaClient): Promise<AiringGroup[]> {
  return prisma.$queryRaw<AiringGroup[]>`${AIRING_GROUPS}`;
}

/** Titles the slot rules can use: those with source slot labels, and those a membership override names. */
function slotTitleWhere(overrideTitleIds: string[]) {
  return { OR: [{ slotLabels: { isEmpty: false } }, { externalId: { in: overrideTitleIds } }] };
}

/**
 * Fingerprint of everything a slot rebuild reads: airing groups, slot titles, tracked channels (hashed inside the
 * database, so only three digests are sent), the registry and overrides, the rule version and, in CI, the commit.
 */
export async function slotInputFingerprint(prisma: PrismaClient, files: unknown): Promise<string> {
  const overrideIds = overrideTitleIds(files);
  const [row] = await prisma.$queryRaw<{ groups: string | null; titles: string | null; channels: string | null }[]>`
    SELECT
      (SELECT md5(string_agg(concat_ws(',', g."titleId", g."channelId", g."seasonOrdinal", g.weekday, g."startMinute", g."durationMinutes", g.count, g."firstStartAt", g."lastStartAt"), ';'
         ORDER BY g."titleId", g."channelId", g."seasonOrdinal", g.weekday, g."startMinute", g."durationMinutes")) FROM (${AIRING_GROUPS}) AS g) AS groups,
      (SELECT md5(string_agg(concat_ws(',', t.id, t."externalId", array_to_string(t."slotLabels", '|'), t."slotEvidence"::text), ';' ORDER BY t.id))
         FROM "Title" AS t WHERE cardinality(t."slotLabels") > 0 OR t."externalId" = ANY(${overrideIds}::text[])) AS titles,
      (SELECT md5(string_agg(concat_ws(',', c.id, c.slug, c."shortName", c.name, c."sortOrder"), ';' ORDER BY c.id))
         FROM "Channel" AS c WHERE c."isTracked") AS channels`;
  return createHash("sha256")
    .update(JSON.stringify({ row, files, rule: SLOT_RULE_VERSION, commit: process.env.GITHUB_SHA ?? null }))
    .digest("hex");
}

function overrideTitleIds(files: unknown): string[] {
  const memberships = (files as { overrides?: { slotMemberships?: { titleExternalId: string }[] } }).overrides?.slotMemberships ?? [];
  return [...new Set(memberships.map((override) => override.titleExternalId))];
}

export async function rebuildSlots(
  prisma: PrismaClient,
  options: { force?: boolean } = {}
): Promise<{ skipped: boolean; slots: number; memberships: number; byKind: Record<string, number> }> {
  const [registry, overrides] = await Promise.all([loadSlotRegistry(), loadOverrides()]);
  const files = { registry: registry.slots, overrides: { slotMemberships: overrides.slotMemberships } };
  const fingerprint = await slotInputFingerprint(prisma, files);
  if (!options.force) {
    const previous = await prisma.syncCursor.findUnique({ where: { key: SLOT_INPUTS_CURSOR }, select: { value: true } });
    // Slots must exist too: tables emptied by hand (or by tests) are never mistaken for up to date.
    if (previous?.value === fingerprint && (await prisma.slot.count()) > 0) return { skipped: true, slots: 0, memberships: 0, byKind: {} };
  }
  const channels = await prisma.channel.findMany({ where: { isTracked: true }, select: { id: true, slug: true, shortName: true, name: true, sortOrder: true } });
  const titleRows = await prisma.title.findMany({
    where: slotTitleWhere(overrideTitleIds(files)),
    select: { id: true, externalId: true, slotLabels: true, slotEvidence: true },
    orderBy: { id: "asc" }
  });
  const titles: SlotInputTitle[] = titleRows.map((row) => {
    const evidence: Record<string, string> = {};
    if (Array.isArray(row.slotEvidence)) {
      for (const entry of row.slotEvidence as { label?: string; evidence?: string }[]) {
        if (entry?.label && entry.evidence) evidence[entry.label] = entry.evidence;
      }
    }
    return { id: row.id, externalId: row.externalId, slotLabels: row.slotLabels, evidence };
  });
  const slots = deriveSlots({
    titles,
    channels: channels.map((c) => ({ id: c.id, slug: c.slug, shortName: c.shortName ?? c.name, sortOrder: c.sortOrder })),
    airingGroups: await readAiringGroups(prisma),
    registry: registry.slots,
    membershipOverrides: overrides.slotMemberships
  });

  const computedAt = new Date();
  const byKind: Record<string, number> = {};
  for (const slot of slots) byKind[slot.kind] = (byKind[slot.kind] ?? 0) + 1;
  const slotRows = slots.map((slot) => {
    const starts = slot.memberships.flatMap((m) => [m.firstStartAt, m.lastStartAt]).filter((d): d is Date => d !== null);
    const first = starts.length > 0 ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
    const last = starts.length > 0 ? new Date(Math.max(...starts.map((d) => d.getTime()))) : null;
    return {
      slug: slot.slug,
      name: slot.name,
      kind: slot.kind,
      description: slot.description,
      evidenceUrl: slot.evidenceUrl,
      ruleVersion: SLOT_RULE_VERSION,
      homeChannelId: slot.homeChannelId,
      firstAnimeDate: first ? isoDateToDbDate(toAnimeTime(first).animeDate) : null,
      lastAnimeDate: last ? isoDateToDbDate(toAnimeTime(last).animeDate) : null,
      titleCount: new Set(slot.memberships.map((m) => m.titleId)).size,
      seasonCount: slot.seasons.length,
      computedAt
    };
  });
  const memberships = slots.reduce((sum, slot) => sum + slot.memberships.length, 0);
  // A handful of bulk statements instead of three round trips per slot: the ingest job runs far from the
  // database, and per-slot writes outgrew the transaction timeout once the dataset reached 2016.
  await prisma.$transaction(
    async (tx) => {
      await tx.slotSeason.deleteMany({});
      await tx.slotMembership.deleteMany({});
      await tx.slot.deleteMany({});
      const created = await tx.slot.createManyAndReturn({ data: slotRows, select: { id: true, slug: true } });
      const idBySlug = new Map(created.map((row) => [row.slug, row.id]));
      const membershipRows = slots.flatMap((slot) => slot.memberships.map((m) => ({ ...m, slotId: idBySlug.get(slot.slug)! })));
      const seasonRows = slots.flatMap((slot) => slot.seasons.map((season) => ({ ...season, slotId: idBySlug.get(slot.slug)! })));
      for (const batch of chunk(membershipRows, BULK_ROWS)) await tx.slotMembership.createMany({ data: batch });
      for (const batch of chunk(seasonRows, BULK_ROWS)) await tx.slotSeason.createMany({ data: batch });
      await tx.syncCursor.upsert({ where: { key: SLOT_INPUTS_CURSOR }, create: { key: SLOT_INPUTS_CURSOR, value: fingerprint }, update: { value: fingerprint } });
    },
    { timeout: 300_000, maxWait: 20_000 }
  );
  return { skipped: false, slots: slots.length, memberships, byKind };
}

const BULK_ROWS = 2000;

/** `force` rebuilds slots even when their inputs look unchanged (the manual `derive` command). */
export async function deriveAll(prisma: PrismaClient, options: { log: (message: string) => void; force?: boolean }) {
  const reruns = await reclassifyReruns(prisma);
  options.log(`reclassified reruns: ${reruns}`);
  const slots = await rebuildSlots(prisma, { force: options.force });
  if (slots.skipped) options.log("slots: inputs unchanged since the last rebuild, skipped");
  return { reclassifiedReruns: reruns, ...slots };
}

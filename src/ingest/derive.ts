/**
 * Derived data, recomputed from stored source data (no network):
 * - rerun classification (when title details arrive after the airings)
 * - slots, memberships and per-season slot positions (full rebuild; slugs are stable)
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { classifyRerun } from "@/domain/flags";
import { deriveSlots, SLOT_RULE_VERSION, type SlotInputTitle } from "@/domain/slots";
import { dbDateToIsoDate, isoDateToDbDate, toAnimeTime } from "@/domain/time";

import { loadOverrides, loadSlotRegistry } from "./overrides";
import { chunk } from "./plan";

export async function reclassifyReruns(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.broadcast.findMany({
    where: { rerunBasis: { not: "MANUAL" } },
    select: { id: true, flagRerun: true, animeDate: true, isRerun: true, rerunBasis: true, title: { select: { firstEndYear: true, firstEndMonth: true } } }
  });
  const changes = new Map<string, number[]>();
  for (const row of rows) {
    const date = dbDateToIsoDate(row.animeDate);
    const [year, month] = date.split("-").map(Number) as [number, number];
    const result = classifyRerun({ flagRerun: row.flagRerun, airingYear: year, airingMonth: month, firstEndYear: row.title.firstEndYear, firstEndMonth: row.title.firstEndMonth });
    if (result.isRerun !== row.isRerun || result.basis !== row.rerunBasis) {
      const key = `${result.isRerun}|${result.basis}`;
      changes.set(key, [...(changes.get(key) ?? []), row.id]);
    }
  }
  let updated = 0;
  for (const [key, ids] of changes) {
    const [isRerun, basis] = key.split("|") as [string, "FLAG" | "AGE" | "NONE"];
    for (const batch of chunk(ids, 5000)) {
      updated += (await prisma.broadcast.updateMany({ where: { id: { in: batch } }, data: { isRerun: isRerun === "true", rerunBasis: basis } })).count;
    }
  }
  return updated;
}

export async function rebuildSlots(prisma: PrismaClient): Promise<{ slots: number; memberships: number; byKind: Record<string, number> }> {
  const [registry, overrides] = await Promise.all([loadSlotRegistry(), loadOverrides()]);
  const channels = await prisma.channel.findMany({ where: { isTracked: true }, select: { id: true, slug: true, shortName: true, name: true, sortOrder: true } });
  const titleRows = await prisma.title.findMany({ select: { id: true, externalId: true, slotLabels: true, slotEvidence: true } });
  const titles: SlotInputTitle[] = titleRows.map((row) => {
    const evidence: Record<string, string> = {};
    if (Array.isArray(row.slotEvidence)) {
      for (const entry of row.slotEvidence as { label?: string; evidence?: string }[]) {
        if (entry?.label && entry.evidence) evidence[entry.label] = entry.evidence;
      }
    }
    return { id: row.id, externalId: row.externalId, slotLabels: row.slotLabels, evidence };
  });
  const broadcasts = await prisma.broadcast.findMany({
    where: { deleted: false, isRerun: false, missingSince: null },
    select: { titleId: true, channelId: true, animeDate: true, animeWeekday: true, animeStartMinute: true, durationMinutes: true, startAt: true, isRerun: true, deleted: true }
  });
  const slots = deriveSlots({
    titles,
    channels: channels.map((c) => ({ id: c.id, slug: c.slug, shortName: c.shortName ?? c.name, sortOrder: c.sortOrder })),
    broadcasts: broadcasts.map((b) => ({ ...b, animeDate: dbDateToIsoDate(b.animeDate) })),
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
    },
    { timeout: 300_000, maxWait: 20_000 }
  );
  return { slots: slots.length, memberships, byKind };
}

const BULK_ROWS = 2000;

export async function deriveAll(prisma: PrismaClient, options: { log: (message: string) => void }) {
  const reruns = await reclassifyReruns(prisma);
  options.log(`reclassified reruns: ${reruns}`);
  const slots = await rebuildSlots(prisma);
  return { reclassifiedReruns: reruns, ...slots };
}

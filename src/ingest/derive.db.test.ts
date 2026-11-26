/**
 * Derive inside the database must match the TypeScript rules exactly: rerun classification (SQL UPDATE vs
 * classifyRerun), airing groups (SQL GROUP BY vs groupAirings), and the slot rebuild must run only when its inputs
 * change. Run with `npm run test:db` (TEST_DATABASE_URL, name must contain "test"; tables are truncated).
 */
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { computeCreditProfiles } from "@/domain/credits";
import { classifyRerun } from "@/domain/flags";
import { groupAirings } from "@/domain/slots";
import { dbDateToIsoDate } from "@/domain/time";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/prisma";

import { aliasesByRole, readAiringGroups, readTitleCredits, rebuildSlots, reclassifyReruns, SLOT_INPUTS_CURSOR } from "./derive";
import { loadCreditAliases } from "./overrides";
import { importFixtures } from "./fixtures";
import { countTitlesNeedingSubtitles, titlesNeedingSubtitles } from "./sync";

const url = process.env.TEST_DATABASE_URL;
let prisma: PrismaClient;

const sortGroups = <T extends { titleId: number; channelId: number; seasonOrdinal: number; weekday: number; startMinute: number; durationMinutes: number }>(groups: T[]) =>
  [...groups].sort((a, b) => a.titleId - b.titleId || a.channelId - b.channelId || a.seasonOrdinal - b.seasonOrdinal || a.weekday - b.weekday || a.startMinute - b.startMinute || a.durationMinutes - b.durationMinutes);

/** Synthetic airings (test database only): every combination the rerun rule distinguishes. */
async function addRerunGrid() {
  const channel = await prisma.channel.findFirstOrThrow({ where: { isTracked: true } });
  const ends: [number | null, number | null][] = [[null, null], [2020, null], [0, 5], [2020, 0], [2020, 13], [2020, 6], [2025, 12]];
  const dates = ["2020-06-15", "2020-12-15", "2021-01-15", "2021-06-15", "2026-01-15"];
  let n = 0;
  for (const [index, [firstEndYear, firstEndMonth]] of ends.entries()) {
    const title = await prisma.title.create({ data: { source: "test", externalId: `grid-${index}`, slug: `grid-${index}`, name: `grid ${index}`, firstEndYear, firstEndMonth } });
    for (const date of dates) {
      for (const flagRerun of [false, true]) {
        for (const manual of [false, true]) {
          n += 1;
          const startAt = new Date(`${date}T15:00:00Z`);
          await prisma.broadcast.create({
            data: {
              source: "test", externalId: `grid-${n}`, titleId: title.id, channelId: channel.id, startAt, endAt: new Date(startAt.getTime() + 30 * 60_000),
              animeDate: new Date(`${date}T00:00:00Z`), animeWeekday: 0, animeStartMinute: 1440, durationMinutes: 30, contentHash: `grid-${n}`, flagRerun,
              // Deliberately wrong stored results; MANUAL rows must be left alone.
              isRerun: manual ? true : !flagRerun, rerunBasis: manual ? "MANUAL" : "AGE"
            }
          });
        }
      }
    }
  }
}

describe("derive in the database (PostgreSQL)", () => {
  beforeAll(async () => {
    if (!url) throw new Error("TEST_DATABASE_URL is not set — see .env.example. DB tests never run against DATABASE_URL.");
    const dbName = new URL(url).pathname.slice(1);
    if (!dbName.includes("test")) throw new Error(`Refusing to truncate database "${dbName}": name must contain "test".`);
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    prisma = createPrismaClient(url);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "SlotSeason","SlotMembership","Slot","BroadcastRevision","Broadcast","TitleSubtitle","Title","Channel","CoverageWindow","FetchLog","RawPayload","ImportRun","SyncCursor" RESTART IDENTITY CASCADE`
    );
    await importFixtures(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("classifies reruns in SQL exactly as classifyRerun, and leaves manual corrections alone", async () => {
    await addRerunGrid();
    expect(await reclassifyReruns(prisma)).toBeGreaterThan(0);
    const rows = await prisma.broadcast.findMany({
      select: { externalId: true, flagRerun: true, animeDate: true, isRerun: true, rerunBasis: true, title: { select: { firstEndYear: true, firstEndMonth: true } } }
    });
    const checked = rows.filter((row) => row.rerunBasis !== "MANUAL");
    expect(checked.length).toBeGreaterThan(70);
    for (const row of checked) {
      const [year, month] = dbDateToIsoDate(row.animeDate).split("-").map(Number) as [number, number];
      const expected = classifyRerun({ flagRerun: row.flagRerun, airingYear: year, airingMonth: month, firstEndYear: row.title.firstEndYear, firstEndMonth: row.title.firstEndMonth });
      expect({ isRerun: row.isRerun, basis: row.rerunBasis }, row.externalId).toEqual(expected);
    }
    const manual = rows.filter((row) => row.externalId.startsWith("grid-") && row.rerunBasis === "MANUAL");
    expect(manual.length).toBe(70);
    expect(manual.every((row) => row.isRerun)).toBe(true);
    // Nothing left to change: a second run updates no row.
    expect(await reclassifyReruns(prisma)).toBe(0);
  });

  it("groups airings in the database exactly as groupAirings", async () => {
    await addRerunGrid();
    await reclassifyReruns(prisma);
    const tracked = new Set((await prisma.channel.findMany({ where: { isTracked: true }, select: { id: true } })).map((c) => c.id));
    const airings = await prisma.broadcast.findMany({
      where: { missingSince: null },
      select: { titleId: true, channelId: true, animeDate: true, animeWeekday: true, animeStartMinute: true, durationMinutes: true, startAt: true, isRerun: true, deleted: true }
    });
    const expected = groupAirings(airings.filter((a) => tracked.has(a.channelId)).map((a) => ({ ...a, animeDate: dbDateToIsoDate(a.animeDate) })));
    const actual = await readAiringGroups(prisma);
    expect(actual.length).toBeGreaterThan(0);
    expect(sortGroups(actual)).toEqual(sortGroups(expected));
  });

  it("rebuilds slots only when their inputs change, and always when asked or when slots are missing", async () => {
    // Two titles naming the same slot give a source-labelled slot.
    const titles = await prisma.title.findMany({ take: 2, orderBy: { id: "asc" } });
    for (const title of titles) {
      await prisma.title.update({ where: { id: title.id }, data: { slotLabels: ["テスト枠"], slotEvidence: [{ label: "テスト枠", evidence: "「テスト枠」枠で放送" }] } });
    }
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: false });
    expect(await prisma.slot.count()).toBeGreaterThan(0);
    expect(await prisma.syncCursor.findUnique({ where: { key: SLOT_INPUTS_CURSOR } })).not.toBeNull();
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: true });

    // An airing moves: the inputs differ.
    const airing = await prisma.broadcast.findFirstOrThrow({ where: { isRerun: false, deleted: false, channel: { isTracked: true } }, orderBy: { id: "asc" } });
    await prisma.broadcast.update({ where: { id: airing.id }, data: { animeStartMinute: airing.animeStartMinute + 5 } });
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: false });
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: true });

    // A title's labels change.
    await prisma.title.update({ where: { id: titles[0]!.id }, data: { slotLabels: ["テスト枠", "別の枠"] } });
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: false });

    expect(await rebuildSlots(prisma, { force: true })).toMatchObject({ skipped: false });
    await prisma.$executeRawUnsafe(`TRUNCATE "SlotSeason","SlotMembership","Slot" CASCADE`);
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: false });
  });

  it("stores each slot's credit profile as computed from the stored rows, and rebuilds when credits change", async () => {
    const titles = await prisma.title.findMany({ take: 3, orderBy: { id: "asc" } });
    for (const [index, title] of titles.entries()) {
      await prisma.title.update({
        where: { id: title.id },
        data: { slotLabels: ["テスト枠"], slotEvidence: [{ label: "テスト枠", evidence: "「テスト枠」枠で放送" }], studios: index < 2 ? ["スタジオA"] : ["スタジオB"], publishers: ["出版社C"] }
      });
    }
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: false });

    const slots = await prisma.slot.findMany({ include: { memberships: true } });
    expect(slots.length).toBeGreaterThan(0);
    const expected = computeCreditProfiles({
      slots: slots.map((slot) => ({ slug: slot.slug, homeChannelId: slot.homeChannelId, members: slot.memberships })),
      credits: await readTitleCredits(prisma),
      aliases: aliasesByRole(await loadCreditAliases()),
      latestSeason: Math.max(0, ...slots.flatMap((slot) => slot.memberships.map((m) => m.seasonOrdinal ?? 0)))
    });
    for (const slot of slots) expect(slot.creditProfile, slot.slug).toEqual(JSON.parse(JSON.stringify(expected.get(slot.slug))));
    const labelled = slots.find((slot) => slot.name === "テスト枠")!;
    expect(labelled.creditProfile).toMatchObject({ roles: { studio: { known: 3, top: [{ name: "スタジオA", titles: 2 }, { name: "スタジオB", titles: 1 }] } } });

    // Credits are an input: a changed studio rebuilds, an unchanged state skips.
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: true });
    await prisma.title.update({ where: { id: titles[2]!.id }, data: { studios: ["スタジオA"] } });
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: false });
    expect(await rebuildSlots(prisma)).toMatchObject({ skipped: true });
  });

  it("counts titles still needing subtitles without reading their ids", async () => {
    await prisma.title.updateMany({ data: { subtitlesFetchedAt: null } });
    const listed = await titlesNeedingSubtitles(prisma, 100_000);
    expect(listed.length).toBeGreaterThan(0);
    expect(await countTitlesNeedingSubtitles(prisma)).toBe(listed.length);
  });
});

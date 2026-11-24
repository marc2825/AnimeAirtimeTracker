/**
 * Queries that let the database aggregate (to send less data out of Neon) must return exactly what the in-memory
 * code computed from full rows: the trend groups, and the slot list with its seasons as arrays.
 * Run with `npm run test:db` (TEST_DATABASE_URL, name must contain "test"; tables are truncated).
 */
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seasonInstantRange } from "@/domain/season";
import { groupTrendAirings } from "@/domain/stats";
import { dbDateToIsoDate } from "@/domain/time";
import type { PrismaClient } from "@/generated/prisma/client";
import { importFixtures } from "@/ingest/fixtures";
import { createPrismaClient } from "@/server/prisma";

import { airingWhere, type AiringFilter, type ChannelInfo } from "./common";
import { loadSlotList } from "./slots";
import { trendGroups } from "./stats";

const url = process.env.TEST_DATABASE_URL;
let prisma: PrismaClient;
let channels: ChannelInfo[];

const byKey = <T extends { titleId: number; seasonOrdinal: number; animeStartMinute: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.titleId - b.titleId || a.seasonOrdinal - b.seasonOrdinal || a.animeStartMinute - b.animeStartMinute);

describe("database aggregates (PostgreSQL)", () => {
  beforeAll(async () => {
    if (!url) throw new Error("TEST_DATABASE_URL is not set — see .env.example. DB tests never run against DATABASE_URL.");
    const dbName = new URL(url).pathname.slice(1);
    if (!dbName.includes("test")) throw new Error(`Refusing to truncate database "${dbName}": name must contain "test".`);
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    prisma = createPrismaClient(url);
    await prisma.$executeRawUnsafe(
      `TRUNCATE "SlotSeason","SlotMembership","Slot","BroadcastRevision","Broadcast","TitleSubtitle","Title","Channel","CoverageWindow","FetchLog","RawPayload","ImportRun","SyncCursor" RESTART IDENTITY CASCADE`
    );
    await importFixtures(prisma);
    channels = (await prisma.channel.findMany({ where: { isTracked: true } })).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      shortName: c.shortName ?? c.name,
      medium: c.medium,
      area: c.area,
      sortOrder: c.sortOrder,
      externalId: c.externalId
    }));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("counts trend groups in the database exactly as groupTrendAirings does from the airings", async () => {
    const range = { start: seasonInstantRange({ year: 2026, quarter: 1 }).start, end: seasonInstantRange({ year: 2026, quarter: 4 }).end };
    const base: AiringFilter = { range, region: "kanto", network: null, channelSlug: null, band: null, length: null, rerun: "exclude", allKinds: false };
    for (const filter of [base, { ...base, region: null }, { ...base, band: "latenight" as const }, { ...base, rerun: "include" as const }, { ...base, region: null, channelSlug: channels[0]!.slug }]) {
      const airings = await prisma.broadcast.findMany({ where: airingWhere(filter, channels), select: { titleId: true, animeDate: true, animeStartMinute: true } });
      const expected = groupTrendAirings(airings.map((a) => ({ ...a, animeDate: dbDateToIsoDate(a.animeDate) })));
      const actual = await trendGroups(filter, channels, prisma);
      expect(byKey(actual), JSON.stringify(filter)).toEqual(byKey(expected));
    }
    expect((await trendGroups(base, channels, prisma)).length).toBeGreaterThan(0);
  });

  it("lists slots with their seasons as arrays, exactly as the row-per-season query did", async () => {
    const [mx, other] = channels;
    const computedAt = new Date();
    const full = await prisma.slot.create({
      data: { slug: "test-full", name: "テスト枠", kind: "SOURCE_LABEL", ruleVersion: "t", computedAt, homeChannelId: mx!.id, titleCount: 3, seasonCount: 3, firstAnimeDate: new Date("2025-04-01T00:00:00Z"), lastAnimeDate: new Date("2026-03-31T00:00:00Z") }
    });
    for (const [ordinal, channelId, weekday, minute] of [[20252, mx!.id, 1, 1500], [20254, other!.id, 3, 1530], [20261, mx!.id, 2, 1440]] as const) {
      await prisma.slotSeason.create({ data: { slotId: full.id, seasonOrdinal: ordinal, channelId, animeWeekday: weekday, animeStartMinute: minute, durationMinutes: 30, titleCount: 1, titleIds: [] } });
    }
    await prisma.slot.create({ data: { slug: "test-empty", name: "空の枠", kind: "INFERRED", ruleVersion: "t", computedAt } });

    // The previous implementation, as reference.
    const rows = await prisma.slot.findMany({
      include: { homeChannel: true, seasons: { orderBy: { seasonOrdinal: "desc" }, select: { seasonOrdinal: true, animeWeekday: true, animeStartMinute: true, durationMinutes: true, channel: { select: { slug: true } } } } },
      orderBy: [{ seasonCount: "desc" }, { titleCount: "desc" }, { slug: "asc" }]
    });
    const expected = rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      titleCount: row.titleCount,
      seasonCount: row.seasonCount,
      firstAnimeDate: row.firstAnimeDate ? dbDateToIsoDate(row.firstAnimeDate) : null,
      lastAnimeDate: row.lastAnimeDate ? dbDateToIsoDate(row.lastAnimeDate) : null,
      channel: row.homeChannel ? { slug: row.homeChannel.slug, shortName: row.homeChannel.shortName ?? row.homeChannel.name, name: row.homeChannel.name } : null,
      latest: row.seasons[0] ? { seasonOrdinal: row.seasons[0].seasonOrdinal, weekday: row.seasons[0].animeWeekday, minute: row.seasons[0].animeStartMinute, durationMinutes: row.seasons[0].durationMinutes } : null,
      seasonOrdinals: row.seasons.map((season) => season.seasonOrdinal).reverse(),
      positions: row.seasons.map((season) => ({ seasonOrdinal: season.seasonOrdinal, weekday: season.animeWeekday, minute: season.animeStartMinute, channelSlug: season.channel.slug }))
    }));
    const actual = await loadSlotList(prisma);
    expect(actual).toEqual(expected);
    expect(actual.find((slot) => slot.slug === "test-full")?.positions.map((p) => p.seasonOrdinal)).toEqual([20261, 20254, 20252]);
    expect(actual.find((slot) => slot.slug === "test-empty")).toMatchObject({ channel: null, latest: null, seasonOrdinals: [], positions: [] });
  });
});

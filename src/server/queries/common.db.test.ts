/**
 * The Prisma filter (schedule) and the SQL filter (search, stats) must select exactly the same airings,
 * and both must agree with inTimeBand (used to filter the cached week on /schedule).
 * Run with `npm run test:db` (TEST_DATABASE_URL, name must contain "test"; tables are truncated).
 */
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { channelsInRegion } from "@/domain/coverage";
import type { PrismaClient } from "@/generated/prisma/client";
import { importFixtures } from "@/ingest/fixtures";
import { inTimeBand, TIME_BANDS, type RerunMode, type TimeBand } from "@/lib/search-params";
import { createPrismaClient } from "@/server/prisma";

import { airingSqlWhere, airingWhere, type AiringFilter, type ChannelInfo } from "./common";

const url = process.env.TEST_DATABASE_URL;
// Boundary start minutes on the anime clock (05:00 … 28:59).
const BOUNDARIES = [5 * 60, 11 * 60 + 59, 12 * 60, 16 * 60 + 59, 17 * 60, 18 * 60 + 59, 19 * 60, 22 * 60 + 59, 23 * 60, 23 * 60 + 59, 24 * 60, 24 * 60 + 59, 25 * 60, 28 * 60 + 59];

let prisma: PrismaClient;
let channels: ChannelInfo[];
let rows: { id: number; animeStartMinute: number; isRerun: boolean; channelId: number }[];

async function viaPrisma(filter: AiringFilter): Promise<number[]> {
  const found = await prisma.broadcast.findMany({ where: airingWhere(filter, channels), select: { id: true }, orderBy: { id: "asc" } });
  return found.map((row) => row.id);
}

async function viaSql(filter: AiringFilter): Promise<number[]> {
  const found = await prisma.$queryRaw<{ id: number }[]>`
    SELECT b.id FROM "Broadcast" b JOIN "Title" t ON t.id = b."titleId" WHERE ${airingSqlWhere(filter, channels)} ORDER BY b.id`;
  return found.map((row) => row.id);
}

describe("time band filters (PostgreSQL)", () => {
  beforeAll(async () => {
    if (!url) throw new Error("TEST_DATABASE_URL is not set — see .env.example. DB tests never run against DATABASE_URL.");
    const dbName = new URL(url).pathname.slice(1);
    if (!dbName.includes("test")) throw new Error(`Refusing to truncate database "${dbName}": name must contain "test".`);
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    prisma = createPrismaClient(url);
    await prisma.$executeRawUnsafe(
      `TRUNCATE "SlotSeason","SlotMembership","Slot","BroadcastRevision","Broadcast","Title","Channel","CoverageWindow","FetchLog","RawPayload","ImportRun","SyncCursor" RESTART IDENTITY CASCADE`
    );
    await importFixtures(prisma);
    // Move the recorded airings onto the boundaries (recorded fixtures: 15 airings on one anime day).
    const ids = (await prisma.broadcast.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((row) => row.id);
    expect(ids.length).toBeGreaterThanOrEqual(BOUNDARIES.length);
    for (const [index, id] of ids.entries()) {
      await prisma.broadcast.update({ where: { id }, data: { animeStartMinute: BOUNDARIES[index % BOUNDARIES.length]! } });
    }
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
    rows = await prisma.broadcast.findMany({
      where: { deleted: false, missingSince: null },
      select: { id: true, animeStartMinute: true, isRerun: true, channelId: true },
      orderBy: { id: "asc" }
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const bands = [null, ...(Object.keys(TIME_BANDS) as TimeBand[])];

  it.each(bands)("band %s: Prisma, SQL and inTimeBand select the same airings", async (band) => {
    const filter: AiringFilter = { band, rerun: "include", allKinds: true };
    const expected = rows.filter((row) => band === null || inTimeBand(row.animeStartMinute, band)).map((row) => row.id);
    expect(await viaPrisma(filter)).toEqual(expected);
    expect(await viaSql(filter)).toEqual(expected);
  });

  it("latenight selects 23:00–28:59 starts only", async () => {
    expect(new Set(rows.map((row) => row.animeStartMinute)).size).toBe(BOUNDARIES.length); // every boundary is present
    const selected = await viaSql({ band: "latenight", rerun: "include", allKinds: true });
    const selectedMinutes = new Set(rows.filter((row) => selected.includes(row.id)).map((row) => row.animeStartMinute));
    expect([...selectedMinutes].sort((a, b) => a - b)).toEqual([23 * 60, 23 * 60 + 59, 24 * 60, 24 * 60 + 59, 25 * 60, 28 * 60 + 59]);
  });

  it.each<[AiringFilter]>([
    [{ band: "latenight", network: "independent", rerun: "include", allKinds: true }],
    [{ region: "kanto", network: "independent", rerun: "include", allKinds: true }],
    [{ region: "bs", network: "cx", rerun: "include", allKinds: true }],
    [{ length: "standard", rerun: "include", allKinds: true }],
    [{ length: "short", rerun: "include", allKinds: true }],
    [{ band: "aftermidnight", length: "standard", rerun: "exclude", allKinds: true }]
  ])("network and length filters select the same airings in Prisma and SQL: %j", async (filter) => {
    expect(await viaSql(filter)).toEqual(await viaPrisma(filter));
  });

  it.each<[RerunMode, "kanto" | null]>([
    ["exclude", null],
    ["only", null],
    ["include", "kanto"]
  ])("combines with rerun=%s and region=%s identically in both filters", async (rerun, region) => {
    const filter: AiringFilter = { band: "latenight", rerun, region, allKinds: true };
    const prismaIds = await viaPrisma(filter);
    expect(await viaSql(filter)).toEqual(prismaIds);
    const kanto = new Set(channelsInRegion("kanto").map((c) => c.slug));
    const expected = rows
      .filter((row) => inTimeBand(row.animeStartMinute, "latenight"))
      .filter((row) => (rerun === "exclude" ? !row.isRerun : rerun === "only" ? row.isRerun : true))
      .filter((row) => region === null || kanto.has(channels.find((c) => c.id === row.channelId)?.slug ?? ""));
    expect(prismaIds).toEqual(expected.map((row) => row.id));
    expect(prismaIds.length).toBeGreaterThan(0);
  });
});

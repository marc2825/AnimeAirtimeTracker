/**
 * The sitemap queries aggregate in the database; each must return exactly what the rule computes from full rows.
 * Run with `npm run test:db` (TEST_DATABASE_URL, name must contain "test"; tables are truncated).
 */
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seasonOfAnimeDate, seasonOrdinal } from "@/domain/season";
import { dbDateToIsoDate } from "@/domain/time";
import type { PrismaClient } from "@/generated/prisma/client";
import { importFixtures } from "@/ingest/fixtures";
import { titleInSitemap } from "@/lib/sitemap";
import { createPrismaClient } from "@/server/prisma";

import { loadSitemapChangeTimes, loadSitemapSlots, loadSitemapTitles } from "./sitemap";

const url = process.env.TEST_DATABASE_URL;
let prisma: PrismaClient;

const maxDate = (dates: Date[]) => dates.reduce<Date | null>((max, date) => (!max || date > max ? date : max), null);
const bySlug = <T extends { slug: string }>(rows: T[]) => [...rows].sort((a, b) => a.slug.localeCompare(b.slug));

describe("sitemap queries (PostgreSQL)", () => {
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
    // A later change to one airing, so that channels, seasons and titles do not all share one change time.
    const changed = await prisma.broadcast.findFirstOrThrow({ where: { deleted: false, missingSince: null }, orderBy: { id: "asc" } });
    await prisma.broadcastRevision.create({ data: { broadcastId: changed.id, observedAt: new Date("2030-01-01T00:00:00Z"), changeType: "UPDATED", after: {} } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("dates channels and seasons by their airings' last revision", async () => {
    const revisions = await prisma.broadcastRevision.findMany({ select: { observedAt: true, broadcast: { select: { animeDate: true, channel: { select: { slug: true } } } } } });
    const channels = new Map<string, Date[]>();
    const seasons = new Map<number, Date[]>();
    for (const revision of revisions) {
      const ordinal = seasonOrdinal(seasonOfAnimeDate(dbDateToIsoDate(revision.broadcast.animeDate)));
      channels.set(revision.broadcast.channel.slug, [...(channels.get(revision.broadcast.channel.slug) ?? []), revision.observedAt]);
      seasons.set(ordinal, [...(seasons.get(ordinal) ?? []), revision.observedAt]);
    }
    const actual = await loadSitemapChangeTimes(prisma);
    expect(bySlug(actual.channels)).toEqual(bySlug([...channels].map(([slug, dates]) => ({ slug, lastModified: maxDate(dates)! }))));
    expect([...actual.seasons].sort((a, b) => a.ordinal - b.ordinal)).toEqual([...seasons].map(([ordinal, dates]) => ({ ordinal, lastModified: maxDate(dates)! })).sort((a, b) => a.ordinal - b.ordinal));
    expect(actual.latest).toEqual(new Date("2030-01-01T00:00:00Z"));
    expect(actual.channels.length).toBeGreaterThan(1);
  });

  it("lists title pages by the sitemap rule, dated by the later of the title and its airings", async () => {
    const titles = await prisma.title.findMany({
      include: { broadcasts: { include: { revisions: { select: { observedAt: true } } } }, memberships: { select: { id: true } } }
    });
    // One title joins a slot; it qualifies through that alone.
    const slotted = titles.find((title) => title.broadcasts.some((b) => !b.deleted && !b.missingSince))!;
    const slot = await prisma.slot.create({ data: { slug: "test-slot", name: "テスト枠", kind: "SOURCE_LABEL", ruleVersion: "t", computedAt: new Date() } });
    await prisma.slotMembership.create({ data: { slotId: slot.id, titleId: slotted.id, method: "SOURCE_COMMENT", confidence: "HIGH" } });

    const expected = (since: string) =>
      titles
        .map((title) => {
          const live = title.broadcasts.filter((b) => !b.deleted && !b.missingSince);
          const last = live.map((b) => dbDateToIsoDate(b.animeDate)).sort().at(-1) ?? null;
          const facts = { liveAirings: live.length, lastAnimeDate: last, inSlot: title.id === slotted.id || title.memberships.length > 0 };
          return { title, facts };
        })
        .filter(({ facts }) => titleInSitemap(facts, since))
        .map(({ title }) => ({ slug: title.slug, lastModified: maxDate([title.updatedAt, ...title.broadcasts.flatMap((b) => b.revisions.map((r) => r.observedAt))])! }));

    // The fixture airings are all on one day: the cutoff decides between "recent" and "only through the slot".
    const day = dbDateToIsoDate(titles.flatMap((title) => title.broadcasts).find((b) => !b.deleted)!.animeDate);
    for (const since of [day, "2099-01-01"]) {
      expect(bySlug(await loadSitemapTitles(since, prisma)), since).toEqual(bySlug(expected(since)));
    }
    expect((await loadSitemapTitles("2099-01-01", prisma)).map((title) => title.slug)).toEqual([slotted.slug]);
    // A title whose airings are all deleted is never listed, even when recent.
    const deletedOnly = titles.filter((title) => title.broadcasts.length > 0 && title.broadcasts.every((b) => b.deleted || b.missingSince));
    const listed = new Set((await loadSitemapTitles(day, prisma)).map((title) => title.slug));
    for (const title of deletedOnly) expect(listed.has(title.slug), title.slug).toBe(false);
  });

  it("dates slots by their members' airings on the member's channel", async () => {
    const broadcasts = await prisma.broadcast.findMany({ include: { revisions: { select: { observedAt: true } } } });
    const title = broadcasts[0]!.titleId;
    const onChannel = broadcasts[0]!.channelId;
    const otherChannel = (await prisma.channel.findFirstOrThrow({ where: { id: { not: onChannel } } })).id;
    const computedAt = new Date();
    for (const [slug, channelId] of [["test-any", null], ["test-on", onChannel], ["test-off", otherChannel]] as const) {
      const slot = await prisma.slot.create({ data: { slug, name: slug, kind: "INFERRED", ruleVersion: "t", computedAt } });
      await prisma.slotMembership.create({ data: { slotId: slot.id, titleId: title, channelId, method: "TIME_POSITION", confidence: "MEDIUM" } });
    }
    await prisma.slot.create({ data: { slug: "test-none", name: "空", kind: "INFERRED", ruleVersion: "t", computedAt } });

    const latest = (filter: (b: (typeof broadcasts)[number]) => boolean) => maxDate(broadcasts.filter((b) => b.titleId === title && filter(b)).flatMap((b) => b.revisions.map((r) => r.observedAt)));
    const actual = new Map((await loadSitemapSlots(prisma)).map((row) => [row.slug, row.lastModified]));
    expect(actual.get("test-any")).toEqual(latest(() => true));
    expect(actual.get("test-on")).toEqual(latest((b) => b.channelId === onChannel));
    expect(actual.get("test-off")).toEqual(latest((b) => b.channelId === otherChannel));
    expect(actual.get("test-none")).toBeNull();
  });
});

/**
 * DB integration tests (real PostgreSQL). Run with `npm run test:db`; requires TEST_DATABASE_URL pointing
 * at a disposable database whose name contains "test" — every table is truncated between tests.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { fromAnimeTime, isoDateToDbDate, parseJstDateTime, toAnimeTime } from "@/domain/time";
import { createPrismaClient } from "@/server/prisma";

import { rebuildSlots, reclassifyReruns } from "./derive";
import { FIXTURE_CHANNEL_IDS, FIXTURE_WINDOW, importFixtures } from "./fixtures";
import { importBroadcasts, upsertTitles } from "./importer";
import type { OverridesFile } from "./overrides";
import { normalizeProgram, normalizeTitle, type NormalizedBroadcast } from "./syoboi/normalize";
import { parseProgLookup, parseTitleLookup } from "./syoboi/parse";

const url = process.env.TEST_DATABASE_URL;
const NO_OVERRIDES: OverridesFile = { broadcasts: [], titles: [], slotMemberships: [] };
const fixture = (name: string) => readFileSync(path.join(process.cwd(), "src/ingest/syoboi/__fixtures__", name), "utf8");
const programs = () => parseProgLookup(fixture("prog-2026-11-16-mx-bs11-cx.xml")).items.map(normalizeProgram);
const byPid = (list: NormalizedBroadcast[], pid: string) => list.find((b) => b.externalId === pid)!;

/** Re-normalize after editing raw fields so the content hash reflects the change. */
function edited(pid: string, edit: (raw: ReturnType<typeof parseProgLookup>["items"][number]) => void): NormalizedBroadcast {
  const raw = parseProgLookup(fixture("prog-2026-11-16-mx-bs11-cx.xml")).items.find((item) => item.PID === pid)!;
  edit(raw);
  return normalizeProgram(raw);
}

let prisma: PrismaClient;

describe("importer (PostgreSQL)", () => {
  beforeAll(() => {
    if (!url) throw new Error("TEST_DATABASE_URL is not set — see .env.example. DB tests never run against DATABASE_URL.");
    const dbName = new URL(url).pathname.slice(1);
    if (!dbName.includes("test")) throw new Error(`Refusing to truncate database "${dbName}": name must contain "test".`);
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    prisma = createPrismaClient(url);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "SlotSeason","SlotMembership","Slot","BroadcastRevision","Broadcast","Title","Channel","CoverageWindow","FetchLog","RawPayload","ImportRun","SyncCursor" RESTART IDENTITY CASCADE`
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("imports fixtures with correct associations and anime-time fields", async () => {
    const { stats } = await importFixtures(prisma);
    expect(stats).toMatchObject({ received: 15, created: 15, updated: 0, rejectedMissingTitle: 0 });
    const psyren = await prisma.broadcast.findFirstOrThrow({ where: { externalId: "720086" }, include: { title: true, channel: true } });
    expect(psyren.title.externalId).toBe("8053");
    expect(psyren.channel.slug).toBe("mx");
    expect(psyren.animeWeekday).toBe(0);
    expect(psyren.animeStartMinute).toBe(23 * 60);
    const lateNight = await prisma.broadcast.findFirstOrThrow({ where: { externalId: "721549" } });
    expect(lateNight.animeStartMinute).toBe(24 * 60 + 30);
    expect(lateNight.animeDate.toISOString().slice(0, 10)).toBe("2026-11-16");
    const run = await prisma.importRun.findFirstOrThrow({ where: { command: "fixtures" } });
    expect(run.status).toBe("SUCCEEDED");
  });

  it("is idempotent: a second identical import creates no rows or revisions", async () => {
    await importFixtures(prisma);
    const revisionsBefore = await prisma.broadcastRevision.count();
    const { stats } = await importFixtures(prisma);
    expect(stats).toMatchObject({ created: 0, updated: 0, unchanged: 15 });
    expect(await prisma.broadcast.count()).toBe(15);
    expect(await prisma.title.count()).toBe(11);
    expect(await prisma.broadcastRevision.count()).toBe(revisionsBefore);
  });

  it("records a RESCHEDULED revision when an airing moves, keeping a single row", async () => {
    await importFixtures(prisma);
    const moved = edited("720086", (raw) => {
      raw.StTime = "2026-11-16 23:30:00";
      raw.EdTime = "2026-11-17 00:00:00";
    });
    const stats = await importBroadcasts(prisma, [moved], { importRunId: null, overrides: NO_OVERRIDES, now: new Date() });
    expect(stats).toMatchObject({ updated: 1, created: 0 });
    const row = await prisma.broadcast.findFirstOrThrow({ where: { externalId: "720086" }, include: { revisions: { orderBy: { id: "asc" } } } });
    expect(row.animeStartMinute).toBe(23 * 60 + 30);
    expect(row.revisions.map((r) => r.changeType)).toEqual(["CREATED", "RESCHEDULED"]);
    expect((row.revisions[1]!.before as { startAt: string }).startAt).toBe(parseJstDateTime("2026-11-16 23:00:00").toISOString());
  });

  it("keeps source-deleted airings as rows flagged deleted (non-destructive)", async () => {
    await importFixtures(prisma);
    const cancelled = edited("719299", (raw) => {
      raw.Deleted = 1;
    });
    await importBroadcasts(prisma, [cancelled], { importRunId: null, overrides: NO_OVERRIDES, now: new Date() });
    const row = await prisma.broadcast.findFirstOrThrow({ where: { externalId: "719299" }, include: { revisions: true } });
    expect(row.deleted).toBe(true);
    expect(row.revisions.some((r) => r.changeType === "DELETED")).toBe(true);
  });

  it("infers absence only from complete windows", async () => {
    await importFixtures(prisma);
    const withoutOne = programs().filter((b) => b.externalId !== "718425");
    // Partial (incremental) batch: nothing may be marked missing.
    await importBroadcasts(prisma, withoutOne, { importRunId: null, overrides: NO_OVERRIDES, now: new Date() });
    expect((await prisma.broadcast.findFirstOrThrow({ where: { externalId: "718425" } })).missingSince).toBeNull();
    // Complete window re-fetch: the absent airing is marked, not deleted.
    const stats = await importBroadcasts(prisma, withoutOne, {
      importRunId: null,
      overrides: NO_OVERRIDES,
      now: new Date(),
      completeWindow: { window: FIXTURE_WINDOW, channelExternalIds: FIXTURE_CHANNEL_IDS }
    });
    expect(stats.markedMissing).toBe(1);
    expect((await prisma.broadcast.findFirstOrThrow({ where: { externalId: "718425" } })).missingSince).not.toBeNull();
    // It reappears → cleared.
    await importBroadcasts(prisma, programs(), { importRunId: null, overrides: NO_OVERRIDES, now: new Date() });
    expect((await prisma.broadcast.findFirstOrThrow({ where: { externalId: "718425" } })).missingSince).toBeNull();
  });

  it("applies manual overrides on every import and keeps change detection on source values", async () => {
    const overrides: OverridesFile = {
      broadcasts: [{ externalId: "720086", field: "isRerun", value: true, reason: "テスト用の補正", evidence: "unit test", addedAt: "2026-11-18" }],
      titles: [{ externalId: "8053", field: "name", value: "PSYREN（補正）", reason: "テスト用の補正", evidence: "unit test", addedAt: "2026-11-18" }],
      slotMemberships: []
    };
    await importFixtures(prisma, overrides);
    await importFixtures(prisma, overrides);
    const row = await prisma.broadcast.findFirstOrThrow({ where: { externalId: "720086" }, include: { title: true, revisions: true } });
    expect(row.isRerun).toBe(true);
    expect(row.rerunBasis).toBe("MANUAL");
    expect(row.title.name).toBe("PSYREN（補正）");
    expect(row.revisions).toHaveLength(1); // only CREATED: overrides never cause churn
    // derive must not undo a manual decision
    await reclassifyReruns(prisma);
    expect((await prisma.broadcast.findFirstOrThrow({ where: { externalId: "720086" } })).rerunBasis).toBe("MANUAL");
  });

  it("rolls back the whole batch when a write fails", async () => {
    await importFixtures(prisma);
    const good = edited("717787", (raw) => {
      raw.SubTitle = "変更されたサブタイトル";
    });
    const bad = { ...byPid(programs(), "720056"), externalId: "999999999", animeDate: "not-a-date" } as NormalizedBroadcast;
    await expect(importBroadcasts(prisma, [good, bad], { importRunId: null, overrides: NO_OVERRIDES, now: new Date() })).rejects.toThrow();
    expect((await prisma.broadcast.findFirstOrThrow({ where: { externalId: "717787" } })).subtitle).toBeNull();
    expect(await prisma.broadcast.count({ where: { externalId: "999999999" } })).toBe(0);
  });

  it("does not import airings whose title is unknown, and skips untracked channels", async () => {
    await importFixtures(prisma);
    const orphan = { ...byPid(programs(), "720056"), externalId: "888888888", titleExternalId: "99999999" };
    const untracked = { ...byPid(programs(), "720056"), externalId: "777777777", channelExternalId: "9999" };
    const stats = await importBroadcasts(prisma, [orphan, untracked], { importRunId: null, overrides: NO_OVERRIDES, now: new Date() });
    expect(stats).toMatchObject({ rejectedMissingTitle: 1, skippedUntrackedChannel: 1, created: 0 });
  });

  it("updates titles in place and reclassifies reruns when title details change", async () => {
    await importFixtures(prisma);
    const raw = parseTitleLookup(fixture("titles-sample.xml")).items.find((item) => item.TID === "8053")!;
    // Pretend the first run ended long ago: the unflagged airing becomes an AGE rerun after derive.
    await upsertTitles(prisma, [normalizeTitle({ ...raw, FirstEndYear: 2020, FirstEndMonth: 3 })], NO_OVERRIDES, new Date());
    expect(await prisma.title.count({ where: { externalId: "8053" } })).toBe(1);
    await reclassifyReruns(prisma);
    const row = await prisma.broadcast.findFirstOrThrow({ where: { externalId: "720086" } });
    expect(row).toMatchObject({ isRerun: true, rerunBasis: "AGE" });
  });

  it("rebuilds derived slots without touching source rows", async () => {
    await importFixtures(prisma);
    const before = await prisma.broadcast.count();
    const result = await rebuildSlots(prisma);
    // One season of fixtures cannot satisfy the inferred-slot rule and only one title carries a label.
    expect(result.byKind.INFERRED ?? 0).toBe(0);
    expect(await prisma.broadcast.count()).toBe(before);
  });

  it("stores the titles behind each derived slot season in airing order", async () => {
    await importFixtures(prisma);
    const channel = await prisma.channel.findFirstOrThrow({ where: { isTracked: true } });
    const titles = await Promise.all(
      ["遅い", "早い"].map((name, index) =>
        prisma.title.create({ data: { source: "test", externalId: `slot-${index}`, slug: `slot-test-${index}`, name, slotLabels: ["テスト枠"] } })
      )
    );
    // Same labelled slot, same autumn season: the second title (higher id) starts a week earlier at 23:30.
    const weekly = (titleId: number, firstDate: `${number}-${number}-${number}`, minute: number) =>
      Array.from({ length: 4 }, (_, week) => {
        const startAt = new Date(fromAnimeTime(firstDate, minute).getTime() + week * 7 * 86_400_000);
        const anime = toAnimeTime(startAt);
        return {
          source: "test",
          externalId: `slot-${titleId}-${week}`,
          titleId,
          channelId: channel.id,
          startAt,
          endAt: new Date(startAt.getTime() + 30 * 60_000),
          animeDate: isoDateToDbDate(anime.animeDate),
          animeWeekday: anime.weekday,
          animeStartMinute: anime.animeMinute,
          durationMinutes: 30,
          contentHash: "test"
        };
      });
    await prisma.broadcast.createMany({ data: [...weekly(titles[0]!.id, "2026-10-12", 1380), ...weekly(titles[1]!.id, "2026-10-05", 1410)] });

    await rebuildSlots(prisma);
    const slot = await prisma.slot.findUniqueOrThrow({ where: { slug: "テスト枠" }, include: { seasons: true } });
    expect(slot.seasons).toHaveLength(1);
    expect(slot.seasons[0]).toMatchObject({ seasonOrdinal: 20264, titleCount: 2, titleIds: [titles[1]!.id, titles[0]!.id] });
  });
});

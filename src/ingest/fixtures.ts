/**
 * Loads the recorded Syoboi fixtures (real responses captured 2026-11-18) through the same parse →
 * normalize → import path as live ingestion, without any network access. Used by `npm run db:fixtures`,
 * DB integration tests and E2E tests. Non-destructive: it only upserts.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PrismaClient } from "@/generated/prisma/client";
import { parseJstDateTime } from "@/domain/time";

import { importBroadcasts, upsertTitles, upsertTrackedChannels } from "./importer";
import type { OverridesFile } from "./overrides";
import { extractSlotLabels, normalizeProgram, normalizeTitle } from "./syoboi/normalize";
import { parseChGroupLookup, parseChLookup, parseProgLookup, parseTitleLookup } from "./syoboi/parse";
import { withImportRun } from "./sync";

export const FIXTURE_DIR = path.join(process.cwd(), "src/ingest/syoboi/__fixtures__");
/** The recorded ProgLookup covers this complete anime day for ChID 19, 128 and 3. */
export const FIXTURE_WINDOW = { start: parseJstDateTime("2026-11-16 05:00:00"), end: parseJstDateTime("2026-11-17 05:00:00") };
export const FIXTURE_CHANNEL_IDS = ["19", "128", "3"];

const read = (name: string) => readFile(path.join(FIXTURE_DIR, name), "utf8");

export async function importFixtures(prisma: PrismaClient, overrides: OverridesFile = { broadcasts: [], titles: [], slotMemberships: [] }) {
  return withImportRun(prisma, "fixtures", { source: "recorded fixtures" }, async (importRunId) => {
    const channels = parseChLookup(await read("channels-tracked.xml"));
    const groups = parseChGroupLookup(await read("chgroups.xml"));
    await upsertTrackedChannels(prisma, channels.items, groups.items);

    const titles = parseTitleLookup(await read("titles-sample.xml"));
    const now = new Date();
    await upsertTitles(
      prisma,
      titles.items.map(normalizeTitle),
      overrides,
      now,
      new Map(titles.items.map((item) => [item.TID, extractSlotLabels(item.Comment)]))
    );

    const programs = parseProgLookup(await read("prog-2026-11-16-mx-bs11-cx.xml"));
    const stats = await importBroadcasts(prisma, programs.items.map(normalizeProgram), {
      importRunId,
      overrides,
      now,
      completeWindow: { window: FIXTURE_WINDOW, channelExternalIds: FIXTURE_CHANNEL_IDS }
    });
    await prisma.coverageWindow.create({
      data: { source: "syoboi", rangeStart: FIXTURE_WINDOW.start, rangeEnd: FIXTURE_WINDOW.end, channelIds: FIXTURE_CHANNEL_IDS, rowCount: programs.rowCount, importRunId }
    });
    return { stats, range: FIXTURE_WINDOW };
  });
}

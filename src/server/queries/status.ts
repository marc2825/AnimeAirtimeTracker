import { seasonInstantRange, type Season } from "@/domain/season";
import { toAnimeTime, type IsoDate } from "@/domain/time";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";
import { summarizeRunError } from "../run-error";

export interface DatasetStatus {
  lastSuccessAt: Date | null;
  coverage: { start: Date; end: Date } | null;
  totals: { broadcasts: number; titles: number; channels: number; slots: number };
  /** Public view of recent runs: the raw `ImportRun.error` stays in the database for operators. */
  recentRuns: { id: number; command: string; status: string; startedAt: Date; finishedAt: Date | null; requestCount: number; errorSummary: string | null }[];
}

const DATA_COMMANDS = ["season", "backfill", "recent", "update", "channels", "fixtures"];

export async function getDatasetStatus(): Promise<DatasetStatus> {
  "use cache";
  datasetCacheProfile();
  const prisma = db();
  const [lastSuccess, coverage, broadcasts, titles, channels, slots, recentRuns] = await Promise.all([
    prisma.importRun.findFirst({ where: { status: "SUCCEEDED", command: { in: DATA_COMMANDS } }, orderBy: { finishedAt: "desc" } }),
    prisma.coverageWindow.aggregate({ _min: { rangeStart: true }, _max: { rangeEnd: true } }),
    prisma.broadcast.count({ where: { deleted: false, missingSince: null } }),
    prisma.title.count(),
    prisma.channel.count({ where: { isTracked: true } }),
    prisma.slot.count(),
    prisma.importRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 12,
      select: { id: true, command: true, status: true, startedAt: true, finishedAt: true, requestCount: true, error: true }
    })
  ]);
  return {
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    coverage: coverage._min.rangeStart && coverage._max.rangeEnd ? { start: coverage._min.rangeStart, end: coverage._max.rangeEnd } : null,
    totals: { broadcasts, titles, channels, slots },
    recentRuns: recentRuns.map((run) => ({
      id: run.id,
      command: run.command,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      requestCount: run.requestCount,
      errorSummary: summarizeRunError(run.error)
    }))
  };
}

/** First and last anime dates with fetched data (for date pickers); empty when unknown or unreadable. */
export async function coverageDates(): Promise<{ min?: IsoDate; max?: IsoDate }> {
  try {
    const { coverage } = await getDatasetStatus();
    if (!coverage) return {};
    // The range end is exclusive.
    return { min: toAnimeTime(coverage.start).animeDate, max: toAnimeTime(new Date(coverage.end.getTime() - 1)).animeDate };
  } catch {
    return {};
  }
}

/** Fraction (0–1) of a season's time range covered by complete fetch windows, plus seasons that have any coverage. */
export async function getSeasonCoverage(season: Season): Promise<{ fraction: number; coveredUntil: Date | null }> {
  "use cache";
  datasetCacheProfile();
  const range = seasonInstantRange(season);
  const windows = await db().coverageWindow.findMany({
    where: { rangeEnd: { gt: range.start }, rangeStart: { lt: range.end } },
    select: { rangeStart: true, rangeEnd: true },
    orderBy: { rangeStart: "asc" }
  });
  let covered = 0;
  let cursor = range.start.getTime();
  let coveredUntil: number | null = null;
  for (const window of windows) {
    const start = Math.max(window.rangeStart.getTime(), cursor);
    const end = Math.min(window.rangeEnd.getTime(), range.end.getTime());
    if (end > start) {
      covered += end - start;
      cursor = end;
      coveredUntil = Math.max(coveredUntil ?? 0, end);
    }
  }
  return { fraction: covered / (range.end.getTime() - range.start.getTime()), coveredUntil: coveredUntil ? new Date(coveredUntil) : null };
}

export async function getCoveredSeasonOrdinals(): Promise<number[]> {
  "use cache";
  datasetCacheProfile();
  const rows = await db().$queryRaw<{ ordinal: number }[]>`
    SELECT DISTINCT (EXTRACT(YEAR FROM "animeDate")::int * 10 + ((EXTRACT(MONTH FROM "animeDate")::int - 1) / 3 + 1)) AS ordinal
    FROM "Broadcast" ORDER BY 1
  `;
  return rows.map((row) => Number(row.ordinal));
}

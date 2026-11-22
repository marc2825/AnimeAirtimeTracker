/**
 * Late-night anime over the years, computed from the per-season trend (src/domain/stats.ts seasonTrend with
 * the TREND_BANDS of the stats query). "Late night" is a title whose most frequent start time in the season
 * is 23:00 or later (bands `late` 23–25 and `latelate` 25+), the same rule as the trend chart on /stats.
 */
import type { SeasonTrendRow } from "../stats";

export interface LateNightSeason {
  seasonOrdinal: number;
  titles: number;
  /** Titles starting 23:00–24:59 (by their most frequent start time). */
  late: number;
  /** Titles starting 25:00 or later. */
  afterOne: number;
}

export interface LateNightYear {
  year: number;
  /** Seasons with data in that year (4 = complete). */
  seasons: number;
  /** Late-night titles per season, averaged over the year's seasons. */
  lateAverage: number;
  /** Late-night titles / all titles, over the year's seasons. */
  lateShare: number;
  /** Titles starting 25:00 or later / late-night titles, over the year's seasons. */
  afterOneShare: number;
}

export function lateNightSeasons(rows: SeasonTrendRow[]): LateNightSeason[] {
  return rows.map((row) => ({
    seasonOrdinal: row.seasonOrdinal,
    titles: row.titles,
    late: (row.bandTitles.late ?? 0) + (row.bandTitles.latelate ?? 0),
    afterOne: row.bandTitles.latelate ?? 0
  }));
}

export function lateNightByYear(seasons: LateNightSeason[]): LateNightYear[] {
  const byYear = new Map<number, LateNightSeason[]>();
  for (const season of seasons) {
    const year = Math.floor(season.seasonOrdinal / 10);
    byYear.set(year, [...(byYear.get(year) ?? []), season]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, list]) => {
      const titles = list.reduce((sum, s) => sum + s.titles, 0);
      const late = list.reduce((sum, s) => sum + s.late, 0);
      const afterOne = list.reduce((sum, s) => sum + s.afterOne, 0);
      return { year, seasons: list.length, lateAverage: late / list.length, lateShare: titles === 0 ? 0 : late / titles, afterOneShare: late === 0 ? 0 : afterOne / late };
    });
}

export interface LateNightFindings {
  /** Season with the most late-night titles in the comparable period. */
  peak: LateNightSeason;
  /** First and last complete years (4 seasons) of the comparable period. */
  first: LateNightYear;
  last: LateNightYear;
}

/**
 * Findings over the comparable period: from `fromYear` (when the source becomes complete) to the last complete
 * year. Only finished seasons count: the season airing now (`currentOrdinal`) and later ones still hold
 * planned airings, so a year that contains one is not complete. Null when fewer than two complete years.
 */
export function lateNightFindings(seasons: LateNightSeason[], fromYear: number, currentOrdinal: number): LateNightFindings | null {
  const comparable = seasons.filter((s) => Math.floor(s.seasonOrdinal / 10) >= fromYear && s.seasonOrdinal < currentOrdinal);
  const complete = lateNightByYear(comparable).filter((year) => year.seasons === 4);
  if (comparable.length === 0 || complete.length < 2) return null;
  const peak = comparable.reduce((best, s) => (s.late > best.late ? s : best));
  return { peak, first: complete[0]!, last: complete.at(-1)! };
}

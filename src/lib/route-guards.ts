/**
 * Request-time checks that need no database, run by `proxy.ts` before a page starts streaming. A streamed
 * page has already sent `200` when it finds out a record is missing (it then renders the not-found UI with
 * `noindex`), so anything that can be decided from the URL alone is answered here with a real 404.
 *
 * Only syntax and fixed lists are checked: a well-formed ID that is not in the database still reaches the
 * page, which renders not-found (200 + noindex). The proxy must not query the database.
 */
import { isAnalysisSlug } from "@/analysis/slugs";
import { FIRST_SEASON, TRACKED_CHANNELS } from "@/domain/coverage";
import { currentSeason, parseSeasonId, seasonOrdinal, shiftSeason } from "@/domain/season";

/** Syoboi Calendar TIDs: positive integers (7 digits leaves ample room). */
const TITLE_ID = /^[1-9]\d{0,6}$/;

const CHANNEL_SLUGS = new Set(TRACKED_CHANNELS.map((channel) => channel.slug));

function segment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Seasons the site can hold: from the first backfilled season to the next one (schedules are published ahead). */
export function isSeasonInScope(value: string, now: Date = new Date()): boolean {
  const season = parseSeasonId(value);
  if (!season) return false;
  const ordinal = seasonOrdinal(season);
  return ordinal >= seasonOrdinal(FIRST_SEASON) && ordinal <= seasonOrdinal(shiftSeason(currentSeason(now), 1));
}

/** `false` when the URL alone shows that the page cannot exist. Unknown paths are left to the router. */
export function routeExists(pathname: string, now: Date = new Date()): boolean {
  const match = /^\/(titles|seasons|channels|analysis)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return true;
  const value = segment(match[2]!);
  if (value === null) return false;
  switch (match[1]) {
    case "titles":
      return TITLE_ID.test(value);
    case "seasons":
      return isSeasonInScope(value, now);
    case "channels":
      return CHANNEL_SLUGS.has(value);
    case "analysis":
      return isAnalysisSlug(value);
    default:
      return true;
  }
}

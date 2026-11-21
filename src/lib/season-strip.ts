import { formatSeason, seasonFromOrdinal, seasonOrdinal, shiftSeason, type Season } from "@/domain/season";

export interface StripTick {
  ordinal: number;
  season: Season;
  /** The slot had a regular position this season. */
  on: boolean;
  heading: string;
  /** Title names, or a note when there are none to show. */
  lines: string[];
}

export const STRIP_NO_POSITION = "この枠での定時放送なし";
/** A filled season whose title names are not stored yet (derived before names were kept). */
export const STRIP_NAMES_UNKNOWN = "この枠で定時放送あり（作品名は未集計）";

/** The `count` seasons ending at `end`, oldest first, each with what its tick should say. */
export function stripTicks(ordinals: number[], end: Season, count: number, titles?: Record<number, string[]>): StripTick[] {
  const set = new Set(ordinals);
  return Array.from({ length: count }, (_, index) => {
    const season = shiftSeason(end, index - count + 1);
    const ordinal = seasonOrdinal(season);
    const on = set.has(ordinal);
    const names = on ? (titles?.[ordinal] ?? []) : [];
    return { ordinal, season, on, heading: formatSeason(season), lines: on ? (names.length > 0 ? names : [STRIP_NAMES_UNKNOWN]) : [STRIP_NO_POSITION] };
  });
}

/** What a screen reader hears for one filled tick (the tooltip shows the same text). */
export function stripTickLabel(tick: StripTick): string {
  return `${tick.heading}${LABEL_SEPARATOR}${tick.lines.join("、")}`;
}

const LABEL_SEPARATOR = "：";

/**
 * Tooltip text for the tick at `index` of a strip ending at `endOrdinal`, read back from the markup so the
 * page does not carry the text twice: filled ticks keep their names in aria-label (several names also in
 * `data-t`, newline-separated), empty ticks carry nothing.
 */
export function stripTooltipText(endOrdinal: number, count: number, index: number, filled: { label: string | null; names: string | null } | null) {
  const heading = formatSeason(shiftSeason(seasonFromOrdinal(endOrdinal), index - count + 1));
  if (!filled) return { heading, lines: [STRIP_NO_POSITION] };
  if (filled.names) return { heading, lines: filled.names.split("\n") };
  const label = filled.label ?? "";
  const at = label.indexOf(LABEL_SEPARATOR);
  return { heading, lines: [at >= 0 ? label.slice(at + LABEL_SEPARATOR.length) : STRIP_NAMES_UNKNOWN] };
}

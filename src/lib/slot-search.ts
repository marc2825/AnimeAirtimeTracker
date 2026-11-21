import { inTimeBand, type TimeBand } from "./search-params";

export interface SlotPosition {
  seasonOrdinal: number;
  weekday: number;
  minute: number;
  channelSlug: string;
}

export interface SlotCriteria {
  /**
   * Which season's position to judge: a season ordinal (the season chosen in the URL), `"any"` (全期間: any
   * season may match) or `"latest"` (no season chosen: each slot's latest season).
   */
  season: number | "any" | "latest";
  channelSlugs: ReadonlySet<string> | null;
  weekday: number | null;
  band: TimeBand | null;
}

/**
 * The season position on which a slot satisfies the criteria, or null when it does not.
 * `positions` must be newest first, so with "any" the most recent matching season is returned.
 */
export function matchSlotPosition(positions: readonly SlotPosition[], criteria: SlotCriteria): SlotPosition | null {
  const candidates =
    criteria.season === "latest" ? positions.slice(0, 1) : criteria.season === "any" ? positions : positions.filter((p) => p.seasonOrdinal === criteria.season);
  return (
    candidates.find(
      (p) =>
        (!criteria.channelSlugs || criteria.channelSlugs.has(p.channelSlug)) &&
        (criteria.weekday === null || p.weekday === criteria.weekday) &&
        (!criteria.band || inTimeBand(p.minute, criteria.band))
    ) ?? null
  );
}

/** True when nothing beyond the keyword narrows the list (the slot tab then lists every slot, as before). */
export function isUnfiltered(criteria: SlotCriteria): boolean {
  return criteria.season === "latest" && !criteria.channelSlugs && criteria.weekday === null && !criteria.band;
}

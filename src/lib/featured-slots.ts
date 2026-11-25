import { seasonFromOrdinal, seasonOrdinal, shiftSeason } from "@/domain/season";

export interface FeaturedSlotCandidate {
  slug: string;
  kind: "OFFICIAL" | "SOURCE_LABEL" | "INFERRED";
  seasonCount: number;
  latest: { seasonOrdinal: number } | null;
}

/**
 * Slots for the home page. Named slots (official, or named in the source) that aired in the latest season of the
 * data or the one before, in the list's order (most seasons first), up to `count`; when fewer are on air, other
 * named slots fill the rest. `more` is every other named slot on air, for plain text links under the cards.
 */
export function pickFeaturedSlots<S extends FeaturedSlotCandidate>(slots: S[], latestSeasonOrdinal: number, count = 8): { featured: S[]; more: S[] } {
  const named = slots.filter((slot) => slot.kind !== "INFERRED" && slot.seasonCount > 0);
  const since = seasonOrdinal(shiftSeason(seasonFromOrdinal(latestSeasonOrdinal), -1));
  const onAir = named.filter((slot) => slot.latest !== null && slot.latest.seasonOrdinal >= since);
  const featured = onAir.slice(0, count);
  if (featured.length < count) featured.push(...named.filter((slot) => !featured.includes(slot)).slice(0, count - featured.length));
  return { featured, more: onAir.filter((slot) => !featured.includes(slot)) };
}

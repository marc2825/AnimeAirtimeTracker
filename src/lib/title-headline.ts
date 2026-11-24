/**
 * What the top of a title page states besides its regular position: the next airing in the stored schedule,
 * and the slots the title belongs to (named slots first, then the inferred slot on the headline channel).
 * Pure: the page passes the current time.
 */

export interface HeadlineAiring {
  startAt: Date;
  deleted: boolean;
  missing: boolean;
}

/** The earliest airing that has not started yet, on any channel; deleted and no longer listed airings never count. */
export function nextAiring<G extends { broadcasts: HeadlineAiring[] }>(groups: G[], now: Date): { group: G; airing: G["broadcasts"][number] } | null {
  let best: { group: G; airing: G["broadcasts"][number] } | null = null;
  for (const group of groups) {
    for (const airing of group.broadcasts) {
      if (airing.deleted || airing.missing || airing.startAt <= now) continue;
      if (!best || airing.startAt < best.airing.startAt) best = { group, airing };
    }
  }
  return best;
}

export interface HeadlineSlot {
  slug: string;
  kind: string;
  channelShortName: string | null;
}

const KIND_ORDER: Record<string, number> = { OFFICIAL: 0, SOURCE_LABEL: 1, INFERRED: 2 };

/** Slots to name at the top: official and source-named slots first, then inferred ones on `channelShortName` first. */
export function headlineSlots<S extends HeadlineSlot>(slots: S[], channelShortName: string | null, limit = 2): { shown: S[]; more: number } {
  const ordered = [...slots].sort(
    (a, b) =>
      (KIND_ORDER[a.kind] ?? 3) - (KIND_ORDER[b.kind] ?? 3) ||
      Number(b.channelShortName === channelShortName) - Number(a.channelShortName === channelShortName)
  );
  return { shown: ordered.slice(0, limit), more: Math.max(0, ordered.length - limit) };
}

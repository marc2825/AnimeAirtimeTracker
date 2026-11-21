export interface OnAirCandidate {
  startAt: string;
  endAt: string;
  channelOrder: number;
}

/** Airings on air at `nowMs` ([start, end) — a show ending at 24:00 is off air at 24:00), in channel order. */
export function airingsOnAir<T extends OnAirCandidate>(airings: readonly T[], nowMs: number): T[] {
  return airings.filter((airing) => Date.parse(airing.startAt) <= nowMs && nowMs < Date.parse(airing.endAt)).sort((a, b) => a.channelOrder - b.channelOrder);
}

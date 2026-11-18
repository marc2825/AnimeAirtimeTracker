/**
 * Pure layout math for the day grid: which hours are shown, how empty stretches collapse,
 * and where each programme sits. Kept separate from React so it can be unit-tested.
 */
export const PX_PER_MINUTE = 2.2;
export const GAP_SEGMENT_PX = 30;
export const MIN_CELL_PX = 26;

export interface TimeSegment {
  kind: "active" | "gap";
  from: number;
  to: number;
  top: number;
  height: number;
}

export interface LayoutInput {
  id: number;
  column: string;
  start: number;
  duration: number;
}

export interface PlacedItem {
  id: number;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

export function buildSegments(items: Pick<LayoutInput, "start" | "duration">[]): TimeSegment[] {
  if (items.length === 0) return [];
  const active = new Array<boolean>(24).fill(false);
  for (const item of items) {
    const end = item.start + Math.max(1, item.duration);
    for (let hour = 5; hour < 29; hour += 1) {
      if (item.start < (hour + 1) * 60 && hour * 60 < end) active[hour - 5] = true;
    }
  }
  const first = active.indexOf(true);
  const last = active.lastIndexOf(true);
  const segments: TimeSegment[] = [];
  let top = 0;
  for (let index = first; index <= last; ) {
    const kind = active[index] ? "active" : "gap";
    let end = index;
    while (end + 1 <= last && active[end + 1] === active[index]) end += 1;
    const from = (index + 5) * 60;
    const to = (end + 6) * 60;
    const height = kind === "active" ? (to - from) * PX_PER_MINUTE : GAP_SEGMENT_PX;
    segments.push({ kind, from, to, top, height });
    top += height;
    index = end + 1;
  }
  return segments;
}

export function minuteToY(segments: TimeSegment[], minute: number): number | null {
  for (const segment of segments) {
    if (minute >= segment.from && minute < segment.to) {
      return segment.kind === "active" ? segment.top + (minute - segment.from) * PX_PER_MINUTE : segment.top + segment.height / 2;
    }
  }
  const last = segments.at(-1);
  return last && minute === last.to ? last.top + last.height : null;
}

export function totalHeight(segments: TimeSegment[]): number {
  const last = segments.at(-1);
  return last ? last.top + last.height : 0;
}

/** Place items; overlapping items in the same column share the width in lanes. */
export function placeItems(items: LayoutInput[], segments: TimeSegment[]): Map<number, PlacedItem> {
  const result = new Map<number, PlacedItem>();
  const byColumn = new Map<string, LayoutInput[]>();
  for (const item of items) {
    const list = byColumn.get(item.column) ?? [];
    list.push(item);
    byColumn.set(item.column, list);
  }
  for (const list of byColumn.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start || b.duration - a.duration || a.id - b.id);
    // Cluster transitively overlapping items, then assign lanes within each cluster.
    let cluster: LayoutInput[] = [];
    let clusterEnd = -Infinity;
    const flush = () => {
      const laneEnds: number[] = [];
      const lanesOf = new Map<number, number>();
      for (const item of cluster) {
        const end = item.start + Math.max(1, item.duration);
        let lane = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(end);
        } else {
          laneEnds[lane] = end;
        }
        lanesOf.set(item.id, lane);
      }
      for (const item of cluster) {
        const top = minuteToY(segments, item.start) ?? 0;
        const bottom = minuteToY(segments, item.start + Math.max(1, item.duration)) ?? top + MIN_CELL_PX;
        const round = (value: number) => Math.round(value * 10) / 10;
        result.set(item.id, { id: item.id, top: round(top), height: round(Math.max(MIN_CELL_PX, bottom - top)), lane: lanesOf.get(item.id)!, lanes: laneEnds.length });
      }
      cluster = [];
    };
    for (const item of sorted) {
      const end = item.start + Math.max(1, item.duration);
      if (cluster.length > 0 && item.start >= clusterEnd) flush();
      clusterEnd = cluster.length === 0 ? end : Math.max(clusterEnd, end);
      cluster.push(item);
    }
    if (cluster.length > 0) flush();
  }
  return result;
}

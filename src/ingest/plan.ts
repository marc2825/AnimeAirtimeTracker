import { toSyoboiTimestamp } from "@/domain/time";

/** Half-open instant window [start, end). */
export interface TimeWindow {
  start: Date;
  end: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Split [start, end) into consecutive windows of at most `maxDays` days. */
export function splitRange(range: TimeWindow, maxDays: number): TimeWindow[] {
  if (range.end.getTime() <= range.start.getTime()) return [];
  const step = maxDays * DAY_MS;
  const windows: TimeWindow[] = [];
  for (let cursor = range.start.getTime(); cursor < range.end.getTime(); cursor += step) {
    windows.push({ start: new Date(cursor), end: new Date(Math.min(cursor + step, range.end.getTime())) });
  }
  return windows;
}

export function halveWindow(window: TimeWindow): [TimeWindow, TimeWindow] {
  const middle = new Date(window.start.getTime() + Math.floor((window.end.getTime() - window.start.getTime()) / 2 / 60_000) * 60_000);
  return [
    { start: window.start, end: middle },
    { start: middle, end: window.end }
  ];
}

export function windowDurationMs(window: TimeWindow): number {
  return window.end.getTime() - window.start.getTime();
}

/** db.php `Range` parameter: matches programs with Range0 < EdTime AND StTime < Range1. */
export function toRangeParam(window: TimeWindow): string {
  return `${toSyoboiTimestamp(window.start)}-${toSyoboiTimestamp(window.end)}`;
}

/** db.php `LastUpdate` lower bound: `YYYYMMDD_HHMMSS-`. */
export function toLastUpdateSinceParam(since: Date, until?: Date): string {
  return `${toSyoboiTimestamp(since)}-${until ? toSyoboiTimestamp(until) : ""}`;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

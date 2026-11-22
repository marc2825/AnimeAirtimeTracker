/** Scheduled ingestion runs every 6 hours; data older than this means ingestion has stopped. */
export const STALE_AFTER_HOURS = 48;

/** Hours since the last successful import, or null when there has never been one. */
export function dataAgeHours(lastSuccessAt: Date | null, now: Date = new Date()): number | null {
  return lastSuccessAt ? (now.getTime() - lastSuccessAt.getTime()) / 3_600_000 : null;
}

/** True when there is no successful import yet or the last one is older than {@link STALE_AFTER_HOURS}. */
export function isDataStale(lastSuccessAt: Date | null, now: Date = new Date()): boolean {
  const age = dataAgeHours(lastSuccessAt, now);
  return age === null || age > STALE_AFTER_HOURS;
}

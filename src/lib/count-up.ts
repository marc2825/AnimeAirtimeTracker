/**
 * Value shown at `progress` (0–1) of a count-up to `to`: exponential ease-out, so the digits race at first and
 * settle on the final value. Whole numbers only, never above `to`, and exactly `to` at the end.
 */
export function countUpValue(to: number, progress: number): number {
  if (progress >= 1) return to;
  if (progress <= 0) return 0;
  return Math.min(to, Math.round(to * (1 - Math.pow(2, -10 * progress))));
}

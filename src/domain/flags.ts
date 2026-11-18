/**
 * Syoboi Calendar program flags (bitmask, documented in rss2.php spec):
 * 1 = 注 (note), 2 = 新 (new series / first episode), 4 = 終 (final), 8 = 再 (rerun).
 *
 * The absence of the 再 bit does NOT prove a first run — it only means the source did not flag it.
 */
export const FLAG_NOTE = 1;
export const FLAG_NEW = 2;
export const FLAG_FINAL = 4;
export const FLAG_RERUN = 8;

export interface BroadcastFlags {
  note: boolean;
  isNew: boolean;
  isFinal: boolean;
  rerun: boolean;
}

export function decodeFlags(value: number | null | undefined): BroadcastFlags {
  const bits = value ?? 0;
  return {
    note: (bits & FLAG_NOTE) !== 0,
    isNew: (bits & FLAG_NEW) !== 0,
    isFinal: (bits & FLAG_FINAL) !== 0,
    rerun: (bits & FLAG_RERUN) !== 0
  };
}

export function encodeFlags(flags: BroadcastFlags): number {
  return (
    (flags.note ? FLAG_NOTE : 0) |
    (flags.isNew ? FLAG_NEW : 0) |
    (flags.isFinal ? FLAG_FINAL : 0) |
    (flags.rerun ? FLAG_RERUN : 0)
  );
}

export type RerunBasis = "FLAG" | "AGE" | "MANUAL" | "NONE";

/** Months after the title's first-run end month after which an unflagged airing is treated as a rerun. */
export const RERUN_AGE_THRESHOLD_MONTHS = 6;

/**
 * Decide whether an airing is a rerun.
 * - FLAG: the source flagged it 再.
 * - AGE: the source records when the title's first run ended, and this airing starts more than
 *   {@link RERUN_AGE_THRESHOLD_MONTHS} months after that month. Titles with an open-ended first run are never AGE.
 * - NONE: no evidence; treated as not-a-rerun for statistics (documented limitation).
 */
export function classifyRerun(input: {
  flagRerun: boolean;
  airingYear: number;
  airingMonth: number;
  firstEndYear: number | null;
  firstEndMonth: number | null;
}): { isRerun: boolean; basis: RerunBasis } {
  if (input.flagRerun) {
    return { isRerun: true, basis: "FLAG" };
  }
  if (input.firstEndYear && input.firstEndMonth && input.firstEndMonth >= 1 && input.firstEndMonth <= 12) {
    const airingIndex = input.airingYear * 12 + (input.airingMonth - 1);
    const endIndex = input.firstEndYear * 12 + (input.firstEndMonth - 1);
    if (airingIndex - endIndex > RERUN_AGE_THRESHOLD_MONTHS) {
      return { isRerun: true, basis: "AGE" };
    }
  }
  return { isRerun: false, basis: "NONE" };
}

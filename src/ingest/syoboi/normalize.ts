import { createHash } from "node:crypto";

import { decodeFlags } from "@/domain/flags";
import { parseJstDateTime, toAnimeTime, type IsoDate, type Weekday } from "@/domain/time";

import type { SyoboiProgram, SyoboiTitle } from "./parse";

export const SOURCE_SYOBOI = "syoboi";

/** Deterministic JSON with sorted keys, so hashes do not depend on property order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashSemantic(value: unknown): string {
  return sha256(stableStringify(value));
}

export interface NormalizedTitle {
  externalId: string;
  name: string;
  shortName: string | null;
  yomi: string | null;
  nameEn: string | null;
  sourceCategory: number | null;
  firstYear: number | null;
  firstMonth: number | null;
  firstEndYear: number | null;
  firstEndMonth: number | null;
  firstChannelText: string | null;
  officialUrl: string | null;
  slotLabels: string[];
  seriesKey: string | null;
  sourceUpdatedAt: Date | null;
  contentHash: string;
}

export interface NormalizedBroadcast {
  externalId: string;
  titleExternalId: string;
  channelExternalId: string;
  startAt: Date;
  endAt: Date;
  startOffsetSeconds: number | null;
  animeDate: IsoDate;
  animeWeekday: Weekday;
  animeStartMinute: number;
  durationMinutes: number;
  episodeNumber: number | null;
  episodeLabel: string | null;
  subtitle: string | null;
  comment: string | null;
  flagNote: boolean;
  flagNew: boolean;
  flagFinal: boolean;
  flagRerun: boolean;
  warn: number | null;
  deleted: boolean;
  sourceRevision: number | null;
  sourceUpdatedAt: Date | null;
  contentHash: string;
}

/** Fields that define a broadcast for change detection (excludes fetch metadata and source bookkeeping). */
export function broadcastSemanticFields(b: Omit<NormalizedBroadcast, "contentHash" | "sourceRevision" | "sourceUpdatedAt">) {
  return {
    externalId: b.externalId,
    titleExternalId: b.titleExternalId,
    channelExternalId: b.channelExternalId,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    startOffsetSeconds: b.startOffsetSeconds,
    episodeNumber: b.episodeNumber,
    episodeLabel: b.episodeLabel,
    subtitle: b.subtitle,
    comment: b.comment,
    flagNote: b.flagNote,
    flagNew: b.flagNew,
    flagFinal: b.flagFinal,
    flagRerun: b.flagRerun,
    warn: b.warn,
    deleted: b.deleted
  };
}

function cleanText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.replace(/\r\n?/g, "\n").trim();
  return trimmed === "" ? null : trimmed;
}

export class NormalizeError extends Error {}

export function normalizeProgram(raw: SyoboiProgram): NormalizedBroadcast {
  const startAt = parseJstDateTime(raw.StTime);
  const endAt = parseJstDateTime(raw.EdTime);
  if (endAt.getTime() < startAt.getTime()) {
    throw new NormalizeError(`PID ${raw.PID}: EdTime before StTime`);
  }
  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
  if (durationMinutes > 24 * 60) {
    throw new NormalizeError(`PID ${raw.PID}: duration exceeds 24h`);
  }
  const anime = toAnimeTime(startAt);
  const flags = decodeFlags(raw.Flag);
  const countText = cleanText(raw.Count);
  const episodeNumber = countText !== null && /^\d{1,5}$/.test(countText) ? Number(countText) : null;

  const base = {
    externalId: raw.PID,
    titleExternalId: raw.TID,
    channelExternalId: raw.ChID,
    startAt,
    endAt,
    startOffsetSeconds: raw.StOffset,
    animeDate: anime.animeDate,
    animeWeekday: anime.weekday,
    animeStartMinute: anime.animeMinute,
    durationMinutes,
    episodeNumber,
    episodeLabel: episodeNumber === null ? countText : null,
    subtitle: cleanText(raw.SubTitle),
    comment: cleanText(raw.ProgComment),
    flagNote: flags.note,
    flagNew: flags.isNew,
    flagFinal: flags.isFinal,
    flagRerun: flags.rerun,
    warn: raw.Warn,
    deleted: raw.Deleted === 1
  };
  return {
    ...base,
    sourceRevision: raw.Revision,
    sourceUpdatedAt: raw.LastUpdate ? parseJstDateTime(raw.LastUpdate) : null,
    contentHash: hashSemantic(broadcastSemanticFields(base))
  };
}

/**
 * Slot labels quoted in a title comment. Only explicit statements that a title aired in a named
 * slot are accepted, e.g. `-「ノイタミナ」枠で放送` or `-「アニメイズム」枠にて放送`.
 */
const SLOT_LABEL_RE = /「([^「」\n]{1,40})」枠(?:で|にて|内で|内にて)(?:の)?(?:放送|放映)/g;

export function extractSlotLabels(comment: string | null): { label: string; evidence: string }[] {
  if (!comment) return [];
  const results = new Map<string, string>();
  for (const line of comment.split(/\r?\n/)) {
    for (const match of line.matchAll(SLOT_LABEL_RE)) {
      const label = normalizeSlotLabel(match[1] ?? "");
      if (label && !results.has(label)) {
        results.set(label, line.trim().replace(/^[-*:\s]+/, "").slice(0, 160));
      }
    }
  }
  return [...results.entries()].map(([label, evidence]) => ({ label, evidence }));
}

export function normalizeSlotLabel(label: string): string {
  return label.normalize("NFKC").replace(/\s+/g, " ").trim();
}

const OFFICIAL_LINK_RE = /\[\[公式(?:サイト|HP|ホームページ)?\s+(https?:\/\/[^\s\]]+)\]\]/;

export function extractOfficialUrl(comment: string | null): string | null {
  if (!comment) return null;
  const match = OFFICIAL_LINK_RE.exec(comment);
  if (!match?.[1]) return null;
  try {
    const url = new URL(match[1]);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Grouping key for related installments: normalised reading (hiragana yomi with spaces/symbols removed). */
export function toSeriesKey(yomi: string | null): string | null {
  if (!yomi) return null;
  const key = yomi.normalize("NFKC").replace(/[\s・、。,.!?()「」『』〜~]/g, "");
  return key.length >= 2 ? key : null;
}

export function normalizeTitle(raw: SyoboiTitle): NormalizedTitle {
  const comment = cleanText(raw.Comment);
  const labels = extractSlotLabels(comment).map((entry) => entry.label);
  const yomi = cleanText(raw.TitleYomi);
  const fields = {
    externalId: raw.TID,
    name: raw.Title.trim(),
    shortName: cleanText(raw.ShortTitle),
    yomi,
    nameEn: cleanText(raw.TitleEN),
    sourceCategory: raw.Cat,
    firstYear: raw.FirstYear && raw.FirstYear > 0 ? raw.FirstYear : null,
    firstMonth: raw.FirstMonth && raw.FirstMonth >= 1 && raw.FirstMonth <= 12 ? raw.FirstMonth : null,
    firstEndYear: raw.FirstEndYear && raw.FirstEndYear > 0 ? raw.FirstEndYear : null,
    firstEndMonth: raw.FirstEndMonth && raw.FirstEndMonth >= 1 && raw.FirstEndMonth <= 12 ? raw.FirstEndMonth : null,
    firstChannelText: cleanText(raw.FirstCh),
    officialUrl: extractOfficialUrl(comment),
    slotLabels: labels,
    seriesKey: toSeriesKey(yomi)
  };
  return {
    ...fields,
    sourceUpdatedAt: raw.LastUpdate ? parseJstDateTime(raw.LastUpdate) : null,
    contentHash: hashSemantic(fields)
  };
}

/** Evidence lines for a title's slot labels (used when deriving memberships). */
export function slotLabelEvidence(comment: string | null): Map<string, string> {
  return new Map(extractSlotLabels(comment).map((entry) => [entry.label, entry.evidence]));
}

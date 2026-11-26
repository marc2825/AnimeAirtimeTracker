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
  /** Animation studios and original-work publishers stated in the comment (`extractCredits`). */
  studios: string[];
  publishers: string[];
  creditEvidence: CreditEvidence[];
  /** Subtitles by episode number from the title's SubTitles list (empty when the list is empty). */
  episodeSubtitles: { episodeNumber: number; subtitle: string }[];
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

export interface CreditEvidence {
  role: "studio" | "publisher";
  line: string;
}

/** Staff lines naming the animation studio. `制作:` and `製作:` are left out: they often name the broadcaster or the production committee. */
const STUDIO_LINE_RE = /^:(?:アニメーション制作|アニメ制作)[:：](.+)$/;
/**
 * Staff lines whose parentheses name the original work's publisher or imprint. On magazine lines
 * (`:掲載誌:週刊少年ジャンプ(集英社)`) the parentheses hold the publisher; on 原作 lines they also hold authors,
 * game companies or roles (`:原作:武論尊(原作)`), so only publisher-like names are taken there.
 */
const PUBLISHER_LINE_RE = /^:(掲載誌|連載誌|連載|レーベル|出版社|発行|原作|原作小説|原作漫画)[:：](.+)$/;
const MAGAZINE_KEYS = new Set(["掲載誌", "連載誌", "連載", "レーベル", "出版社", "発行"]);
/** Parenthesised words that say what someone did or what the work is, not who published it. */
const NOT_A_PUBLISHER_RE = /^(?:作|絵|文|著|訳|漫画|まんが|作画|原作|原案|原作協力|構成|監修|イラスト|シナリオ|脚本|小説|連載|キャラクター原案|[#＃\d].*|.*ゲーム)$/;
/** On 原作 lines: names that read as a publisher or an imprint. */
const PUBLISHER_LIKE_RE =
  /(?:社|館|書店|書房|出版|文庫|ノベル|ブックス|BOOKS|Books|コミックス|新文芸|KADOKAWA|カドカワ|角川|メディアワークス|エンターブレイン|アルファポリス|スクウェア・エニックス|SQEX|文藝春秋|新書館|コアミックス|リブレ|ホビージャパン|HJ|オーバーラップ|アース・スター|TOブックス|comico)/;

const stripParentheses = (value: string) => {
  let previous: string;
  let current = value;
  do {
    previous = current;
    current = current.replace(/[(（][^()（）]*[)）]/g, "");
  } while (current !== previous);
  return current;
};

const addUnique = (list: string[], value: string) => {
  const key = value.toLowerCase();
  if (value && !list.some((existing) => existing.toLowerCase() === key)) list.push(value);
};

/**
 * Animation studios and original-work publishers stated in a title comment, as written (NFKC, trimmed). Only the
 * lines above are read; notes in parentheses after a studio (episodes, team names) are dropped, studios are split
 * on 「、」「×」「/」 (not on "&" or ",", which occur inside company names). Publishers are the parenthesised name
 * before any 「」『』, "/" or space (`(集英社 ジャンプコミックス)` → 集英社), without 「刊」. Imprints (電撃文庫) stay
 * as written: telling an imprint from its publisher is not something the comment states.
 */
export function extractCredits(comment: string | null): { studios: string[]; publishers: string[]; evidence: CreditEvidence[] } {
  const studios: string[] = [];
  const publishers: string[] = [];
  const evidence: CreditEvidence[] = [];
  if (!comment) return { studios, publishers, evidence };
  for (const raw of comment.split(/\r?\n/)) {
    const line = raw.trim();
    const studio = STUDIO_LINE_RE.exec(line);
    if (studio) {
      const before = studios.length;
      for (const part of stripParentheses(studio[1]!).split(/[、×/／]/)) addUnique(studios, part.normalize("NFKC").trim());
      if (studios.length > before) evidence.push({ role: "studio", line: line.slice(0, 160) });
      continue;
    }
    const publisher = PUBLISHER_LINE_RE.exec(line);
    if (publisher) {
      const before = publishers.length;
      const magazine = MAGAZINE_KEYS.has(publisher[1]!);
      for (const match of publisher[2]!.matchAll(/[(（]([^()（）]+)[)）]/g)) {
        for (const part of match[1]!.normalize("NFKC").split("、")) {
          const name = part.split(/[「『/／]/)[0]!.trim().split(/\s+/)[0]!.replace(/刊$/, "").trim();
          if (name && !NOT_A_PUBLISHER_RE.test(name) && (magazine || PUBLISHER_LIKE_RE.test(name))) addUnique(publishers, name);
        }
      }
      if (publishers.length > before) evidence.push({ role: "publisher", line: line.slice(0, 160) });
    }
  }
  return { studios, publishers, evidence };
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
  const credits = extractCredits(comment);
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
    seriesKey: toSeriesKey(yomi),
    studios: credits.studios,
    publishers: credits.publishers,
    creditEvidence: credits.evidence
  };
  return {
    ...fields,
    // Kept out of the content hash: the hash tracks the title's own metadata.
    episodeSubtitles: parseEpisodeSubtitles(raw.SubTitles),
    sourceUpdatedAt: raw.LastUpdate ? parseJstDateTime(raw.LastUpdate) : null,
    contentHash: hashSemantic(fields)
  };
}

/**
 * The source's per-title subtitle list: one `*<episode>*<subtitle>` per line (`*01*はじまり`, `*1*…`). Other
 * lines are ignored; a repeated episode keeps its last subtitle; blank subtitles are skipped.
 */
export function parseEpisodeSubtitles(value: string | null): { episodeNumber: number; subtitle: string }[] {
  if (!value) return [];
  const byEpisode = new Map<number, string>();
  for (const line of value.replace(/\r\n?/g, "\n").split("\n")) {
    const match = /^\*(\d{1,4})\*(.*)$/.exec(line.trim());
    if (!match) continue;
    const subtitle = match[2]!.trim();
    if (subtitle) byEpisode.set(Number(match[1]), subtitle);
  }
  return [...byEpisode.entries()].sort(([a], [b]) => a - b).map(([episodeNumber, subtitle]) => ({ episodeNumber, subtitle }));
}

/** Evidence lines for a title's slot labels (used when deriving memberships). */
export function slotLabelEvidence(comment: string | null): Map<string, string> {
  return new Map(extractSlotLabels(comment).map((entry) => [entry.label, entry.evidence]));
}

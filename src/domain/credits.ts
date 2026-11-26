/**
 * Studios and publishers of the titles in a slot (experimental, docs/data-pipeline.md → Credits):
 * - composition: how many member titles name each studio / publisher in the source comment;
 * - dominance ("implicit slot"): one name holds at least half of the titles that name any;
 * - similarity: slots whose studios and publishers resemble each other (cosine of IDF-weighted counts);
 * - an experimental next-season prediction (decayed frequency of the slot's past titles), with a backtest that
 *   predicts every past title from earlier seasons only, next to two baselines.
 * Pure: derive (src/ingest/derive.ts) stores the result per slot in `Slot.creditProfile`.
 */
import { seasonFromOrdinal, seasonOrdinal, shiftSeason } from "./season";

export const CREDIT_RULE_VERSION = "credits-v1";
export const CREDIT_ROLES = ["studio", "publisher"] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

/** Dominance: at least this many member titles name someone, and the top name holds this share and count. */
export const DOMINANT_MIN_KNOWN = 4;
export const DOMINANT_MIN_SHARE = 0.5;
export const DOMINANT_MIN_TITLES = 3;
/** Similarity: slots with at least this many titles naming a studio or publisher; listed from this score. */
export const SIMILAR_MIN_KNOWN = 4;
export const SIMILAR_MIN_SCORE = 0.3;
export const SIMILAR_LIMIT = 3;
/** Prediction: weight of a past title per season of distance. */
export const PREDICTION_DECAY = 0.7;
export const PREDICTION_CANDIDATES = 3;
/** Names listed per role in a profile. */
export const TOP_LIMIT = 5;

/**
 * Confidence bands of a prediction: the share of the top candidate, and how many past titles it rests on.
 * `high` ≥ 0.8, `mid` ≥ 0.6 (both with at least BAND_MIN_HISTORY titles), `low` below 0.6, `short` too few titles.
 */
export const BANDS = ["high", "mid", "low", "short"] as const;
export type Band = (typeof BANDS)[number];
export const BAND_MIN_HISTORY = 3;

export function bandOf(share: number, history: number): Band {
  if (history < BAND_MIN_HISTORY) return "short";
  if (share >= 0.8) return "high";
  if (share >= 0.6) return "mid";
  return "low";
}

export interface CreditAliases {
  /** Canonical name → other spellings of the same company (reviewed: data/credit-aliases.json). */
  studios: Record<string, string[]>;
  publishers: Record<string, string[]>;
}

export interface CreditSlotInput {
  slug: string;
  homeChannelId: number | null;
  members: { titleId: number; channelId: number | null; seasonOrdinal: number | null }[];
}

export interface TitleCredits {
  studios: string[];
  publishers: string[];
}

export interface BacktestTally {
  /** Predictions made (member titles naming someone, with at least one earlier such title in the slot). */
  n: number;
  top1: number;
  top3: number;
  /** Hits of the baselines: the most frequent name so far on the slot's channel, and overall. */
  channelTop1: number;
  globalTop1: number;
  bands: Record<Band, { n: number; top1: number }>;
}

export interface RoleProfile {
  /** Member titles naming at least one name for the role. */
  known: number;
  top: { name: string; titles: number; firstSeason: number | null; lastSeason: number | null }[];
  dominant: { name: string; titles: number; share: number } | null;
  /** Next season's candidates; only for slots on air in the latest or the previous season of the data. */
  prediction: { season: number; candidates: { name: string; share: number }[]; band: Band; history: number } | null;
  backtest: BacktestTally;
}

export interface CreditProfile {
  version: string;
  /** Distinct member titles. */
  members: number;
  roles: Record<CreditRole, RoleProfile>;
  /** Slots with similar studios and publishers that share no title with this one. */
  similar: { slug: string; score: number }[];
}

/** Comparison key: NFKC, lower case, without spaces and punctuation (`SILVER LINK.` = `SILVER LINK`). */
export function creditKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.・･,'’"“”!！?？]/g, "");
}

const seasonIndex = (ordinal: number) => {
  const season = seasonFromOrdinal(ordinal);
  return season.year * 4 + season.quarter - 1;
};

const round = (value: number) => Math.round(value * 1000) / 1000;

const emptyTally = (): BacktestTally => ({
  n: 0,
  top1: 0,
  top3: 0,
  channelTop1: 0,
  globalTop1: 0,
  bands: { high: { n: 0, top1: 0 }, mid: { n: 0, top1: 0 }, low: { n: 0, top1: 0 }, short: { n: 0, top1: 0 } }
});

/** Ranks names by count (then name), so ties never depend on input order. */
function topName(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && name < best)) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Display names per role: an alias maps to its canonical name; otherwise names with the same key show as the most
 * frequent spelling among the titles.
 */
function canonicalNames(credits: Map<number, TitleCredits>, aliases: CreditAliases): Record<CreditRole, (name: string) => string> {
  const build = (role: CreditRole) => {
    const aliasMap = new Map<string, string>();
    for (const [canonical, variants] of Object.entries(role === "studio" ? aliases.studios : aliases.publishers)) {
      aliasMap.set(creditKey(canonical), canonical);
      for (const variant of variants) aliasMap.set(creditKey(variant), canonical);
    }
    const spellings = new Map<string, Map<string, number>>();
    for (const title of credits.values()) {
      for (const name of role === "studio" ? title.studios : title.publishers) {
        const key = creditKey(name);
        if (aliasMap.has(key)) continue;
        const forms = spellings.get(key) ?? new Map<string, number>();
        forms.set(name, (forms.get(name) ?? 0) + 1);
        spellings.set(key, forms);
      }
    }
    const display = new Map<string, string>();
    for (const [key, forms] of spellings) display.set(key, topName(forms)!);
    return (name: string) => {
      const key = creditKey(name);
      return aliasMap.get(key) ?? display.get(key) ?? name;
    };
  };
  return { studio: build("studio"), publisher: build("publisher") };
}

interface Member {
  titleId: number;
  season: number | null;
  names: Record<CreditRole, string[]>;
}

/** Ranked candidates from past titles, weighted by PREDICTION_DECAY per season of distance from `target`. */
function rank(past: Member[], role: CreditRole, target: number): { candidates: { name: string; share: number }[]; history: number } {
  const scores = new Map<string, number>();
  let history = 0;
  for (const member of past) {
    if (member.season === null || member.names[role].length === 0) continue;
    history += 1;
    const weight = Math.pow(PREDICTION_DECAY, seasonIndex(target) - seasonIndex(member.season));
    for (const name of member.names[role]) scores.set(name, (scores.get(name) ?? 0) + weight);
  }
  const total = [...scores.values()].reduce((sum, value) => sum + value, 0);
  const candidates = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([name, score]) => ({ name, share: total > 0 ? score / total : 0 }));
  return { candidates, history };
}

/**
 * "Most frequent so far" baselines: for each season, the name most titles named before it, overall and per channel.
 * A title counts once, at its earliest season in any slot, on that membership's channel.
 */
function baselines(slots: { homeChannelId: number | null; members: Member[] }[], role: CreditRole) {
  const titles = new Map<number, { season: number; channel: number | null; names: string[] }>();
  for (const slot of slots) {
    for (const member of slot.members) {
      if (member.season === null || member.names[role].length === 0) continue;
      const known = titles.get(member.titleId);
      if (!known || member.season < known.season) titles.set(member.titleId, { season: member.season, channel: slot.homeChannelId, names: member.names[role] });
    }
  }
  const bySeason = [...titles.values()].sort((a, b) => a.season - b.season);
  const globalBefore = new Map<number, string | null>();
  const channelBefore = new Map<string, string | null>();
  const globalCounts = new Map<string, number>();
  const channelCounts = new Map<number | null, Map<string, number>>();
  // Every season a prediction can target (any member's season), not only the seasons titles first appeared in.
  const seasons = [...new Set(slots.flatMap((slot) => slot.members.map((member) => member.season)).filter((season): season is number => season !== null))].sort(
    (a, b) => a - b
  );
  const channels = [...new Set(slots.map((slot) => slot.homeChannelId))];
  let index = 0;
  for (const season of [...seasons, Number.POSITIVE_INFINITY]) {
    globalBefore.set(season, topName(globalCounts));
    for (const channel of channels) channelBefore.set(`${channel}:${season}`, topName(channelCounts.get(channel) ?? new Map()));
    while (index < bySeason.length && bySeason[index]!.season <= season) {
      const title = bySeason[index]!;
      const perChannel = channelCounts.get(title.channel) ?? new Map<string, number>();
      for (const name of title.names) {
        globalCounts.set(name, (globalCounts.get(name) ?? 0) + 1);
        perChannel.set(name, (perChannel.get(name) ?? 0) + 1);
      }
      channelCounts.set(title.channel, perChannel);
      index += 1;
    }
  }
  return {
    global: (season: number) => globalBefore.get(season) ?? null,
    channel: (channel: number | null, season: number) => channelBefore.get(`${channel}:${season}`) ?? null
  };
}

function cosineNeighbours(vectors: Map<string, Map<string, number>>, titleSets: Map<string, Set<number>>): Map<string, { slug: string; score: number }[]> {
  const df = new Map<string, number>();
  for (const vector of vectors.values()) for (const feature of vector.keys()) df.set(feature, (df.get(feature) ?? 0) + 1);
  const n = vectors.size;
  const weighted = new Map<string, Map<string, number>>();
  const norms = new Map<string, number>();
  const postings = new Map<string, { slug: string; weight: number }[]>();
  for (const [slug, vector] of vectors) {
    const w = new Map<string, number>();
    let norm = 0;
    for (const [feature, count] of vector) {
      const value = count * Math.log(n / df.get(feature)!);
      if (value <= 0) continue;
      w.set(feature, value);
      norm += value * value;
      const list = postings.get(feature) ?? [];
      list.push({ slug, weight: value });
      postings.set(feature, list);
    }
    weighted.set(slug, w);
    norms.set(slug, Math.sqrt(norm));
  }
  const result = new Map<string, { slug: string; score: number }[]>();
  for (const [slug, w] of weighted) {
    const dots = new Map<string, number>();
    for (const [feature, value] of w) {
      for (const other of postings.get(feature)!) {
        if (other.slug !== slug) dots.set(other.slug, (dots.get(other.slug) ?? 0) + value * other.weight);
      }
    }
    const mine = titleSets.get(slug)!;
    const scored = [...dots.entries()]
      .filter(([other]) => ![...titleSets.get(other)!].some((title) => mine.has(title)))
      .map(([other, dot]) => ({ slug: other, score: round(dot / (norms.get(slug)! * norms.get(other)!)) }))
      .filter((entry) => entry.score >= SIMILAR_MIN_SCORE)
      .sort((a, b) => b.score - a.score || (a.slug < b.slug ? -1 : 1))
      .slice(0, SIMILAR_LIMIT);
    result.set(slug, scored);
  }
  return result;
}

/**
 * Credit profiles of all slots. `latestSeason` is the latest season ordinal in the data: slots with a title in it
 * or the season before get a prediction for the season after it.
 */
export function computeCreditProfiles(input: {
  slots: CreditSlotInput[];
  credits: Map<number, TitleCredits>;
  aliases: CreditAliases;
  latestSeason: number;
}): Map<string, CreditProfile> {
  const canonical = canonicalNames(input.credits, input.aliases);
  const namesOf = (titleId: number): Record<CreditRole, string[]> => {
    const credits = input.credits.get(titleId);
    const unique = (role: CreditRole, names: string[]) => [...new Set(names.map(canonical[role]))];
    return { studio: unique("studio", credits?.studios ?? []), publisher: unique("publisher", credits?.publishers ?? []) };
  };
  const slots = input.slots.map((slot) => {
    const byTitle = new Map<number, Member>();
    for (const member of slot.members) {
      const known = byTitle.get(member.titleId);
      if (!known || (member.seasonOrdinal !== null && (known.season === null || member.seasonOrdinal < known.season))) {
        byTitle.set(member.titleId, { titleId: member.titleId, season: member.seasonOrdinal, names: namesOf(member.titleId) });
      }
    }
    return { slug: slot.slug, homeChannelId: slot.homeChannelId, members: [...byTitle.values()] };
  });
  const base = { studio: baselines(slots, "studio"), publisher: baselines(slots, "publisher") };
  const target = seasonOrdinal(shiftSeason(seasonFromOrdinal(input.latestSeason), 1));
  const onAirSince = seasonOrdinal(shiftSeason(seasonFromOrdinal(input.latestSeason), -1));

  const profiles = new Map<string, CreditProfile>();
  const vectors = new Map<string, Map<string, number>>();
  const titleSets = new Map<string, Set<number>>();
  for (const slot of slots) {
    const roles = {} as Record<CreditRole, RoleProfile>;
    for (const role of CREDIT_ROLES) {
      const known = slot.members.filter((member) => member.names[role].length > 0);
      const counts = new Map<string, { titles: number; first: number | null; last: number | null }>();
      for (const member of known) {
        for (const name of member.names[role]) {
          const entry = counts.get(name) ?? { titles: 0, first: null, last: null };
          entry.titles += 1;
          if (member.season !== null) {
            entry.first = entry.first === null ? member.season : Math.min(entry.first, member.season);
            entry.last = entry.last === null ? member.season : Math.max(entry.last, member.season);
          }
          counts.set(name, entry);
        }
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1].titles - a[1].titles || (b[1].last ?? 0) - (a[1].last ?? 0) || (a[0] < b[0] ? -1 : 1))
        .slice(0, TOP_LIMIT)
        .map(([name, entry]) => ({ name, titles: entry.titles, firstSeason: entry.first, lastSeason: entry.last }));
      const leader = top[0];
      const dominant =
        leader && known.length >= DOMINANT_MIN_KNOWN && leader.titles >= DOMINANT_MIN_TITLES && leader.titles / known.length >= DOMINANT_MIN_SHARE
          ? { name: leader.name, titles: leader.titles, share: round(leader.titles / known.length) }
          : null;

      const backtest = emptyTally();
      for (const member of known) {
        if (member.season === null) continue;
        const earlier = known.filter((other) => other.season !== null && other.season < member.season!);
        if (earlier.length === 0) continue;
        const { candidates, history } = rank(earlier, role, member.season);
        const names = new Set(member.names[role]);
        const hit = names.has(candidates[0]!.name);
        backtest.n += 1;
        if (hit) backtest.top1 += 1;
        if (candidates.slice(0, PREDICTION_CANDIDATES).some((candidate) => names.has(candidate.name))) backtest.top3 += 1;
        const channelBest = base[role].channel(slot.homeChannelId, member.season);
        if (channelBest !== null && names.has(channelBest)) backtest.channelTop1 += 1;
        const globalBest = base[role].global(member.season);
        if (globalBest !== null && names.has(globalBest)) backtest.globalTop1 += 1;
        const band = backtest.bands[bandOf(candidates[0]!.share, history)];
        band.n += 1;
        if (hit) band.top1 += 1;
      }

      const latest = Math.max(...slot.members.map((member) => member.season ?? 0));
      let prediction: RoleProfile["prediction"] = null;
      if (latest >= onAirSince) {
        const { candidates, history } = rank(known, role, target);
        if (candidates.length > 0) {
          prediction = {
            season: target,
            candidates: candidates.slice(0, PREDICTION_CANDIDATES).map((candidate) => ({ name: candidate.name, share: round(candidate.share) })),
            band: bandOf(candidates[0]!.share, history),
            history
          };
        }
      }
      roles[role] = { known: known.length, top, dominant, prediction, backtest };
    }
    profiles.set(slot.slug, { version: CREDIT_RULE_VERSION, members: slot.members.length, roles, similar: [] });

    const withAny = slot.members.filter((member) => member.names.studio.length > 0 || member.names.publisher.length > 0);
    if (withAny.length >= SIMILAR_MIN_KNOWN) {
      const vector = new Map<string, number>();
      for (const member of withAny) {
        for (const role of CREDIT_ROLES) for (const name of member.names[role]) vector.set(`${role}:${name}`, (vector.get(`${role}:${name}`) ?? 0) + 1);
      }
      vectors.set(slot.slug, vector);
      titleSets.set(slot.slug, new Set(slot.members.map((member) => member.titleId)));
    }
  }
  for (const [slug, similar] of cosineNeighbours(vectors, titleSets)) profiles.get(slug)!.similar = similar;
  return profiles;
}

/**
 * Slot derivation (rule version {@link SLOT_RULE_VERSION}). Pure and deterministic.
 *
 * 1. Regular position: for each (title, channel, season), the modal (weekday, start minute) among
 *    non-rerun, non-deleted airings, provided it occurs at least {@link MIN_REGULAR_AIRINGS} times.
 * 2. SOURCE_LABEL / OFFICIAL slots: titles whose source comment states 「X」枠で放送. The home channel is the
 *    tracked channel where most member titles have a regular position. Per-season position = modal position
 *    of members on the home channel. Labels need ≥2 member titles unless listed in the curated registry.
 * 3. INFERRED slots: an exact (channel, weekday, start minute) that held the regular position of
 *    ≥{@link INFERRED_MIN_TITLES} distinct titles across ≥{@link INFERRED_MIN_SEASONS} seasons.
 *    These are hypotheses about recurring programming, labelled as such in the UI.
 */
import { seasonOfAnimeDate, seasonOrdinal } from "./season";
import { formatAnimeMinute, WEEKDAY_KEYS, WEEKDAY_LABELS, type IsoDate, type Weekday } from "./time";

export const SLOT_RULE_VERSION = "slots-v3";
export const MIN_REGULAR_AIRINGS = 3;
export const INFERRED_MIN_TITLES = 3;
export const INFERRED_MIN_SEASONS = 3;
export const LABEL_MIN_TITLES = 2;

export interface SlotInputBroadcast {
  titleId: number;
  channelId: number;
  animeDate: IsoDate;
  animeWeekday: number;
  animeStartMinute: number;
  durationMinutes: number;
  startAt: Date;
  isRerun: boolean;
  deleted: boolean;
}

export interface SlotInputTitle {
  id: number;
  externalId: string;
  slotLabels: string[];
  evidence: Record<string, string>;
}

export interface SlotInputChannel {
  id: number;
  slug: string;
  shortName: string;
  sortOrder: number;
}

export interface SlotRegistryEntry {
  label: string;
  slug: string;
  name: string;
  kind: "OFFICIAL" | "SOURCE_LABEL";
  description?: string;
  evidenceUrl?: string;
}

export interface MembershipOverride {
  slot: string;
  titleExternalId: string;
  action: "add" | "remove";
  reason: string;
}

export interface TitlePosition {
  titleId: number;
  channelId: number;
  seasonOrdinal: number;
  weekday: Weekday;
  startMinute: number;
  durationMinutes: number;
  count: number;
  firstStartAt: Date;
  lastStartAt: Date;
}

export type SlotKindValue = "OFFICIAL" | "SOURCE_LABEL" | "INFERRED";

export interface DerivedMembership {
  titleId: number;
  channelId: number | null;
  method: "SOURCE_COMMENT" | "TIME_POSITION" | "MANUAL";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string | null;
  seasonOrdinal: number | null;
  animeWeekday: number | null;
  animeStartMinute: number | null;
  firstStartAt: Date | null;
  lastStartAt: Date | null;
  broadcastCount: number;
}

export interface DerivedSlotSeason {
  seasonOrdinal: number;
  channelId: number;
  animeWeekday: number;
  animeStartMinute: number;
  durationMinutes: number;
  titleCount: number;
  /** Distinct titles in the season, ordered by their first airing at the position (then by id). */
  titleIds: number[];
}

export interface DerivedSlot {
  slug: string;
  name: string;
  kind: SlotKindValue;
  description: string | null;
  evidenceUrl: string | null;
  homeChannelId: number | null;
  memberships: DerivedMembership[];
  seasons: DerivedSlotSeason[];
}

function mode<T>(values: T[], key: (value: T) => string): { value: T; count: number } | null {
  const counts = new Map<string, { value: T; count: number }>();
  for (const value of values) {
    const k = key(value);
    const entry = counts.get(k);
    if (entry) entry.count += 1;
    else counts.set(k, { value, count: 1 });
  }
  let best: { value: T; count: number; key: string } | null = null;
  for (const [k, entry] of counts) {
    // Ties break on the smaller key so results are deterministic.
    if (!best || entry.count > best.count || (entry.count === best.count && k < best.key)) best = { ...entry, key: k };
  }
  return best ? { value: best.value, count: best.count } : null;
}

export function computeTitlePositions(broadcasts: SlotInputBroadcast[]): TitlePosition[] {
  const groups = new Map<string, SlotInputBroadcast[]>();
  for (const broadcast of broadcasts) {
    if (broadcast.isRerun || broadcast.deleted) continue;
    const ordinal = seasonOrdinal(seasonOfAnimeDate(broadcast.animeDate));
    const key = `${broadcast.titleId}|${broadcast.channelId}|${ordinal}`;
    const list = groups.get(key);
    if (list) list.push(broadcast);
    else groups.set(key, [broadcast]);
  }
  const positions: TitlePosition[] = [];
  for (const [key, list] of groups) {
    const modal = mode(list, (b) => `${b.animeWeekday}|${String(b.animeStartMinute).padStart(4, "0")}`);
    if (!modal || modal.count < MIN_REGULAR_AIRINGS) continue;
    const atPosition = list.filter((b) => b.animeWeekday === modal.value.animeWeekday && b.animeStartMinute === modal.value.animeStartMinute);
    const duration = mode(atPosition, (b) => String(b.durationMinutes).padStart(4, "0"))?.value.durationMinutes ?? modal.value.durationMinutes;
    const times = atPosition.map((b) => b.startAt.getTime());
    const [titleId, channelId, ordinal] = key.split("|").map(Number) as [number, number, number];
    positions.push({
      titleId,
      channelId,
      seasonOrdinal: ordinal,
      weekday: modal.value.animeWeekday as Weekday,
      startMinute: modal.value.animeStartMinute,
      durationMinutes: duration,
      count: modal.count,
      firstStartAt: new Date(Math.min(...times)),
      lastStartAt: new Date(Math.max(...times))
    });
  }
  return positions.sort((a, b) => a.titleId - b.titleId || a.channelId - b.channelId || a.seasonOrdinal - b.seasonOrdinal);
}

function membershipFromPositions(
  positions: TitlePosition[],
  base: Pick<DerivedMembership, "method" | "confidence" | "evidence">
): DerivedMembership {
  const sorted = [...positions].sort((a, b) => a.seasonOrdinal - b.seasonOrdinal);
  const first = sorted[0];
  if (!first) {
    return { ...base, titleId: -1, channelId: null, seasonOrdinal: null, animeWeekday: null, animeStartMinute: null, firstStartAt: null, lastStartAt: null, broadcastCount: 0 };
  }
  return {
    ...base,
    titleId: first.titleId,
    channelId: first.channelId,
    seasonOrdinal: first.seasonOrdinal,
    animeWeekday: first.weekday,
    animeStartMinute: first.startMinute,
    firstStartAt: new Date(Math.min(...sorted.map((p) => p.firstStartAt.getTime()))),
    lastStartAt: new Date(Math.max(...sorted.map((p) => p.lastStartAt.getTime()))),
    broadcastCount: sorted.reduce((sum, p) => sum + p.count, 0)
  };
}

/**
 * Per-season slot position on one channel. A slot can hold several titles per season (e.g. a one-hour
 * block with shows at 23:00 and 23:30), so the position is the block: the modal weekday, the earliest
 * start on that weekday, and the span to the latest end. A "time move" is a change of the block start.
 */
function seasonsFromPositions(positions: TitlePosition[], channelId: number): DerivedSlotSeason[] {
  const bySeason = new Map<number, TitlePosition[]>();
  for (const position of positions) {
    if (position.channelId !== channelId) continue;
    const list = bySeason.get(position.seasonOrdinal);
    if (list) list.push(position);
    else bySeason.set(position.seasonOrdinal, [position]);
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ordinal, list]) => {
      const weekday = mode(list, (p) => String(p.weekday))!.value.weekday;
      const sameDay = list.filter((p) => p.weekday === weekday);
      const start = Math.min(...sameDay.map((p) => p.startMinute));
      const end = Math.max(...sameDay.map((p) => p.startMinute + p.durationMinutes));
      const firstAiring = new Map<number, number>();
      for (const p of list) firstAiring.set(p.titleId, Math.min(firstAiring.get(p.titleId) ?? Infinity, p.firstStartAt.getTime()));
      const titleIds = [...firstAiring.entries()].sort(([a, at], [b, bt]) => at - bt || a - b).map(([id]) => id);
      return {
        seasonOrdinal: ordinal,
        channelId,
        animeWeekday: weekday,
        animeStartMinute: start,
        durationMinutes: end - start,
        titleCount: titleIds.length,
        titleIds
      };
    });
}

/** URL slug for a source label: NFKC, ASCII lower-cased, separators collapsed (Japanese kept as-is). */
export function slugifyLabel(label: string): string {
  return label
    .normalize("NFKC")
    .trim()
    .replace(/[A-Z]/g, (char) => char.toLowerCase())
    .replace(/[\s/\\?#%&]+/g, "-");
}

export function inferredSlotSlug(channelSlug: string, weekday: Weekday, startMinute: number): string {
  return `${channelSlug}-${WEEKDAY_KEYS[weekday]}-${formatAnimeMinute(startMinute).replace(":", "")}`;
}

export function inferredSlotName(channelShortName: string, weekday: Weekday, startMinute: number): string {
  return `${channelShortName} ${WEEKDAY_LABELS[weekday]}曜${formatAnimeMinute(startMinute)}枠`;
}

export function deriveSlots(input: {
  titles: SlotInputTitle[];
  channels: SlotInputChannel[];
  broadcasts: SlotInputBroadcast[];
  registry: SlotRegistryEntry[];
  membershipOverrides: MembershipOverride[];
}): DerivedSlot[] {
  const channelById = new Map(input.channels.map((channel) => [channel.id, channel]));
  const trackedBroadcasts = input.broadcasts.filter((b) => channelById.has(b.channelId));
  const positions = computeTitlePositions(trackedBroadcasts);
  const positionsByTitle = new Map<number, TitlePosition[]>();
  for (const position of positions) {
    const list = positionsByTitle.get(position.titleId);
    if (list) list.push(position);
    else positionsByTitle.set(position.titleId, [position]);
  }
  const titleByExternal = new Map(input.titles.map((title) => [title.externalId, title]));
  const registryByLabel = new Map(input.registry.map((entry) => [entry.label, entry]));
  const slots: DerivedSlot[] = [];

  // --- Source-labelled slots -------------------------------------------------------------
  const titlesByLabel = new Map<string, SlotInputTitle[]>();
  for (const title of input.titles) {
    for (const label of title.slotLabels) {
      const list = titlesByLabel.get(label);
      if (list) list.push(title);
      else titlesByLabel.set(label, [title]);
    }
  }
  for (const [label, members] of [...titlesByLabel.entries()].sort(([a], [b]) => a.localeCompare(b, "ja"))) {
    const registry = registryByLabel.get(label);
    if (!registry && members.length < LABEL_MIN_TITLES) continue;
    const memberPositions = members.flatMap((title) => positionsByTitle.get(title.id) ?? []);
    const titlesPerChannel = new Map<number, Set<number>>();
    for (const position of memberPositions) {
      const set = titlesPerChannel.get(position.channelId) ?? new Set<number>();
      set.add(position.titleId);
      titlesPerChannel.set(position.channelId, set);
    }
    const home = [...titlesPerChannel.entries()].sort(
      ([channelA, a], [channelB, b]) => b.size - a.size || (channelById.get(channelA)?.sortOrder ?? 0) - (channelById.get(channelB)?.sortOrder ?? 0)
    )[0]?.[0] ?? null;
    const memberships = members.map((title) => {
      const own = positionsByTitle.get(title.id) ?? [];
      const onHome = own.filter((p) => p.channelId === home);
      const busiest = [...own].sort((a, b) => b.count - a.count)[0];
      const chosen = onHome.length > 0 ? onHome : own.filter((p) => p.channelId === busiest?.channelId);
      const evidence = title.evidence[label] ?? null;
      // A statement such as 「再放送は「X」枠で放送」 attests the slot for a rerun only.
      const rerunContext = evidence !== null && evidence.includes("再放送");
      const membership = membershipFromPositions(chosen, { method: "SOURCE_COMMENT", confidence: rerunContext ? "MEDIUM" : "HIGH", evidence });
      return { ...membership, titleId: title.id };
    });
    slots.push({
      slug: registry?.slug ?? slugifyLabel(label),
      name: registry?.name ?? label,
      kind: registry?.kind ?? "SOURCE_LABEL",
      description: registry?.description ?? null,
      evidenceUrl: registry?.evidenceUrl ?? null,
      homeChannelId: home,
      memberships,
      seasons: home === null ? [] : seasonsFromPositions(memberPositions, home)
    });
  }

  // --- Inferred time-position slots --------------------------------------------------------
  const byPosition = new Map<string, TitlePosition[]>();
  for (const position of positions) {
    const key = `${position.channelId}|${position.weekday}|${position.startMinute}`;
    const list = byPosition.get(key);
    if (list) list.push(position);
    else byPosition.set(key, [position]);
  }
  for (const [key, list] of [...byPosition.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const titleIds = new Set(list.map((p) => p.titleId));
    const seasons = new Set(list.map((p) => p.seasonOrdinal));
    if (titleIds.size < INFERRED_MIN_TITLES || seasons.size < INFERRED_MIN_SEASONS) continue;
    const [channelId, weekday, startMinute] = key.split("|").map(Number) as [number, Weekday, number];
    const channel = channelById.get(channelId)!;
    const memberships = [...titleIds].map((titleId) => ({
      ...membershipFromPositions(list.filter((p) => p.titleId === titleId), { method: "TIME_POSITION", confidence: "MEDIUM", evidence: null }),
      titleId
    }));
    slots.push({
      slug: inferredSlotSlug(channel.slug, weekday, startMinute),
      name: inferredSlotName(channel.shortName, weekday, startMinute),
      kind: "INFERRED",
      description: null,
      evidenceUrl: null,
      homeChannelId: channelId,
      memberships,
      seasons: seasonsFromPositions(list, channelId)
    });
  }

  // --- Manual membership corrections --------------------------------------------------------
  const slotBySlug = new Map(slots.map((slot) => [slot.slug, slot]));
  for (const override of input.membershipOverrides) {
    const slot = slotBySlug.get(override.slot);
    const title = titleByExternal.get(override.titleExternalId);
    if (!slot || !title) continue;
    slot.memberships = slot.memberships.filter((m) => m.titleId !== title.id);
    if (override.action === "add") {
      const own = (positionsByTitle.get(title.id) ?? []).filter((p) => slot.homeChannelId === null || p.channelId === slot.homeChannelId);
      slot.memberships.push({ ...membershipFromPositions(own, { method: "MANUAL", confidence: "HIGH", evidence: override.reason }), titleId: title.id });
    }
  }

  return slots;
}

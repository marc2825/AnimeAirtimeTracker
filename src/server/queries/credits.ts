/**
 * Studios and publishers by slot (experimental; src/domain/credits.ts, docs/data-pipeline.md#credits). Every query
 * aggregates or filters the stored slot profiles in the database, so a page reads a handful of short rows.
 */
import { ANIME_CATEGORIES } from "@/domain/coverage";
import { BANDS, CREDIT_RULE_VERSION, type Band, type CreditProfile, type CreditRole, type RoleProfile } from "@/domain/credits";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";

export interface CreditRoleSummary {
  /** Slots with at least 4 member titles naming someone for the role, and those held by one name. */
  slotsKnown: number;
  dominantSlots: number;
  backtest: { n: number; top1: number; top3: number; channelTop1: number; globalTop1: number; bands: Record<Band, { n: number; top1: number }> };
  /** Anime titles naming someone for the role, of all anime titles. */
  titlesKnown: number;
}

export interface CreditSummary {
  animeTitles: number;
  roles: Record<CreditRole, CreditRoleSummary>;
}

type SummaryRow = { role: CreditRole; slotsKnown: number; dominantSlots: number; n: number; top1: number; top3: number; channelTop1: number; globalTop1: number } & Record<
  `${Band}N` | `${Band}Top1`,
  number
>;

/** Sums the backtest counts every slot profile stores, and counts the titles naming a studio or publisher. */
export async function getCreditSummary(): Promise<CreditSummary> {
  "use cache";
  datasetCacheProfile();
  const sum = (path: string) => `coalesce(sum((p->'backtest'->${path})::int), 0)::int`;
  const bandColumns = BANDS.flatMap((band) => [`${sum(`'bands'->'${band}'->>'n'`)} AS "${band}N"`, `${sum(`'bands'->'${band}'->>'top1'`)} AS "${band}Top1"`]).join(", ");
  const [rows, [titles]] = await Promise.all([
    db().$queryRawUnsafe<SummaryRow[]>(
      `SELECT r.role,
        count(*) FILTER (WHERE (p->>'known')::int >= 4)::int AS "slotsKnown",
        count(*) FILTER (WHERE jsonb_typeof(p->'dominant') = 'object')::int AS "dominantSlots",
        ${sum("'n'")} AS n, ${sum("'top1'")} AS top1, ${sum("'top3'")} AS top3,
        ${sum("'channelTop1'")} AS "channelTop1", ${sum("'globalTop1'")} AS "globalTop1", ${bandColumns}
      FROM "Slot" AS s
      CROSS JOIN (VALUES ('studio'), ('publisher')) AS r(role)
      CROSS JOIN LATERAL (SELECT s."creditProfile"->'roles'->r.role AS p) AS profile
      WHERE s."creditProfile"->>'version' = $1
      GROUP BY r.role`,
      CREDIT_RULE_VERSION
    ),
    db().$queryRaw<{ anime: number; studios: number; publishers: number }[]>`
      SELECT count(*)::int AS anime,
        count(*) FILTER (WHERE cardinality(studios) > 0)::int AS studios,
        count(*) FILTER (WHERE cardinality(publishers) > 0)::int AS publishers
      FROM "Title" WHERE "sourceCategory" = ANY(${ANIME_CATEGORIES as number[]}::int[])`
  ]);
  const role = (name: CreditRole): CreditRoleSummary => {
    const row = rows.find((entry) => entry.role === name);
    const bands = Object.fromEntries(BANDS.map((band) => [band, { n: row?.[`${band}N`] ?? 0, top1: row?.[`${band}Top1`] ?? 0 }])) as Record<Band, { n: number; top1: number }>;
    return {
      slotsKnown: row?.slotsKnown ?? 0,
      dominantSlots: row?.dominantSlots ?? 0,
      backtest: { n: row?.n ?? 0, top1: row?.top1 ?? 0, top3: row?.top3 ?? 0, channelTop1: row?.channelTop1 ?? 0, globalTop1: row?.globalTop1 ?? 0, bands },
      titlesKnown: name === "studio" ? (titles?.studios ?? 0) : (titles?.publishers ?? 0)
    };
  };
  return { animeTitles: titles?.anime ?? 0, roles: { studio: role("studio"), publisher: role("publisher") } };
}

export interface CreditSlotRow {
  slug: string;
  name: string;
  kind: string;
  channelShortName: string | null;
  latest: { seasonOrdinal: number; weekday: number; minute: number } | null;
  role: CreditRole;
  profile: RoleProfile;
}

/**
 * Slots whose profile for a role passes `filter` (SQL over the stored profile): one row per slot and role, with the
 * slot's latest position.
 */
async function slotsWhere(filter: "dominant" | "prediction"): Promise<CreditSlotRow[]> {
  const condition =
    filter === "dominant" ? `jsonb_typeof(s."creditProfile"->'roles'->r.role->'dominant') = 'object'` : `s."creditProfile"->'roles'->r.role->'prediction'->>'band' IN ('high', 'mid')`;
  const rows = await db().$queryRawUnsafe<
    { slug: string; name: string; kind: string; channelShortName: string | null; seasonOrdinal: number | null; weekday: number | null; minute: number | null; role: CreditRole; profile: RoleProfile }[]
  >(
    `SELECT s.slug, s.name, s.kind::text AS kind, coalesce(c."shortName", c.name) AS "channelShortName",
      ss."seasonOrdinal", ss."animeWeekday" AS weekday, ss."animeStartMinute" AS minute,
      r.role, s."creditProfile"->'roles'->r.role AS profile
    FROM "Slot" AS s
    CROSS JOIN (VALUES ('studio'), ('publisher')) AS r(role)
    LEFT JOIN "Channel" AS c ON c.id = s."homeChannelId"
    LEFT JOIN LATERAL (
      SELECT "seasonOrdinal", "animeWeekday", "animeStartMinute" FROM "SlotSeason" WHERE "slotId" = s.id ORDER BY "seasonOrdinal" DESC LIMIT 1
    ) AS ss ON true
    WHERE s."creditProfile"->>'version' = $1 AND ${condition}`,
    CREDIT_RULE_VERSION
  );
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    channelShortName: row.channelShortName,
    latest: row.seasonOrdinal === null ? null : { seasonOrdinal: row.seasonOrdinal, weekday: row.weekday!, minute: row.minute! },
    role: row.role,
    profile: row.profile
  }));
}

/** Slots held by one studio or publisher (an "implicit slot"), most titles first. */
export async function getDominatedSlots(): Promise<CreditSlotRow[]> {
  "use cache";
  datasetCacheProfile();
  const rows = await slotsWhere("dominant");
  return rows.sort((a, b) => b.profile.dominant!.titles - a.profile.dominant!.titles || b.profile.dominant!.share - a.profile.dominant!.share || a.name.localeCompare(b.name, "ja"));
}

/** Slots on air whose next-season prediction is in the high or mid band, most confident first. */
export async function getConfidentPredictions(): Promise<CreditSlotRow[]> {
  "use cache";
  datasetCacheProfile();
  const rows = await slotsWhere("prediction");
  return rows.sort((a, b) => b.profile.prediction!.candidates[0]!.share - a.profile.prediction!.candidates[0]!.share || a.name.localeCompare(b.name, "ja"));
}

/** A stored profile of the current rule version, or null (not derived yet, or from an older rule). */
export function creditProfileOf(value: unknown): CreditProfile | null {
  return value !== null && typeof value === "object" && (value as { version?: unknown }).version === CREDIT_RULE_VERSION ? (value as CreditProfile) : null;
}

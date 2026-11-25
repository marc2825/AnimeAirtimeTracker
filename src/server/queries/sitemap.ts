/**
 * Data for the sitemaps. Change times come from BroadcastRevision rows, which are written only when an airing is
 * created or its content changes; `Broadcast.updatedAt` is not used because every re-fetch touches `lastSeenAt`.
 * Each query lets the database aggregate, so a sitemap sends one small row per page out of Neon.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { TITLE_SITEMAP_LIMIT, TITLE_SITEMAP_MIN_AIRINGS } from "@/lib/sitemap";
import type { IsoDate } from "@/domain/time";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";

type RawClient = Pick<PrismaClient, "$queryRaw">;

export interface SitemapChangeTimes {
  /** Last change to any stored airing. */
  latest: Date | null;
  /** Per channel slug: last change to the channel's airings. */
  channels: { slug: string; lastModified: Date }[];
  /** Per season ordinal (year*10+quarter of the anime date): last change to the season's airings. */
  seasons: { ordinal: number; lastModified: Date }[];
}

export async function loadSitemapChangeTimes(client: RawClient = db()): Promise<SitemapChangeTimes> {
  const rows = await client.$queryRaw<{ channel: string | null; ordinal: number | null; lastModified: Date }[]>`
    SELECT channel, ordinal, max("observedAt") AS "lastModified"
    FROM (
      SELECT c.slug AS channel,
        (EXTRACT(YEAR FROM b."animeDate")::int * 10 + ((EXTRACT(MONTH FROM b."animeDate")::int - 1) / 3 + 1)) AS ordinal,
        r."observedAt"
      FROM "BroadcastRevision" AS r
      JOIN "Broadcast" AS b ON b.id = r."broadcastId"
      JOIN "Channel" AS c ON c.id = b."channelId"
    ) AS changes
    GROUP BY GROUPING SETS ((channel), (ordinal))`;
  const channels = rows.filter((row) => row.channel !== null).map((row) => ({ slug: row.channel!, lastModified: row.lastModified }));
  const seasons = rows.filter((row) => row.ordinal !== null).map((row) => ({ ordinal: Number(row.ordinal), lastModified: row.lastModified }));
  const latest = channels.reduce<Date | null>((max, row) => (!max || row.lastModified > max ? row.lastModified : max), null);
  return { latest, channels, seasons };
}

export async function getSitemapChangeTimes(): Promise<SitemapChangeTimes> {
  "use cache";
  datasetCacheProfile();
  return loadSitemapChangeTimes();
}

/**
 * Every slot, with the last change to the airings of its member titles (on the member's channel when the
 * membership names one). Null when no member airing has a revision.
 */
export async function loadSitemapSlots(client: RawClient = db()): Promise<{ slug: string; lastModified: Date | null }[]> {
  return client.$queryRaw<{ slug: string; lastModified: Date | null }[]>`
    SELECT s.slug, max(r."observedAt") AS "lastModified"
    FROM "Slot" AS s
    LEFT JOIN "SlotMembership" AS m ON m."slotId" = s.id
    LEFT JOIN "Broadcast" AS b ON b."titleId" = m."titleId" AND (m."channelId" IS NULL OR b."channelId" = m."channelId")
    LEFT JOIN "BroadcastRevision" AS r ON r."broadcastId" = b.id
    GROUP BY s.id
    ORDER BY s."seasonCount" DESC, s."titleCount" DESC, s.slug ASC`;
}

export async function getSitemapSlots(): Promise<{ slug: string; lastModified: Date | null }[]> {
  "use cache";
  datasetCacheProfile();
  return loadSitemapSlots();
}

/**
 * Title pages for the sitemap, by the rule in `titleInSitemap` (src/lib/sitemap.ts): at least
 * TITLE_SITEMAP_MIN_AIRINGS live airings, a slot membership, or a live airing on or after `since`. The lastmod is
 * the later of the title row's update and the last change to its airings. Most recently changed first.
 */
export async function loadSitemapTitles(since: IsoDate, client: RawClient = db()): Promise<{ slug: string; lastModified: Date }[]> {
  return client.$queryRaw<{ slug: string; lastModified: Date }[]>`
    WITH live AS (
      SELECT "titleId", count(*)::int AS airings, max("animeDate") AS "lastDate"
      FROM "Broadcast"
      WHERE NOT deleted AND "missingSince" IS NULL
      GROUP BY "titleId"
    ), changed AS (
      SELECT b."titleId", max(r."observedAt") AS "changedAt"
      FROM "BroadcastRevision" AS r
      JOIN "Broadcast" AS b ON b.id = r."broadcastId"
      GROUP BY b."titleId"
    )
    SELECT t.slug, greatest(t."updatedAt", ch."changedAt") AS "lastModified"
    FROM "Title" AS t
    JOIN live AS l ON l."titleId" = t.id
    LEFT JOIN changed AS ch ON ch."titleId" = t.id
    WHERE l.airings >= ${TITLE_SITEMAP_MIN_AIRINGS}
      OR l."lastDate" >= ${since}::date
      OR EXISTS (SELECT 1 FROM "SlotMembership" AS m WHERE m."titleId" = t.id)
    ORDER BY "lastModified" DESC, t.slug ASC
    LIMIT ${TITLE_SITEMAP_LIMIT}`;
}

export async function getSitemapTitles(since: IsoDate): Promise<{ slug: string; lastModified: Date }[]> {
  "use cache";
  datasetCacheProfile();
  return loadSitemapTitles(since);
}

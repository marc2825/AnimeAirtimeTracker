/**
 * Re-reads stored title details and fills the fields that later code learned to take from the comment: studios,
 * publishers and their evidence lines (`extractCredits`). No request is sent to the source: the bodies come from
 * RawPayload, kept for exactly this kind of replay (docs/data-model.md → Provenance).
 *
 * Only those three columns change, and only where they differ, so fetch dates and the subtitle backfill state stay as
 * they were. The latest stored response of each title wins; only per-title detail requests (`TitleLookup:TID=…`,
 * which ask for the Comment field) are read.
 */
import { gunzipSync } from "node:zlib";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { chunk } from "./plan";
import { normalizeTitle, SOURCE_SYOBOI, stableStringify, type CreditEvidence } from "./syoboi/normalize";
import { parseTitleLookup } from "./syoboi/parse";

const UPDATE_ROWS = 500;

interface Credits {
  studios: string[];
  publishers: string[];
  creditEvidence: CreditEvidence[];
}

export async function reparseTitleCredits(prisma: PrismaClient, log: (message: string) => void): Promise<{ payloads: number; titles: number; updated: number }> {
  // Each distinct body once, ordered by the last time it was received, so the newest response of a title is applied last.
  const logs = await prisma.fetchLog.groupBy({
    by: ["payloadHash"],
    where: { requestKey: { startsWith: "TitleLookup:TID=" }, payloadHash: { not: null } },
    _max: { startedAt: true }
  });
  const hashes = logs
    .filter((row): row is typeof row & { payloadHash: string } => row.payloadHash !== null)
    .sort((a, b) => (a._max.startedAt?.getTime() ?? 0) - (b._max.startedAt?.getTime() ?? 0))
    .map((row) => row.payloadHash);

  const latest = new Map<string, Credits>();
  for (const hash of hashes) {
    const payload = await prisma.rawPayload.findUnique({ where: { hash }, select: { body: true } });
    if (!payload) continue;
    for (const item of parseTitleLookup(gunzipSync(payload.body).toString("utf8")).items) {
      const title = normalizeTitle(item);
      latest.set(title.externalId, { studios: title.studios, publishers: title.publishers, creditEvidence: title.creditEvidence });
    }
  }
  log(`reparse: ${hashes.length} stored responses, ${latest.size} titles`);

  const rows = await prisma.title.findMany({
    where: { source: SOURCE_SYOBOI, externalId: { in: [...latest.keys()] } },
    select: { id: true, externalId: true, studios: true, publishers: true, creditEvidence: true }
  });
  const changed = rows.flatMap((row) => {
    const next = latest.get(row.externalId)!;
    const same =
      stableStringify(row.studios) === stableStringify(next.studios) &&
      stableStringify(row.publishers) === stableStringify(next.publishers) &&
      stableStringify(row.creditEvidence ?? []) === stableStringify(next.creditEvidence);
    return same ? [] : [{ id: row.id, ...next }];
  });
  for (const batch of chunk(changed, UPDATE_ROWS)) {
    const values = Prisma.join(
      batch.map((row) => Prisma.sql`(${row.id}::int, ${row.studios}::text[], ${row.publishers}::text[], ${JSON.stringify(row.creditEvidence)}::jsonb)`)
    );
    await prisma.$executeRaw`
      UPDATE "Title" AS t
      SET studios = v.studios, publishers = v.publishers, "creditEvidence" = v.evidence, "updatedAt" = now()
      FROM (VALUES ${values}) AS v(id, studios, publishers, evidence)
      WHERE t.id = v.id`;
  }
  log(`reparse: updated credits of ${changed.length} titles`);
  return { payloads: hashes.length, titles: latest.size, updated: changed.length };
}

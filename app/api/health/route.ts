import { connection } from "next/server";

import { getDatasetStatus } from "@/server/queries/status";

/** Data older than this is reported as stale (scheduled ingestion runs every 6 hours). */
const STALE_AFTER_HOURS = 48;

/**
 * Freshness check for monitors: 200 while the last successful import is recent, 503 when it is stale or the
 * database cannot be read. The body carries no internal detail.
 */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    const { lastSuccessAt } = await getDatasetStatus();
    const ageHours = lastSuccessAt ? (Date.now() - lastSuccessAt.getTime()) / 3_600_000 : null;
    const ok = ageHours !== null && ageHours <= STALE_AFTER_HOURS;
    return Response.json(
      { ok, lastSuccessAt: lastSuccessAt?.toISOString() ?? null, ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10, staleAfterHours: STALE_AFTER_HOURS },
      { status: ok ? 200 : 503, headers }
    );
  } catch {
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503, headers });
  }
}

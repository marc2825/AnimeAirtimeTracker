# Data pipeline

## Source and terms (checked 2026-11-18)

| Item | Finding | Reference |
| --- | --- | --- |
| Provider | Syoboi Calendar (しょぼいカレンダー), volunteer-entered anime program guide | https://docs.cal.syoboi.jp/about/ |
| Reuse | Copying, including automated retrieval by applications, is permitted ("自由にコピーできます"). Distributed software should set its own User-Agent. | same |
| Bot rules | No HTML scraping; fetch only what is needed and reuse results; separate initial fetch from update checks (use `LastUpdate`); honour Cache-Control; no parallel requests; ≥1 s after the previous **response**; no fixed-time bursts; 429/Retry-After; backoff with jitter and capped retries, then stop; keep last good data on failure; UA `AppName/version (+URL with contact info)`; do not rotate UA/IP to evade limits | https://docs.cal.syoboi.jp/rule/bot/ |
| API | `db.php` Commands `ChLookup`, `ChGroupLookup`, `TitleLookup` (≤100 TIDs per request), `ProgLookup` (≤5,000 rows; `Range`, `LastUpdate`, `ChID`). `Result/Code` must be checked even on HTTP 200. | https://docs.cal.syoboi.jp/spec/db.php/ |
| Not used | `json.php` (site-internal, not recommended for data retrieval), HTML pages | https://docs.cal.syoboi.jp/spec/json.php/ |

Attribution shown on every page footer and on `/about`; each title links to its Syoboi page. We do not use or host images.

## What we fetch

| Command | When | Requests |
| --- | --- | --- |
| `channels` | rarely (channel metadata) | 2 |
| `season [--season 2026-autumn]` | initial load of a season | 13–14 `ProgLookup` (7-day windows) + ⌈new TIDs / 100⌉ `TitleLookup` |
| `backfill --from A --to B` | one-off history load | per season as above |
| `update` | every 6 h (scheduled) | 1 `ProgLookup LastUpdate=…` + 1 `TitleLookup TID=* LastUpdate=…` + details for changed tracked titles |
| `recent` | daily | ~4 windows covering today−7 … today+14 (complete windows → absence detection) |
| `derive` | after every run (automatic) | 0 (DB only) |

Request budget in steady state: ≈ 4 × (2–4) + 4 ≈ **20 requests/day**. The initial backfill of 11 seasons on 2026-11-18 took 294 requests (before title batching per season was added; now ≈ 190). All requests: serial, `SYOBOI_MIN_INTERVAL_MS` (default 3000, floor 1000) + up to 25% jitter after each response, 60 s timeout, max 4 retries with exponential backoff from 10 s, Retry-After respected.

User-Agent: configured via `SYOBOI_USER_AGENT`; the CLI refuses to run unless it matches `AppName/version (+https://…)`. The info URL must lead to a page with contact information (the repository README + Issues).

## Processing steps

1. **Plan** 7-day windows (`src/ingest/plan.ts`); a window returning 5,000 rows is split in half and refetched (never accepted as complete).
2. **Fetch** through `SyoboiClient` (`src/ingest/syoboi/client.ts`); every attempt → `FetchLog`, every distinct body → `RawPayload` (gzip).
3. **Parse** (`parse.ts`): root element and `Result/Code` validation (404 = empty, others throw), zod row validation; invalid rows are quarantined (`rejected`) and make the window incomplete.
4. **Normalize** (`normalize.ts`): JST → instant, anime date/weekday/minute, flags, episode number vs label, comments; semantic content hash.
5. **Import** (`importer.ts`): per window in one transaction; creates/updates with revisions; touches unchanged rows; marks `missingSince` only for complete windows; applies overrides.
6. **Record** `CoverageWindow` for complete windows; `ImportRun` status/stats.
7. **Derive** (`derive.ts`): rerun reclassification and full slot rebuild.

Re-running any command is safe (idempotent). An interrupted run keeps committed windows; just run it again. Overlapping runs are prevented by a PostgreSQL advisory lock.

## Field semantics worth knowing

- `Flag` bits: 1 注, 2 新, 4 終, 8 再. `Deleted=1` marks removed entries.
- `Cat` 1 = アニメ and 10 = アニメ(終了/再放送) are confirmed from data; other labels (3 テレビ, 4 特撮, 5 アニメ関連, 7 OVA, 8 映画) match observed titles. Default anime filter: 1, 7, 8, 10.
- `StOffset` is in seconds (observed values 60–3300) but whether `StTime` already includes it is undocumented, so it is stored and **not applied**.
- `ProgComment` notes often start with `!` (e.g. sports overruns); the marker is stripped for display.

## Manual corrections

`data/overrides.json` (schema in `src/ingest/overrides.ts`), each entry with `reason`, `evidence`, `addedAt`:

- `broadcasts[]`: `isRerun` true/false (→ `rerunBasis = MANUAL`)
- `titles[]`: `name`, `seriesKey`, `officialUrl`, `sourceCategory`
- `slotMemberships[]`: add/remove a title from a slot by slug

Process: report via GitHub Issue → PR editing the file (reviewed) → next import/derive applies it. Corrections of the *source data itself* should go to Syoboi Calendar, which benefits everyone.

## Slots

Rule version `slots-v3` (`src/domain/slots.ts`, explained publicly on `/about#slots`):

- **SOURCE_LABEL**: comment lines matching `「X」枠で/にて/内で放送`; ≥2 member titles; home channel = most member titles with regular positions; the per-season position is the block (modal weekday, earliest start, span to latest end); rerun-context statements get `MEDIUM` confidence.
- **INFERRED**: exact (channel, weekday, start) with regular positions of ≥3 titles across ≥3 seasons.
- **OFFICIAL**: only via `data/slots.json` with an `evidenceUrl` on the broadcaster's own site (registry intentionally empty until verified).

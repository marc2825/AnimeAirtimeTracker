# Data architecture and ingestion contract — proposed v1

This is a target design, not a claim about current implementation. Review and test the contract before changing prisma/schema.prisma or attaching a live collector.

## Source hierarchy

Primary candidate: **Syoboi Calendar non-HTML feeds**, subject to compliance with the current site documentation and traffic limits.

- https://docs.cal.syoboi.jp/about/
- https://docs.cal.syoboi.jp/rule/bot/
- https://docs.cal.syoboi.jp/spec/feeds/
- https://docs.cal.syoboi.jp/spec/db.php/

Use db.php TitleLookup / ChLookup / ProgLookup for structured historical records and LastUpdate windows, plus update notices as hints. db.php is XML; HTTP 200 does not guarantee Result/Code success. A ProgLookup response may have at most 5000 rows, so partition time ranges and verify completeness. Recent notice feeds are capped in history/row count and cannot be the only recovery strategy.

Official guidance: never scrape HTML, avoid parallel requests, wait at least one second **after the previous response** before starting another, use substantial additional spacing for ongoing polling, cache, respect 429/Retry-After and conditional response metadata, and set an identifying User-Agent and project contact URL. Centralize all provider traffic in a single ingestion worker, not browser clients.

Do not add AniList/MAL/Jikan as enrichment simply because an API exists: verify service terms, bulk-data rights, request policy, and compatibility with the intended product before coding. Do not hotlink/reproduce artwork without permission.

## Canonical concepts (not the current schema)

- Series / Title: identity of anime work, alternate names and provider-specific IDs; series identity is distinct from a seasonal installment.
- Season / Installment: TV cour/season, first observed release date, relation to series, unknown metadata allowed.
- Channel: provider channel ID, station name, physical broadcast medium (terrestrial/BS/CS), availability region and time-bounded aliases.
- Region: geographic reception/measurement area, separate from medium; the chosen sampling stations are explicit.
- BroadcastEvent: one airing/episode on one channel at a timestamp, unique by **provider namespace + provider program ID** when available. Episode count/flags may be unknown.
- BroadcastRevision: source timestamp and observed change (scheduled, changed, cancelled, deleted, confirmed if independently supported); retaining a revision history is preferable to overwriting.
- Slot: canonical grouping of recurring programming, type official/common/inferred, documented evidence and manual override.
- SlotPeriod / SlotMembership: channel, anime weekday, effective dates, time band and relation of broadcast events to a slot. A slot is not one immutable weekday/time pair.
- SourceRecord / ImportRun: source namespace, external ID, fetched timestamp, raw object key/hash, normalized version, coverage window and provenance for **channels and airings as well as titles**.
- ManualOverride: field/entity, original value, replacement, reason, evidence, reviewer, created timestamp, and audit history.

Avoid using one title row for both a series and an airing-season identity. A season may span quarters, be rescheduled, or air on more than one channel.

## Time and statistical semantics

- Store broadcast start/end as timezone-aware instants. Parse source dates with a specified JST assumption only when warranted; test around midnight and year/quarter boundaries.
- Separately derive **anime date** + weekday + minute offset from a documented rollover policy (e.g., 05:00), rather than storing only a weekday or formatting UTC as local JST.
- Example: Monday 25:30 corresponds to Tuesday 01:30 JST; local calendar dates must be preserved.
- Model planned and observed broadcast distinctly; absence of rebroadcast flag does **not** prove a first run. Represent unknown flags explicitly.
- Keep event duration separate from rough buckets; do not turn 5/10/15/30/60-minute buckets into unqualified equivalent title counts.
- For simultaneous broadcasts, define half-open intervals [start,end), channel/region inclusion and how overlaps on the same channel or nationwide retransmissions are handled.
- Publish units: unique title count, season count, broadcast-event count, occupied slot count, overlapping pair count, and optionally airtime-minutes; never label all of them simply as 'number of anime'.
- Qualify charts by coverage window, station list, category filter, replay inclusion and data completeness.

## Import pipeline

1. Plan bounded request windows with global queue, jittered schedule and resumable cursor.
2. Fetch and validate response metadata, XML structure, Result/Code, record count and required IDs. Reject oversized/truncated windows rather than silently treating them as complete.
3. Store immutable raw payload with hash and retrieval metadata.
4. Normalize source IDs, dates, flags and terminology. Record rejected/unmapped rows to a quarantine report.
5. Compute semantic entity hashes excluding fetchedAt, raw path and whole-payload hash. Otherwise unchanged records can appear updated on each run.
6. Upsert in a DB transaction using source-qualified unique keys. Preserve previous good data on error.
7. Only infer removal after a **confirmed complete replacement** of that same coverage window. Incremental/partial responses MUST NOT delete unseen entities.
8. Save checkpoint and ImportRun only after committed data; safely resume after interruption.
9. Reconcile with recent LastUpdate windows plus periodic wider checks. Surface late corrections, source lag and import failures.
10. Apply manual overrides separately so the next import does not erase reviewed corrections.

## Important gaps in the existing implementation

- scripts/collector/index.ts explicitly rejects all but mock-official-feed.
- src/data/catalog.ts supplies all visible page data; Prisma is only a schema/seed at present.
- prisma/seed.ts deletes all rows in multiple tables before inserting synthetic data: never run against a populated/production DB. Convert to an explicit dev-only command or an isolated database.
- prisma/schema.prisma forces Title.summary, Title.genres and durationCategory though real source fields can be absent; SourceRecord requires a Title relation even for channel/airing provenance.
- src/lib/admin.ts presents static fake jobs/errors. The current /admin page has no authentication.
- Existing collector entity digests include fetchedAt and the whole payload hash in sourceRecord hashes, which can create false diffs; add a changing-fetch-timestamp fixture test before live use.
- RegionGroup currently mixes Kanto/Kansai with BS/CS reception types.

## Required fixtures/tests

- A fixture representing real db.php XML structure, including Result/Code failure with HTTP 200.
- Cursor/window partition test at the 5000-record limit; duplicates and records crossing boundary.
- Duplicate import, changed program, deleted program, partial retry, missed notice interval and rate-limit tests.
- First-run unknown, rebroadcast flag, changed schedule, cancellation, after-midnight and year boundary tests.
- Property-based or table-driven metrics with known expected values; snapshots are not substitutes for numerical semantics.
- Source attribution and manual override precedence tests.
- Failure injection: crash after raw write, before DB commit, and after DB commit but before checkpoint.

Before enabling collection, record the exact source endpoints, request schedule, user-agent identifier, contact channel and estimated traffic in docs/operations.md.

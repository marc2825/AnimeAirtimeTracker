# Data model

Schema: `prisma/schema.prisma`. This document explains the concepts and invariants the schema must keep.

## Entities

| Model | One row is | Source key | Notes |
| --- | --- | --- | --- |
| `Channel` | a tracked broadcast channel | (`source`, `externalId` = ChID) | `medium` (TERRESTRIAL/BS/CS) and `area` (NATIONWIDE/KANTO/KANSAI) are separate axes |
| `Title` | a Syoboi title (TID) — usually one season/installment of a work | (`source`, `externalId` = TID) | `seriesKey` = normalized reading, a *derived* grouping (not verified series identity); `detailsFetchedAt = null` marks a stub |
| `Broadcast` | one airing of one episode on one channel | (`source`, `externalId` = PID) | JST instant (`startAt`, `endAt`) **and** anime-time fields (`animeDate`, `animeWeekday`, `animeStartMinute`) |
| `BroadcastRevision` | an observed change of a broadcast | — | `CREATED`, `RESCHEDULED`, `FLAGS_CHANGED`, `DELETED`, `RESTORED`, `UPDATED` with before/after snapshots |
| `Slot` / `SlotMembership` / `SlotSeason` | derived slot, title membership with method/confidence/evidence, per-season position | `slug` | Fully rebuilt by `ingest derive`; never edited by hand (use `data/` files) |
| `ImportRun` / `FetchLog` / `RawPayload` | one CLI run / one HTTP attempt / one distinct response body | `RawPayload.hash` = sha256 | Audit trail and replay source |
| `CoverageWindow` | a time range fetched completely for the tracked channels | — | Basis for "対象期間" and absence inference |
| `SyncCursor` | incremental sync position | key | e.g. `syoboi:programs:lastUpdate` |

## Invariants

1. **Series ≠ installment ≠ airing.** A TID is an installment; a PID is an airing. Statistics never treat airings as titles.
2. **Two time representations.** `startAt` is the real instant; anime fields use the 05:00 rollover (`src/domain/time.ts`). Weekday, season and schedule day always come from anime fields.
3. **Unknown ≠ false.** Missing source values are `NULL`. An absent 再 flag is not proof of a first run (`rerunBasis = NONE`).
4. **Non-destructive.** Source deletions set `deleted = true`; disappearance sets `missingSince` and only after a complete re-fetch of a covering window. Rows are never physically deleted by ingestion.
5. **History is kept.** Semantic changes create revisions; change detection uses a hash of source semantic fields only (not fetch time, revision counters or overrides).
6. **Corrections survive imports.** Manual overrides (`data/overrides.json`) are applied on every import; `rerunBasis = MANUAL` is never recomputed.
7. **Provenance.** Every public fact can be traced to a TID/PID (linked to the Syoboi page), an import run and a raw payload.

## Counting

| Unit | Definition |
| --- | --- |
| 作品本数 (titles) | distinct `Title` with ≥1 qualifying airing in scope; a title in two cells counts in both |
| 放送件数 (broadcasts) | qualifying `Broadcast` rows |
| 同時放送数 | regular positions overlapping a bucket, half-open `[start, end)` |
| 定時放送の位置 | modal (weekday, start) per title/channel/season with ≥3 airings |
| 再放送 | `flagRerun` or aired >6 months after the source's first-run end month (`AGE`), or manual |

"Qualifying" always excludes `deleted` and `missingSince` rows; category and rerun filters are explicit in the UI.

## Migrations, backup, recovery

- Create: `npm run db:migrate -- --name <change>` (dev DB only). Apply: `npm run db:deploy` (CI/production). Never edit an applied migration; destructive changes need a written plan and a verified backup first.
- `prisma migrate reset` and `db push --force-reset` are denied for agents and must not be run against shared databases.
- Fixtures (`npm run db:fixtures`) refuse non-local hosts and `APP_ENV=production`.
- Backup/restore procedure: [operations.md](operations.md#backup-and-restore). Because raw payloads are stored, derived tables can always be rebuilt with `npm run ingest -- derive`.

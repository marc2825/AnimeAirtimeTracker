# Product strategy — 2026-11-18

Status: proposed replacement for the 2026-03 MVP direction. The existing docs/requirements.md is retained as historical ideation, not a current acceptance contract.

## Decision

Build a **Japanese late-night anime broadcast-slot observatory**, not a second general anime database and not merely another weekly TV guide.

- Entry point: a reliable, filterable **current season weekly schedule** for supported channels.
- Differentiator: explore **which titles occupied a named or inferred slot**, how the slot moved over seasons, and how broadcast congestion changed.
- Trust: show source attribution, retrieval time, coverage, uncertainty, and explicitly defined counting units.
- Initial audience: Japanese viewers curious about schedules, then enthusiasts/researchers exploring historical programming.
- Primary UI language: Japanese. English localization is optional later.
- Avoid collecting copyrighted key visuals until rights or a permitted embedding mechanism are verified.

## Evidence / competition

As of 2026-11, Syoboi Calendar already offers detailed TV schedules, and other sites offer seasonal anime grids, reminders and watch lists. Simply duplicating a program guide is weak differentiation.

The existing application has routes for home, search, title, slot, stats, and an admin demo. It renders repository-local synthetic catalog data. The collector accepts only a mock fixture, and the Prisma schema is not yet serving pages.

## v1 public scope (smaller than the original plan)

1. Support a **documented, bounded set** of Kanto terrestrial channels, selected BS channels as a separate distribution category, and the current quarter. Do not promise nationwide coverage.
2. Show current-season weekly schedule and a readable table, with explicit channel, scheduled timestamp (JST), anime-day representation (e.g., Monday 25:30), flags, original source, and update time.
3. Link shows and **curated official slot histories**. Start with a handful of verifiable named slots; label inferred slots as hypotheses, not facts.
4. Provide one accurate, inspectable dashboard: weekday × hour heatmap, counts by channel, and simultaneously scheduled broadcast counts; expose filter settings and denominators.
5. Query parameters are shareable. Responsive mobile layout, keyboard navigation, and Japanese copy are required.
6. Deploy a read-only public website with a private ingestion job, health checks, backups, and clearly separated demo environment.
7. Begin recent-history backfill only after the current-quarter pipeline is reliable; progressively extend toward 2010 where evidence supports it.

## Out of scope for v1

User accounts, watch-list sync, notifications, streaming catalogs, genres/staff enrichment, nationwide channel completeness, automated inferred-slot classification, recommendations, ranking by popularity, and a public editing portal.

Keep these as optional later experiments; do not model them as requirements that block launch.

## Information architecture

- / — what is on this week, data freshness, season and channel controls, one featured slot/history.
- /schedule — weekly calendar and accessible list, filters by quarter/channel/day, optional rebroadcast inclusion.
- /titles/[slug] — program profile, related broadcasts and sources; no fictitious facts.
- /slots/[slug] — history timeline with provenance and official/inferred distinctions.
- /stats — honest counts, heatmap and documented metric definitions.
- /methodology — sources, inclusion rules, time conventions, corrections, known limitations.
- /admin — must be inaccessible to anonymous users in production; no public demo of fake jobs.

Existing /search may be preserved/redirected to /schedule, and existing pages may be adapted rather than rewritten.

## Product principles

1. Actual data before visual polish or adding chart types.
2. Distinguish planned schedule, updated schedule, and confirmed historical broadcast.
3. A blank or unknown field is preferable to fabricated metadata.
4. Count unique titles, episodes, channel-broadcast events and slot occupancy separately.
5. Geographic area (Kanto/Kansai) is not a distribution medium (terrestrial/BS/CS).
6. A slot can change its station, weekday, time, label and existence over time.
7. No metric should be published without source, covered dates/channels, exclusion rules and update timestamp.
8. Public-facing UI must never contain seeded fake job outcomes or interactive-looking buttons with no action.
9. Do not make live requests to third-party providers on each page view; ingest and cache centrally.

## Success criteria

**Readiness:** a completely new checkout can build, run tests, start against a documented local data environment, ingest a fixture and then a real bounded source range, and serve real records on public routes.

**Reliability:** reproducible rerun gives no semantic changes; missed/changed records are observable; interrupted imports resume without deleting previously valid data; stale data is visibly marked.

**Experience:** representative desktop/mobile tasks (find this week's schedule, open an official slot timeline, understand a chart count) are usable without instructions.

No unsupported claim of comprehensive historical accuracy or exact source freshness.

## Decision checkpoints

- Gate A: source use, fields and data transformations verified on a small real sample.
- Gate B: DB import, idempotency, correction and time-conversion tests are green.
- Gate C: public pages use DB-backed queries and demo data is isolated.
- Gate D: deployment/security/monitoring verified and source/limitation pages published.
- Gate E: historical expansion and inference only after measuring completeness.

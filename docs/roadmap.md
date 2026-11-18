# Roadmap

Status as of 2026-11-18 (branch `feat/v1-public-redesign`).

## Done in v1

- Toolchain on current majors; CI (lint, typecheck, unit, build without DB; DB integration + Playwright E2E with PostgreSQL 18)
- Syoboi ingestion with source-rule compliance, raw payload retention, revisions, coverage windows, overrides
- 20 channels, 2024 winter – 2026 autumn ingested locally (≈ 51,000 airings, 1,700 titles, 19 source-labelled + 281 inferred slots)
- Pages: home, schedule, search, title, slots, slot chronicle, stats, about, status; light/dark; mobile layouts
- Harness: AGENTS.md / CLAUDE.md / `.claude` rules, skill and permissions; docs reorganized

## P0 — before public launch

- [ ] Choose hosting + DB and create production resources (owner decision; see operations.md)
- [ ] Set production env/secrets; run migrations; ingest current season + backfill in production
- [ ] Enable scheduled ingestion (`INGEST_ENABLED=true`) and confirm two successful runs
- [ ] Domain + `SITE_URL`; verify sitemap/robots/OG and security headers on the live URL
- [ ] Backup policy and one restore test
- [ ] Review `/about` copy and the info page linked from `SYOBOI_USER_AGENT` (contact path)
- [ ] Choose a LICENSE for the source code (owner decision)

## P1 — shortly after launch

- [ ] Curated OFFICIAL slots in `data/slots.json` with broadcaster evidence URLs (ノイタミナ, +Ultra, …)
- [ ] Season landing pages (`/seasons/2026-autumn`: new series by weekday) for SEO and browsing
- [ ] Channel pages (`/channels/[slug]`: slots and season counts per channel)
- [ ] `pg_trgm` index for title search once data grows; query timing review
- [ ] Persisted cache (`use cache: remote` or provider cache) if traffic warrants
- [ ] Lighthouse/axe pass in CI; visual regression snapshots for key pages
- [ ] Extend backfill to 2020+ (≈ 15 requests per season), with coverage shown per season

## P2 — later

- [ ] Additional regions (Chukyo) and channels with regional comparison beyond Kanto/Kansai
- [ ] Slot time-move detection across positions (link inferred positions into one moving slot)
- [ ] CSV export of statistics tables
- [ ] Planned-vs-observed analysis using revisions (how often schedules change)
- [ ] English UI if there is demand

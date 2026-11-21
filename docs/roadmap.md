# Roadmap

Status as of 2026-11-21: live at <https://anime-airtime-tracker.vercel.app> (Vercel Hobby + Neon Free + GitHub Actions, see [operations.md](operations.md)).

## Done in v1

- Toolchain on current majors; CI (lint, typecheck, unit, build without DB; DB integration + Playwright E2E with PostgreSQL 18)
- Syoboi ingestion with source-rule compliance, raw payload retention, revisions, coverage windows, overrides
- 20 channels, 2024 winter – 2026 autumn ingested locally (≈ 51,000 airings, 1,700 titles, 19 source-labelled + 281 inferred slots)
- Pages: home, schedule, search, title, slots, slot chronicle, stats, about, status; light/dark; mobile layouts
- Harness: AGENTS.md / CLAUDE.md / `.claude` rules, skill and permissions; docs reorganized

## P0 — launch

- [x] Hosting + DB chosen and production resources created (option A in operations.md)
- [x] Production env/secrets set; migrations applied; current season + 2024 winter – 2026 summer backfill ingested in production
- [x] Scheduled ingestion enabled (`INGEST_ENABLED=true`); `update` and `recent` verified in production
- [x] sitemap/robots and security headers verified on the live URL (`*.vercel.app`; a custom domain + `SITE_URL` is optional)
- [ ] Backup: one logical dump and one restore test (Neon Free keeps only a 6-hour restore window)
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

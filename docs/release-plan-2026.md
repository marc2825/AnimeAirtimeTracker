# Delivery plan (2026-11-18)

Source of truth for staged shipping. supersedes docs/implementation-plan.md for new work. No launch claim is made until all gates pass.

## Phase 0 — protect the foundation

- [ ] Upgrade the installed Next.js patch version immediately; test migration to current Active LTS Next.js and compatible React/Prisma under Node 22/24. Regenerate lockfile with npm and review npm audit output.
- [ ] Keep /admin fully private or disabled in production before deployment.
- [ ] Make destructive prisma/seed.ts inaccessible for production credentials; add a safe development-only fixture seed.
- [ ] Establish CI and test fixtures, environment guide, data provenance conventions and changelog/issue process.
- [ ] Remove generated files from version control and document all runtime environment variables.
- [ ] Decide allowed data sources and publish attribution/caveats.
- Gate: all existing checks green, vulnerabilities triaged, no synthetic admin status shown in the public experience.

## Phase 1 — live data vertical slice

- [ ] Inspect Syoboi XML responses on a small, limited date range and validate their field semantics.
- [ ] Implement one respectful source adapter (client-wide request queue, caching, User-Agent, retries, Result/Code).
- [ ] Introduce migration for source-qualified IDs, provenance, time normalization, import runs, non-destructive upserts.
- [ ] Ingest a small current-quarter station sample into PostgreSQL with deterministic rerun.
- [ ] Implement a repository/data access layer and replace one public list route with DB data.
- [ ] Add end-to-end smoke tests using the local test DB and source fixtures.
- Gate: real schedule is visible, attribution and freshness correct, rerun no-op, failures resumable.

## Phase 2 — meaningful public beta

- [ ] Build /schedule weekly and list views with quarter, station, broadcast-day and rebroadcast filters.
- [ ] Build title/slot pages with curated official slots and historical transitions, never fabricated descriptors.
- [ ] Implement heatmap with precise counting units and accessible table equivalent.
- [ ] Replace demo homepage copy and synthetic metrics. Add methodology, limitations, coverage and contact/correction page.
- [ ] Cover desktop/mobile accessibility, metadata, sitemap, robots, error/empty/loading states.
- [ ] Deploy read-only web separately from scheduled private ingestion; monitor sync lag/errors and backups.
- Gate: anonymous user can complete schedule, slot-history and metric-interpretation tasks on a supported device.

## Phase 3 — verified history and analytical depth

- [ ] Backfill additional quarters incrementally; track explicit coverage per quarter/station.
- [ ] Implement planned-vs-observed revisions, time-move visualization and source correction audit.
- [ ] Add overlap and station-comparison statistics with deterministic reference test cases.
- [ ] Evaluate inferred slots only after curated labeled examples and human review.
- Gate: chart errors, history gaps and uncertain slot associations are measurable and visible.

## Delivery/harness rules

- One vertical slice per PR: source contract + fixture + import + query + UI + tests.
- PR summary: user-facing change, source/coverage effects, migration/backfill effects, screenshots where relevant, security/access checks, commands actually executed, rollback path.
- Static checks: npm ci; npm run lint; npm run typecheck; npm test; npm run build.
- Additional production gates: DB migration test, data-quality/integrity checks, source request budget, auth boundary test, accessibility, smoke E2E, deployment health and backup restore.
- Never claim a passed test that was not executed; never substitute synthetic demos for real-source validation.
- Do not introduce unaudited data providers, user accounts, notifications or broad architecture rewrites in phase 1.

## Open decisions before phase 1

- Production hosting and DB provider, cost budget, and monitoring.
- Initial station allowlist and cutoff for 24+ anime notation.
- Source attribution display, licensing policy for non-program metadata and images.
- How to define official vs inferred slots and who reviews proposed corrections.
- Initial historical coverage target; no '15-year complete archive' promise without a coverage report.

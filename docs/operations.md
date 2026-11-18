# Operations handbook (draft)

This is a design/launch checklist. **No live collector or deployment is configured yet.**

## Environments

- Local: fixtures and an isolated development DB.
- Preview: fake datasets only when prominently marked as demo, with no third-party production calls.
- Production: database-backed read-only site; private scheduled importer, private backups, protected admin or no admin route.
- Use a distinct database and credentials for production. Never run current destructive `prisma/seed.ts` against it.

## Collector onboarding

Before enabling a provider, record:
- provider name, structured endpoint URLs, terms/attribution URLs, permissions review date;
- expected request budget per hour/day, cache TTL, global rate-limit policy, backoff/429 behavior;
- identifying User-Agent with stable project contact URL;
- exact fields and source-qualified keys, parser version, timezone policy and recovery/backfill limits;
- sample raw fixture and expected normalized output.

Syoboi policy refs: https://docs.cal.syoboi.jp/rule/bot/ and https://docs.cal.syoboi.jp/spec/rate_limit/ . The documentation says db/rss/rss2/json requests are capped at one per second; excessive/duplicate requests or missing identifying UA may trigger one per ten seconds. Use slower settings and centralized scheduling rather than targeting the maximum throughput.

## Observability

Measure last successful synchronization, oldest unattended update, fetched/parsed/inserted/rejected/changed counts, per-request status and rate limit, rejected source records, missing channel mapping, incomplete time windows, and datasource availability. Alert on repeated failure and stale data without silently showing it as current.

## Backup, restore and rollback

- Schedule DB backups and periodically test restores in a separate environment.
- Keep immutable raw snapshot references and import checkpoints for replay.
- Apply tested migrations with clear rollback notes; avoid destructive migrations without an independent verified backup.
- A failed importer must not bring down read-only public routes.
- Prepare ability to disable an ingest job without taking down the site.

## Publication requirements

- `/admin` server-side disabled or authenticated and authorized.
- Production environment tested after dependency security upgrade.
- All public facts traced to source, update time and coverage; source terms reviewed.
- Provide methodology, contact/correction process, accessibility and a visible data staleness indicator.
- SEO, privacy notice if analytics/cookies are used, and hosting/domain settings checked.

# Operations

Nothing is deployed yet. This document is the runbook for doing so; production actions need the owner's approval.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | web runtime, ingest job | PostgreSQL connection string. Not needed at build time. |
| `SITE_URL` | web runtime | Public origin for canonical URLs, sitemap, Open Graph (e.g. `https://example.jp`) |
| `SYOBOI_USER_AGENT` | ingest job only | `AnimeAirtimeTracker/<version> (+<info page with contact>)` — required, validated |
| `SYOBOI_MIN_INTERVAL_MS` | ingest job | default 3000, minimum 1000 |
| `TEST_DATABASE_URL` | dev/CI | disposable DB for `test:db` and E2E (name must contain `test`) |
| `APP_ENV` | optional | set `production` in production; fixture import refuses to run |

Secrets are configured in the hosting provider / GitHub Actions secrets, never in the repository.

## Local setup

```bash
nvm use            # Node 24
npm ci
cp .env.example .env
npm run db:local   # terminal 1: embedded PostgreSQL 18 on :54320 (data in .data/postgres)
npm run db:deploy
npm run db:fixtures              # offline sample (one recorded day), or:
npm run ingest -- season         # live current season (~20 requests; set SYOBOI_USER_AGENT first)
npm run dev
```

Any PostgreSQL ≥ 16 works instead of the embedded one (Docker, Homebrew, managed) — point `DATABASE_URL` at it.

## Deployment (recommendation)

Facts that drive the choice (checked 2026-11-19): the app relies on Next.js 16 Cache Components; the whole dataset for 11 seasons is **62 MB** (≈5 MB per season); traffic is read-only; ingestion runs ~5 short jobs per day.

| Option | Web | DB | Ingest | Cost | Notes |
| --- | --- | --- | --- | --- | --- |
| **A. Vercel Hobby + Neon Free (recommended start)** | Vercel (first-party Next 16 support) | Neon Free: 1 GB storage/project, 100 CU-hours/month, scales to zero after 5 min | GitHub Actions `ingest.yml` | $0 | Hobby is **non-commercial only**; ads/affiliate → Vercel Pro ($20/month incl. $20 usage). Neon cold start after idle; CU-hours can run out if the DB is busy around the clock → Neon paid plan |
| B. Railway (Hobby) | long-running `next start` (in-memory cache stays warm) | Railway Postgres in the same project | Railway cron or GitHub Actions | ~$5/month incl. $5 usage | Commercial use fine; one dashboard; no free tier |
| C. Vercel + Supabase Free | Vercel | Supabase Free: 500 MB, project pauses after 7 days without activity | GitHub Actions | $0 | Pause risk if ingestion stops; Pro $25/month removes it |
| D. VPS + Docker | self-hosted | self-hosted | cron | fixed monthly | Most control, highest ops load (patching, TLS, backups) |
| Not now: Cloudflare Workers (OpenNext) | | | | | Open issues report hangs/500s with `cacheComponents` on Next 16.3/16.4 — revisit when fixed |

Choose DB and function regions close to each other (and to Japan where available).

Prices and limits change; confirm on the providers' pricing pages before signing up. Steps for A:

1. Create the Neon project (region close to users, e.g. Tokyo/Singapore); create a role for the app.
2. Vercel project from the repository; set `DATABASE_URL` (pooled connection string), `SITE_URL`, `APP_ENV=production`. Build command `npm run build` (no DB needed).
3. Run migrations from a trusted machine or a manual workflow: `DATABASE_URL=… npm run db:deploy`.
4. Initial data: `npm run ingest -- season`, then `backfill --from 2024-winter --to <previous season>` (one-off, ~15 requests per season).
5. GitHub: secrets `DATABASE_URL` (direct, non-pooled is fine), `SYOBOI_USER_AGENT`; repository variable `INGEST_ENABLED=true` to activate `.github/workflows/ingest.yml` (update every 6 h, recent re-sync daily).
6. Verify `/status`, `/sitemap.xml`, `/robots.txt`, security headers (`curl -I`), and both themes on a phone.

## Scheduled ingestion

`ingest.yml` runs `update` at :23 every 6 hours and `recent` daily at 19:41 UTC, after a random 0–4 min delay; concurrency group prevents overlap (the advisory lock is a second guard). Failures appear in the Actions tab and as `FAILED` runs on `/status`; the site keeps serving the last good data. To pause ingestion, set `INGEST_ENABLED` to anything else.

## Backup and restore

- Managed (Neon): enable point-in-time restore; additionally keep a weekly logical dump:
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > backup-$(date +%F).dump`
- Restore into a **new** database, verify, then switch `DATABASE_URL`:
  `createdb restore_test && pg_restore --no-owner -d restore_test backup.dump`
- Test a restore at least once per quarter. Derived tables can be rebuilt with `npm run ingest -- derive`; source tables can be re-fetched from the API if ever lost (respecting the request budget).
- `RawPayload` grows with every distinct response (~MBs per season); prune old payloads only after confirming no replay is needed.

## Monitoring

- `/status`: last success, coverage window, last 12 runs, staleness warning after 48 h.
- GitHub Actions failure notifications for `ingest.yml`.
- Hosting provider logs for 5xx; add an uptime check on `/about` (static) and `/status` (DB-backed).

## Pre-launch checklist

- [ ] Hosting/DB chosen and costs accepted by the owner
- [ ] `SITE_URL`, `DATABASE_URL`, `APP_ENV` set; `SYOBOI_USER_AGENT` points to a page with contact info
- [ ] Migrations applied; initial season + backfill ingested; `/status` shows success
- [ ] Security headers verified; `npm audit --omit=dev` clean; Dependabot enabled
- [ ] Backup schedule + one restore test done
- [ ] Domain, TLS, `robots.txt`/`sitemap.xml` reachable; Open Graph preview checked
- [ ] Privacy: no analytics/cookies are used; if added later, publish a privacy notice first

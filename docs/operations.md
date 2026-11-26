# Operations

Production runs on option A below (Vercel Hobby + Neon Free + GitHub Actions) since 2026-11-21: <https://anime-airtime-tracker.vercel.app>. This document is the runbook; production actions need the owner's approval.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | web runtime | PostgreSQL connection string. On Neon: the **pooled** URL of the read-only `web_readonly` role. Not needed at build time. |
| `DIRECT_DATABASE_URL` | migrations, ingest job | Owner role, **non-pooled** URL. Used by `prisma migrate` and ingestion (its advisory lock is session-scoped and breaks behind a transaction pooler). Falls back to `DATABASE_URL` locally. |
| `SITE_URL` | web runtime | Public origin for canonical URLs, sitemap, Open Graph (e.g. `https://example.jp`) |
| `SYOBOI_USER_AGENT` | ingest job only | `AnimeAirtimeTracker/<version> (+<info page with contact>)` — required, validated. Production: `…/about#contact` (contact via GitHub Issues / private advisory) |
| `SYOBOI_MIN_INTERVAL_MS` | ingest job | default 3000, minimum 1000 |
| `TEST_DATABASE_URL` | dev/CI | disposable DB for `test:db` and E2E (name must contain `test`) |
| `APP_ENV` | optional | set `production` in production; fixture import refuses to run |
| `GOOGLE_SITE_VERIFICATION` | web (optional) | Search Console HTML-tag token; rendered as `<meta name="google-site-verification">` |
| `BING_SITE_VERIFICATION` | web (optional) | Bing Webmaster Tools HTML-tag token; rendered as `<meta name="msvalidate.01">` |

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

Facts that drive the choice (checked 2026-11-19): the app relies on Next.js 16 Cache Components; the whole dataset for 11 seasons is **62 MB** (≈5 MB per season; on 2026-11-21, 2000 winter – 2026 autumn is ≈ 370 MB of the 1 GB Neon Free branch limit); traffic is read-only; ingestion runs ~5 short jobs per day.

| Option | Web | DB | Ingest | Cost | Notes |
| --- | --- | --- | --- | --- | --- |
| **A. Vercel Hobby + Neon Free (recommended start)** | Vercel (first-party Next 16 support) | Neon Free: 1 GB storage/project, 100 CU-hours/month, scales to zero after 5 min | GitHub Actions `ingest.yml` | $0 | Hobby is **non-commercial only**; ads/affiliate → Vercel Pro ($20/month incl. $20 usage). Neon cold start after idle; CU-hours can run out if the DB is busy around the clock → Neon paid plan |
| B. Railway (Hobby) | long-running `next start` (in-memory cache stays warm) | Railway Postgres in the same project | Railway cron or GitHub Actions | ~$5/month incl. $5 usage | Commercial use fine; one dashboard; no free tier |
| C. Vercel + Supabase Free | Vercel | Supabase Free: 500 MB, project pauses after 7 days without activity | GitHub Actions | $0 | Pause risk if ingestion stops; Pro $25/month removes it |
| D. VPS + Docker | self-hosted | self-hosted | cron | fixed monthly | Most control, highest ops load (patching, TLS, backups) |
| Not now: Cloudflare Workers (OpenNext) | | | | | Open issues report hangs/500s with `cacheComponents` on Next 16.3/16.4 — revisit when fixed |

Choose DB and function regions close to each other (and to Japan where available).

Prices and limits change; confirm on the providers' pricing pages before signing up. Steps for A:

Region: Neon does not list Tokyo, so use **AWS Asia Pacific (Singapore) `aws-ap-southeast-1`** and run Vercel functions in **`sin1`** (`vercel.json`) next to it. Static shells are still served from Vercel's CDN close to users.

1. **Neon project** in `aws-ap-southeast-1`. The default owner role (e.g. `neondb_owner`) is used only for migrations and ingestion (direct URL).
2. **Read-only web role**: `neon roles create --name web_readonly --access read_only`. The default `--access admin` (also what the console creates) joins `neon_superuser` and **can write**. Then grant and verify:
   `DIRECT_DATABASE_URL=<owner direct> npm run db:role -- apply web_readonly --yes` — grants `SELECT` on the site's tables only (`src/server/web-role.ts`) and fails if the role can still write, read other tables or create objects. If a role with the same name was recreated, restart the compute so the pooler drops connections of the old role.
3. **Migrations**: `DIRECT_DATABASE_URL=<owner direct> npm run db:deploy`
4. **Initial data** — either copy what was already fetched locally (no new requests to the source):
   `SOURCE_DATABASE_URL=<local> TARGET_DATABASE_URL=<owner direct> npx tsx scripts/copy-db.ts` (refuses non-empty targets)
   or run the `Ingest` workflow manually: `season`, then `backfill` with `from`/`to` (~15 requests per season).
5. **Vercel project** from the GitHub repository (Git integration: `main` → production, PRs → previews). Environment variables for Production and Preview: `DATABASE_URL` = `web_readonly` **pooled** URL, `APP_ENV=production`, optionally `SITE_URL` (defaults to the Vercel production domain). The web app never writes, so previews can safely share the read-only role. Keep **Git Fork Protection** on (default): the repository is public, and a fork PR must not build with these variables unreviewed.
6. **GitHub** secrets `DIRECT_DATABASE_URL`, `SYOBOI_USER_AGENT`; variables `INGEST_ENABLED=true` (scheduled ingestion) and `MIGRATE_ON_PUSH=true` (`migrate.yml` applies migrations when they change on `main`; keep them additive because Vercel deploys in parallel). `migrate.yml` is the only workflow that applies migrations: on push when `MIGRATE_ON_PUSH=true`, or by a manual run (Actions → Migrate → Run workflow) regardless of the variable. `ingest.yml` only checks `prisma migrate status` and fails while migrations are pending. Workflows that receive these secrets run only on `main`/manual dispatch, never on `pull_request`.
7. **Verify** `/status`, `/sitemap.xml`, `/robots.txt`, security headers (`curl -I`), both themes on a phone, and the first scheduled `update` run.
8. **Search Console** (optional): add a URL-prefix property for the production URL, choose the HTML-tag method, set `GOOGLE_SITE_VERIFICATION` on Vercel (Production), redeploy, verify, then submit `/sitemap.xml`. Afterwards: Pages (indexing) report for excluded URLs, Enhancements for Breadcrumbs and Datasets, and URL inspection to request indexing of the home page and the current season page. `/sitemap.xml` is a sitemap index; submitting it covers the four child sitemaps. After a change to what the sitemaps list (#52), resubmit `/sitemap.xml` and request indexing of the home page again.

   Bing Webmaster Tools:
   - Import the property from Search Console, or verify with the HTML-tag method by setting `BING_SITE_VERIFICATION` on Vercel (Production) and redeploying.
   - Then submit `/sitemap.xml`.
   - IndexNow is not wired up: the update job does not know which pages changed, and it would need a key in both GitHub and Vercel.

## Scheduled ingestion

`ingest.yml` runs `update` at :23 every 6 hours and `recent` daily at 19:41 UTC, after a random 0–4 min delay; concurrency group prevents overlap (the advisory lock is a second guard). It can also be run manually (Actions → Ingest → Run workflow) with `season`, `backfill` (seasons validated before use), `derive`, `channels`, `subtitles` or `reparse-titles` (re-reads stored title responses for studios and publishers, no request to the source; run once after a change to the extraction, [data-pipeline.md#credits](data-pipeline.md#credits)). Failures appear in the Actions tab and as `FAILED` runs on `/status` (a fixed summary only; the full error stays in `ImportRun.error`, readable with `npm run ingest -- status`); the site keeps serving the last good data. To pause ingestion, set `INGEST_ENABLED` to anything else.

Actions logs of a public repository are public: the workflows mask the database host before any step runs, and secrets are masked by GitHub. GitHub also **disables scheduled workflows after 60 days without repository activity** in public repositories; `monitor.yml` re-enables `ingest.yml`, `backup.yml` and itself through the API every day, which resets that timer. `/status` warns when data is older than 48 h.

## Backup and restore

- Neon Free keeps a **6-hour** restore window (instant restore / branch from a past point); longer windows and scheduled snapshots need a paid plan.
- `backup.yml` (1st of each month, 04:47 UTC, or Actions → Backup → Run workflow; it shares the `ingest` concurrency group so an import never lands between the dump and the count check) dumps production with a PostgreSQL 18 client, restores the dump into a throwaway PostgreSQL 18 and compares the list of tables and the row count of every table (the list is read from the database, so tables added later are checked too), then uploads it **encrypted** to `.github/backup/backup-cert.pem` as an artifact kept 90 days (artifacts of a public repository are downloadable, so never upload it unencrypted). The private key is only on the owner's machine (`~/.config/anime-airtime-tracker/backup-key.pem`); keep a second copy of it elsewhere (password manager). To restore:
  `gh run download <run id> --name <artifact>` →
  `openssl cms -decrypt -binary -inform DER -in anime-airtime-tracker-<date>.dump.cms -inkey ~/.config/anime-airtime-tracker/backup-key.pem -out backup.dump` →
  `pg_restore --no-owner --no-privileges -d <new database> backup.dump` (PostgreSQL 18 client, e.g. `docker run postgres:18 pg_restore …`).
- Manual copies from a trusted machine, when needed:
  - copy into a local PostgreSQL 18 (no PostgreSQL client needed; verifies row counts per table and refuses to run when a table is missing from its list). The source must read every table, so once the web role is limited to the site's tables use the owner's direct URL, from a trusted machine only:
    `DIRECT_DATABASE_URL=<local db> npm run db:deploy && SOURCE_DATABASE_URL=<owner direct url> TARGET_DATABASE_URL=<local db> npx tsx scripts/copy-db.ts`
  - or a logical dump with a **PostgreSQL 18** client (older `pg_dump` refuses an 18 server):
    `pg_dump --format=custom --no-owner "$DIRECT_DATABASE_URL" > backup-$(date +%F).dump`
- Restore check done 2026-11-21: production → local PostgreSQL 18 with `copy-db.ts` (≈ 6.5 min); all 12 tables matched (326,151 airings, 6,490 titles, 866 slots) and the site served every page from the copy.
- Restore into a **new** database, verify, then switch `DATABASE_URL`:
  `createdb restore_test && pg_restore --no-owner -d restore_test backup.dump`
- **Frequency (reviewed 2026-11-22): monthly stays.** A dump is ≈ 52 MB compressed (2026-11-21), but `pg_dump` reads every table over the network, so each run uses a few hundred MB of Neon's monthly network-transfer allowance; weekly would make backups a large share of the Free plan's transfer. Between dumps, Neon's 6-hour restore window covers operator mistakes, and source tables can be re-fetched from the source; what only a dump preserves is the history this site observed (`BroadcastRevision`, `ImportRun`) and `data/` overrides (those are in git). Revisit if the plan changes or the observed history becomes important.
- The backup job's PostgreSQL image is pinned by digest (it handles the owner-role URL). When testing a restore, update the digest: `docker pull postgres:18` and copy the `sha256:` digest into `PG_IMAGE` and the service image in `backup.yml`.
- Test a restore at least once per quarter. Derived tables can be rebuilt with `npm run ingest -- derive`; source tables can be re-fetched from the API if ever lost (respecting the request budget).
- `RawPayload` grows with every distinct response (~MBs per season); prune old payloads only after confirming no replay is needed.

## Monitoring

- `/status`: last success, coverage window, last 12 runs, staleness warning after 48 h.
- `/api/health`: `200` while the last successful import is at most 48 h old, `503` when older or when the database cannot be read (JSON: `ok`, `lastSuccessAt`, `ageHours`; no internal detail).
- `monitor.yml` (daily 03:17 UTC): fails when `/api/health` is not `200`, and keeps the scheduled workflows enabled. Set the repository variable `SITE_URL` if the site moves off the Vercel domain.
- GitHub Actions failure notifications for `ingest.yml`, `monitor.yml`, `backup.yml` and `audit.yml` (sent to the account that last changed their `schedule`; enable "Actions" notifications in GitHub settings). These and `codeql.yml` are kept enabled by the `monitor.yml` keepalive.
- Every page shows a notice under the header when the data is older than 48 h (same threshold as `/status` and `/api/health`).
- Hosting provider logs for 5xx: Vercel → project → Logs (runtime logs are kept only briefly on Hobby; check the current retention on Vercel's pricing page).

### Independent uptime monitor (owner task)

`monitor.yml` runs on GitHub Actions, so it cannot report that GitHub Actions itself has stopped (scheduled runs disabled, an Actions outage, a billing or account problem). An external monitor closes that gap, and because `/api/health` turns `503` when the data is older than 48 h, the same check also catches stopped ingestion. It needs an account with an uptime service, so the owner sets it up:

1. Create a free account with an uptime service (for example UptimeRobot or Better Stack; compare their current free-plan limits and notification channels).
2. Add an HTTP(S) monitor: URL `https://anime-airtime-tracker.vercel.app/api/health`, method GET, interval 5–15 min, alert when the status is not `200` (optionally: response body contains `"ok":true`).
3. Notification: the owner's e-mail (or a push app). Do not use a public channel; do not put the address in the repository.
4. Test it once: the monitor should show the current `200`. A real alert arrives when the site is down or the data is older than 48 h.
5. Record in this file that it is configured (service name and check interval, not the account details).

Until then, failures are noticed through GitHub's Actions notifications and the stale-data notice on the site.

## Web Analytics

Vercel Web Analytics counts page views, visitors, pages and referrers. The owner enabled it in the Vercel dashboard; the code side is `<Analytics />` from `@vercel/analytics/next` at the end of `app/layout.tsx`. No API key or environment variable is involved. Visitors are told on `/privacy#analytics`.

- Sent: one page view on the first load and one per client-side navigation. The Next.js component reports route changes and switches off the script's own history tracking, so nothing is counted twice. A page view carries the URL (with its query string, e.g. `/search?q=…`), the route pattern (`/titles/[slug]`), the external referrer on the first view, and the script version. No custom events, no `identify`, no cookies.
- Paths: `/_vercel/insights/script.js` and `/_vercel/insights/view` (newer deployments may use `/<unique-path>/script.js` and `/<unique-path>/view`), on the site's own domain. Locally `next start` returns 404 for them; the page is unaffected. `next dev` loads a debug script from `va.vercel-scripts.com` that logs to the console and sends nothing.
- Not counted: automated browsers (the script skips `navigator.webdriver` and headless user agents), so E2E runs and screenshots add no page views. Visitors with ad blockers are usually not counted either.
- Environments: the dashboard shows Production by default; the environment menu (top right) switches to Preview or All. Nothing else is needed to look at production only.

Dashboard: Vercel → project → Analytics. Panels: Pages, Route, Hostname, Referrers, Country, Browsers, Devices, Operating System; timeframe and environment at the top right. Event usage: Vercel → Usage (limits under Usage and limits).

After a deploy that changes the layout, `next.config.ts` headers or the package version:

1. Open the production site in a normal browser with ad blockers off. DevTools → Network: `script.js` under `/_vercel/insights/` (or the unique path) returns 200, and one Fetch request to `…/view` is sent on load and one per page change.
2. DevTools → Console: no Content Security Policy errors and no `[Vercel Web Analytics]` warning.
3. The visit shows up in the dashboard under Production.

Troubleshooting:

- `script.js` returns 404 in production: the deployment was built before Web Analytics was enabled. Redeploy the current production deployment.
- The script loads but no `/view` request: an ad blocker or privacy extension, or an automated browser. The console shows `[Vercel Web Analytics]` messages when the script fails.
- Requests are sent but the dashboard is empty: check the environment menu and timeframe, then the monthly event limit (collection pauses at the limit).
- A CSP error that names the analytics script: the script should come from this site's domain. Find out why it does not before touching `next.config.ts`.

CSP: the production policy needs nothing for Web Analytics; `script-src 'self'` covers the script and `connect-src 'self'` the requests. Only development allows `https://va.vercel-scripts.com` in `script-src`. If Analytics is ever pointed at another host (`scriptSrc`, `endpoint`, a proxy), allow that one host only, never a wildcard, and update `/privacy`.

To stop measuring: remove `<Analytics />` and the package, update `/privacy`, then turn Web Analytics off in the dashboard.

## Security

State checked 2026-11-22 (alerts and workflows re-checked 2026-11-24: no open code scanning, Dependabot or secret scanning alerts):

- Repository settings: secret scanning with push protection, Dependabot alerts and security updates, private vulnerability reporting (`SECURITY.md`) are on. The default workflow token is read-only; PRs from any outside contributor need approval before workflows run. Only GitHub-owned actions are allowed, pinned to full commit SHAs (enforced). Merging is squash-only and merged branches are deleted.
- `main` (rulesets, 2026-11-24): deletion and force pushes are blocked for everyone; changes arrive through pull requests with the `Lint, typecheck, unit tests, build` and `DB integration + E2E` checks passing (repository admins can bypass this second ruleset in an emergency).
- The jobs that use the owner connection string (`ingest.yml`, `migrate.yml`, `backup.yml`, `db-role.yml`) run in the `production` environment, which only `main` can use; a secret stored there takes precedence over a repository secret of the same name.
- Audit: no credentials in the git history (all refs, including closed PRs), the current files or sampled Actions logs; the database host is masked in logs; `npm audit` reports 0 vulnerabilities. `.github/backup/backup-cert.pem` is a public certificate; the private key was never committed.
- Workflows: actions are pinned to commit SHAs (Dependabot's monthly `github-actions` updates bump the pins) and the PostgreSQL service images to a digest (`ci.yml`, `backup.yml`; update both together, Dependabot does not); checkouts use `persist-credentials: false` (no job pushes); top-level permissions are `contents: read`; no `pull_request_target`; PR-triggered jobs receive no secrets; dispatch inputs reach scripts only through `env`. CodeQL (`codeql.yml`, `security-extended`) runs on PRs, `main` and weekly.
- Dependencies: `audit.yml` runs `npm audit --audit-level=high` (direct and indirect, dev included, since the ingest, migration and backup jobs run dev tooling with production secrets) and `npm audit signatures` every Monday and when `package.json`/`package-lock.json` change. Packages Next.js bundles under `next/dist/compiled` are not in the lockfile; they are covered by Next.js's advisories, so keep `next` current (Dependabot).
- Headers (`next.config.ts`): CSP limited to `'self'` with `frame-ancestors 'none'`, `frame-src 'none'` and `script-src-attr 'none'` (inline event-handler attributes blocked; an E2E test visits the main pages and fails on any CSP violation), HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. `script-src` keeps `'unsafe-inline'` because the inline RSC payloads differ per request (no hashes) and nonces would give up prerendered shells. The only script not built with the site is Vercel Web Analytics, served from the site's own domain (see Web Analytics).
- Database: the web uses the `web_readonly` role; previews share it, so a preview cannot write. Fork PRs do not get Vercel environment variables (Git Fork Protection).
- Web role, least privilege (`src/server/web-role.ts`): the site reads only the tables in `WEB_TABLES` (titles, airings and their revisions, channels, slots, coverage and import runs); fetch logs, raw payloads, sync cursors and the migration history are for ingestion only. `npm run db:role -- audit [role]` checks a role against that and changes nothing: role attributes, memberships (Neon's read-only access is membership in `pg_read_all_data`, which reads every table), table, column and sequence privileges, write privileges including `TRUNCATE`, schema and database `CREATE`, `PUBLIC` grants through effective privileges, and default privileges for future tables. `apply --yes` (owner role, one transaction) revokes the broad memberships and default privileges and grants `SELECT` on `WEB_TABLES` only. CI runs the whole E2E suite with the site connected as a role limited this way, so a page that reads another table fails there first.
  - Done 2026-11-24: the audit found `web_readonly` could read `FetchLog`, `RawPayload`, `SyncCursor` and `_prisma_migrations`, and future tables through `neondb_owner`'s default privileges (no write access, no broad role memberships). `apply` was checked first on a local copy of production (390 pages served by a role limited the same way, no permission errors), then run in production; pages, logs and the audit were clean afterwards, and `WEB_DB_ROLE=web_readonly` is set.
  - Owner steps (for a new role or a new project): run **Actions → DB role → audit** (read-only) and review the problems; run **apply**; then set the repository variable `WEB_DB_ROLE=web_readonly`, which makes `migrate.yml` re-apply after every migration and `db-role.yml` audit weekly. If `apply` cannot revoke `pg_read_all_data` (the membership was granted by Neon's control plane), create a new login role from SQL as the owner, apply to it, and switch Vercel's `DATABASE_URL` to it.
  - Rollback (if a page fails with `permission denied` after apply): **Actions → DB role → rollback** restores what the role had before (`SELECT` on every table, and on future tables through the owner's default privileges; never write access), then find the page and add its table to `WEB_TABLES`. Without Actions, run the same three statements as the owner in the Neon SQL editor: `GRANT USAGE ON SCHEMA public TO web_readonly; GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_readonly; ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT ON TABLES TO web_readonly;`. Unset `WEB_DB_ROLE` first, or the next migration applies the limits again.
- External text and links: titles and comments from the source are rendered as text by React (no HTML injection); outbound links use `rel="noopener"`.

Options for later (owner decisions):

- Separate database roles for ingestion (insert/update on source and derived tables, no DDL) and migrations (owner), each in its own secret, so a compromised ingest job cannot alter the schema or drop tables.
- Previews: give the Preview environment its own Neon branch (and role) instead of the production read-only role, so previews never read production directly.
- Vercel: keep usage e-mails on (Hobby cannot be charged and pauses at its limits, so no spend cap is needed); if abusive traffic appears, add a Firewall rate-limit rule for `/search` and `/stats` (see Capacity and limits).

## Usage and limits

Both providers are on free plans (see Deployment for the figures known at setup); confirm current limits on their pricing pages before relying on a number.

| Where | What to watch | Where to see it | Notification |
| --- | --- | --- | --- |
| Neon Free | storage (≈ 370 MB of 1 GB on 2026-11-21, ≈ 5 MB per season), compute hours (100 CU-hours/month), network transfer (egress, 5 GB per billing period; 2.10 GB used 2026-11-19 → 11-24) | Neon console → project → Usage; `neon projects get <id>` shows `data_transfer_bytes` | e-mail near limits; at a limit the compute suspends until the next period and pages show "読み込めませんでした" |
| Vercel Hobby | function invocations and duration, bandwidth (`/slots` is the largest page, ≈ 330 KB compressed), build minutes | Vercel → Usage | e-mail near limits; Hobby pauses the project when exceeded |
| Vercel Web Analytics (Hobby) | events: 50,000 per month, 1-month reporting window (checked 2026-11-22) | Vercel → Usage | collection pauses at the limit until the next cycle; Hobby is never charged |
| GitHub Actions | free for public repositories; artifact storage (one ≈ 52 MB backup per month, kept 90 days) | repository → Actions | failed runs notify the account that last changed the schedule |

Free-plan limits that apply (checked 2026-11-24 on the providers' pages):

| Limit | Allowance | Use and estimate | What happens at the limit |
| --- | --- | --- | --- |
| Neon network transfer (egress) | 5 GB per billing period | ≈ 1.1–1.3 GB/month after 2026-11-24 (was ≈ 6.7–7.3 GB/month) — see the budget below | compute suspended until the next period: site down |
| Neon compute | 100 CU-hours per month (scale to zero after 5 min, fixed) | ≈ 1 CU-hour/day observed (2026-11-19 → 24, including the backfill) ≈ 30/month | compute suspended until the next period |
| Neon storage | 1 GB (logical size) | 390 MB on 2026-11-24; growth ≈ 0.1 GB/year (airings, their `CREATED` revisions, raw payloads) | inserts and updates fail; reads keep working |
| Vercel Active CPU | 4 hours per month | not readable from the CLI; check Vercel → Usage | Hobby project paused for 30 days, no automatic resume |
| Vercel Fast Origin Transfer | 10 GB per month | dynamic page parts streamed from the function; `/slots` is the largest (≈ 330 KB compressed) | same |
| Vercel function invocations / edge requests | 1M / 1M per month | far below at current traffic | same |
| Vercel Runtime Cache (`use cache: remote`) | 1M reads / 200K writes per month, items ≤ 2 MB | not used | cache paused, not the site |

Network transfer budget per month:

| Source | Before 2026-11-24 | After (measured on a copy of production) |
| --- | --- | --- |
| `derive` after each scheduled import (5 a day) | 41.7 MB × 150 ≈ 6.3 GB | 4.2 MB when inputs changed, ≈ 0 when not: ≤ 0.63 GB |
| Imports (rows of the fetched windows, titles) | ≈ 0.1 GB | ≈ 0.1 GB |
| Monthly backup (`pg_dump` of ≈ 0.28 GB of row text) | ≈ 0.3 GB | ≈ 0.3 GB |
| Web: database reads on cache misses | 18.3 MB per cold read of the 20 main pages | 3.8 MB; ≈ 0.1–0.3 GB at current traffic |

Thresholds and next steps if traffic or data grow: the web is the part that scales with visitors. About 240 KB of database reads per uncached page view were observed before the change (≈ 50 KB after, on average); with ≈ 3.5 GB of the allowance left for the web, that is roughly 70,000 uncached page views a month. If the Neon usage (`neon projects get` → `data_transfer_bytes`, or Neon → Usage) passes 3 GB in a period: (1) raise the `dataset` revalidate from 15 to 30–60 minutes (fewer refills and fewer compute wake-ups; data changes only at the 5 daily imports); (2) put small, hot entries (tracked channels, dataset status) in `use cache: remote`; (3) aggregate the per-season stats in SQL too (`/stats` still reads 0.7–1.5 MB per refill). Run manual backups or copies early in a billing period, not near its end.

Any plan change, billing setting or production setting is the owner's decision. Commercial use (ads, affiliate links) is not allowed on Vercel Hobby.

## Contact channels

Current channels, all on GitHub: public Issues (corrections, questions; the templates warn against posting personal data) and the private report form (`/security/advisories/new`: security issues, rights claims, anything not for public view). Both need a GitHub account.

A channel without a GitHub account is an **owner decision** and is not set up. Options, if wanted:

| Option | Cost | Notes |
| --- | --- | --- |
| A dedicated mail address (forwarding alias) | free with many providers | simplest; publish it on `/about#contact` and `/terms`; expect spam; never use the owner's personal address |
| A hosted form (e.g. Google Forms) | free | no address to publish; the form provider stores the submissions, so `/privacy` must name it |
| A form on this site | — | needs a backend that stores input and an admin view, which the architecture rules out (CLI-only operations) |

When one is chosen, update `/about#contact`, `/terms#requests`, `/privacy#contact`, `SECURITY.md` and the issue template links together.

## Incident response

The site is read-only and serves the last good data, so most incidents are about freshness, not data loss. Production changes (settings, secrets, plans, destructive database operations) need the owner.

| Symptom | Check | Action |
| --- | --- | --- |
| Whole site down (5xx, timeouts) | Vercel dashboard → Deployments / status page; `curl -I` the site | Redeploy the last good deployment (Vercel → Deployments → Promote). If Vercel itself is down, wait. |
| Pages say "読み込めませんでした", `/api/health` → `503` with `database unavailable` | Neon console: compute state, Free-plan usage (CU-hours, storage), status page | Quota exhausted: wait for the monthly reset or ask the owner about a paid plan. Endpoint suspended/outage: wait; the data cache keeps recently viewed pages for up to a day. |
| Stale-data notice on every page, `/api/health` → `503` with an old `lastSuccessAt` | Actions → Ingest: last runs; `/status` | A failed run: open its log (the DB host is masked). Source API change or rate limiting: see docs/data-pipeline.md, pause with `INGEST_ENABLED`. Scheduled workflows disabled: run `monitor.yml` manually (it re-enables them). Once fixed, run Ingest → `update` manually. |
| Ingest fails with pending migrations | Actions → Migrate | Run Migrate manually (owner approval for production schema changes). |
| Wrong or missing airings reported | The source page (しょぼいカレンダー) | Source error: the source is edited there; site error: `data/overrides.json` with evidence, then `derive`. |
| Data loss in the database | Neon restore window (6 h on Free), `backup.yml` artifacts (monthly) | Restore into a new database (Backup and restore), verify counts, then switch `DATABASE_URL`. |

After an incident, note what happened and the fix in the PR or Issue that resolves it.

## Capacity and limits

Measured 2026-11-22 against a full local copy (production build, PostgreSQL 18 on the same machine, 326,151 airings): uncached renders of the heaviest pages (`/`, `/stats` for all channels, `/slots`, `/sitemap.xml`) took ≤ 0.5 s, others ≤ 0.15 s; cached repeats 0.01–0.04 s, except `/slots` (0.16 s, a 4.7 MB page). Production runs further from the database (Vercel `sin1` ↔ Neon Singapore, Free compute), so expect a few times more on a cold cache.

Safeguards in code (docs/architecture.md → Rendering and caching): input bounds (search text 80 characters with whitespace collapsed, so equivalent queries share one cache entry; search pages ≤ 100, i.e. 3,000 results, later pages answer with a notice and no query; validated slugs), 15 s statement timeout on web queries, a 15-minute data cache per instance, `/slots` rendered once per filter, real 404s for impossible URLs before any rendering.

Not measured: concurrent load against production (it would use up the shared Free-plan resources; do not run load tests against production). If abusive traffic appears, the owner can add a rate-limiting rule in Vercel's Firewall for `/search` and `/stats`.

## Launch checklist

Status 2026-11-21.

- [x] Hosting/DB chosen (option A, free plans)
- [x] `DATABASE_URL` (read-only role, pooled) and `APP_ENV` set on Vercel; `SITE_URL` unset (defaults to the Vercel production domain)
- [x] `SYOBOI_USER_AGENT` points to `/about#contact`
- [x] Migrations applied; initial season + backfill ingested; `/status` shows success
- [x] Security headers verified; `npm audit` clean; Dependabot version updates configured
- [x] Dependabot alerts and security updates, secret scanning, push protection and private vulnerability reporting enabled (confirmed 2026-11-22)
- [x] Restore test done (2026-11-21, copy into a separate database; see Backup and restore)
- [x] Monthly encrypted backup with restore check (`backup.yml`; first successful run 2026-11-21: 9 tables matched after restore, artifact decrypted with the owner's key)
- [x] TLS, `robots.txt`/`sitemap.xml` reachable on the Vercel domain
- [ ] Open Graph preview checked; Search Console verified (optional)
- [ ] Vercel Web Analytics (`<Analytics />`, added 2026-11-22): the owner confirms that page views appear in Vercel → Analytics (Production)
- [x] Privacy policy (`/privacy`) and terms (`/terms`) published 2026-11-22, describing the site as built: no accounts, forms, cookies or ads; Vercel Web Analytics page views (added 2026-11-22); two localStorage keys; Vercel request logs. Update `/privacy` **before** adding anything that collects or sends visitor data (analytics, forms, embeds), and bump `POLICIES_UPDATED` in `src/lib/site.ts`. The wording was written from the code; the owner reviews legal wording.

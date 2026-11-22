# Architecture

```
Syoboi Calendar db.php (XML)
   │  serial queue · ≥3 s after each response + jitter · 429/Retry-After · backoff · identifying UA
   ▼
src/ingest   plan windows → fetch → parse/validate (Result/Code, zod) → normalize → upsert (tx) → derive
   │  RawPayload (gzip+sha256) · FetchLog · ImportRun · CoverageWindow · BroadcastRevision
   ▼
PostgreSQL (Prisma 7 + @prisma/adapter-pg)
   ▲  src/server/queries/*  — "use cache" + cacheLife("dataset") + cacheTag("dataset")
   │
Next.js 16 App Router — Server Components; client components only for interaction
```

## Layers

| Layer | Path | May depend on | Notes |
| --- | --- | --- | --- |
| Domain | `src/domain` | nothing | Pure functions; all time/statistics/slot semantics and their tests |
| Ingest | `src/ingest`, `scripts/ingest.ts` | domain, Prisma | The only code that talks to the source |
| Server queries | `src/server` | domain, Prisma | The only code pages use to read the DB |
| UI | `app`, `src/components`, `src/styles`, `src/lib` | domain (types/formatting), server queries | No Prisma imports in components |

## Rendering and caching

- `cacheComponents` + `partialPrefetching` are enabled. Each page renders a static shell (header, titles, skeletons) and streams data components inside `<Suspense>`.
- Data components are request-time: they await `params`/`searchParams` or call `io()` before reading the clock. Consequently **`next build` never touches the database** (CI builds without `DATABASE_URL`).
- Query functions are `"use cache"` with the `dataset` profile (stale 5 min, revalidate 15 min, expire 1 day) and tag `dataset`. Ingestion runs a few times a day, so 15-minute freshness is sufficient. On serverless hosts the in-memory cache is per instance; the DB queries are small enough that a miss is cheap.
- **Status codes.** A streamed page has sent `200` with its shell before data is read, so a page cannot turn into a `404`/`5xx` afterwards. Hence:
  - `proxy.ts` answers URLs that cannot exist with a real `404` before rendering, from the URL alone (`src/lib/route-guards.ts`): malformed title IDs, unknown channels, seasons outside 2000 winter … next season. It never reads the database (proxies must not rely on shared state).
  - A well-formed ID that is not in the database streams the not-found UI with `noindex` (soft 404).
  - A database failure is never shown as "not found" or as empty data: data components show a "読み込めませんでした" notice or throw to `app/error.tsx` (which adds `noindex`), and `generateMetadata` falls back to a neutral, `noindex` title. Route handlers that are not streamed answer `503`: `/api/health`, and `/sitemap.xml` (with `Retry-After`, so crawlers keep the last good sitemap instead of a shortened one).
- **Stale data.** When the last successful import is older than 48 h (`src/domain/freshness.ts`), every page shows a notice under the header with the time of the last update; pages keep serving the last good data. `/status` and `/api/health` use the same threshold.
- **Limits.** Search text ≤ 80 characters (LIKE wildcards in it are matched literally), page ≤ 10,000, slugs validated; the web's database client cancels any statement after 15 s (`src/server/db.ts`; ingestion and migrations have no limit). `/slots` caches its rendered list per filter, since rendering 866 slots cost more than the cached reads.

## Key decisions

| Decision | Why | Alternatives considered |
| --- | --- | --- |
| Keep Next.js + PostgreSQL + Prisma, upgrade to current majors | Matches existing work; maintained; team familiarity | Static export (search/filters would need client-side data), Drizzle (unnecessary churn) |
| CSS Modules + design tokens, no UI framework | Dense custom layouts (grid, timeline); zero runtime; fewer dependencies | Tailwind/shadcn (fine, but adds a second styling vocabulary for little gain here) |
| Server-rendered CSS/SVG charts | Heatmaps and bars are simple; SSR-friendly; accessible table twins | Recharts/D3 (bundle size, client-only rendering) |
| No admin web UI in v1 | Avoids an authenticated surface; corrections are reviewed files; ops via CLI | Auth-protected admin (more attack surface and work than value right now) |
| Raw responses stored in PostgreSQL (gzip) | Single store, replayable, small (MBs) | Object storage (another service to operate) |
| Slots derived, not hand-entered | Every slot is traceable to source text or a published rule | Hand-curated slot master (unverifiable at scale) |
| Embedded PostgreSQL for local dev | Works without Docker (the original dev machine has none) | Docker Compose (supported implicitly: any PostgreSQL ≥ 16 works) |

## Security

- Read-only public site; no write endpoints, no forms that mutate state, no user data.
- Security headers in `next.config.ts` (CSP without nonces, `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy); `X-Powered-By` disabled.
- All URL parameters are whitelisted/validated (`src/lib/search-params.ts`) before reaching queries; SQL uses Prisma parameter binding (`Prisma.sql`).
- `/admin` does not exist (404). Secrets only via environment variables; `.env*` ignored.
- Dependency updates via Dependabot; `npm audit --omit=dev` reported 0 vulnerabilities at release.

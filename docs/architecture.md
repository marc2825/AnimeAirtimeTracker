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
- Query functions are `"use cache"` with the `dataset` profile (stale 5 min, revalidate 15 min, expire 1 day) and tag `dataset`. Ingestion runs a few times a day, so 15-minute freshness is sufficient. On serverless hosts the in-memory cache is per instance, so every miss is a fresh read from Neon, which bills the data it sends: queries over many airings let the database aggregate (the season trend reads title × season × start-minute counts, the slot list one row per slot with its seasons as arrays), and DB tests check that each aggregate equals what the code computed from full rows. Measured on a copy of production (2026-11-24), a cold read of the 20 main pages sends 3.8 MB from the database (18.3 MB before). `robots.txt` keeps crawlers off query-string variants (`Disallow: /*?`), which are endless and each a fresh read; the sitemaps list only clean paths.
- **Search engines** (`src/lib/seo.ts`). Every indexable page has its own title, description and canonical URL. Titles and descriptions use the words people search with (a title page is 「作品名の放送日時・放送局」, its description states the first airing, the number of channels and the regular slot from stored airings; a season page is 「2026年秋アニメ一覧（新作・曜日別）」), and leave out what is not stored. JSON-LD:
  - `WebSite` with the English alternate name and a `SearchAction` for `/search?q=` on the home page;
  - `BreadcrumbList` mirroring the visible breadcrumbs on title, slot, channel, season and analysis pages;
  - on title pages, the work from stored source facts only (`TVSeries` / `Movie` / `CreativeWork` from the source category; names; the source's first and last broadcast year and month for TV series; the official site and the source page as `sameAs`);
  - an `ItemList` of member titles on slot pages;
  - `Dataset` on analysis pages (no license claimed).

  Pages that read data stream metadata into `<body>` for visitors; Googlebot joins Next.js's list of crawlers that get it in `<head>` (`htmlLimitedBots` in `next.config.ts`), so `rel=canonical` is where search engines read it. The home page `<h1>` holds the site name and 「TVアニメの放送枠一覧と年表・編成統計」, and its description is always shown, not folded away.
- **Sitemaps** (`src/lib/sitemap.ts`, `src/server/sitemaps.ts`). `/sitemap.xml` is an index of four child sitemaps:
  - `/sitemaps/static.xml`: the fixed pages and analyses;
  - `/sitemaps/seasons.xml`: seasons up to the next one, and the tracked channels;
  - `/sitemaps/slots.xml`;
  - `/sitemaps/titles.xml`.

  Rules:
  - `/terms`, `/privacy`, `/status` and `/search` are left out. They outranked the home page for the site's own name; the pages stay, without noindex.
  - A title is listed when it has at least 4 live airings, belongs to a slot, or has an airing in the last 60 days or later. That is 5,668 of 6,486 titles on a 2026-11-21 copy; the rest are mostly single TV showings of films and OVAs, still linked and indexable.
  - `lastmod` is the last BroadcastRevision of the airings behind the page: per channel, per season, per slot (members' airings on the member's channel) and per title (or the title row's own update). `Broadcast.updatedAt` is not used, since every re-fetch touches it. Data pages among the fixed ones use the last change to any airing; `/about` has none.
  - A date later than the request is dropped: a slot's latest airing day used to put upcoming dates in the sitemap.
- **Status codes.** A streamed page has sent `200` with its shell before data is read, so a page cannot turn into a `404`/`5xx` afterwards. Hence:
  - `proxy.ts` answers URLs that cannot exist with a real `404` before rendering, from the URL alone (`src/lib/route-guards.ts`): malformed title IDs, unknown channels, seasons outside 2000 winter … next season. It never reads the database (proxies must not rely on shared state).
  - A well-formed ID that is not in the database streams the not-found UI with `noindex` (soft 404).
  - A database failure is never shown as "not found" or as empty data: data components show a "読み込めませんでした" notice or throw to `app/error.tsx` (which adds `noindex`), and `generateMetadata` falls back to a neutral, `noindex` title. Route handlers that are not streamed answer `503`: `/api/health`, and the child sitemaps `/sitemaps/*.xml` (with `Retry-After`, so crawlers keep the last good sitemap instead of a shortened one). The index `/sitemap.xml` reads no data.
- **Stale data.** When the last successful import is older than 48 h (`src/domain/freshness.ts`), every page shows a notice under the header with the time of the last update; pages keep serving the last good data. `/status` and `/api/health` use the same threshold.
- **Limits.** Search text ≤ 80 characters (LIKE wildcards in it are matched literally, whitespace runs collapsed), search pages ≤ 100 (`MAX_SEARCH_PAGE`; later pages answer with a notice without querying), slugs validated; the web's database client cancels any statement after 15 s (`src/server/db.ts`; ingestion and migrations have no limit). `/slots` caches its rendered list per filter, since rendering 866 slots cost more than the cached reads.

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

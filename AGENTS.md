# AnimeAirtimeTracker — coding agent instructions

Read `docs/strategy-2026.md`, `docs/data-and-ingestion-2026.md`, and `docs/release-plan-2026.md` before implementing a feature. These supersede the original March 2026 mock-first MVP goals in `docs/requirements.md`, which remain as historical reference.

## Product contract

Japanese late-night anime broadcast schedule + historical programming-slot observatory. Current-season weekly schedule is the entry point; curated slot timelines, research-grade transparency and accurate counts are the differentiators. Do not turn this into a general anime/streaming database.

## Reality check (as of Nov 2026)

The public pages currently render synthetic `src/data/catalog.ts`. The collector only supports a mock fixture; Prisma is not wired into the public pages. `/admin` is an unauthenticated static demo; its buttons do not save. Never claim these are live production features.

## Implementation priorities

1. Secure dependencies, prevent production use of destructive seed and disable/protect /admin.
2. Implement a conservative, verified, non-HTML data adapter with fixtures, durable raw responses, provenance, strict request throttling and failure handling.
3. Make imports DB-transactional, idempotent and resumable; implement an honest DB-backed public query.
4. Complete /schedule, title/slot histories and a meaningful stats page; document coverage and uncertainty.
5. Add operations, accessibility, release checks and gradual historical coverage.

Small reviewed vertical PRs are preferred to giant rewrites. Do not change the entire tech stack without measured justification.

## Data invariants

- Keep scheduled instant and anime-style date/time separately; JST must be explicit.
- Do not identify a series with a seasonal installment or with a broadcast event.
- Region and terrestrial/BS/CS medium are different axes.
- A recurring slot has time-bounded periods and evidence for membership.
- Unknown is not false; missing rebroadcast flag is not proof of first airing.
- Every displayed metric needs unit, covered stations/dates, filters, source/update date and completeness caveats.
- Retain provider-qualified external IDs, source evidence and correction history.
- Never delete missing entities from a partial or failed response.
- Existing `prisma/seed.ts` deletes tables: prohibit use on production data and remove/guard before any deployment.

## Third-party sources

- Favor official, permitted structured interfaces; **no Syoboi HTML scraping**.
- Review https://docs.cal.syoboi.jp/rule/bot/ and https://docs.cal.syoboi.jp/spec/rate_limit/ immediately before implementing a connector.
- Use one centrally throttled source worker, identifying User-Agent, caching, retries and explicitly bounded historical windows; never poll from web page requests.
- No unverified images, source reuse rights or invented metadata.

## Security

- Never expose `/admin` without server-side authorization. For beta, disable it entirely if no auth is ready.
- Keep DB credentials and ingestion secrets server-side. Never enable public write endpoints without authentication/authorization, input validation and rate limiting.
- Review dependency advisories. Avoid assuming `next@15.5.13` is suitable for deployment.
- Do not commit real `.env`, raw fetched archives with sensitive content, or generated build state.

## Workflow

1. Summarize user value, scope, source/coverage impacts and affected files.
2. Write regression fixtures/tests for changed time and ingestion semantics.
3. Implement smallest end-to-end slice. Prefer server-side data access and explicit types.
4. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
5. Describe what actually ran, test evidence, uncovered risks, data migration/rollback and next step.
6. Update relevant documentation and examples. Keep current release roadmap honest.

Do not fabricate passing checks; if dependencies/network/DB are unavailable, say so plainly.

## Definition of done

- Functional real-data path for the slice, tested on fixture + bounded verified source response.
- Correct metric semantics, error/empty states, source attribution and update timestamps.
- Responsive, keyboard-usable Japanese UI; no fake data on production pages.
- Tests and security boundary appropriate to the change; docs and rollback notes updated.

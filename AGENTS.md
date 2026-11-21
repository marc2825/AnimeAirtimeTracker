# AGENTS.md

Entry point for coding agents (Claude Code, Codex, others). Keep this file short; details live in `docs/` and are linked, not repeated.

## What this is

アニメ放送枠観測所 (Anime Airtime Tracker): a Japanese website for exploring TV anime programming — weekly schedule, the history of programming slots, and programming statistics — built on data ingested from Syoboi Calendar's official non-HTML API. Product scope: [docs/product.md](docs/product.md).

## Commands

```bash
npm ci                    # install (Node 24, see .nvmrc)
npm run db:local          # embedded PostgreSQL 18 on :54320 (keep running in another terminal)
npm run db:deploy         # apply migrations   | npm run db:migrate  # create a migration (dev only)
npm run db:fixtures       # load recorded fixtures into a LOCAL db (no network)
npm run dev               # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build   # required before every commit
npm run test:db           # DB integration tests (TEST_DATABASE_URL, name must contain "test")
npm run test:e2e          # Playwright against `next start` (run `npm run build` first)
npm run screenshots       # visual check: pages × desktop/tablet/mobile × light/dark
npm run ingest -- <cmd>   # live ingestion — contacts a third party, read docs/data-pipeline.md first
```

## Map

| Path | Responsibility |
| --- | --- |
| `src/domain/` | Pure rules: anime time, seasons, flags, coverage, statistics, slot derivation. No I/O. |
| `src/ingest/` | Syoboi client, XML parsing, normalization, DB import, derived data. |
| `src/server/` | Prisma client and cached read queries. The only place pages read the DB from. |
| `app/`, `src/components/`, `src/styles/` | Next.js App Router pages, UI components (CSS Modules), design tokens. |
| `prisma/` | Schema and migrations. `data/` reviewed overrides and slot registry. `scripts/` CLIs. |
| `docs/` | Specs and decisions — index in [docs/README.md](docs/README.md). `docs/archive/` is history only. |

## Non-negotiable rules

1. **No fabricated data.** Never show synthetic broadcasts, titles, job statuses or metadata on public pages. Unknown stays unknown (`null`, "不明"). Fixtures are recorded real responses and are for tests/local only.
2. **Third-party access only through `src/ingest`.** No HTML scraping, no requests from page renders, identifying User-Agent, serial requests with ≥1 s (default 3 s) after each response. Rules and rationale: [docs/data-pipeline.md](docs/data-pipeline.md).
3. **Non-destructive data.** No `deleteMany`/`TRUNCATE` on source tables outside tests, no `prisma migrate reset`/`db push --force-reset` without explicit human approval. Never edit applied migrations. See [docs/data-model.md](docs/data-model.md).
4. **Every figure states its unit and scope** (period, channels, rerun handling). Titles ≠ broadcasts. See [docs/data-model.md#counting](docs/data-model.md#counting).
5. **Secrets stay out of git and out of the client.** `.env*` (except `.env.example`) is ignored; never print or commit credentials.
6. **No admin web UI without authentication.** Operations are CLI-only by design ([docs/architecture.md](docs/architecture.md)).
7. **Builds must not need a database.** DB reads happen at request time inside `<Suspense>` (`"use cache"` + `cacheLife("dataset")`).
8. **UI changes follow [docs/design-system.md](docs/design-system.md)** and are verified visually (desktop + mobile, light + dark) before they count as done.

## Workflow

- Investigate first; for multi-file or architectural changes write a short plan before editing.
- Add/adjust tests with every behavior change (unit for domain/ingest, DB tests for persistence, E2E for user flows). Never delete a correct test to get green.
- Commits: small, imperative subject (`feat(ui): …`, `fix(ingest): …`), body explains why. PR template: what changed, data/coverage impact, migrations, screenshots for UI, commands actually run.
- Report honestly: what ran, what failed, what was not verified.
- Roles: `CHANGELOG.md` = past changes, `docs/roadmap.md` = plans, Issues = concrete work, PRs = implementation and review. Do not use one as another.
- User-facing feature, behavior change or bug fix → add a short Japanese line under `未リリース` in `CHANGELOG.md`, written for users (not a commit log). Internal refactors and doc-only edits need no entry. Never present unreleased changes as released; versions/dates are added only at a real release.
- Work on a roadmap item → update its status in `docs/roadmap.md` (done → 実装済み; dropped → 保留・見送り with the reason). Never leave implemented features listed as planned.
- Keep README and `docs/` consistent with behavior; prefer editing an existing doc over adding a new one.

## Definition of done

Lint, typecheck, unit tests and build pass; DB/E2E tests pass when persistence or flows changed; docs updated where behavior or rules changed; UI checked in both themes and on mobile; no new fabricated or placeholder content on public pages.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

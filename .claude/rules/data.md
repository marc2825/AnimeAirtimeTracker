---
paths:
  - "src/ingest/**"
  - "src/domain/**"
  - "src/server/**"
  - "prisma/**"
  - "scripts/ingest.ts"
  - "data/**"
---

# Data, ingestion and schema changes

Authoritative specs: `docs/data-pipeline.md` (source rules, request budget, overrides) and `docs/data-model.md` (entities, invariants, counting units, migrations).

- Live requests to Syoboi only via `npm run ingest`; never from tests or page code. Tests use `src/ingest/syoboi/__fixtures__`.
- Schema change → `npm run db:migrate -- --name <change>` then `npm run db:generate`; never edit an applied migration; never run `prisma migrate reset` without the user's explicit consent.
- Time logic changes need tests around 24:00/05:00, year and season boundaries.
- Persistence changes need a DB test in `src/ingest/importer.db.test.ts` (idempotency, no destructive deletes, override precedence).

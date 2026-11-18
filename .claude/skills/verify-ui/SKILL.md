---
name: verify-ui
description: Visually verify UI changes in this project — start the app, capture pages at desktop/tablet/mobile in light and dark themes with Playwright, and review the screenshots. Use after any change under app/, src/components/ or src/styles/.
---

# Visual verification

1. Ensure a database with data is reachable (`npm run db:local` + `npm run db:fixtures`, or the dev DB with ingested data).
2. Start the app: `npm run dev -- --port 3100` (background) and wait for "Ready".
3. Capture: `BASE_URL=http://localhost:3100 npm run screenshots -- <routes...>`
   - Defaults to the main routes; add flags `--viewport=desktop|tablet|mobile`, `--theme=light|dark`, `--viewport-only`.
   - Output: `.artifacts/screenshots/<route>--<viewport>--<theme>.png` (gitignored). Page errors fail the run.
4. Read the images and check against `docs/design-system.md#review-checklist`: hierarchy, overflow/clipping, long Japanese titles, contrast in both themes, mobile layout (no horizontal page scroll), empty/error states.
5. Fix and re-capture until clean; mention which routes/viewports were checked in the report.

# Design system

## Concept: 深夜の編成表 (the late-night programming grid)

Modern Japanese anime × editorial data visualization × premium web app. The motifs are the ones the subject already owns — the programming grid, the clock past midnight (25:30), the 24:00 date-change line, the "on air" signal, the season timeline — rendered quietly so dense data stays readable. No decorative gradients, no generic card soup: cards appear only where an item is a unit of navigation.

## Tokens (`src/styles/tokens.css`)

| Group | Light | Dark | Notes |
| --- | --- | --- | --- |
| Background / surfaces | paper `#f5f4f0`, `#fcfbf8`, `#fff`, `#efede7` | night navy `#0a0f1d`, `#0f1628`, `#141c32`, `#1b2540` | elevation in dark mode comes from surface tone, not shadow |
| Ink | `#141a2e` / `#474e65` / `#5e6479` | `#e9edf7` / `#b2bad0` / `#8a93ad` | all ≥ 4.5:1 on every surface of their theme (computed) |
| Accent (signal cyan) | `#08717f` | `#45d3e4` | links, active nav, focus ring, "24:00" |
| Broadcast status | 新 `#b83a2a` (solid), 終 `#5b45c4` (outline), 再 `#5f6478` (dashed), 注 `#8a5a00` | lighter steps | shape + text always accompany color |
| Slot kinds | 公式 solid · 出典記載 outline · 推定 dashed | | |
| Calendar | 土 `#1f5fb0`, 日 `#c0392b` | `#7fb2ff`, `#ff8f84` | Japanese calendar convention; weekdays stay ink. (A 7-hue weekday palette failed the CVD/normal-vision validator, so it was dropped.) |
| Data viz | sequential blue ramp `--viz-1…7`, zero `--viz-zero`, bars `--viz-bar` / `--viz-bar-muted` | dark-mode steps run dim → bright | single hue; validated reference ramp |
| Type | Noto Sans JP (400/500/700) + Geist for Latin; Geist Mono for times/numbers | | scale 11–38 px; body line-height 1.75 for Japanese; `word-break: auto-phrase` |
| Space | 4 px base (`--space-1` … `--space-16`), gutter 16/24 px | | |
| Radius | 3 / 6 / 10 / 14 / pill | | |
| Motion | 120 / 200 / 320 ms, `--ease-out` | | all durations 0 under `prefers-reduced-motion` |
| Breakpoints | sm 640 · md 768 · lg 1024 · xl 1280 | | mobile nav switches at md |
| States | hover wash, pressed wash, selected = accent-soft, focus ring 2 px accent + 2 px offset, disabled 45% | | |

Theme: the pre-hydration script in `app/layout.tsx` resolves `data-theme` (stored choice → OS preference) before paint and follows OS changes until the user chooses.

## Components

| Component | File | Notes |
| --- | --- | --- |
| Header / desktop nav / mobile tab bar / theme toggle | `src/components/layout/*` | bottom tab bar < 768 px; `aria-current` on active item |
| PageHeader, Section, Card, Badge/FlagBadges/SlotKindBadge, EmptyState, Notice, Skeleton, StatTile, KeyValue, ExternalLink | `src/components/ui/primitives.tsx` | |
| SegmentedLinks, SelectField, FilterChips, Pagination, Disclosure, ButtonLink | `src/components/ui/controls.tsx` | link-based controls keep state in the URL |
| FilterForm | `src/components/ui/FilterForm.tsx` | GET form; works without JS; with JS: client navigation, empty params dropped, auto-submit, pending text |
| ScheduleGrid / NowLine / ScheduleDayList / WeekNav / DayTabs / Legend | `src/components/schedule/*` | layout math in `layout.ts` (tested) |
| SlotTimeline / SlotCard / SeasonStrip | `src/components/slots/*` | timeline scrolls to the latest season |
| ChartFrame, WeekdayHourHeatmap, ConcurrencyStrip, BarList, ColumnChart, HeatmapTable | `src/components/stats/Charts.tsx` | every chart: computed takeaway, scope line, table view |

## Page patterns

- **Header → controls → content → footnote.** Kicker (mono caps) + H1 + one-sentence lead; never marketing copy.
- **Data sections** stream under `<Suspense>` with skeletons sized like the content; errors render a `Notice`, empty results an `EmptyState` with a next step.
- **Schedule grid**: channel columns × time; empty hours collapse to a hatched "放送なし" band; 24:00 is highlighted as "日付変更"; overlapping items share lanes; phones get the day list.
- **Slot chronicle**: season columns on a rail; filled node = titles present, hollow = none, coral = time moved; title cards show continuation from the previous season.
- **Charts vs tables**: charts for patterns, tables for exact comparison (always available).

## Accessibility

Skip link; landmarks; one H1 per page; focus-visible ring; tab order follows reading order; segmented controls are links with `aria-current`; charts have `role="img"` summaries plus table twins; flags and kinds have text/shape; contrast ≥ 4.5:1 for text; reduced motion respected; tested keyboard flow in E2E.

## Review checklist

Use with the `verify-ui` skill / `npm run screenshots`:

1. Hierarchy is obvious at a glance (title → key number/time → details).
2. No clipped text, no horizontal page scroll at 390 px; long titles wrap or clamp cleanly.
3. Both themes: contrast, borders visible, no pure-black/white glare.
4. Empty, loading and error states exist and say what to do next.
5. Every number shows its unit; every chart shows its scope and has a table.
6. Nothing looks clickable that is not.

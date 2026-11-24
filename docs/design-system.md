# Design system

## Concept: a pop programme guide (アニメ誌の番組欄)

White ground, black type, one highlighter. The site borrows from the programme pages of anime magazines and from plain utility sites: a black masthead, heavy gothic headings with a marker stroke, thick black rules, square corners, and titles that read as blue links. It should look made by hand for this subject, loud in a few places and quiet everywhere else.

Where the loudness goes (and nowhere else):

- **Marker**: a warm yellow stroke under page and section headings (`.marker`), under the active nav item, and as the hover wash. Never a filled yellow band or page-wide area: large fluorescent yellow glared and was rejected.
- **Black**: the masthead, the 4 px section rule, 2 px frames on controls and list edges, the primary button (with a hard yellow offset, pressing in on hover).
- **Blue**: every link to a title, slot or channel, and the data colour in strips and charts.

What this system deliberately avoids:

- Cream or tinted paper backgrounds, serif (mincho) headings, hairline-only "editorial" layouts. All were tried and read as generated design.
- A caps/mono eyebrow label above headings; taglines and explanatory paragraphs above the content. A page states what it is in one line; anything longer sits behind a collapsed 「詳しく」 (`MoreInfo`). Scope and unit lines are not explanation: they stay visible.
- Rounded cards, soft shadows, gradients (the marker is a hard-stop stroke), tinted boxes around everything, grids of identical cards.
- Mono type as decoration. Mono is for times and numbers only.
- Motion without a job. The authored motion is the count-up of key figures and the button press.

## Tokens (`src/styles/tokens.css`)

| Group | Light | Dark | Notes |
| --- | --- | --- | --- |
| Background / surfaces | white `#ffffff`; greys `#f1f1f2`, `#f6f6f7` | neutral near-black `#111114`, `#18181d`, `#1f1f26`, `#2a2a33` | greys are untinted; no brown or navy cast in dark mode |
| Ink | `#17171c` / `#3f3f47` / `#66666f` | `#f2f2f5` / `#c4c4cc` / `#9797a1` | all ≥ 4.5:1 on their grounds (computed) |
| Lines | hairline `#dedee2`; `--color-line-strong` is ink | hairline 14% white; strong is ink | hairlines separate rows, ink frames things |
| Accent (link blue) | `#1f4fe0` | `#8eb0ff` | links to titles/slots/channels (`main a[href^="/titles/"]` etc. in `base.css`), focus ring, data marks |
| Marker | `#ffd95a` as a wide band (`--marker-from: 62%`), soft wash `#fff4cf` | the same `#ffd95a` as a thin underline (`--marker-from: 88%`); washes are neutral white at 8% | heading stroke, hover wash, active nav. A wide yellow or mustard band under light text looked muddy, so dark mode keeps yellow to thin strokes and the button |
| Masthead | `#17171c` with white text | `#060608` with a hairline below | black in both themes; `themeColor` in `app/layout.tsx` matches |
| Broadcast status | 新 `#d9264a` (solid), 終 `#5b45c4` (outline), 再 `#66666f` (dashed), 注 `#7a5200` | lighter steps | shape + text always accompany color |
| Slot kinds | 公式 solid · 出典記載 outline · 推定 dashed | | |
| Calendar | 土 `#1f5fb0`, 日 `#d03027` | `#7fb2ff`, `#ff8f84` | Japanese calendar convention; weekdays stay ink |
| Data viz | sequential blue ramp `--viz-1…7`, zero `--viz-zero`, bars `--viz-bar` / `--viz-bar-muted` | dark-mode steps run dim → bright | single hue; the 5-step ramp (`--viz-3…7`) passes the ordinal validator on both grounds |
| Type | Noto Sans JP + Geist for Latin throughout. Headings (h1, h2, site name, slot names) at weight 900; body 400/500/700. Times/numbers: Geist Mono; key figures: Geist 800, tabular | | scale 11–38 px; body 16 px, line-height 1.7; `word-break: auto-phrase` |
| Space | 4 px base (`--space-1` … `--space-16`), gutter 16/24 px | | rows are tight: one line per item where it fits |
| Radius | 0 everywhere (pill only for round dots) | | |
| Rules | hairline `--border`, frame `--border-strong` (2 px ink), section rule `--rule` (4 px ink) | | no soft shadows; `--shadow-offset` is the hard block behind the primary button and the heatmap panel (yellow behind a black button; in dark mode white behind a yellow button) |
| Motion | 120 / 200 / 320 ms, `--ease-out`; key figures count up in 800 ms (`CountUp`); the primary button shifts 2 px on hover | | all durations 0 and no count-up under `prefers-reduced-motion`; the server always renders the final value |
| Breakpoints | sm 640 · md 768 · lg 1024 · xl 1280 | | mobile nav switches at md |
| States | hover = marker wash, selected = ink underline or ink fill, focus ring 2 px accent + 2 px offset, disabled 45% | | |

Theme: the pre-hydration script in `app/layout.tsx` resolves `data-theme` (stored choice → OS preference) before paint and follows OS changes until the user chooses.

## Components

| Component | File | Notes |
| --- | --- | --- |
| Header / desktop nav / mobile tab bar / theme toggle | `src/components/layout/*` | black masthead; active item = bright marker underline; bottom tab bar < 768 px; `aria-current` on active item |
| PageHeader, Section, MoreInfo, Card, Badge/FlagBadges/SlotKindBadge, EmptyState, Notice, Skeleton, StatTile, KeyValue, ExternalLink | `src/components/ui/primitives.tsx` | page and section titles carry the marker stroke; Section opens with the section rule; `lead`/`description` are one line, longer text goes in `details` (a collapsed MoreInfo); StatGrid is a ruled strip; a numeric StatTile value counts up (`CountUp.tsx`); ExternalLink opens a new tab with `rel="noopener noreferrer"` and links only absolute http(s) URLs (anything else renders as text, `src/lib/safe-url.ts`) |
| SegmentedLinks, SelectField, FilterChips, Pagination, Disclosure, ButtonLink | `src/components/ui/controls.tsx` | link-based controls keep state in the URL; SegmentedLinks are underline tabs (current = ink underline + bold, hover = marker underline; never colour alone); the primary button is a black block with the yellow offset |
| FilterForm | `src/components/ui/FilterForm.tsx` | GET form; works without JS; with JS: client navigation, empty params dropped, auto-submit, pending text |
| ScheduleGrid / NowLine / ScheduleDayList / WeekNav / DayTabs / Legend | `src/components/schedule/*` | layout math in `layout.ts` (tested) |
| SlotTimeline / SlotCard / SeasonStrip / StripTooltip | `src/components/slots/*` | timeline scrolls to the latest season; strip ticks name their season and titles on hover, focus or tap, and open the season's first title on double-click, Enter or a second tap (one delegated tooltip per page; the strip is one tab stop, arrows move between filled seasons; empty ticks carry no text to keep `/slots` light) |
| MonthCalendar | `src/components/schedule/MonthCalendar.tsx` | Monday-first month of day links to the guide (home, and under the week switcher); today = ink block, shown week = wash; days outside the fetched range are not links |
| ChartFrame, WeekdayHourHeatmap, ConcurrencyStrip, BarList, ColumnChart, HeatmapTable, ChartExport | `src/components/stats/Charts.tsx`, `Heatmap.tsx`, `ChartExport.tsx` | every chart: computed takeaway, scope line, table view. A frame given `exportData` (a `ChartSpec` of aggregates plus title, scope, share URL, data time) shows a 書き出し row: CSV, SVG, PNG and リンクをコピー, generated in the browser by `src/lib/chart-export.ts` (exported figures use the fixed light palette and always carry source, site name, scope and URL; no title lists). CSV text fields that begin with `=` `+` `-` `@`, a tab or line break, or their full-width forms get a leading `'` so spreadsheets do not run them as formulas; numbers stay numbers. Each `#` header line is a single field. Heatmap cells are buttons: hover/focus shows the titles, channels and times behind a cell, a click pins the panel (titles become links). With `controls` the hour range can be cropped and cells enlarged; the colour scale stays fixed so views remain comparable |

## Page patterns

- **Header → controls → content → footnote.** H1 (heavy gothic with the marker) + a one-line lead saying what the page is (a phrase, no trailing 「。」); details collapsed under 「詳しく」; no eyebrow label, no tagline. The home page opens with a plain description, the entry points in one ruled bar, and today's first-run airings in two columns.
- **Data sections** stream under `<Suspense>` with skeletons sized like the content; errors render a `Notice`, empty results an `EmptyState` with a next step.
- **Schedule grid**: channel columns × time; empty hours collapse to a hatched "放送なし" band; 24:00 is highlighted as "日付変更"; overlapping items share lanes; phones get the day list.
- **Slot chronicle**: season columns on a rail; filled node = titles present, hollow = none, coral = time moved; title cards show continuation from the previous season.
- **Charts vs tables**: charts for patterns, tables for exact comparison (always available). A figure reads finding → chart → scope footnote, without a frame; long season charts open scrolled to the latest season.

## Accessibility

Skip link; landmarks; one H1 per page; focus-visible ring; tab order follows reading order; segmented controls are links with `aria-current`; charts have `role="img"` summaries plus table twins; flags and kinds have text/shape; contrast ≥ 4.5:1 for text; reduced motion respected; tested keyboard flow in E2E. Horizontally scrolling tables and charts are labelled `role="region"` with `tabIndex={0}` so they can be scrolled from the keyboard; links in the schedule grid are at least 24 px tall (WCAG 2.2 target size), and a short programme gets its own lane rather than being covered by the next. `e2e/a11y.spec.ts` runs axe-core (WCAG 2.0–2.2 A/AA rules) on 13 main pages in both themes on desktop and mobile in every CI run; it catches what can be checked mechanically, not reading order or wording.

## Review checklist

Use with the `verify-ui` skill / `npm run screenshots`:

1. Hierarchy is obvious at a glance (title → key number/time → details).
2. No clipped text, no horizontal page scroll at 390 px; long titles wrap or clamp cleanly.
3. Both themes: contrast, borders visible, no pure-black/white glare.
4. Empty, loading and error states exist and say what to do next.
5. Every number shows its unit; every chart shows its scope and has a table.
6. Nothing looks clickable that is not.

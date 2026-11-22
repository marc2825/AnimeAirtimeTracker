# Product

## Concept

**「日本のテレビアニメの放送枠と放送編成の歴史・変遷・統計を横断的に調べられる専門データベース」** — アニメ放送枠観測所 (Anime Airtime Tracker). Not a general anime information or programme-guide site: the weekly schedule stays as the everyday entry point, and the value is in the accumulated data (product policy, #23; also in `docs/roadmap.md`).

| Pillar | What users get | Status |
| --- | --- | --- |
| A. Schedule | Weekly grid (channel × time) and lists, anime-time notation (25:30), new/final/rerun marks, region/channel filters, shareable URLs | v1 |
| B. Slot history (differentiator) | Per-slot season timeline: which titles, when the time moved, on which channel, with source evidence and judgement basis | v1 |
| C. Statistics | Weekday × hour heatmap, concurrency, channel breakdown, season trend, Kanto↔Kansai delay — always with unit and scope | v1 |
| D. Analysis | Pages that answer one question from the accumulated data (scope, unit, definitions, limits and how to reproduce stated on every page; findings computed, never written in advance) | v1 (`/analysis`) |

## Positioning

Syoboi Calendar already provides an excellent, detailed program guide, title pages and recording tools; seasonal "今期アニメ一覧" sites cover browsing by title. A schedule alone would duplicate them.

| Reuse (expected baseline) | Our own value |
| --- | --- |
| Weekly guide, per-title airing list, new/final/rerun marks, channel filters | Programming **as a time series**: slot chronicles across seasons, time-move history, inferred recurring positions |
| Links to the source title page and official site | Statistics with explicit counting units, coverage and rerun handling; regional delay analysis |
| | Transparency: judgement rules, evidence quotes, coverage windows and the real import history are public |

## Users

1. Viewers checking what airs this week / tonight (entry point, mobile-heavy).
2. Enthusiasts interested in slot culture (ノイタミナ, 日5, …) and how programming shifted.
3. Researchers/writers needing counts with clear definitions.

## Scope (v1)

In: 20 tracked channels (Kanto terrestrial 8, Kansai terrestrial 5, BS 6, CS 1 — list in `src/domain/coverage.ts`), seasons from 2000 winter onward (source records are sparse before 2006, see `SOURCE_COMPLETE_FROM_YEAR`), anime categories by default.

Out (by policy, not just for launch): general title introductions, reviews, watch lists and records, accounts, notifications, streaming catalogues, images, genre/staff enrichment, auto-generated articles without evidence, public editing, an admin web UI. Nationwide channel completeness is a research item, not a goal.

## Information architecture

| Route | Purpose |
| --- | --- |
| (all pages) | Dismissible now-airing strip under the header (client clock; hidden until 05:00 once closed) |
| `/` | Today's upcoming new episodes, quick filters, featured slot chronicles, season heatmap, data freshness |
| `/schedule` | Day grid / week list; `week`, `day`, `region`, `network`, `channel`, `time`, `length`, `view`, `rerun`, `kind`, `clock` in the URL |
| `/search` | Titles / broadcasts / slots with basic + advanced filters, chips, sorting, paging |
| `/titles/[tid]` | Per-channel positions, slot memberships with evidence, airing history with observed changes, related candidates |
| `/slots`, `/slots/[slug]` | Slot index (labelled cards, inferred positions per channel) and chronicle pages |
| `/seasons`, `/seasons/[season]` | Season index and the season's new series (first-episode airings) by weekday |
| `/channels`, `/channels/[slug]` | Channel index and per-channel trend, weekday × hour, slots |
| (figures) | 書き出し row under exportable charts: CSV / SVG / PNG with source, site, scope, URL and data time; a share link with every condition explicit |
| `/analysis`, `/analysis/[slug]` | Analyses from a typed registry (`src/analysis/`): shared frame with scope, unit, source, data time, definitions, limits, reproduce links |
| `/stats` | Season statistics with scope selector (region, network, channel, time band, length), band trend, season comparison, table views |
| `/about` | Sources, terms, coverage, time conventions, definitions, slot rules, limits, corrections |
| `/terms`, `/privacy` | Terms and disclaimer (unofficial site, source and limits, code vs data licensing, requests); privacy policy (what the browser stores, hosting logs, contact data) |
| `/status` | Real import history, coverage window, staleness warning |

## Product principles

1. Real data before features; a blank is better than an invented value.
2. Distinguish source facts, source-recorded labels, and our inferences — visibly.
3. Units and scope next to every number.
4. Mobile is a first-class layout, not a shrunken desktop.
5. Corrections are public and reviewable (GitHub Issues → `data/overrides.json`).

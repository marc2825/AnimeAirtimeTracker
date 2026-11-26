# Data pipeline

## Source and terms (checked 2026-11-18)

| Item | Finding | Reference |
| --- | --- | --- |
| Provider | Syoboi Calendar (しょぼいカレンダー), volunteer-entered anime program guide | https://docs.cal.syoboi.jp/about/ |
| Reuse | Copying, including automated retrieval by applications, is permitted ("自由にコピーできます"). Distributed software should set its own User-Agent. | same |
| Bot rules | No HTML scraping; fetch only what is needed and reuse results; separate initial fetch from update checks (use `LastUpdate`); honour Cache-Control; no parallel requests; ≥1 s after the previous **response**; no fixed-time bursts; 429/Retry-After; backoff with jitter and capped retries, then stop; keep last good data on failure; UA `AppName/version (+URL with contact info)`; do not rotate UA/IP to evade limits | https://docs.cal.syoboi.jp/rule/bot/ |
| API | `db.php` Commands `ChLookup`, `ChGroupLookup`, `TitleLookup` (≤100 TIDs per request), `ProgLookup` (≤5,000 rows; `Range`, `LastUpdate`, `ChID`). `Result/Code` must be checked even on HTTP 200. | https://docs.cal.syoboi.jp/spec/db.php/ |
| Not used | `json.php` (site-internal, not recommended for data retrieval), HTML pages | https://docs.cal.syoboi.jp/spec/json.php/ |

Attribution shown on every page footer and on `/about`; each title links to its Syoboi page. We do not use or host images.

## What we fetch

| Command | When | Requests |
| --- | --- | --- |
| `channels` | rarely (channel metadata) | 2 |
| `season [--season 2026-autumn]` | initial load of a season | 13–14 `ProgLookup` (7-day windows) + ⌈new TIDs / 100⌉ `TitleLookup` |
| `backfill --from A --to B` | one-off history load | per season as above |
| `update` | every 6 h (scheduled) | 1 `ProgLookup LastUpdate=…` + 1 `TitleLookup TID=* LastUpdate=…` + details for changed tracked titles |
| `recent` | daily | ~4 windows covering today−7 … today+14 (complete windows → absence detection) |
| `subtitles` | after every `update` and `recent` (automatic) while titles lack their subtitle list; also manual | ⌈titles / 100⌉ `TitleLookup` for up to `SUBTITLE_BACKFILL_PER_RUN` (default 500 → 5 requests) titles without a list, most recently aired first; 0 once done |
| `derive` | after every run (automatic) | 0 (DB only) |
| `reparse-titles` | once, when the extraction from the title comment changes (manual, also in the `Ingest` workflow) | 0: re-reads stored `TitleLookup:TID=…` responses (≈ 130 bodies, ≈ 5 MB compressed), then runs derive |

Request budget in steady state: ≈ 4 × (2–4) + 4 ≈ **20 requests/day**. Subtitle backfill (from 2026-11-22): `TitleLookup` now also asks for `SubTitles` (the per-episode list `*01*…`; an airing's own `SubTitle` is filled mostly for specials). Titles read before that are re-read gradually: 500 per scheduled run, 5 runs a day → ≈ 25 extra requests/day for about three days for ≈ 6,500 titles, then nothing extra (new and changed titles get the list with their details). Progress is on `/status`; pause by setting the repository variable `SUBTITLE_BACKFILL_PER_RUN` to `0` (unset = 500 per run). The initial backfill of 11 seasons on 2026-11-18 took 294 requests (before title batching per season was added; now ≈ 190). The production backfill from 2000 winter to 2023 autumn on 2026-11-21 took 1,402 requests in 12 workflow runs of 8 seasons (≈ 117 each, ≈ 13 min per run including derive); 2005 and earlier hold far fewer records (2002 and earlier: 3–4 channels). All requests: serial, `SYOBOI_MIN_INTERVAL_MS` (default 3000, floor 1000) + up to 25% jitter after each response, max 4 retries with exponential backoff from 10 s, Retry-After respected.

Resource limits (`src/ingest/syoboi/client.ts`, `parse.ts`; tested with synthetic responses only):

- One 60 s time limit per attempt, covering headers and body; the body is read as a stream and counted in bytes, and the transfer is cancelled past 30 MB (real responses are under 0.3 MB) or on timeout. Timeouts and network errors are retried; an oversized body is not.
- Redirects are not followed (the endpoint does not redirect; a redirect would leave the checked `https://cal.syoboi.jp` address).
- A Retry-After over 10 minutes is not waited out, and one request waits at most 15 minutes in total between attempts; then it stops and the next scheduled run tries again.
- XML: a DOCTYPE is refused, so no entity can be defined and expansion cannot grow the text (the five XML entities are decoded; character references stay as written). Nesting is capped at 16 levels, a response at 20,000 items, a text field at 1,000,000 characters and a name at 10,000; an oversized record is quarantined like any invalid row.
- A failed or refused response fails its window, never counts as an empty complete one, so stored data stays as it was. Fetch logs record URL, status, byte size and error text, not request headers.

User-Agent: configured via `SYOBOI_USER_AGENT`; the CLI refuses to run unless it matches `AppName/version (+https://…)`. The info URL must lead to a page with contact information (the repository README + Issues).

## Processing steps

1. **Plan** 7-day windows (`src/ingest/plan.ts`); a window returning 5,000 rows is split in half and refetched (never accepted as complete).
2. **Fetch** through `SyoboiClient` (`src/ingest/syoboi/client.ts`); every attempt → `FetchLog`, every distinct body → `RawPayload` (gzip).
3. **Parse** (`parse.ts`): root element and `Result/Code` validation (404 = empty, others throw), zod row validation; invalid rows are quarantined (`rejected`) and make the window incomplete.
4. **Normalize** (`normalize.ts`): JST → instant, anime date/weekday/minute, flags, episode number vs label, comments; semantic content hash.
5. **Import** (`importer.ts`): per window in one transaction; creates/updates with revisions; touches unchanged rows; marks `missingSince` only for complete windows; applies overrides.
6. **Record** `CoverageWindow` for complete windows; `ImportRun` status/stats.
7. **Derive** (`derive.ts`): rerun reclassification and full slot rebuild. Both work inside the database, because Neon bills the data it sends out and derive runs after every scheduled import: reclassification is one SQL `UPDATE` with the same rule as `classifyRerun`, and the slot rebuild reads airing groups (title × channel × season × weekday × start × duration, with counts and first/last start) that the database aggregates, ≈ 40k rows instead of ≈ 230k airings. The rebuild is skipped when a fingerprint of all its inputs (groups, slot titles, tracked channels, registry, overrides, rule version, commit), hashed in the database, matches the last rebuild (`SyncCursor` `derive:slot-inputs`); the manual `derive` command always rebuilds. Measured on a copy of production (2026-11-24): 41.7 MB and ≈ 5 s per run before; 4.2 MB and ≈ 3.5 s when the inputs changed, a few hundred bytes and ≈ 0.7 s when they did not, with identical results (all 326,151 rerun classifications; 866 slots, 10,470 memberships, 15,532 seasons).

Re-running any command is safe (idempotent). An interrupted run keeps committed windows; just run it again. Overlapping runs are prevented by a PostgreSQL advisory lock.

## Field semantics worth knowing

- `Flag` bits: 1 注, 2 新, 4 終, 8 再. `Deleted=1` marks removed entries.
- `Cat` 1 = アニメ and 10 = アニメ(終了/再放送) are confirmed from data; other labels (3 テレビ, 4 特撮, 5 アニメ関連, 7 OVA, 8 映画) match observed titles. Default anime filter: 1, 7, 8, 10.
- `StOffset` is in seconds (observed values 60–3300) but whether `StTime` already includes it is undocumented, so it is stored and **not applied**.
- `ProgComment` notes often start with `!` (e.g. sports overruns); the marker is stripped for display.

## Manual corrections

`data/overrides.json` (schema in `src/ingest/overrides.ts`), each entry with `reason`, `evidence`, `addedAt`:

- `broadcasts[]`: `isRerun` true/false (→ `rerunBasis = MANUAL`)
- `titles[]`: `name`, `seriesKey`, `officialUrl`, `sourceCategory`
- `slotMemberships[]`: add/remove a title from a slot by slug

Process: report via GitHub Issue → PR editing the file (reviewed) → next import/derive applies it. Corrections of the *source data itself* should go to Syoboi Calendar, which benefits everyone.

## Slots

Rule version `slots-v3` (`src/domain/slots.ts`, explained publicly on `/about#slots`):

- **SOURCE_LABEL**: comment lines matching `「X」枠で/にて/内で放送`; ≥2 member titles; home channel = most member titles with regular positions; the per-season position is the block (modal weekday, earliest start, span to latest end); rerun-context statements get `MEDIUM` confidence.
- **INFERRED**: exact (channel, weekday, start) with regular positions of ≥3 titles across ≥3 seasons.
- **OFFICIAL**: only via `data/slots.json` with an `evidenceUrl` on the broadcaster's own site (registry intentionally empty until verified).

## Credits

Studios and publishers named in the title comment (`extractCredits` in `src/ingest/syoboi/normalize.ts`), stored on `Title` as written (`studios`, `publishers`, `creditEvidence` with the lines used). They are facts from the source, not verified; a title whose comment names none has empty lists, shown as 「記載なし」.

- **Studio**: `:アニメーション制作:` and `:アニメ制作:` lines only. `制作:` and `製作:` often name the broadcaster or the production committee. Notes in parentheses are dropped (`アクタス(第1話～第26話)`), joint studios split on 「、」「×」「/」, never on `&` or `,` (they occur inside names).
- **Publisher**: the name in parentheses on `掲載誌`・`連載誌`・`連載`・`レーベル`・`出版社`・`発行` lines (`週刊少年ジャンプ(集英社)`), up to 「」『』, `/` or a space, without 「刊」. On `原作`・`原作小説`・`原作漫画` lines the parentheses also hold authors, games or roles, so only publisher-like names are taken (ending in 社・館・書店・文庫・ノベル・ブックス…, or a listed publisher). Imprints (電撃文庫) stay as written.
- Coverage on a copy of production (2026-11-21, 6,490 titles): a studio for 4,289, a publisher or imprint for 2,314.
- `npm run ingest -- reparse-titles` fills these fields for titles imported before (or after a change to) the extraction, from stored responses, then runs derive. It updates only these three columns where they differ, so fetch dates and the subtitle backfill state stay unchanged; the newest stored detail response of each title wins.

Derive adds a credit profile to every slot (`Slot.creditProfile`, rule version `credits-v2`, `src/domain/credits.ts`; pages ignore profiles of another version). The profile is experimental and shown as such:

- **Composition**: titles per studio and per publisher among the slot's member titles. Names are compared without case, spaces and punctuation. `data/credit-aliases.json` (reviewed, with evidence) joins spellings of the same company or imprint (OLM／オー・エル・エム); renamed or merged companies are not joined.
- **Dominance** (an "implicit slot"): at least 4 member titles name someone for the role, and one name holds at least half of them and at least 3 titles.
- **Similar slots**: cosine similarity of IDF-weighted title counts per studio and publisher, between slots with at least 4 titles naming any; slots that share a title are left out (the slot page lists those as related); top 3 from 0.3.
- **Next-season candidates** for slots with a title in the latest season of the data or the one before: the slot's past titles weighted 0.7 per season of distance, top 3 with their share (from 1 %). A prediction needs at least one title naming someone within the 12 seasons before the target: normalised weights would otherwise make one title from long ago look certain (`credits-v1` did). Bands, counting only those recent titles: `high` (top share ≥ 0.8), `mid` (≥ 0.6), `low` (below), all with ≥ 3 recent titles, and `short` (fewer). Slot pages show `high` and `mid` only.
- **Backtest**: every member title naming someone is predicted from the slot's earlier titles only (same recency rule), and compared with two baselines computed from earlier seasons only (the name most titles had so far on the slot's channel, and overall). Per slot the profile stores the counts; the analysis page sums them. On the 2026-11-21 copy: studio top-1 9.0 % (baselines 5.0 % and 5.0 %), publisher 18.5 % (11.4 %, 16.9 %); in the `high` band 30.7 % and 33.2 %. Weak overall: candidates are shown only with these figures.
- Credits are an input of the slot rebuild fingerprint, so a reparse or a changed comment rebuilds slots on the next derive.

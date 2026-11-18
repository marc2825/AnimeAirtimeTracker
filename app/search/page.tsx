import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { Disclosure, FilterChips, Pagination, SegmentedLinks, SelectField, SubmitButton } from "@/components/ui/controls";
import { FilterForm } from "@/components/ui/FilterForm";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, FlagBadges, Notice, PageHeader, SkeletonBlock, SlotKindBadge } from "@/components/ui/primitives";
import { REGIONS, REGION_KEYS } from "@/domain/coverage";
import { currentSeason, formatSeason, seasonFromOrdinal, seasonId } from "@/domain/season";
import { WEEKDAY_KEYS, WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import { episodeText, formatDateShort, formatDateTime, formatSeasonOrdinal } from "@/lib/format";
import { buildHref, flattenParams, parseCommonFilters, parsePage, parseQuery, single, TIME_BANDS, type RawSearchParams } from "@/lib/search-params";
import { getTrackedChannels } from "@/server/queries/common";
import { listSlots } from "@/server/queries/slots";
import { getCoveredSeasonOrdinals } from "@/server/queries/status";
import { searchBroadcasts, searchTitles, type TitleSort } from "@/server/queries/titles";

import styles from "./search.module.css";

export const metadata: Metadata = {
  title: "検索",
  description: "作品名・クール・放送局・曜日・時間帯でアニメの放送を検索。作品・放送・放送枠の3つの表示に切り替えられます。",
  alternates: { canonical: "/search" }
};

const PATH = "/search";
const PAGE_SIZE = 30;
const SORT_LABELS: Record<TitleSort, string> = { position: "曜日・時刻順", first: "放送開始が新しい順", name: "読み順", airings: "放送回数順" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="container">
      <PageHeader kicker="Search" title="検索" lead="作品名や放送条件から、作品・個々の放送・放送枠を探せます。初期表示は今期の作品です。" />
      <Suspense fallback={<SkeletonBlock rows={8} label="検索結果を読み込み中" />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  await io();
  const current = flattenParams(params);
  const now = currentSeason();
  const filters = parseCommonFilters(params, { rerun: "exclude", season: now });
  const query = parseQuery(single(params, "q"));
  const viewParam = single(params, "view");
  const view = viewParam === "airings" ? "airings" : viewParam === "slots" ? "slots" : "titles";
  const sortParam = single(params, "sort") as TitleSort | undefined;
  const sort: TitleSort = sortParam && sortParam in SORT_LABELS ? sortParam : query ? "first" : "position";
  const page = parsePage(single(params, "page"));
  const href = (overrides: Record<string, string | null>) => buildHref(PATH, current, overrides);

  let channels;
  let covered: number[];
  try {
    [channels, covered] = await Promise.all([getTrackedChannels(), getCoveredSeasonOrdinals()]);
  } catch {
    return <Notice tone="danger" title="検索できませんでした">時間をおいて再読み込みしてください。</Notice>;
  }

  const filter = { season: filters.season, region: filters.region, channelSlug: filters.channel, weekday: filters.weekday, band: filters.band, rerun: filters.rerun, allKinds: filters.allKinds };
  const channelName = (id: number) => channels.find((c) => c.id === id)?.shortName ?? "";

  const chips: { label: string; removeHref: string }[] = [];
  if (query) chips.push({ label: `「${query}」`, removeHref: href({ q: null }) });
  if (single(params, "season")) chips.push({ label: filters.season ? formatSeason(filters.season) : "全期間", removeHref: href({ season: null }) });
  if (filters.region) chips.push({ label: REGIONS[filters.region].label, removeHref: href({ region: null }) });
  if (filters.channel) chips.push({ label: channels.find((c) => c.slug === filters.channel)?.name ?? filters.channel, removeHref: href({ channel: null }) });
  if (filters.weekday !== null) chips.push({ label: `${WEEKDAY_LABELS[filters.weekday]}曜`, removeHref: href({ day: null }) });
  if (filters.band) chips.push({ label: TIME_BANDS[filters.band].label, removeHref: href({ time: null }) });
  if (filters.rerun !== "exclude") chips.push({ label: filters.rerun === "include" ? "再放送を含む" : "再放送のみ", removeHref: href({ rerun: null }) });
  if (filters.allKinds) chips.push({ label: "関連番組も含む", removeHref: href({ kind: null }) });
  const advancedOpen = Boolean(single(params, "season") || filters.region || filters.channel || filters.weekday !== null || filters.band || filters.rerun !== "exclude" || filters.allKinds);

  return (
    <div className={styles.layout}>
      <FilterForm action={PATH} className={styles.form} label="検索条件">
        <div className={styles.searchRow}>
          <label className={styles.searchField}>
            <span className="visually-hidden">キーワード</span>
            <Icon name="search" size={18} className={styles.searchIcon} />
            <input type="search" name="q" defaultValue={query} placeholder="作品名・読み・英題で検索" className={styles.searchInput} autoComplete="off" enterKeyHint="search" />
          </label>
          <SubmitButton>検索</SubmitButton>
        </div>
        <input type="hidden" name="view" value={view === "titles" ? "" : view} />
        <Disclosure summary="詳細条件" defaultOpen={advancedOpen}>
          <div className={styles.advanced}>
            <SelectField
              label="クール"
              name="season"
              value={single(params, "season") ?? ""}
              autoSubmit={false}
              options={[
                { value: "", label: `今期（${formatSeason(now)}）` },
                { value: "all", label: "全期間" },
                ...[...covered].reverse().map((ordinal) => ({ value: seasonId(seasonFromOrdinal(ordinal)), label: formatSeasonOrdinal(ordinal) }))
              ]}
            />
            <SelectField
              label="地域・媒体"
              name="region"
              value={filters.region ?? ""}
              autoSubmit={false}
              options={[{ value: "", label: "すべて" }, ...REGION_KEYS.map((key) => ({ value: key, label: REGIONS[key].label }))]}
            />
            <SelectField label="放送局" name="channel" value={filters.channel ?? ""} autoSubmit={false} options={[{ value: "", label: "すべて" }, ...channels.map((c) => ({ value: c.slug, label: c.name }))]} />
            <SelectField
              label="曜日（アニメ時刻）"
              name="day"
              value={filters.weekday !== null ? WEEKDAY_KEYS[filters.weekday]! : ""}
              autoSubmit={false}
              options={[{ value: "", label: "すべて" }, ...WEEKDAY_LABELS.map((label, index) => ({ value: WEEKDAY_KEYS[index]!, label: `${label}曜` }))]}
            />
            <SelectField
              label="時間帯"
              name="time"
              value={filters.band ?? ""}
              autoSubmit={false}
              options={[{ value: "", label: "すべて" }, ...Object.entries(TIME_BANDS).map(([key, band]) => ({ value: key, label: band.label }))]}
            />
            <SelectField
              label="再放送"
              name="rerun"
              value={filters.rerun === "exclude" ? "" : filters.rerun}
              autoSubmit={false}
              options={[
                { value: "", label: "除く" },
                { value: "include", label: "含める" },
                { value: "only", label: "再放送のみ" }
              ]}
            />
            <SelectField
              label="番組の種類"
              name="kind"
              value={filters.allKinds ? "all" : ""}
              autoSubmit={false}
              options={[
                { value: "", label: "アニメのみ" },
                { value: "all", label: "関連番組・特撮も含む" }
              ]}
            />
          </div>
        </Disclosure>
      </FilterForm>

      <FilterChips chips={chips} clearHref={PATH} />

      <SegmentedLinks
        label="表示"
        options={[
          { href: href({ view: null, sort: null }), label: "作品", active: view === "titles" },
          { href: href({ view: "airings", sort: null }), label: "放送", active: view === "airings" },
          { href: href({ view: "slots", sort: null }), label: "放送枠", active: view === "slots" }
        ]}
      />

      {view === "titles" ? (
        <TitleResults filter={filter} query={query} sort={sort} page={page} href={href} channelName={channelName} />
      ) : view === "airings" ? (
        <AiringResults filter={filter} query={query} order={single(params, "order") === "asc" ? "asc" : "desc"} page={page} href={href} channelName={channelName} />
      ) : (
        <SlotResults query={query} channel={filters.channel} />
      )}
    </div>
  );
}

type Href = (overrides: Record<string, string | null>) => string;
type Filter = Parameters<typeof searchTitles>[0];

async function TitleResults({ filter, query, sort, page, href, channelName }: { filter: Filter; query: string; sort: TitleSort; page: number; href: Href; channelName: (id: number) => string }) {
  const result = await searchTitles(filter, query, sort, page, PAGE_SIZE);
  const totalPages = Math.ceil(result.total / PAGE_SIZE);
  return (
    <section aria-labelledby="results-title" className={styles.results}>
      <div className={styles.resultsHead}>
        <h2 id="results-title" className={styles.count}>
          <span className="mono">{result.total}</span> 作品
        </h2>
        <SegmentedLinks size="sm" label="並び替え" options={(Object.keys(SORT_LABELS) as TitleSort[]).map((key) => ({ href: href({ sort: key }), label: SORT_LABELS[key], active: key === sort }))} />
      </div>
      {result.rows.length === 0 ? (
        <EmptyState title="該当する作品はありません" icon="search">
          条件を減らすか、クールを「全期間」にしてください。
        </EmptyState>
      ) : (
        <ol role="list" className={styles.titleList}>
          {result.rows.map((row) => (
            <li key={row.id} className={styles.titleRow}>
              <span className={styles.titlePosition}>
                <span className={row.modalWeekday === 5 ? "sat" : row.modalWeekday === 6 ? "sun" : undefined}>{WEEKDAY_LABELS[row.modalWeekday]}</span>
                <span className="mono">{formatAnimeMinute(row.modalMinute)}</span>
              </span>
              <span className={styles.titleMain}>
                <Link href={`/titles/${row.slug}`} className={styles.titleName}>
                  {row.name}
                </Link>
                <span className={styles.titleMeta}>
                  <span>{channelName(row.modalChannelId)}ほか{row.channelIds.length > 1 ? `計${row.channelIds.length}局` : ""}</span>
                  <span className="mono">
                    {formatDateTime(row.firstAt).split(" ")[0]}〜{formatDateShort(formatDateTime(row.lastAt).split(" ")[0]!.replaceAll("/", "-"))}
                  </span>
                  <span>{row.airings}回</span>
                </span>
              </span>
              <span className={styles.titleFlags}>{row.hasNew ? <FlagBadges flagNew /> : null}</span>
            </li>
          ))}
        </ol>
      )}
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p === 1 ? null : String(p) })} />
    </section>
  );
}

async function AiringResults({ filter, query, order, page, href, channelName }: { filter: Filter; query: string; order: "asc" | "desc"; page: number; href: Href; channelName: (id: number) => string }) {
  const result = await searchBroadcasts(filter, query, order, page, PAGE_SIZE);
  const totalPages = Math.ceil(result.total / PAGE_SIZE);
  return (
    <section aria-labelledby="results-title" className={styles.results}>
      <div className={styles.resultsHead}>
        <h2 id="results-title" className={styles.count}>
          <span className="mono">{result.total}</span> 件の放送
        </h2>
        <SegmentedLinks
          size="sm"
          label="並び替え"
          options={[
            { href: href({ order: null }), label: "新しい順", active: order === "desc" },
            { href: href({ order: "asc" }), label: "古い順", active: order === "asc" }
          ]}
        />
      </div>
      {result.rows.length === 0 ? (
        <EmptyState title="該当する放送はありません" icon="search">
          条件を変えてください。
        </EmptyState>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">放送日</th>
                <th scope="col">時刻</th>
                <th scope="col">局</th>
                <th scope="col">作品・話数</th>
                <th scope="col">区分</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <td className="mono">
                    {row.animeDate.replaceAll("-", "/")}
                    <span className={row.animeWeekday === 5 ? "sat" : row.animeWeekday === 6 ? "sun" : "muted"}>({WEEKDAY_LABELS[row.animeWeekday]})</span>
                  </td>
                  <td className="mono">{formatAnimeMinute(row.animeStartMinute)}</td>
                  <td>{channelName(row.channelId)}</td>
                  <td>
                    <Link href={`/titles/${row.titleSlug}`} className={styles.tableTitle}>
                      {row.titleName}
                    </Link>{" "}
                    <span className="muted mono">{episodeText(row.episodeNumber, row.episodeLabel)}</span>
                  </td>
                  <td>
                    <FlagBadges flagNew={row.flagNew} flagFinal={row.flagFinal} isRerun={row.isRerun} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p === 1 ? null : String(p) })} />
    </section>
  );
}

async function SlotResults({ query, channel }: { query: string; channel: string | null }) {
  const slots = await listSlots();
  const normalized = query.toLowerCase();
  const filtered = slots.filter((slot) => (!query || slot.name.toLowerCase().includes(normalized)) && (!channel || slot.channel?.slug === channel));
  return (
    <section aria-labelledby="results-title" className={styles.results}>
      <div className={styles.resultsHead}>
        <h2 id="results-title" className={styles.count}>
          <span className="mono">{filtered.length}</span> 枠
        </h2>
        <p className={styles.resultsNote}>放送枠はキーワードと放送局で絞り込めます（クール・曜日などの条件は作品・放送の表示に適用されます）。</p>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="該当する放送枠はありません" icon="search" />
      ) : (
        <ul role="list" className={styles.slotList}>
          {filtered.slice(0, 120).map((slot) => (
            <li key={slot.slug} className={styles.slotRow}>
              <SlotKindBadge kind={slot.kind} />
              <Link href={`/slots/${encodeURIComponent(slot.slug)}`} className={styles.tableTitle}>
                {slot.name}
              </Link>
              <span className="muted">
                {slot.titleCount}作品・{slot.seasonCount}クール
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

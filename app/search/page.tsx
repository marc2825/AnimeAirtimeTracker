import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import { durationLabels, quarterLabels, weekdayLabels } from "@/lib/labels";
import {
  formatAnimeSchedule,
  formatDateTimeJst,
  formatDuration,
  formatSeason,
  formatSlotType
} from "@/lib/formatters";
import {
  buildSearchHref,
  getDefaultSortForView,
  readSearchState,
  searchSortOptions,
  searchViewLabels,
  searchViews
} from "@/lib/search";
import type { SearchState, SearchView } from "@/lib/search";
import {
  getSearchCollections,
  getSearchPageOptions,
  paginateItems,
  type AiringSearchEntry,
  type SlotSearchEntry,
  type TitleSearchEntry
} from "@/lib/search-catalog";

export const metadata: Metadata = {
  title: "検索一覧 | 深夜アニメ放送枠観測所"
};

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const filterFieldKeys = [
  "q",
  "year",
  "quarter",
  "weekday",
  "timeBand",
  "channel",
  "region",
  "slot",
  "genre",
  "company",
  "sequel",
  "duration"
] as const;

function hiddenFields(state: SearchState, excluded: Array<keyof SearchState>) {
  return (Object.entries(state) as Array<[keyof SearchState, SearchState[keyof SearchState]]>).map(([key, value]) => {
    if (excluded.includes(key)) {
      return null;
    }

    if (typeof value === "number") {
      return <input key={key} type="hidden" name={key} value={String(value)} />;
    }

    if (!value) {
      return null;
    }

    return <input key={key} type="hidden" name={key} value={value} />;
  });
}

function findLabel(values: Array<{ slug: string; name: string }>, target: string): string {
  return values.find((item) => item.slug === target)?.name ?? target;
}

function getActiveFilterChips(state: SearchState, options: ReturnType<typeof getSearchPageOptions>) {
  const chips: Array<{ label: string; value: string }> = [];

  if (state.q) {
    chips.push({ label: "検索語", value: state.q });
  }

  if (state.year) {
    chips.push({ label: "年", value: `${state.year}年` });
  }

  if (state.quarter) {
    chips.push({
      label: "クール",
      value: quarterLabels[state.quarter as keyof typeof quarterLabels] ?? state.quarter
    });
  }

  if (state.weekday) {
    chips.push({
      label: "曜日",
      value: weekdayLabels[state.weekday as keyof typeof weekdayLabels] ?? state.weekday
    });
  }

  if (state.timeBand) {
    chips.push({ label: "時刻帯", value: `${state.timeBand}時台${state.timeBand === "26" ? "以降" : ""}` });
  }

  if (state.channel) {
    chips.push({ label: "放送局", value: findLabel(options.channels, state.channel) });
  }

  if (state.region) {
    chips.push({ label: "地域", value: findLabel(options.regions, state.region) });
  }

  if (state.slot) {
    chips.push({ label: "放送枠", value: findLabel(options.slots, state.slot) });
  }

  if (state.genre) {
    chips.push({ label: "ジャンル", value: state.genre });
  }

  if (state.company) {
    chips.push({ label: "制作会社", value: findLabel(options.companies, state.company) });
  }

  if (state.sequel === "only") {
    chips.push({ label: "続編", value: "続編のみ" });
  }

  if (state.sequel === "exclude") {
    chips.push({ label: "続編", value: "新作のみ" });
  }

  if (state.duration) {
    chips.push({
      label: "尺区分",
      value: durationLabels[state.duration as keyof typeof durationLabels] ?? state.duration
    });
  }

  return chips;
}

function getResultDescription(view: SearchView): string {
  if (view === "airing") {
    return "放送件数でカウントします。作品に紐づく各放送行を一覧表示します。";
  }

  if (view === "slot") {
    return "放送枠数でカウントします。現在の条件に一致した放送が1件以上ある枠を表示します。";
  }

  return "作品本数でカウントします。現在の条件に一致した放送を持つ作品を表示します。";
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  const pages: number[] = [];

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  return pages;
}

function renderTitleTable(items: TitleSearchEntry[]) {
  return (
    <div className="table-wrapper">
      <table className="result-table">
        <thead>
          <tr>
            <th>作品</th>
            <th>開始クール</th>
            <th>一致放送</th>
            <th>地域・局数</th>
            <th>放送枠</th>
            <th>属性</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.title.id}>
              <td>
                <Link href={`/titles/${entry.title.slug}`} className="result-title inline-link">
                  {entry.title.name}
                </Link>
                <span className="subline">
                  {entry.title.shortName ?? "短縮名なし"} / {entry.titleEntry.primaryCompanies[0]?.name ?? "制作会社未設定"}
                </span>
              </td>
              <td>{formatSeason(entry.title.seasonYear, entry.title.seasonQuarter)}</td>
              <td>
                {entry.matchedAirings.length}件
                <span className="subline">
                  {entry.firstMatchedAiring
                    ? formatAnimeSchedule(
                        entry.firstMatchedAiring.animeBroadcastDay,
                        entry.firstMatchedAiring.animeBroadcastTimeText
                      )
                    : "未設定"}
                </span>
              </td>
              <td>
                {entry.matchedRegions.length}地域 / {entry.matchedChannels.length}局
              </td>
              <td>
                {entry.matchedSlots.length > 0 ? (
                  entry.matchedSlots.map((slot) => (
                    <div key={slot.id}>
                      <Link href={`/slots/${slot.slug}`} className="inline-link">
                        {slot.name}
                      </Link>
                    </div>
                  ))
                ) : (
                  "未分類"
                )}
              </td>
              <td>
                <div className="badge-row">
                  {entry.title.genres.slice(0, 2).map((genre) => (
                    <Badge key={genre}>{genre}</Badge>
                  ))}
                  <Badge tone="accent">{formatDuration(entry.title.durationCategory)}</Badge>
                  {entry.title.isSequel ? <Badge tone="warm">続編</Badge> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderAiringTable(items: AiringSearchEntry[]) {
  return (
    <div className="table-wrapper">
      <table className="result-table">
        <thead>
          <tr>
            <th>作品</th>
            <th>放送局</th>
            <th>地域</th>
            <th>実日時刻</th>
            <th>アニメ文脈時刻</th>
            <th>放送枠</th>
            <th>尺 / 状態</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.airing.id}>
              <td>
                <Link href={`/titles/${entry.title.slug}`} className="result-title inline-link">
                  {entry.title.name}
                </Link>
                <span className="subline">{entry.primaryCompanies[0]?.name ?? "制作会社未設定"}</span>
              </td>
              <td>{entry.airing.channel.name}</td>
              <td>{entry.airing.region.name}</td>
              <td>{formatDateTimeJst(entry.airing.broadcastStartAt)}</td>
              <td>{formatAnimeSchedule(entry.airing.animeBroadcastDay, entry.airing.animeBroadcastTimeText)}</td>
              <td>
                {entry.airing.slot ? (
                  <Link href={`/slots/${entry.airing.slot.slug}`} className="inline-link">
                    {entry.airing.slot.name}
                  </Link>
                ) : (
                  "未分類"
                )}
              </td>
              <td>
                <div className="badge-row">
                  <Badge tone="accent">{formatDuration(entry.airing.durationCategory)}</Badge>
                  {entry.title.isSequel ? <Badge tone="warm">続編</Badge> : null}
                  {entry.airing.isRebroadcast ? <Badge>再放送</Badge> : <Badge>初回系</Badge>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderSlotTable(items: SlotSearchEntry[]) {
  return (
    <div className="table-wrapper">
      <table className="result-table">
        <thead>
          <tr>
            <th>放送枠</th>
            <th>局 / 地域</th>
            <th>代表時刻</th>
            <th>作品本数</th>
            <th>放送件数</th>
            <th>代表属性</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.slot.id}>
              <td>
                <Link href={`/slots/${entry.slot.slug}`} className="result-title inline-link">
                  {entry.slot.name}
                </Link>
                <span className="subline">{formatSlotType(entry.slot.slotType)}</span>
              </td>
              <td>
                {entry.channel.name}
                <span className="subline">{entry.region.name}</span>
              </td>
              <td>{formatAnimeSchedule(entry.slot.representativeDay, entry.slot.representativeTimeText)}</td>
              <td>{entry.titleCount}</td>
              <td>{entry.airingCount}</td>
              <td>
                <div className="badge-row">
                  {entry.topGenres.map((item) => (
                    <Badge key={item.label}>{item.label}</Badge>
                  ))}
                  {entry.topCompanies[0] ? <Badge tone="accent">{entry.topCompanies[0].label}</Badge> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const state = readSearchState(params);
  const normalizedState = {
    ...state,
    sort: state.sort || getDefaultSortForView(state.view)
  };
  const options = getSearchPageOptions();
  const activeFilterChips = getActiveFilterChips(normalizedState, options);
  const collections = getSearchCollections(normalizedState);
  const paginatedTitleResults = paginateItems(
    collections.titleResults,
    normalizedState.page,
    normalizedState.pageSize
  );
  const paginatedAiringResults = paginateItems(
    collections.airingResults,
    normalizedState.page,
    normalizedState.pageSize
  );
  const paginatedSlotResults = paginateItems(
    collections.slotResults,
    normalizedState.page,
    normalizedState.pageSize
  );
  const currentPaginated =
    normalizedState.view === "airing"
      ? paginatedAiringResults
      : normalizedState.view === "slot"
        ? paginatedSlotResults
        : paginatedTitleResults;
  const sortOptions = searchSortOptions[normalizedState.view];
  const visiblePages = getVisiblePages(currentPaginated.page, currentPaginated.totalPages);

  return (
    <div className="page-stack">
      <section className="hero">
        <Badge tone="warm">検索・絞り込み</Badge>
        <h1>作品 / 放送 / 枠 を同じ条件で横断検索する</h1>
        <p>
          まず一致した放送データを作り、そこから作品・放送・枠ビューへ切り替える構成にしています。
          URL クエリと状態を同期しているので、リロードや共有でも条件が保たれます。
        </p>
      </section>

      <div className="search-layout">
        <aside className="section-card">
          <div className="section-card-header">
            <h2>検索条件</h2>
            <p>条件を変更して送信すると URL に反映され、一覧も同時に更新されます。</p>
          </div>
          <form className="filter-form" method="get">
            <input type="hidden" name="view" value={normalizedState.view} />
            <input type="hidden" name="sort" value={normalizedState.sort} />
            <input type="hidden" name="pageSize" value={String(normalizedState.pageSize)} />
            <input type="hidden" name="page" value="1" />
            <label>
              フリーワード
              <input type="text" name="q" defaultValue={normalizedState.q} placeholder="作品名・短縮名・枠名・局名" />
            </label>
            <label>
              年
              <select name="year" defaultValue={normalizedState.year}>
                <option value="">すべて</option>
                {options.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label>
              クール
              <select name="quarter" defaultValue={normalizedState.quarter}>
                <option value="">すべて</option>
                {options.quarters.map((quarter) => (
                  <option key={quarter} value={quarter}>
                    {quarterLabels[quarter]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              曜日
              <select name="weekday" defaultValue={normalizedState.weekday}>
                <option value="">すべて</option>
                {options.weekdays.map((weekday) => (
                  <option key={weekday} value={weekday}>
                    {weekdayLabels[weekday]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              時刻帯
              <select name="timeBand" defaultValue={normalizedState.timeBand}>
                <option value="">すべて</option>
                <option value="23">23時台</option>
                <option value="24">24時台</option>
                <option value="25">25時台</option>
                <option value="26">26時以降</option>
              </select>
            </label>
            <label>
              放送局
              <select name="channel" defaultValue={normalizedState.channel}>
                <option value="">すべて</option>
                {options.channels.map((channel) => (
                  <option key={channel.id} value={channel.slug}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              地域
              <select name="region" defaultValue={normalizedState.region}>
                <option value="">すべて</option>
                {options.regions.map((region) => (
                  <option key={region.id} value={region.slug}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              放送枠
              <select name="slot" defaultValue={normalizedState.slot}>
                <option value="">すべて</option>
                {options.slots.map((slot) => (
                  <option key={slot.id} value={slot.slug}>
                    {slot.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ジャンル
              <select name="genre" defaultValue={normalizedState.genre}>
                <option value="">すべて</option>
                {options.genres.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              制作会社
              <select name="company" defaultValue={normalizedState.company}>
                <option value="">すべて</option>
                {options.companies.map((company) => (
                  <option key={company.id} value={company.slug}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              続編フラグ
              <select name="sequel" defaultValue={normalizedState.sequel}>
                <option value="">すべて</option>
                <option value="only">続編のみ</option>
                <option value="exclude">新作のみ</option>
              </select>
            </label>
            <label>
              尺区分
              <select name="duration" defaultValue={normalizedState.duration}>
                <option value="">すべて</option>
                {options.durations.map((duration) => (
                  <option key={duration} value={duration}>
                    {durationLabels[duration]}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-actions">
              <button type="submit" className="filter-submit">
                条件を反映
              </button>
              <Link href="/search" className="button-link button-link-secondary filter-reset">
                条件をリセット
              </Link>
            </div>
          </form>
        </aside>

        <div className="page-stack">
          <SectionCard
            title={`${searchViewLabels[normalizedState.view]}検索`}
            description={getResultDescription(normalizedState.view)}
          >
            <div className="results-toolbar">
              <div className="view-switch" role="tablist" aria-label="表示切り替え">
                {searchViews.map((view) => (
                  <Link
                    key={view}
                    href={buildSearchHref("/search", normalizedState, {
                      view,
                      sort: "",
                      page: 1
                    })}
                    className={view === normalizedState.view ? "view-tab view-tab-active" : "view-tab"}
                  >
                    {searchViewLabels[view]} ({collections.counts[view]})
                  </Link>
                ))}
              </div>

              <form method="get" className="results-control-form">
                {hiddenFields(normalizedState, [...filterFieldKeys, "view", "sort", "pageSize", "page"])}
                {filterFieldKeys.map((fieldKey) => {
                  const value = normalizedState[fieldKey];
                  if (!value) {
                    return null;
                  }

                  return <input key={fieldKey} type="hidden" name={fieldKey} value={value} />;
                })}
                <input type="hidden" name="view" value={normalizedState.view} />
                <input type="hidden" name="page" value="1" />
                <label>
                  並び順
                  <select name="sort" defaultValue={normalizedState.sort}>
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  表示件数
                  <select name="pageSize" defaultValue={String(normalizedState.pageSize)}>
                    {options.pageSizes.map((pageSize) => (
                      <option key={pageSize} value={pageSize}>
                        {pageSize}件
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="filter-submit">
                  表示更新
                </button>
              </form>
            </div>

            <div className="results-summary">
              <p className="muted">
                {currentPaginated.totalItems === 0
                  ? "0件"
                  : `全${currentPaginated.totalItems}件中 ${currentPaginated.startIndex} - ${currentPaginated.endIndex}件を表示`}
              </p>
              {activeFilterChips.length > 0 ? (
                <div className="chips">
                  {activeFilterChips.map((chip) => (
                    <Badge key={`${chip.label}-${chip.value}`}>{`${chip.label}: ${chip.value}`}</Badge>
                  ))}
                </div>
              ) : (
                <p className="muted">現在は絞り込みなしで全件表示しています。</p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={`${searchViewLabels[normalizedState.view]}一覧`}
            description="URL クエリと検索状態は同期しています。ページ送りでも条件を維持します。"
          >
            {currentPaginated.totalItems === 0 ? (
              <div className="empty-state">条件に一致する結果がありません。条件をゆるめて再検索してください。</div>
            ) : (
              <>
                {normalizedState.view === "airing"
                  ? renderAiringTable(currentPaginated.items as AiringSearchEntry[])
                  : normalizedState.view === "slot"
                    ? renderSlotTable(currentPaginated.items as SlotSearchEntry[])
                    : renderTitleTable(currentPaginated.items as TitleSearchEntry[])}

                {currentPaginated.totalPages > 1 ? (
                  <nav className="pagination" aria-label="ページネーション">
                    <Link
                      href={buildSearchHref("/search", normalizedState, {
                        page: Math.max(1, currentPaginated.page - 1)
                      })}
                      className="pagination-link"
                    >
                      前へ
                    </Link>
                    {visiblePages.map((page) => (
                      <Link
                        key={page}
                        href={buildSearchHref("/search", normalizedState, { page })}
                        className={page === currentPaginated.page ? "pagination-link pagination-current" : "pagination-link"}
                      >
                        {page}
                      </Link>
                    ))}
                    <Link
                      href={buildSearchHref("/search", normalizedState, {
                        page: Math.min(currentPaginated.totalPages, currentPaginated.page + 1)
                      })}
                      className="pagination-link"
                    >
                      次へ
                    </Link>
                  </nav>
                ) : null}
              </>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

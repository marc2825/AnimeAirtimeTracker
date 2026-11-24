import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { Disclosure, FilterChips, Pagination, SegmentedLinks, SelectField, SubmitButton } from "@/components/ui/controls";
import { FilterForm } from "@/components/ui/FilterForm";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, FlagBadges, Notice, PageHeader, SkeletonBlock, SlotKindBadge, WeekdayChip } from "@/components/ui/primitives";
import { NETWORKS, NETWORK_KEYS, REGIONS, REGION_KEYS, channelSlugsFor } from "@/domain/coverage";
import { currentSeason, formatSeason, seasonFromOrdinal, seasonId, seasonOrdinal } from "@/domain/season";
import { WEEKDAY_KEYS, WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import { episodeText, formatDateShort, formatDateTime, formatSeasonOrdinal } from "@/lib/format";
import { buildHref, flattenParams, LENGTH_OPTIONS, LENGTHS, MAX_SEARCH_PAGE, parseCommonFilters, parsePage, parseQuery, single, TIME_BAND_OPTIONS, TIME_BANDS, type RawSearchParams } from "@/lib/search-params";
import { isUnfiltered, matchSlotPosition, type SlotCriteria } from "@/lib/slot-search";
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
      <PageHeader title="検索" lead="作品・放送・放送枠の検索（初期表示は今期の作品）" />
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
  const sort: TitleSort = sortParam && Object.hasOwn(SORT_LABELS, sortParam) ? sortParam : query ? "first" : "position";
  const page = parsePage(single(params, "page"));
  const href = (overrides: Record<string, string | null>) => buildHref(PATH, current, overrides);

  let channels;
  let covered: number[];
  try {
    [channels, covered] = await Promise.all([getTrackedChannels(), getCoveredSeasonOrdinals()]);
  } catch {
    return <Notice tone="danger" title="検索できませんでした">時間をおいて再読み込みしてください。</Notice>;
  }

  const filter = {
    season: filters.season,
    region: filters.region,
    network: filters.network,
    channelSlug: filters.channel,
    weekday: filters.weekday,
    band: filters.band,
    length: filters.length,
    rerun: filters.rerun,
    allKinds: filters.allKinds
  };
  const channelName = (id: number) => channels.find((c) => c.id === id)?.shortName ?? "";

  const chips: { label: string; removeHref: string }[] = [];
  if (query) chips.push({ label: `「${query}」`, removeHref: href({ q: null }) });
  if (single(params, "season")) chips.push({ label: filters.season ? formatSeason(filters.season) : "全期間", removeHref: href({ season: null }) });
  if (filters.region) chips.push({ label: REGIONS[filters.region].label, removeHref: href({ region: null }) });
  if (filters.network) chips.push({ label: NETWORKS[filters.network].label, removeHref: href({ network: null }) });
  if (filters.channel) chips.push({ label: channels.find((c) => c.slug === filters.channel)?.name ?? filters.channel, removeHref: href({ channel: null }) });
  if (filters.weekday !== null) chips.push({ label: `${WEEKDAY_LABELS[filters.weekday]}曜`, removeHref: href({ day: null }) });
  if (filters.band) chips.push({ label: TIME_BANDS[filters.band].label, removeHref: href({ time: null }) });
  if (filters.length) chips.push({ label: LENGTHS[filters.length].label, removeHref: href({ length: null }) });
  if (filters.rerun !== "exclude") chips.push({ label: filters.rerun === "include" ? "再放送を含む" : "再放送のみ", removeHref: href({ rerun: null }) });
  if (filters.allKinds) chips.push({ label: "関連番組も含む", removeHref: href({ kind: null }) });
  const advancedOpen = Boolean(
    single(params, "season") || filters.region || filters.network || filters.channel || filters.weekday !== null || filters.band || filters.length || filters.rerun !== "exclude" || filters.allKinds
  );

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
            <SelectField
              label="系列"
              name="network"
              value={filters.network ?? ""}
              autoSubmit={false}
              options={[{ value: "", label: "すべて" }, ...NETWORK_KEYS.map((key) => ({ value: key, label: NETWORKS[key].label }))]}
            />
            <SelectField label="放送局" name="channel" value={filters.channel ?? ""} autoSubmit={false} options={[{ value: "", label: "すべて" }, ...channels.map((c) => ({ value: c.slug, label: c.name }))]} />
            <SelectField
              label="曜日（アニメ時刻）"
              name="day"
              value={filters.weekday !== null ? WEEKDAY_KEYS[filters.weekday]! : ""}
              autoSubmit={false}
              options={[{ value: "", label: "すべて" }, ...WEEKDAY_LABELS.map((label, index) => ({ value: WEEKDAY_KEYS[index]!, label: `${label}曜` }))]}
            />
            <SelectField label="時間帯（開始時刻）" name="time" value={filters.band ?? ""} autoSubmit={false} options={TIME_BAND_OPTIONS} />
            <SelectField label="放送時間（長さ）" name="length" value={filters.length ?? ""} autoSubmit={false} options={LENGTH_OPTIONS} />
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
        <SlotResults
          query={query}
          criteria={{
            season: single(params, "season") ? (filters.season ? seasonOrdinal(filters.season) : "any") : "latest",
            channelSlugs: filters.channel ? new Set([filters.channel]) : channelSlugsFor(filters.region, filters.network),
            weekday: filters.weekday,
            band: filters.band
          }}
          seasonLabel={filters.season ? formatSeason(filters.season) : null}
          ignoresAiringOnly={filters.rerun !== "exclude" || filters.allKinds || filters.length !== null}
        />
      )}
    </div>
  );
}

type Href = (overrides: Record<string, string | null>) => string;
type Filter = Parameters<typeof searchTitles>[0];

async function TitleResults({ filter, query, sort, page, href, channelName }: { filter: Filter; query: string; sort: TitleSort; page: number; href: Href; channelName: (id: number) => string }) {
  if (page > MAX_SEARCH_PAGE) return <BeyondLimit href={href} />;
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
      {result.rows.length === 0 && result.total > 0 ? (
        <OutOfRange totalPages={totalPages} href={href} />
      ) : result.rows.length === 0 ? (
        <EmptyState title="該当する作品はありません" icon="search">
          条件を減らすか、クールを「全期間」にしてください。
        </EmptyState>
      ) : (
        <ol role="list" className={styles.titleList}>
          {result.rows.map((row) => (
            <li key={row.id} className={styles.titleRow}>
              <span className={styles.titlePosition}>
                <WeekdayChip weekday={row.modalWeekday} suffix="" />
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
      <ResultPages page={page} totalPages={totalPages} href={href} />
    </section>
  );
}

async function AiringResults({ filter, query, order, page, href, channelName }: { filter: Filter; query: string; order: "asc" | "desc"; page: number; href: Href; channelName: (id: number) => string }) {
  if (page > MAX_SEARCH_PAGE) return <BeyondLimit href={href} />;
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
      {result.rows.length === 0 && result.total > 0 ? (
        <OutOfRange totalPages={totalPages} href={href} />
      ) : result.rows.length === 0 ? (
        <EmptyState title="該当する放送はありません" icon="search">
          条件を変えてください。
        </EmptyState>
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="放送の検索結果" tabIndex={0}>
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
      <ResultPages page={page} totalPages={totalPages} href={href} />
    </section>
  );
}

async function SlotResults({ query, criteria, seasonLabel, ignoresAiringOnly }: { query: string; criteria: SlotCriteria; seasonLabel: string | null; ignoresAiringOnly: boolean }) {
  const slots = await listSlots();
  const normalized = query.toLowerCase();
  const unfiltered = isUnfiltered(criteria);
  const matched = slots.flatMap((slot) => {
    if (query && !slot.name.toLowerCase().includes(normalized)) return [];
    const position = unfiltered ? (slot.positions[0] ?? null) : matchSlotPosition(slot.positions, criteria);
    return unfiltered || position ? [{ slot, position }] : [];
  });
  const basis =
    criteria.season === "latest"
      ? "放送局・曜日・時間帯は各枠の最新クールの放送位置で判定しています。"
      : criteria.season === "any"
        ? "いずれかのクールで条件に一致した枠です（表示は一致した最新のクールの位置）。"
        : `${seasonLabel}に放送があった枠を、そのクールの放送位置で判定しています。`;
  return (
    <section aria-labelledby="results-title" className={styles.results}>
      <div className={styles.resultsHead}>
        <h2 id="results-title" className={styles.count}>
          <span className="mono">{matched.length}</span> 枠
        </h2>
        <p className={styles.resultsNote}>
          {unfiltered ? "放送枠はクール・地域・放送局・曜日・時間帯でも絞り込めます。" : basis}
          {ignoresAiringOnly ? "再放送・番組の種類・放送時間の条件は放送枠には適用されません。" : null}
        </p>
      </div>
      {matched.length === 0 ? (
        <EmptyState title="該当する放送枠はありません" icon="search" />
      ) : (
        <ul role="list" className={styles.slotList}>
          {matched.slice(0, 120).map(({ slot, position }) => (
            <li key={slot.slug} className={styles.slotRow}>
              <SlotKindBadge kind={slot.kind} />
              <Link href={`/slots/${encodeURIComponent(slot.slug)}`} className={styles.tableTitle}>
                {slot.name}
              </Link>
              <span className="muted">
                {position ? <span className="mono">{`${WEEKDAY_LABELS[position.weekday]} ${formatAnimeMinute(position.minute)}`}</span> : null}
                {position && criteria.season === "any" ? `（${formatSeasonOrdinal(position.seasonOrdinal)}）` : null}
                {position ? "・" : null}
                {slot.titleCount}作品・{slot.seasonCount}クール
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Page links up to MAX_SEARCH_PAGE, with a note when the results go on beyond it. */
function ResultPages({ page, totalPages, href }: { page: number; totalPages: number; href: Href }) {
  const shown = Math.min(totalPages, MAX_SEARCH_PAGE);
  return (
    <>
      <Pagination page={page} totalPages={shown} hrefFor={(p) => href({ page: p === 1 ? null : String(p) })} />
      {totalPages > MAX_SEARCH_PAGE ? (
        <p className={styles.resultsNote}>
          表示は{MAX_SEARCH_PAGE}ページ（{MAX_SEARCH_PAGE * PAGE_SIZE}件）までです。その先は条件を絞り込むか、並び順を変えてください。
        </p>
      ) : null}
    </>
  );
}

function BeyondLimit({ href }: { href: Href }) {
  return (
    <section aria-labelledby="results-title" className={styles.results}>
      <h2 id="results-title" className="visually-hidden">
        検索結果
      </h2>
      <EmptyState title={`${MAX_SEARCH_PAGE + 1}ページ目以降は表示していません`} icon="search">
        条件を絞り込むか、並び順を変えてください。
        <Link href={href({ page: null })} className="inline-link">
          1ページ目へ
        </Link>
      </EmptyState>
    </section>
  );
}

function OutOfRange({ totalPages, href }: { totalPages: number; href: Href }) {
  return (
    <EmptyState title="このページには結果がありません" icon="search">
      結果は{Math.min(totalPages, MAX_SEARCH_PAGE)}ページまでです。
      <Link href={href({ page: null })} className="inline-link">
        1ページ目へ
      </Link>
    </EmptyState>
  );
}

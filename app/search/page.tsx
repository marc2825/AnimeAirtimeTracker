import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import { quarterLabels, weekdayLabels } from "@/lib/labels";
import { formatAnimeSchedule, formatDateTimeJst, formatSeason } from "@/lib/formatters";
import { filterTitles, getSearchOptions, type SearchFilters } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "検索一覧 | 深夜アニメ放送枠観測所"
};

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const filters: SearchFilters = {
    q: readSingle(params.q),
    year: readSingle(params.year),
    quarter: readSingle(params.quarter),
    weekday: readSingle(params.weekday),
    region: readSingle(params.region),
    channel: readSingle(params.channel),
    slot: readSingle(params.slot),
    genre: readSingle(params.genre),
    company: readSingle(params.company),
    timeBand: readSingle(params.timeBand),
    sort: readSingle(params.sort) || "latest"
  };
  const options = getSearchOptions();
  const results = filterTitles(filters);
  const activeFilters = Object.entries(filters).filter(([, value]) => value);

  return (
    <div className="page-stack">
      <section className="hero">
        <Badge tone="warm">検索・絞り込み</Badge>
        <h1>作品一覧を放送条件から絞り込む</h1>
        <p>
          URL クエリに条件を保持する GET フォームで構成しています。検索条件をそのまま共有でき、
          放送枠・地域・曜日の組み合わせを追いやすい作りです。
        </p>
      </section>

      <div className="search-layout">
        <aside className="section-card">
          <div className="section-card-header">
            <h2>検索条件</h2>
            <p>グループ間はANDで絞り込む想定です。</p>
          </div>
          <form className="filter-form" method="get">
            <label>
              フリーワード
              <input type="text" name="q" defaultValue={filters.q} placeholder="作品名・短縮名・枠名" />
            </label>
            <label>
              年
              <select name="year" defaultValue={filters.year}>
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
              <select name="quarter" defaultValue={filters.quarter}>
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
              <select name="weekday" defaultValue={filters.weekday}>
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
              <select name="timeBand" defaultValue={filters.timeBand}>
                <option value="">すべて</option>
                <option value="23">23時台</option>
                <option value="24">24時台</option>
                <option value="25">25時台</option>
                <option value="26">26時以降</option>
              </select>
            </label>
            <label>
              地域
              <select name="region" defaultValue={filters.region}>
                <option value="">すべて</option>
                {options.regions.map((region) => (
                  <option key={region.id} value={region.slug}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              放送局
              <select name="channel" defaultValue={filters.channel}>
                <option value="">すべて</option>
                {options.channels.map((channel) => (
                  <option key={channel.id} value={channel.slug}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              放送枠
              <select name="slot" defaultValue={filters.slot}>
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
              <select name="genre" defaultValue={filters.genre}>
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
              <select name="company" defaultValue={filters.company}>
                <option value="">すべて</option>
                {options.companies.map((company) => (
                  <option key={company.id} value={company.slug}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              並び順
              <select name="sort" defaultValue={filters.sort}>
                <option value="latest">新しいクール順</option>
                <option value="title">タイトル順</option>
                <option value="airtime">初回放送日時順</option>
                <option value="slot">枠順</option>
              </select>
            </label>
            <div className="filter-actions">
              <button type="submit" className="filter-submit">
                絞り込む
              </button>
              <Link href="/search" className="button-link button-link-secondary filter-reset">
                条件をリセット
              </Link>
            </div>
          </form>
        </aside>

        <div className="page-stack">
          <SectionCard
            title={`検索結果 ${results.length}件`}
            description="作品本数としてカウントしています。放送件数は詳細ページや統計ダッシュボードで確認できます。"
          >
            {activeFilters.length > 0 ? (
              <div className="chips">
                {activeFilters.map(([key, value]) => (
                  <Badge key={key}>{`${key}: ${value}`}</Badge>
                ))}
              </div>
            ) : (
              <p className="muted">現在は絞り込みなしで全件表示しています。</p>
            )}
          </SectionCard>

          <SectionCard title="作品一覧" description="作品詳細と放送枠詳細へ遷移できます。">
            {results.length === 0 ? (
              <div className="empty-state">条件に一致する作品がありません。条件をゆるめて再検索してください。</div>
            ) : (
              <div className="table-wrapper">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>作品</th>
                      <th>開始クール</th>
                      <th>初回放送</th>
                      <th>地域・局数</th>
                      <th>放送枠</th>
                      <th>属性</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((entry) => {
                      const uniqueRegions = new Set(entry.airings.map((airing) => airing.region.name)).size;
                      const uniqueChannels = new Set(entry.airings.map((airing) => airing.channel.name)).size;

                      return (
                        <tr key={entry.title.id}>
                          <td>
                            <Link href={`/titles/${entry.title.slug}`} className="result-title inline-link">
                              {entry.title.name}
                            </Link>
                            <span className="subline">
                              {entry.title.shortName ?? "短縮名なし"} / {entry.primaryCompanies[0]?.name ?? "制作会社未設定"}
                            </span>
                          </td>
                          <td>{formatSeason(entry.title.seasonYear, entry.title.seasonQuarter)}</td>
                          <td>
                            {entry.firstAiring ? (
                              <>
                                {formatDateTimeJst(entry.firstAiring.broadcastStartAt)}
                                <span className="subline">
                                  {formatAnimeSchedule(
                                    entry.firstAiring.animeBroadcastDay,
                                    entry.firstAiring.animeBroadcastTimeText
                                  )}
                                </span>
                              </>
                            ) : (
                              "未設定"
                            )}
                          </td>
                          <td>
                            {uniqueRegions}地域 / {uniqueChannels}局
                          </td>
                          <td>
                            {entry.slots.length > 0 ? (
                              entry.slots.map((slot) => (
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
                              {entry.title.isSequel ? <Badge tone="accent">続編</Badge> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

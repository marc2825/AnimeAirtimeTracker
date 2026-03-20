import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { SectionCard } from "@/components/SectionCard";
import { getDashboardData, getSearchOptions, type DashboardDurationRow } from "@/lib/catalog";
import { buildDashboardHref, readDashboardState, type DashboardState } from "@/lib/dashboard";
import { durationLabels, quarterLabels, weekdayLabels } from "@/lib/labels";
import { formatPercent } from "@/lib/formatters";
import { animeWeekdays } from "@/lib/types";

export const metadata: Metadata = {
  title: "統計ダッシュボード | 深夜アニメ放送枠観測所"
};

type StatsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ChartRow = {
  key: string;
  label: string;
  value: string;
  width: number;
  meta?: string;
  tone?: "accent" | "warm" | "neutral";
};

const timeBandLabels: Record<string, string> = {
  "23": "23時台",
  "24": "24時台",
  "25": "25時台",
  "26": "26時台以降"
};

function getBarWidth(width: number): string {
  if (width <= 0) {
    return "0%";
  }

  return `${Math.max(width, 8)}%`;
}

function findLabel(values: Array<{ slug: string; name: string }>, target: string): string {
  return values.find((item) => item.slug === target)?.name ?? target;
}

function getActiveFilterChips(
  state: DashboardState,
  options: ReturnType<typeof getSearchOptions>
): Array<{ label: string; value: string; href: string }> {
  const chips: Array<{ label: string; value: string; href: string }> = [];

  if (state.year) {
    chips.push({
      label: "年",
      value: `${state.year}年`,
      href: buildDashboardHref("/stats", state, { year: "" })
    });
  }

  if (state.quarter) {
    chips.push({
      label: "クール",
      value: quarterLabels[state.quarter as keyof typeof quarterLabels] ?? state.quarter,
      href: buildDashboardHref("/stats", state, { quarter: "" })
    });
  }

  if (state.channel) {
    chips.push({
      label: "放送局",
      value: findLabel(options.channels, state.channel),
      href: buildDashboardHref("/stats", state, { channel: "" })
    });
  }

  if (state.slot) {
    chips.push({
      label: "放送枠",
      value: findLabel(options.slots, state.slot),
      href: buildDashboardHref("/stats", state, { slot: "" })
    });
  }

  return chips;
}

function InlineBarList({ items, emptyMessage }: { items: ChartRow[]; emptyMessage: string }) {
  if (items.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="inline-bars">
      {items.map((item) => (
        <article key={item.key} className="inline-bar-card">
          <div className="inline-bar-head">
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </div>
          {item.meta ? <p className="muted">{item.meta}</p> : null}
          <div className="inline-bar-track">
            <div
              className={`inline-bar-fill inline-bar-fill-${item.tone ?? "accent"}`}
              style={{ width: getBarWidth(item.width) }}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function MatrixTable({
  columns,
  rows
}: {
  columns: string[];
  rows: Array<{
    label: string;
    cells: Array<{
      key: string;
      value: number;
    }>;
  }>;
}) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>時刻帯</th>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              {row.cells.map((cell) => (
                <td key={cell.key}>{cell.value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DurationTable({ rows }: { rows: DashboardDurationRow[] }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>尺区分</th>
            <th>作品本数</th>
            <th>構成比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.duration}>
              <td>{durationLabels[row.duration]}</td>
              <td>{row.titleCount}</td>
              <td>{formatPercent(row.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const state = readDashboardState(await searchParams);
  const options = getSearchOptions();
  const dashboard = getDashboardData(state);
  const activeChips = getActiveFilterChips(state, options);

  const weekdayColumns = animeWeekdays.map((weekday) => weekdayLabels[weekday]);
  const weekdayRows = dashboard.weekdayHeatmap.map((row) => ({
    label: timeBandLabels[row.timeBand] ?? `${row.timeBand}時台`,
    cells: animeWeekdays.map((weekday) => ({
      key: `${row.timeBand}-${weekday}`,
      value: row.counts[weekday],
      label: `${weekdayLabels[weekday]} ${timeBandLabels[row.timeBand] ?? row.timeBand}`
    }))
  }));

  const channelColumns = dashboard.channelTimeHeatmap.columns.map((column) => column.label);
  const channelRows = dashboard.channelTimeHeatmap.rows.map((row) => ({
    label: timeBandLabels[row.timeBand] ?? `${row.timeBand}時台`,
    cells: dashboard.channelTimeHeatmap.columns.map((column) => ({
      key: `${row.timeBand}-${column.slug}`,
      value: row.counts[column.slug] ?? 0,
      label: `${column.label} ${timeBandLabels[row.timeBand] ?? row.timeBand}`
    }))
  }));

  const trendPeak = Math.max(...dashboard.quarterTrend.map((row) => row.titleCount), 1);
  const overlapPeak = Math.max(...dashboard.overlapTable.map((row) => row.count), 1);
  const durationBars = dashboard.durationTable
    .filter((row) => row.titleCount > 0)
    .map((row) => ({
      key: row.duration,
      label: durationLabels[row.duration],
      value: `${row.titleCount}本`,
      width: row.share,
      meta: `構成比 ${formatPercent(row.share)}`,
      tone: "warm" as const
    }));
  const trendBars = dashboard.quarterTrend.map((row) => ({
    key: row.seasonKey,
    label: row.label,
    value: `${row.titleCount}本`,
    width: (row.titleCount / trendPeak) * 100,
    meta: `放送 ${row.airingCount}件 / 構成比 ${formatPercent(row.share)}`,
    tone: "accent" as const
  }));
  const overlapBars = dashboard.overlapTable.slice(0, 6).map((row) => ({
    key: `${row.leftSlotSlug}-${row.rightSlotSlug}`,
    label: `${row.leftSlotName} × ${row.rightSlotName}`,
    value: `${row.count}回`,
    width: (row.count / overlapPeak) * 100,
    meta: `${row.seasonCount}クール / ${
      row.topWeekday ? `${weekdayLabels[row.topWeekday]}曜` : "曜日未観測"
    } / ${row.topTimeWindow}`,
    tone: "neutral" as const
  }));

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="badge-row">
          <Badge tone="warm">統計ダッシュボード</Badge>
          {activeChips.length > 0 ? <Badge tone="accent">フィルタ適用中</Badge> : null}
        </div>
        <h1>曜日・時刻・局・地域差を一画面で把握する</h1>
        <p>
          曜日×時刻、局×時刻帯、クール推移、被り、尺区分、地域差を同じ条件で見比べられる形に整えました。
          地域差比較を横並びで保つため、ここでは地域フィルタは置かずに全地域を比較します。
        </p>
        {activeChips.length > 0 ? (
          <div className="chips">
            {activeChips.map((chip) => (
              <Link key={chip.label} href={chip.href}>
                <Badge>{`${chip.label}: ${chip.value} ×`}</Badge>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <SectionCard title="分析フィルタ" description="URL クエリに同期する、ダッシュボード用の絞り込みです。">
        <form method="get" className="results-control-form">
          <label>
            年
            <select name="year" defaultValue={state.year}>
              <option value="">すべて</option>
              {options.years.map((year) => (
                <option key={year} value={String(year)}>
                  {year}年
                </option>
              ))}
            </select>
          </label>

          <label>
            クール
            <select name="quarter" defaultValue={state.quarter}>
              <option value="">すべて</option>
              {options.quarters.map((quarter) => (
                <option key={quarter} value={quarter}>
                  {quarterLabels[quarter]}
                </option>
              ))}
            </select>
          </label>

          <label>
            放送局
            <select name="channel" defaultValue={state.channel}>
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
            <select name="slot" defaultValue={state.slot}>
              <option value="">すべて</option>
              {options.slots.map((slot) => (
                <option key={slot.id} value={slot.slug}>
                  {slot.name}
                </option>
              ))}
            </select>
          </label>

          <div className="filter-actions">
            <button type="submit" className="filter-submit">
              反映
            </button>
            <Link href="/stats" className="button-link filter-reset">
              クリア
            </Link>
          </div>
        </form>
      </SectionCard>

      <div className="summary-cards slot-summary-cards">
        <article className="metric-card">
          <span className="muted">対象作品数</span>
          <strong>{dashboard.summary.titleCount}</strong>
          <p className="muted">条件に一致した作品本数</p>
        </article>
        <article className="metric-card">
          <span className="muted">対象放送件数</span>
          <strong>{dashboard.summary.airingCount}</strong>
          <p className="muted">再放送を除く放送件数</p>
        </article>
        <article className="metric-card">
          <span className="muted">対象放送枠数</span>
          <strong>{dashboard.summary.slotCount}</strong>
          <p className="muted">条件下で観測された放送枠数</p>
        </article>
        <article className="metric-card">
          <span className="muted">接近ペア数</span>
          <strong>{dashboard.summary.overlapPairCount}</strong>
          <p className="muted">被り分析で検出された枠ペア数</p>
        </article>
      </div>

      <div className="grid-two">
        <SectionCard title="曜日 × 時刻ヒートマップ" description="初回放送を、曜日とアニメ文脈時刻帯で集計しています。">
          <div className="page-stack">
            <HeatmapGrid columns={weekdayColumns} rows={weekdayRows} />
            <MatrixTable columns={weekdayColumns} rows={weekdayRows} />
          </div>
        </SectionCard>

        <SectionCard title="局 × 時刻帯ヒートマップ" description="どの局が、どの深夜帯に集まりやすいかを見るための基礎集計です。">
          {channelColumns.length === 0 ? (
            <div className="empty-state">現在の条件では、局×時刻帯を描ける初回放送がありません。</div>
          ) : (
            <div className="page-stack">
              <HeatmapGrid columns={channelColumns} rows={channelRows} />
              <MatrixTable columns={channelColumns} rows={channelRows} />
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid-two">
        <SectionCard title="クール別本数推移" description="条件に一致した作品が、どのクールに集中しているかを見ます。">
          <div className="chart-table-layout">
            <InlineBarList items={trendBars} emptyMessage="現在の条件では、推移を描けるデータがありません。" />
            {dashboard.quarterTrend.length === 0 ? (
              <div className="empty-state">テーブル化できる推移データがありません。</div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>クール</th>
                      <th>作品本数</th>
                      <th>放送件数</th>
                      <th>構成比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.quarterTrend.map((row) => (
                      <tr key={row.seasonKey}>
                        <td>{row.label}</td>
                        <td>{row.titleCount}</td>
                        <td>{row.airingCount}</td>
                        <td>{formatPercent(row.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="尺区分別分布" description="短尺・通常尺・長尺の構成を、作品本数ベースで見ます。">
          <div className="chart-table-layout">
            <InlineBarList items={durationBars} emptyMessage="現在の条件では、尺区分を比較できる作品がありません。" />
            <DurationTable rows={dashboard.durationTable} />
          </div>
        </SectionCard>
      </div>

      <div className="grid-two">
        <SectionCard title="被り分析" description="同一クール・同曜日・30分以内で近接した放送枠ペアを簡易集計しています。">
          <div className="chart-table-layout">
            <InlineBarList items={overlapBars} emptyMessage="現在の条件では、近接放送の枠ペアは見つかっていません。" />
            {dashboard.overlapTable.length === 0 ? (
              <div className="empty-state">表形式で出せる被りデータはありません。</div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>枠ペア</th>
                      <th>近接回数</th>
                      <th>重複クール数</th>
                      <th>中心曜日</th>
                      <th>代表時刻組</th>
                      <th>構成比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.overlapTable.map((row) => (
                      <tr key={`${row.leftSlotSlug}-${row.rightSlotSlug}`}>
                        <td>
                          <Link href={`/slots/${row.leftSlotSlug}`} className="inline-link">
                            {row.leftSlotName}
                          </Link>
                          {" × "}
                          <Link href={`/slots/${row.rightSlotSlug}`} className="inline-link">
                            {row.rightSlotName}
                          </Link>
                        </td>
                        <td>{row.count}</td>
                        <td>{row.seasonCount}</td>
                        <td>{row.topWeekday ? `${weekdayLabels[row.topWeekday]}曜` : "未観測"}</td>
                        <td>{row.topTimeWindow}</td>
                        <td>{formatPercent(row.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="地域差比較の土台UI" description="地域ごとの作品数、放送件数、中心時刻を比較するベースです。">
          <div className="page-stack">
            <div className="grid-three dashboard-region-grid">
              {dashboard.regionTable.map((row) => (
                <article key={row.regionSlug} className="panel dashboard-region-card">
                  <div className="badge-row">
                    <Badge tone="accent">{row.regionName}</Badge>
                    <Badge>{`${row.airingCount}件`}</Badge>
                  </div>
                  <h3>{row.topChannel}</h3>
                  <p className="muted">
                    {row.peakWeekday ? `${weekdayLabels[row.peakWeekday]}曜` : "曜日未観測"} /{" "}
                    {timeBandLabels[row.peakTimeBand] ?? row.peakTimeBand}
                  </p>
                  <div className="dashboard-region-stats">
                    <span>{`作品 ${row.titleCount}本`}</span>
                    <span>{`平均 ${row.averageHour}`}</span>
                    <span>{`放送比 ${formatPercent(row.airingShare)}`}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>地域</th>
                    <th>作品本数</th>
                    <th>放送件数</th>
                    <th>平均アニメ時刻</th>
                    <th>中心局</th>
                    <th>中心曜日</th>
                    <th>中心時刻帯</th>
                    <th>放送比</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.regionTable.map((row) => (
                    <tr key={row.regionSlug}>
                      <td>{row.regionName}</td>
                      <td>{row.titleCount}</td>
                      <td>{row.airingCount}</td>
                      <td>{row.averageHour}</td>
                      <td>{row.topChannel}</td>
                      <td>{row.peakWeekday ? `${weekdayLabels[row.peakWeekday]}曜` : "未観測"}</td>
                      <td>{timeBandLabels[row.peakTimeBand] ?? row.peakTimeBand}</td>
                      <td>{formatPercent(row.airingShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

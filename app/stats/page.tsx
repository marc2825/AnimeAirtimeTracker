import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { SectionCard } from "@/components/SectionCard";
import { weekdayLabels } from "@/lib/labels";
import { formatPercent } from "@/lib/formatters";
import { getDashboardData } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "統計ダッシュボード | 深夜アニメ放送枠観測所"
};

export default function StatsPage() {
  const dashboard = getDashboardData();
  const columns = Object.values(weekdayLabels);
  const rows = dashboard.heatmap.map((row) => ({
    label: `${row.hour}時台`,
    cells: Object.entries(row.counts).map(([weekday, value]) => ({
      key: `${row.hour}-${weekday}`,
      value,
      label: `${weekdayLabels[weekday as keyof typeof weekdayLabels]} ${row.hour}時台`
    }))
  }));

  return (
    <div className="page-stack">
      <section className="hero">
        <Badge tone="warm">統計ダッシュボード</Badge>
        <h1>曜日・時間帯・放送枠の偏りをざっくり掴む</h1>
        <p>
          MVP ではまず、曜日×時刻のヒートマップと、放送枠・地域の集計表を出しています。
          グラフだけでなく表でも見られることを優先した土台です。
        </p>
      </section>

      <SectionCard
        title="曜日 × 時刻ヒートマップ"
        description="カウント対象は、ダミーデータにおける初回放送件数です。"
      >
        <HeatmapGrid columns={columns} rows={rows} />
      </SectionCard>

      <div className="grid-two">
        <SectionCard title="放送枠集計表" description="タイトル本数、放送件数、代表ジャンル、続編率を一覧化しています。">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>放送枠</th>
                  <th>局</th>
                  <th>作品本数</th>
                  <th>放送件数</th>
                  <th>代表ジャンル</th>
                  <th>続編率</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.slotTable.map((row) => (
                  <tr key={row.slotSlug}>
                    <td>{row.slotName}</td>
                    <td>{row.channelName}</td>
                    <td>{row.titleCount}</td>
                    <td>{row.firstRunCount}</td>
                    <td>{row.topGenre}</td>
                    <td>{formatPercent(row.sequelRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="地域別サマリー" description="地域差を見るための最小テーブルです。">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>地域</th>
                  <th>作品本数</th>
                  <th>平均アニメ時刻</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.regionTable.map((row) => (
                  <tr key={row.regionName}>
                    <td>{row.regionName}</td>
                    <td>{row.titleCount}</td>
                    <td>{row.averageHour}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

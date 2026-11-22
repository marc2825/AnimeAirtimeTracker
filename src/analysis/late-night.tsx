import { io } from "next/cache";

import { ChartFrame, ColumnChart, StackedColumnChart } from "@/components/stats/Charts";
import { Notice, Section } from "@/components/ui/primitives";
import { lateNightByYear, lateNightFindings, lateNightSeasons } from "@/domain/analysis/late-night";
import { FIRST_SEASON, REGIONS, SOURCE_COMPLETE_FROM_YEAR, SPARSE_SOURCE_NOTE } from "@/domain/coverage";
import { currentSeason, seasonFromOrdinal, seasonOrdinal } from "@/domain/season";
import { formatPercent, formatSeasonOrdinal } from "@/lib/format";
import { getSeasonTrend, statsFilter } from "@/server/queries/stats";

import styles from "./analysis.module.css";
import type { Analysis } from "./types";

const FILTER = statsFilter({ region: "kanto", rerun: "exclude" });
const QUARTERS = ["冬", "春", "夏", "秋"];
const decimal = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });

async function LateNightContent() {
  await io(); // the current season is per request
  const now = currentSeason();
  let rows;
  try {
    rows = await getSeasonTrend(FILTER, FIRST_SEASON, now);
  } catch {
    return <Notice tone="danger" title="データを読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  const seasons = lateNightSeasons(rows);
  const years = lateNightByYear(seasons);
  const nowOrdinal = seasonOrdinal(now);
  const findings = lateNightFindings(seasons, SOURCE_COMPLETE_FROM_YEAR, nowOrdinal);

  return (
    <>
      <Section id="findings" title="結果" description={`${SOURCE_COMPLETE_FROM_YEAR}年以降の、放送を終えたクールが4つそろった年で比べています`}>
        {findings ? (
          <ul className={styles.findings}>
            <li>
              23時以降に始まるアニメは、{findings.first.year}年はクール平均<strong>{decimal(findings.first.lateAverage)}作品</strong>（全作品の{formatPercent(findings.first.lateShare)}）、{findings.last.year}年は
              <strong>{decimal(findings.last.lateAverage)}作品</strong>（{formatPercent(findings.last.lateShare)}）でした。
            </li>
            <li>
              最も多かったのは<strong>{formatSeasonOrdinal(findings.peak.seasonOrdinal)}</strong>の{findings.peak.late}作品です。
            </li>
            <li>
              23時以降の作品のうち25時以降に始まるものは、{findings.first.year}年の{formatPercent(findings.first.afterOneShare)}から{findings.last.year}年の{formatPercent(findings.last.afterOneShare)}になりました。
            </li>
          </ul>
        ) : (
          <Notice tone="warning" title="比べられる年がまだありません">{SOURCE_COMPLETE_FROM_YEAR}年以降で4クールそろった年が2つ以上必要です。</Notice>
        )}
      </Section>

      <Section id="seasons" title="クール別の本数" description="23時以降に始まる作品を、24時台までと25時以降に分けた本数">
        <ChartFrame
          title="23時以降に始まるアニメ（クール別）"
          scope={`単位: 作品本数。各作品はクールごとに、最も多かった開始時刻で1回だけ数えます。${REGIONS.kanto.label}、再放送を除く。${SPARSE_SOURCE_NOTE}${seasons.some((s) => s.seasonOrdinal === nowOrdinal) ? "最新のクールは放送中で、今後の放送予定を含みます。" : ""}`}
          table={
            <div className={styles.tableWrap} role="region" aria-label="クール別の本数の表" tabIndex={0}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">クール</th>
                    <th scope="col">23–24時台</th>
                    <th scope="col">25時以降</th>
                    <th scope="col">全作品</th>
                    <th scope="col">23時以降の割合</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => (
                    <tr key={s.seasonOrdinal}>
                      <th scope="row">{formatSeasonOrdinal(s.seasonOrdinal)}</th>
                      <td className="mono">{s.late - s.afterOne}</td>
                      <td className="mono">{s.afterOne}</td>
                      <td className="mono">{s.titles}</td>
                      <td className="mono">{formatPercent(s.titles === 0 ? 0 : s.late / s.titles)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          <StackedColumnChart
            unit="作品"
            firstStep={4}
            series={[
              { key: "late", label: "23–24時台" },
              { key: "afterOne", label: "25時以降" }
            ]}
            columns={seasons.map((s, index) => {
              const season = seasonFromOrdinal(s.seasonOrdinal);
              return {
                key: String(s.seasonOrdinal),
                label: QUARTERS[season.quarter - 1]!,
                sublabel: season.quarter === 1 || index === 0 ? String(season.year) : undefined,
                segments: [s.late - s.afterOne, s.afterOne],
                highlight: s.seasonOrdinal === nowOrdinal
              };
            })}
          />
        </ChartFrame>
      </Section>

      <Section id="years" title="年別の割合" description="全作品のうち23時以降に始まる作品の割合（その年のクールの合計で計算）">
        <ChartFrame
          title="23時以降に始まるアニメの割合（年別）"
          scope={`単位: %（その年の各クールの、23時以降の作品本数の合計 ÷ 全作品本数の合計）。クール数が4に満たない年と、放送中のクールを含む年（${now.year}年）は途中までの値です。${SPARSE_SOURCE_NOTE}`}
          table={
            <div className={styles.tableWrap} role="region" aria-label="年別の表" tabIndex={0}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">年</th>
                    <th scope="col">クール数</th>
                    <th scope="col">23時以降（クール平均）</th>
                    <th scope="col">23時以降の割合</th>
                    <th scope="col">うち25時以降</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((year) => (
                    <tr key={year.year}>
                      <th scope="row">{year.year}年</th>
                      <td className="mono">{year.seasons}</td>
                      <td className="mono">{decimal(year.lateAverage)}</td>
                      <td className="mono">{formatPercent(year.lateShare)}</td>
                      <td className="mono">{formatPercent(year.afterOneShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          <ColumnChart
            unit="%"
            label="年別のグラフ（左が古く、右が新しい）"
            columns={years.map((year) => ({
              key: String(year.year),
              // Every fifth year in full, the others by their last two digits.
              label: year.year % 5 === 0 ? String(year.year) : String(year.year).slice(2),
              value: Math.round(year.lateShare * 100)
            }))}
          />
        </ChartFrame>
      </Section>
    </>
  );
}

export const lateNight: Analysis = {
  meta: {
    slug: "late-night",
    title: "深夜アニメの長期的な変遷",
    summary: "23時以降に始まるアニメの本数と割合は、2000年代からどう変わったか（関東地上波）",
    scope: `${REGIONS.kanto.label}（${REGIONS.kanto.description}）、${FIRST_SEASON.year}年冬クール以降、アニメカテゴリ、再放送を除く`,
    unit: "作品本数（各作品をクールごとに1回、最も多かった開始時刻で数える）と、その割合",
    definitions: [
      { term: "深夜アニメ", text: "そのクールで最も多かった開始時刻が23:00以降（アニメ時刻で29:00まで）の作品。統計ページの「時間帯別の推移」と同じ規則です。" },
      { term: "25時以降", text: "最も多かった開始時刻が25:00（翌1:00）以降の作品。" },
      { term: "比べる期間", text: `出典の登録がそろう${SOURCE_COMPLETE_FROM_YEAR}年以降で、放送を終えたクールが4つそろった最初の年と最後の年。放送中のクールは予定を含むため、結果には使いません。` }
    ],
    limits: [
      SPARSE_SOURCE_NOTE,
      "関東地上波だけの集計です。BS・CS・関西の局だけで放送された作品は含みません。",
      "開始時刻は各作品のそのクールの最頻値です。途中で時刻が変わった作品も、どちらか一方の時間帯に数えます。"
    ],
    reproduce: [
      { label: "統計: 時間帯別の推移（関東地上波・再放送を除く）", href: "/stats?region=kanto&rerun=exclude#bands" },
      { label: "統計: 深夜アニメ 23–29時に絞った分布", href: "/stats?region=kanto&rerun=exclude&time=latenight" }
    ],
    revisedAt: "2026-11-22"
  },
  Content: LateNightContent
};

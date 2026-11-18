import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { BarList, ChartFrame, ColumnChart, ConcurrencyStrip, HeatmapTable, WeekdayHourHeatmap } from "@/components/stats/Charts";
import { SegmentedLinks, SelectField } from "@/components/ui/controls";
import { FilterForm } from "@/components/ui/FilterForm";
import { EmptyState, Notice, PageHeader, Section, SkeletonBlock, StatGrid, StatTile } from "@/components/ui/primitives";
import { REGIONS, parseRegionKey, type RegionKey } from "@/domain/coverage";
import { currentSeason, formatSeason, parseSeasonId, seasonDateRange, seasonFromOrdinal, seasonId, seasonOrdinal, type Season } from "@/domain/season";
import { DELAY_BUCKETS, type CountUnit } from "@/domain/stats";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import { formatDateJa, formatDelay, formatNumber, formatPercent, formatSeasonOrdinal } from "@/lib/format";
import { buildHref, flattenParams, parseRerunMode, single, type RawSearchParams, type RerunMode } from "@/lib/search-params";
import { getRegionalDelay, getSeasonStats, getSeasonTrend, regionChannelNames } from "@/server/queries/stats";
import { getCoveredSeasonOrdinals, getSeasonCoverage } from "@/server/queries/status";

import styles from "./stats.module.css";

export const metadata: Metadata = {
  title: "編成統計",
  description: "アニメ放送編成の統計。曜日×時間帯の分布、同時放送数、放送局別の本数、クール別推移、関東と関西の放送時差を、集計単位と対象範囲を明示して示します。",
  alternates: { canonical: "/stats" }
};

const PATH = "/stats";
const STAT_REGIONS: RegionKey[] = ["kanto", "kansai", "bs", "cs"];

export default function StatsPage({ searchParams }: PageProps<"/stats">) {
  return (
    <div className="container">
      <PageHeader
        kicker="Programming statistics"
        title="編成統計"
        lead="アニメがどの曜日・時間帯・局に集まっているか。すべての図に集計単位・対象期間・対象局・再放送の扱いを記載しています。"
      />
      <Suspense fallback={<SkeletonBlock rows={8} label="統計を集計中" />}>
        <StatsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function unitLabel(unit: CountUnit) {
  return unit === "titles" ? "作品" : "件";
}

function rerunLabel(rerun: RerunMode) {
  return rerun === "exclude" ? "再放送を除く（出典の「再」フラグ＋放送終了から6か月超の推定）" : rerun === "only" ? "再放送のみ" : "再放送を含む";
}

async function StatsContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  await io();
  const current = flattenParams(params);
  let covered: number[];
  try {
    covered = await getCoveredSeasonOrdinals();
  } catch {
    return <Notice tone="danger" title="統計を読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  if (covered.length === 0) {
    return <EmptyState title="集計できるデータがまだありません">データ取得後に表示されます。</EmptyState>;
  }
  const now = currentSeason();
  const latestCovered = seasonFromOrdinal(Math.min(covered.at(-1)!, seasonOrdinal(now)));
  const season: Season = parseSeasonId(single(params, "season")) ?? latestCovered;
  const region: RegionKey = parseRegionKey(single(params, "region")) ?? "kanto";
  const unit: CountUnit = single(params, "unit") === "broadcasts" ? "broadcasts" : "titles";
  const rerun = parseRerunMode(single(params, "rerun"), "exclude");
  const href = (overrides: Record<string, string | null>) => buildHref(PATH, current, overrides);

  const [stats, coverage, trend, delay] = await Promise.all([
    getSeasonStats({ season, region, unit, rerun }),
    getSeasonCoverage(season),
    getSeasonTrend(region, rerun, seasonFromOrdinal(covered[0]!), latestCovered),
    getRegionalDelay(season)
  ]);

  const range = seasonDateRange(season);
  const isCurrent = seasonOrdinal(season) === seasonOrdinal(now);
  const scopeText = `${formatSeason(season)}（${range.first.replaceAll("-", "/")}〜${range.last.replaceAll("-", "/")}）・${REGIONS[region].label}（${regionChannelNames(region)}）・アニメカテゴリ・${rerunLabel(rerun)}`;

  // Takeaways computed from the data — never hand-written.
  let peakCell = { weekday: 0, hour: 0, value: 0 };
  stats.heatmap.cells.forEach((row, weekday) =>
    row.forEach((value, index) => {
      if (value > peakCell.value) peakCell = { weekday, hour: index + 5, value };
    })
  );
  const lateTitles = stats.heatmap.cells.reduce((sum, row) => sum + row.slice(24 - 5).reduce((a, b) => a + b, 0), 0);
  const trendRow = trend.find((row) => row.seasonOrdinal === seasonOrdinal(season));
  const topChannel = stats.byChannel[0];
  const concurrencyPeak = stats.concurrency.peak;
  const delayTotal = delay.compared.length;

  return (
    <div className={styles.layout}>
      <div className={styles.controls}>
        <FilterForm action={PATH} className={styles.filterForm} label="集計条件">
          <SelectField
            label="クール"
            name="season"
            value={seasonId(season)}
            options={[...covered]
              .filter((ordinal) => ordinal <= seasonOrdinal(now) + 1)
              .reverse()
              .map((ordinal) => ({ value: seasonId(seasonFromOrdinal(ordinal)), label: formatSeasonOrdinal(ordinal) }))}
          />
          <input type="hidden" name="region" value={region === "kanto" ? "" : region} />
          <input type="hidden" name="unit" value={unit === "titles" ? "" : unit} />
          <SelectField
            label="再放送"
            name="rerun"
            value={rerun === "exclude" ? "" : rerun}
            options={[
              { value: "", label: "除く" },
              { value: "include", label: "含める" },
              { value: "only", label: "再放送のみ" }
            ]}
          />
          <noscript>
            <button type="submit">集計</button>
          </noscript>
        </FilterForm>
        <SegmentedLinks label="対象地域・媒体" options={STAT_REGIONS.map((key) => ({ href: href({ region: key === "kanto" ? null : key }), label: REGIONS[key].short, active: key === region }))} />
        <SegmentedLinks
          label="集計単位"
          options={[
            { href: href({ unit: null }), label: "作品本数", active: unit === "titles" },
            { href: href({ unit: "broadcasts" }), label: "放送件数", active: unit === "broadcasts" }
          ]}
        />
      </div>

      <p className={styles.scopeLine}>
        <strong>集計対象</strong> {scopeText}
      </p>
      {coverage.fraction < 0.999 || isCurrent ? (
        <Notice tone="warning" title={isCurrent ? "放送中のクールです" : "取得期間が一部欠けています"}>
          {isCurrent ? <p>今後の放送は予定として含まれます（出典は1週間以上先の予定に誤りが多いと案内しています）。</p> : null}
          <p>
            このクールの取得済み期間: {formatPercent(coverage.fraction)}
            {coverage.coveredUntil ? `（${formatDateJa(coverage.coveredUntil)}まで）` : ""}
          </p>
        </Notice>
      ) : null}

      <StatGrid>
        <StatTile label="作品本数" value={formatNumber(stats.titleCount)} unit="作品" hint="対象範囲で1回以上放送されたタイトル数" />
        <StatTile label="放送件数" value={formatNumber(stats.airingCount)} unit="件" hint="各話の放送1回を1件として数えた値" />
        <StatTile
          label="最大同時放送数"
          value={concurrencyPeak?.count ?? 0}
          unit="本"
          hint={concurrencyPeak ? `${WEEKDAY_LABELS[concurrencyPeak.weekday]}曜 ${formatAnimeMinute(concurrencyPeak.minute)}台（定時放送の重なり）` : "—"}
        />
        <StatTile
          label="24時以降開始の割合"
          value={trendRow ? formatPercent(trendRow.lateNightShare) : "—"}
          hint="作品ごとの最頻開始時刻が24:00以降の割合"
        />
      </StatGrid>

      <Section id="heatmap" title="曜日×時間帯の分布" description="どの曜日のどの時間帯にアニメが集中しているか。">
        <ChartFrame
          title={`曜日×時間帯（${unit === "titles" ? "作品本数" : "放送件数"}）`}
          takeaway={
            peakCell.value > 0 ? (
              <>
                最も多いのは<strong>
                  {WEEKDAY_LABELS[peakCell.weekday]}曜{peakCell.hour}時台
                </strong>
                （{peakCell.value}
                {unitLabel(unit)}）。24時以降の時間帯に全体の{formatPercent(lateTitles / Math.max(1, stats.heatmap.cells.flat().reduce((a, b) => a + b, 0)))}が集まっています。
              </>
            ) : (
              "該当データがありません。"
            )
          }
          scope={
            unit === "titles"
              ? "単位: 作品本数。各作品は放送が始まった曜日・時台ごとに1回数えます（時刻が変わった作品は複数のセルに数えます）。時刻はアニメ時刻（5時切替）。"
              : "単位: 放送件数。各話の放送1回を1件として数えます。時刻はアニメ時刻（5時切替）。"
          }
          table={<HeatmapTable cells={stats.heatmap.cells} unitLabel={unitLabel(unit)} />}
        >
          <WeekdayHourHeatmap cells={stats.heatmap.cells} max={stats.heatmap.max} unitLabel={unitLabel(unit)} />
        </ChartFrame>
      </Section>

      <div className={styles.twoColumn}>
        <Section id="concurrency" title="同時放送の密度" description="同じ時刻に何本の新作が重なっていたか（18時〜29時）。">
          <ChartFrame
            title="15分ごとの同時放送数"
            takeaway={concurrencyPeak ? `ピークは${WEEKDAY_LABELS[concurrencyPeak.weekday]}曜${formatAnimeMinute(concurrencyPeak.minute)}からの15分で、${concurrencyPeak.count}本が重なっていました。` : "重なりはありません。"}
            scope={`単位: 本（作品の定時放送位置）。各作品の最頻の曜日・開始時刻・尺を[開始, 終了)の区間として、15分ごとに重なる本数を数えます。同じ作品が複数局で同時刻に放送される場合は局ごとに数えます。対象: 定時放送 ${stats.positionCount}位置。`}
          >
            <ConcurrencyStrip counts={stats.concurrency.counts} fromMinute={stats.concurrency.fromMinute} bucketMinutes={stats.concurrency.bucketMinutes} />
          </ChartFrame>
        </Section>

        <Section id="channels" title="放送局別" description="局ごとのアニメの本数。">
          <ChartFrame
            title="放送局別の作品本数"
            takeaway={topChannel ? `最も多いのは${topChannel.channel.name}（${topChannel.titles}作品・${topChannel.broadcasts}件）。` : "該当データがありません。"}
            scope="単位: 作品本数（棒）と放送件数（数値の下）。同じ作品が複数局で放送された場合は各局で数えます。"
          >
            <BarList
              unit="作品"
              rows={stats.byChannel.map((row, index) => ({
                key: row.channel.slug,
                label: row.channel.name,
                value: row.titles,
                secondary: `${row.broadcasts}件`,
                highlight: index === 0
              }))}
            />
          </ChartFrame>
        </Section>
      </div>

      <Section id="trend" title="クール別の推移" description={`${REGIONS[region].label}での作品本数の推移。選択中のクールを強調しています。`}>
        <ChartFrame
          title="クール別の作品本数"
          takeaway={
            trend.length > 1
              ? `取得済みの${trend.length}クールでは、最多が${formatSeasonOrdinal(trend.reduce((a, b) => (b.titles > a.titles ? b : a)).seasonOrdinal)}（${Math.max(...trend.map((row) => row.titles))}作品）、最少が${formatSeasonOrdinal(trend.reduce((a, b) => (b.titles < a.titles ? b : a)).seasonOrdinal)}（${Math.min(...trend.map((row) => row.titles))}作品）。`
              : undefined
          }
          scope={`単位: 作品本数（そのクールに1回以上放送された作品）。新規作品は取得期間内で初めて放送されたクールに数えます。対象期間は取得済みのクールのみで、${formatSeasonOrdinal(trend[0]?.seasonOrdinal ?? seasonOrdinal(season))}より前は未取得です。${rerunLabel(rerun)}。`}
          table={
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">クール</th>
                    <th scope="col">作品本数</th>
                    <th scope="col">新規作品</th>
                    <th scope="col">放送件数</th>
                    <th scope="col">24時以降開始</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((row) => (
                    <tr key={row.seasonOrdinal}>
                      <th scope="row">{formatSeasonOrdinal(row.seasonOrdinal)}</th>
                      <td className="mono">{row.titles}</td>
                      <td className="mono">{row.newTitles}</td>
                      <td className="mono">{formatNumber(row.broadcasts)}</td>
                      <td className="mono">{formatPercent(row.lateNightShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          <ColumnChart
            unit="作品"
            columns={trend.map((row) => {
              const s = seasonFromOrdinal(row.seasonOrdinal);
              return {
                key: String(row.seasonOrdinal),
                label: ["冬", "春", "夏", "秋"][s.quarter - 1]!,
                sublabel: s.quarter === 1 || row === trend[0] ? String(s.year) : undefined,
                value: row.titles,
                highlight: row.seasonOrdinal === seasonOrdinal(season)
              };
            })}
          />
        </ChartFrame>
      </Section>

      <Section id="regional" title="関東と関西の放送時差" description={`${formatSeason(season)}に関東・関西の両方で放送された作品について、関西での放送が関東よりどれだけ遅いか。`}>
        <ChartFrame
          title="関西の放送の遅れ（作品ごとの中央値）"
          takeaway={
            delayTotal > 0
              ? `比較できた${delayTotal}作品のうち、${delay.buckets["same-time"]}作品がほぼ同時、${delay.buckets["within-week"] + delay.buckets["over-week"]}作品が1日以上遅れて放送されました。関東のみ${delay.kantoOnly}作品、関西のみ${delay.kansaiOnly}作品。`
              : "比較できる作品がありません。"
          }
          scope="同じ話数の各地域での最初の放送どうしを比べ、作品ごとに中央値をとります。NHK（両地域で同時に受信可能）と話数のない放送は比較から除きます。再放送は除きます。"
        >
          <BarList
            unit="作品"
            max={Math.max(1, ...Object.values(delay.buckets))}
            rows={DELAY_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, value: delay.buckets[bucket.key], highlight: bucket.key === "same-time" }))}
          />
          {delay.examples.length > 0 ? (
            <div className={styles.examples}>
              <p className={styles.examplesTitle}>遅れが大きい作品</p>
              <ul role="list">
                {delay.examples.map((example) => (
                  <li key={example.titleId}>
                    <Link href={`/titles/${example.slug}`}>{example.name}</Link>
                    <span className="mono">{formatDelay(example.delayMinutes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </ChartFrame>
      </Section>

      <p className={styles.footnote}>
        定義と限界の詳細は<Link href="/about#method" className="inline-link">方法論</Link>を参照してください。出典の登録漏れ・再放送フラグの付け忘れは集計に影響します。
      </p>
    </div>
  );
}

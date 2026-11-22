import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { BarList, ChartFrame, HeatmapTable, PairColumnChart, WeekdayHourHeatmap } from "@/components/stats/Charts";
import { SelectField } from "@/components/ui/controls";
import { FilterForm } from "@/components/ui/FilterForm";
import { EmptyState, Notice, PageHeader, Section, SkeletonBlock } from "@/components/ui/primitives";
import { DEFAULT_SIDES, delayBucketLabels, parseCompareSide, sideLabel, sideParam, type CompareSide } from "@/domain/compare";
import { REGION_KEYS, REGIONS, SOURCE_COMPLETE_FROM_YEAR, SPARSE_SOURCE_NOTE, TRACKED_CHANNELS } from "@/domain/coverage";
import { currentSeason, formatSeason, parseSeasonId, seasonDateRange, seasonFromOrdinal, seasonId, seasonOrdinal, type Season } from "@/domain/season";
import { WEEKDAY_LABELS } from "@/domain/time";
import type { ChartSpec } from "@/lib/chart-export";
import { formatDateTime, formatDelay, formatPercent, formatSeasonOrdinal } from "@/lib/format";
import { buildHref, single, type RawSearchParams } from "@/lib/search-params";
import { absoluteUrl } from "@/lib/site";
import { getPairComparison, sideFilter } from "@/server/queries/compare";
import { getSeasonStats, getSeasonTrend } from "@/server/queries/stats";
import { getCoveredSeasonOrdinals, getDatasetStatus } from "@/server/queries/status";

import styles from "../compare.module.css";

const PATH = "/compare/channels";

export const metadata: Metadata = {
  title: "地域・放送局を比べる",
  description: "関東と関西、TOKYO MX と BS11 など、2つの地域・放送局のアニメ編成を比べる。作品本数の推移、曜日×時間帯、共通の作品と、同じ話数の放送時差。",
  alternates: { canonical: PATH }
};

const SIDE_OPTIONS = [
  ...REGION_KEYS.map((key) => ({ value: key, label: `${REGIONS[key].label}（地域）` })),
  ...TRACKED_CHANNELS.map((channel) => ({ value: channel.slug, label: channel.name }))
];

export default function CompareChannelsPage({ searchParams }: PageProps<"/compare/channels">) {
  return (
    <div className="container">
      <PageHeader title="地域・放送局を比べる" lead="2つの地域・放送局のアニメ編成（再放送を除く）" />
      <Suspense fallback={<SkeletonBlock rows={10} label="比較を計算中" />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function lateShare(row: { titles: number; bandTitles: Record<string, number> } | undefined): number | null {
  if (!row || row.titles === 0) return null;
  return ((row.bandTitles.late ?? 0) + (row.bandTitles.latelate ?? 0)) / row.titles;
}

function peakOf(cells: number[][]): { weekday: number; hour: number; value: number } | null {
  let peak: { weekday: number; hour: number; value: number } | null = null;
  cells.forEach((row, weekday) => row.forEach((value, index) => {
    if (value > (peak?.value ?? 0)) peak = { weekday, hour: index + 5, value };
  }));
  return peak;
}

async function CompareContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  await io();
  const a: CompareSide = parseCompareSide(single(params, "a")) ?? DEFAULT_SIDES[0];
  const b: CompareSide = parseCompareSide(single(params, "b")) ?? DEFAULT_SIDES[1];
  let covered: number[];
  try {
    covered = await getCoveredSeasonOrdinals();
  } catch {
    return <Notice tone="danger" title="比較を読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  if (covered.length === 0) return <EmptyState title="比べられるデータがまだありません" />;
  const now = currentSeason();
  const latest = seasonFromOrdinal(Math.min(covered.at(-1)!, seasonOrdinal(now)));
  const requested = parseSeasonId(single(params, "season"));
  const season: Season = requested && covered.includes(seasonOrdinal(requested)) ? requested : latest;
  const [nameA, nameB] = [sideLabel(a), sideLabel(b)];

  const [statsA, statsB, trendA, trendB, pair, dataset] = await Promise.all([
    getSeasonStats(season, "titles", sideFilter(a)),
    getSeasonStats(season, "titles", sideFilter(b)),
    getSeasonTrend(sideFilter(a), seasonFromOrdinal(covered[0]!), latest),
    getSeasonTrend(sideFilter(b), seasonFromOrdinal(covered[0]!), latest),
    getPairComparison(season, a, b),
    getDatasetStatus().catch(() => null)
  ]);

  const range = seasonDateRange(season);
  const seasonText = `${formatSeason(season)}（${range.first.replaceAll("-", "/")}〜${range.last.replaceAll("-", "/")}）`;
  const conditions = "アニメカテゴリ・再放送を除く";
  const query = buildHref(PATH, {}, { a: sideParam(a), b: sideParam(b), season: seasonId(season) });
  const exportMeta = (anchor: string, title: string, scope: string) => ({
    title: `${nameA}と${nameB}: ${title}`,
    scope,
    url: absoluteUrl(`${query}#${anchor}`),
    dataTime: dataset?.lastSuccessAt ? formatDateTime(dataset.lastSuccessAt) : undefined,
    filename: `compare-${sideParam(a)}-${sideParam(b)}-${anchor}`
  });
  const rowA = trendA.find((row) => row.seasonOrdinal === seasonOrdinal(season));
  const rowB = trendB.find((row) => row.seasonOrdinal === seasonOrdinal(season));
  const peakA = peakOf(statsA.heatmap.cells);
  const peakB = peakOf(statsB.heatmap.cells);
  const heatMax = Math.max(statsA.heatmap.max, statsB.heatmap.max);
  const buckets = delayBucketLabels(nameB);
  const trendB2 = new Map(trendB.map((row) => [row.seasonOrdinal, row.titles]));
  const trendRows = trendA.map((row) => ({ ordinal: row.seasonOrdinal, a: row.titles, b: trendB2.get(row.seasonOrdinal) ?? 0 }));
  const sparse = trendRows.length > 0 && Math.floor(trendRows[0]!.ordinal / 10) < SOURCE_COMPLETE_FROM_YEAR;
  const sharedNote = pair.sharedChannels.length
    ? `両方に含まれる局（${pair.sharedChannels.map((slug) => TRACKED_CHANNELS.find((c) => c.slug === slug)?.shortName ?? slug).join("・")}）は、同じ放送なので共通の作品と放送時差の計算から除いています。`
    : "";
  const peakText = (peak: ReturnType<typeof peakOf>) => (peak ? `${WEEKDAY_LABELS[peak.weekday]}曜 ${peak.hour}時台（${peak.value}作品）` : "—");

  return (
    <div className={styles.layout}>
      <FilterForm action={PATH} className={styles.form} label="比べる対象">
        <SelectField label="A" name="a" value={sideParam(a)} options={SIDE_OPTIONS} />
        <span className={styles.versus} aria-hidden="true">
          と
        </span>
        <SelectField label="B" name="b" value={sideParam(b)} options={SIDE_OPTIONS} />
        <SelectField
          label="クール"
          name="season"
          value={seasonId(season)}
          options={[...covered]
            .filter((ordinal) => ordinal <= seasonOrdinal(latest))
            .reverse()
            .map((ordinal) => ({ value: seasonId(seasonFromOrdinal(ordinal)), label: formatSeasonOrdinal(ordinal) }))}
        />
      </FilterForm>

      <Section id="summary" title={`${formatSeason(season)}の比較`} description={`${seasonText}・${conditions}`}>
        <div className={styles.tableWrap} role="region" aria-label="比較の要約" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">項目</th>
                <th scope="col">{nameA}</th>
                <th scope="col">{nameB}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">作品本数</th>
                <td className={styles.num}>{statsA.titleCount}作品</td>
                <td className={styles.num}>{statsB.titleCount}作品</td>
              </tr>
              <tr>
                <th scope="row">放送件数</th>
                <td className={styles.num}>{statsA.airingCount}件</td>
                <td className={styles.num}>{statsB.airingCount}件</td>
              </tr>
              <tr>
                <th scope="row">23時以降に始まる作品の割合</th>
                <td className={styles.num}>{lateShare(rowA) === null ? "—" : formatPercent(lateShare(rowA)!)}</td>
                <td className={styles.num}>{lateShare(rowB) === null ? "—" : formatPercent(lateShare(rowB)!)}</td>
              </tr>
              <tr>
                <th scope="row">最も多い曜日・時台</th>
                <td>{peakText(peakA)}</td>
                <td>{peakText(peakB)}</td>
              </tr>
              <tr>
                <th scope="row">相手にもある作品</th>
                <td className={styles.num}>{pair.overlap.both}作品（{nameA}だけ {pair.overlap.onlyA}）</td>
                <td className={styles.num}>{pair.overlap.both}作品（{nameB}だけ {pair.overlap.onlyB}）</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="timing"
        title="同じ作品・同じ話数の放送時差"
        description={`両方で放送された作品の、同じ話数どうしの開始時刻の差（${nameB} − ${nameA}）`}
        details={`作品ごとに、両方で放送された話数の差の中央値を1つ数えます。話数が記録されていない放送は使いません。${sharedNote}`}
      >
        {pair.overlap.timed === 0 ? (
          <EmptyState title="比べられる作品がありません">同じ話数が両方で放送された作品がありません。</EmptyState>
        ) : (
          <div className={styles.twoColumn}>
            <ChartFrame
              title="放送時差の分布（作品数）"
              takeaway={`${pair.overlap.timed}作品を比べ、時差の中央値は${pair.overlap.medianDelay === null ? "—" : pair.overlap.medianDelay === 0 ? "0分（同時）" : formatDelay(pair.overlap.medianDelay)}でした（＋は${nameB}が後）。`}
              scope={`単位: 作品数。${seasonText}・${conditions}。${sharedNote}`}
              exportData={{
                spec: { kind: "bars", categoryLabel: "放送時差", categories: buckets.map((bucket) => bucket.label), series: [{ name: "作品数", values: buckets.map((bucket) => pair.buckets[bucket.key]) }], unit: "作品" } satisfies ChartSpec,
                meta: exportMeta("timing", "同じ話数の放送時差の分布", `${seasonText}・${conditions}・${nameB} − ${nameA}`)
              }}
            >
              <BarList unit="作品" rows={buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, value: pair.buckets[bucket.key] }))} />
            </ChartFrame>
            <div>
              <h3 className={styles.muted}>差の大きい作品</h3>
              <ol className={styles.examples}>
                {pair.examples.map((example) => (
                  <li key={example.slug}>
                    <Link href={`/titles/${example.slug}`}>{example.name}</Link> <span className={styles.num}>{formatDelay(example.delayMinutes)}</span>
                    <span className={styles.muted}>（{example.episodes}話で比較）</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Section>

      <Section id="trend" title="クール別の作品本数" description="取得済みのクールごとの作品本数（再放送を除く）">
        <ChartFrame
          title={`${nameA}と${nameB}の作品本数（クール別）`}
          scope={`単位: 作品本数（そのクールに1回以上放送された作品）。${conditions}。${sparse ? SPARSE_SOURCE_NOTE : ""}`}
          exportData={{
            spec: {
              kind: "columns",
              categoryLabel: "クール",
              categories: trendRows.map((row) => formatSeasonOrdinal(row.ordinal)),
              series: [
                { name: nameA, values: trendRows.map((row) => row.a) },
                { name: nameB, values: trendRows.map((row) => row.b) }
              ],
              unit: "作品"
            } satisfies ChartSpec,
            meta: exportMeta("trend", "作品本数（クール別）", `取得済みのクール別・${conditions}`)
          }}
          table={
            <div className={styles.tableWrap} role="region" aria-label="クール別の作品本数の表" tabIndex={0}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">クール</th>
                    <th scope="col">{nameA}</th>
                    <th scope="col">{nameB}</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.map((row) => (
                    <tr key={row.ordinal}>
                      <th scope="row">{formatSeasonOrdinal(row.ordinal)}</th>
                      <td className={styles.num}>{row.a}</td>
                      <td className={styles.num}>{row.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          <PairColumnChart
            unit="作品"
            series={[nameA, nameB]}
            columns={trendRows.map((row, index) => {
              const s = seasonFromOrdinal(row.ordinal);
              return { key: String(row.ordinal), label: ["冬", "春", "夏", "秋"][s.quarter - 1]!, sublabel: s.quarter === 1 || index === 0 ? String(s.year) : undefined, values: [row.a, row.b] };
            })}
          />
        </ChartFrame>
      </Section>

      <Section id="heatmap" title={`${formatSeason(season)}の曜日×時間帯`} description="同じ色の基準で並べています（作品本数）">
        <div className={styles.twoColumn}>
          {[
            { side: a, name: nameA, stats: statsA, key: "a" },
            { side: b, name: nameB, stats: statsB, key: "b" }
          ].map((entry) => (
            <ChartFrame
              key={entry.key}
              title={entry.name}
              scope={`単位: 作品本数。${seasonText}・${conditions}。色の基準は両方の最大値（${heatMax}作品）。`}
              table={<HeatmapTable cells={entry.stats.heatmap.cells} unitLabel="作品" />}
              exportData={{
                spec: {
                  kind: "matrix",
                  rowLabel: "曜日",
                  colLabel: "時台",
                  rows: WEEKDAY_LABELS.map((label) => `${label}曜`),
                  cols: entry.stats.heatmap.cells[0]!.map((_, index) => `${index + 5}時`),
                  values: entry.stats.heatmap.cells,
                  unit: "作品"
                } satisfies ChartSpec,
                meta: { ...exportMeta(`heatmap-${entry.key}`, `${entry.name}の曜日×時間帯`, `${seasonText}・${entry.name}・${conditions}`), title: `${entry.name}の曜日×時間帯（作品本数）` }
              }}
            >
              <WeekdayHourHeatmap cells={entry.stats.heatmap.cells} max={heatMax} unitLabel="作品" details={entry.stats.heatmap.details} />
            </ChartFrame>
          ))}
        </div>
      </Section>
    </div>
  );
}

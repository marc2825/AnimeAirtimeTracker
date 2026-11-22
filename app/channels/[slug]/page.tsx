import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ChartFrame, HeatmapTable, StackedColumnChart, WeekdayHourHeatmap } from "@/components/stats/Charts";
import { Disclosure } from "@/components/ui/controls";
import { EmptyState, Notice, PageHeader, Section, SkeletonBlock, SlotKindBadge, StatGrid, StatTile } from "@/components/ui/primitives";
import { AREA_LABELS, MEDIUM_LABELS, SOURCE_COMPLETE_FROM_YEAR, SPARSE_SOURCE_NOTE, TRACKED_CHANNELS, networkLabelOf } from "@/domain/coverage";
import { currentSeason, formatSeason, seasonFromOrdinal, seasonOrdinal } from "@/domain/season";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import { formatSeasonOrdinal } from "@/lib/format";
import { listSlots } from "@/server/queries/slots";
import { getSeasonStats, getSeasonTrend, statsFilter, TREND_BANDS } from "@/server/queries/stats";
import { getCoveredSeasonOrdinals } from "@/server/queries/status";

import styles from "../channels.module.css";

function findChannel(slug: string) {
  return TRACKED_CHANNELS.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/channels/[slug]">): Promise<Metadata> {
  const channel = findChannel((await params).slug);
  if (!channel) return { title: "放送局が見つかりません" };
  return {
    title: `${channel.name}のアニメ放送`,
    description: `${channel.name}（${networkLabelOf(channel)}）で放送されたアニメの本数のクール別推移、時間帯の内訳、曜日×時間帯の分布、放送枠。データ出典: しょぼいカレンダー。`,
    alternates: { canonical: `/channels/${channel.slug}` }
  };
}

export default function ChannelPage({ params }: PageProps<"/channels/[slug]">) {
  return (
    <div className="container">
      <Suspense fallback={<SkeletonBlock rows={8} label="放送局を読み込み中" />}>
        <ChannelContent params={params} />
      </Suspense>
    </div>
  );
}

async function ChannelContent({ params }: { params: Promise<{ slug: string }> }) {
  const channel = findChannel((await params).slug);
  if (!channel) notFound();
  await io(); // "this season" depends on today's date: request time only
  const filter = statsFilter({ region: null, channelSlug: channel.slug });

  let covered: number[];
  try {
    covered = await getCoveredSeasonOrdinals();
  } catch {
    return <Notice tone="danger" title="放送局の情報を読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  if (covered.length === 0) return <EmptyState title="データがまだありません" />;
  const latest = seasonFromOrdinal(Math.min(covered.at(-1)!, seasonOrdinal(currentSeason())));
  const [trend, stats, slots] = await Promise.all([
    getSeasonTrend(filter, seasonFromOrdinal(covered[0]!), latest),
    getSeasonStats(latest, "titles", filter),
    listSlots()
  ]);
  const ownSlots = slots.filter((slot) => slot.channel?.slug === channel.slug);
  const active = trend.filter((row) => row.titles > 0);
  const peak = active.length ? active.reduce((a, b) => (b.titles > a.titles ? b : a)) : null;
  const latestRow = trend.find((row) => row.seasonOrdinal === seasonOrdinal(latest));
  const lateShare = (row: (typeof trend)[number]) => (row.titles === 0 ? 0 : ((row.bandTitles.late ?? 0) + (row.bandTitles.latelate ?? 0)) / row.titles);

  return (
    <article className={styles.layout}>
      <nav className={styles.breadcrumb} aria-label="パンくず">
        <Link href="/channels">放送局</Link>
        <span aria-hidden="true">/</span>
        <span>{channel.name}</span>
      </nav>
      <PageHeader title={channel.name} lead={`${MEDIUM_LABELS[channel.medium]}・${AREA_LABELS[channel.area]}・${networkLabelOf(channel)}`} />

      <ul role="list" className={styles.links}>
        <li>
          <Link href={`/schedule?region=all&channel=${channel.slug}`}>この局の番組表</Link>
        </li>
        <li>
          <Link href={`/search?season=all&channel=${channel.slug}`}>この局で放送された作品を検索</Link>
        </li>
        <li>
          <Link href={`/stats?region=all&channel=${channel.slug}`}>この局の編成統計</Link>
        </li>
      </ul>

      <StatGrid>
        <StatTile label={`${formatSeason(latest)}の作品本数`} value={stats.titleCount} unit="作品" hint="新作・継続を含み、再放送を除く" />
        <StatTile label="23時以降の割合" value={latestRow && latestRow.titles > 0 ? Math.round(lateShare(latestRow) * 100) : "—"}
          unit={latestRow && latestRow.titles > 0 ? "%" : undefined} hint={`${formatSeason(latest)}・作品ごとの最頻の開始時刻`} />
        <StatTile label="放送枠" value={ownSlots.length} unit="枠" hint="この局を基準局とする出典記載枠と推定枠" />
        <StatTile label="放送があったクール" value={active.length} unit="クール" hint={`取得済み${covered.length}クール中`} />
      </StatGrid>

      <Section id="trend" title="クール別の作品本数" description="クールごとの作品本数（最も多かった開始時刻の時間帯別）">
        <ChartFrame
          title="クール別・時間帯別の作品本数"
          takeaway={peak ? `最も多かったのは${formatSeasonOrdinal(peak.seasonOrdinal)}の${peak.titles}作品です。` : "放送の記録がありません。"}
          scope={`単位: 作品本数（そのクールに1回以上放送された作品、再放送を除く）。各作品はクールごとに最頻の開始時刻の時間帯に1回だけ数えます。${trend.length > 0 && Math.floor(trend[0]!.seasonOrdinal / 10) < SOURCE_COMPLETE_FROM_YEAR ? SPARSE_SOURCE_NOTE : ""}`}
          table={
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">クール</th>
                    <th scope="col">作品本数</th>
                    {TREND_BANDS.map((group) => (
                      <th key={group.key} scope="col">
                        {group.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trend.map((row) => (
                    <tr key={row.seasonOrdinal}>
                      <th scope="row">{formatSeasonOrdinal(row.seasonOrdinal)}</th>
                      <td className="mono">{row.titles}</td>
                      {TREND_BANDS.map((group) => (
                        <td key={group.key} className="mono">
                          {row.bandTitles[group.key] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          <StackedColumnChart
            unit="作品"
            series={TREND_BANDS.map((group) => ({ key: group.key, label: group.label }))}
            columns={trend.map((row) => {
              const s = seasonFromOrdinal(row.seasonOrdinal);
              return {
                key: String(row.seasonOrdinal),
                label: ["冬", "春", "夏", "秋"][s.quarter - 1]!,
                sublabel: s.quarter === 1 || row === trend[0] ? String(s.year) : undefined,
                segments: TREND_BANDS.map((group) => row.bandTitles[group.key] ?? 0),
                highlight: row.seasonOrdinal === seasonOrdinal(latest)
              };
            })}
          />
        </ChartFrame>
      </Section>

      <Section id="heatmap" title={`${formatSeason(latest)}の曜日×時間帯`} description="この局でアニメが放送された曜日と時台">
        <ChartFrame
          title="曜日×時間帯（作品本数）"
          scope="単位: 作品本数。各作品は放送が始まった曜日・時台ごとに1回数えます。時刻はアニメ時刻（5時切替）。"
          table={<HeatmapTable cells={stats.heatmap.cells} unitLabel="作品" />}
        >
          <WeekdayHourHeatmap cells={stats.heatmap.cells} max={stats.heatmap.max} unitLabel="作品" details={stats.heatmap.details} />
        </ChartFrame>
      </Section>

      <Section id="slots" title="この局の放送枠" description="この局を基準局とする枠（位置は各枠の最新クール）">
        {ownSlots.length === 0 ? (
          <EmptyState title="この局を基準局とする放送枠はありません" icon="search" />
        ) : (
          <>
            <SlotRows slots={ownSlots.slice(0, 20)} />
            {ownSlots.length > 20 ? (
              <Disclosure summary={`残りの${ownSlots.length - 20}枠`}>
                <SlotRows slots={ownSlots.slice(20)} />
              </Disclosure>
            ) : null}
          </>
        )}
      </Section>
    </article>
  );
}

function SlotRows({ slots }: { slots: Awaited<ReturnType<typeof listSlots>> }) {
  return (
    <ul role="list" className={styles.slotList}>
      {slots.map((slot) => (
        <li key={slot.slug} className={styles.slotRow}>
          <SlotKindBadge kind={slot.kind} />
          <Link href={`/slots/${encodeURIComponent(slot.slug)}`} className={styles.slotName}>
            {slot.name}
          </Link>
          <span className="muted">
            {slot.latest ? <span className="mono">{`${WEEKDAY_LABELS[slot.latest.weekday]} ${formatAnimeMinute(slot.latest.minute)}・`}</span> : null}
            {slot.titleCount}作品・{slot.seasonCount}クール
          </span>
        </li>
      ))}
    </ul>
  );
}

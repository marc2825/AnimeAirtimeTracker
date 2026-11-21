import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SegmentedLinks } from "@/components/ui/controls";
import { EmptyState, Notice, PageHeader, SkeletonBlock } from "@/components/ui/primitives";
import { REGIONS, REGION_KEYS, parseRegionKey } from "@/domain/coverage";
import { formatSeason, parseSeasonId, seasonId, seasonOrdinal, shiftSeason } from "@/domain/season";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import { formatDateShort } from "@/lib/format";
import { buildHref, flattenParams, single, type RawSearchParams } from "@/lib/search-params";
import { getSeasonPremieres } from "@/server/queries/seasons";
import { getCoveredSeasonOrdinals } from "@/server/queries/status";

import styles from "../seasons.module.css";

export async function generateMetadata({ params }: PageProps<"/seasons/[season]">): Promise<Metadata> {
  const season = parseSeasonId((await params).season);
  if (!season) return { title: "クールが見つかりません" };
  return {
    title: `${formatSeason(season)}の新作アニメ（曜日別）`,
    description: `${formatSeason(season)}に始まったテレビアニメの新作を、曜日・放送開始時刻・放送局ごとに一覧。データ出典: しょぼいカレンダー。`,
    alternates: { canonical: `/seasons/${seasonId(season)}` }
  };
}

export default function SeasonPage({ params, searchParams }: PageProps<"/seasons/[season]">) {
  return (
    <div className="container">
      <Suspense fallback={<SkeletonBlock rows={8} label="新作を読み込み中" />}>
        <SeasonContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SeasonContent({ params, searchParams }: { params: Promise<{ season: string }>; searchParams: Promise<RawSearchParams> }) {
  const season = parseSeasonId((await params).season);
  if (!season) notFound();
  const query = await searchParams;
  const region = parseRegionKey(single(query, "region"));
  const path = `/seasons/${seasonId(season)}`;
  const href = (overrides: Record<string, string | null>) => buildHref(path, flattenParams(query), overrides);

  let premieres: Awaited<ReturnType<typeof getSeasonPremieres>>;
  let covered: number[];
  try {
    [premieres, covered] = await Promise.all([getSeasonPremieres(season, region), getCoveredSeasonOrdinals()]);
  } catch {
    return <Notice tone="danger" title="新作を読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  const coveredSet = new Set(covered);
  const neighbours = [
    { season: shiftSeason(season, -1), label: "前のクール" },
    { season: shiftSeason(season, 1), label: "次のクール" }
  ].filter((entry) => coveredSet.has(seasonOrdinal(entry.season)));
  const byWeekday = WEEKDAY_LABELS.map((_, weekday) =>
    premieres.filter((p) => p.animeWeekday === weekday).sort((a, b) => a.animeStartMinute - b.animeStartMinute || a.startAt.getTime() - b.startAt.getTime())
  );

  return (
    <>
      <nav className={styles.breadcrumb} aria-label="パンくず">
        <Link href="/seasons">クール別の新作</Link>
        <span aria-hidden="true">/</span>
        <span>{formatSeason(season)}</span>
      </nav>
      <PageHeader
        kicker="New series"
        title={`${formatSeason(season)}の新作アニメ`}
        lead={`第1話の放送があった作品を、最初の放送の曜日・時刻順に並べています。${region ? REGIONS[region].label : "全対象局"}で${premieres.length}作品。`}
      />
      <div className={styles.toolbar}>
        <SegmentedLinks
          label="地域・媒体"
          size="sm"
          options={[{ href: href({ region: null }), label: "すべて", active: region === null }, ...REGION_KEYS.map((key) => ({ href: href({ region: key }), label: REGIONS[key].short, active: region === key }))]}
        />
        {neighbours.length > 0 ? (
          <nav className={styles.neighbours} aria-label="ほかのクール">
            {neighbours.map((entry) => (
              <Link key={entry.label} href={`/seasons/${seasonId(entry.season)}${region ? `?region=${region}` : ""}`}>
                {entry.label}（{formatSeason(entry.season)}）
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {!coveredSet.has(seasonOrdinal(season)) ? (
        <EmptyState title="このクールのデータはまだありません">
          取得済みの範囲は<Link href="/status" className="inline-link">データ更新状況</Link>で確認できます。
        </EmptyState>
      ) : premieres.length === 0 ? (
        <EmptyState title="新作の記録がありません">地域を「すべて」にするか、ほかのクールを選んでください。</EmptyState>
      ) : (
        <div className={styles.weekdays}>
          {byWeekday.map((items, weekday) =>
            items.length === 0 ? null : (
              <section key={weekday} className={styles.weekday} aria-labelledby={`weekday-${weekday}`}>
                <h2 id={`weekday-${weekday}`} className={styles.weekdayHeading}>
                  <span className={weekday === 5 ? "sat" : weekday === 6 ? "sun" : undefined}>{WEEKDAY_LABELS[weekday]}曜</span>
                  <span className={styles.weekdayCount}>{items.length}作品</span>
                </h2>
                <ol role="list" className={styles.premieres}>
                  {items.map((item) => (
                    <li key={item.titleId} className={styles.premiere}>
                      <span className={`mono ${styles.time}`}>{formatAnimeMinute(item.animeStartMinute)}</span>
                      <span className={styles.channel}>
                        {item.channelShortName}
                        {item.otherChannels > 0 ? <span className={styles.others}>ほか{item.otherChannels}局</span> : null}
                      </span>
                      <Link href={`/titles/${item.slug}`} className={styles.titleLink}>
                        {item.name}
                      </Link>
                      <span className={`mono ${styles.date}`}>{formatDateShort(item.animeDate)}〜</span>
                    </li>
                  ))}
                </ol>
              </section>
            )
          )}
        </div>
      )}
      <p className={styles.footnote}>
        時刻はアニメ時刻（5時切替）。第1話は出典の「新」フラグで判定し、最初の放送局・時刻に置いています。フラグのない作品や、対象局以外で始まった作品は含まれません。再放送は除きます。
      </p>
    </>
  );
}

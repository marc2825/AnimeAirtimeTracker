import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { Fragment, Suspense, type CSSProperties } from "react";

import { MonthCalendar } from "@/components/schedule/MonthCalendar";
import { JsonLd } from "@/components/seo/JsonLd";
import { latestOrdinal, SlotCard, stripStartOrdinal } from "@/components/slots/SlotCard";
import { StripTooltip } from "@/components/slots/StripTooltip";
import { WeekdayHourHeatmap } from "@/components/stats/Charts";
import { ButtonLink } from "@/components/ui/controls";
import { CountUp } from "@/components/ui/CountUp";
import { FlagBadges, Notice, Skeleton, SkeletonBlock, WeekdayChip } from "@/components/ui/primitives";
import { REGIONS, REGION_KEYS } from "@/domain/coverage";
import { currentSeason, formatSeason, seasonOrdinal } from "@/domain/season";
import { WEEKDAY_KEYS, WEEKDAY_LABELS, currentAnimeDate, formatIsoDateJa, toAnimeTime, weekdayOf } from "@/domain/time";
import { pickFeaturedSlots } from "@/lib/featured-slots";
import { episodeText, formatCoverage, formatDateTime, formatStartTime } from "@/lib/format";
import { websiteJsonLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";
import { getSchedule } from "@/server/queries/schedule";
import { getSlotStripTitles, listSlots, type StripTitles } from "@/server/queries/slots";
import { getSeasonStats, statsFilter } from "@/server/queries/stats";
import { coverageDates, getDatasetStatus } from "@/server/queries/status";

import styles from "./home.module.css";

/** The title and description come from the root layout; the home page names its canonical URL. */
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <div className="container">
      <JsonLd data={websiteJsonLd()} />
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroText}>
          <h1 id="hero-title" className={styles.heroTitle}>
            <span className={styles.heroSite}>{SITE_NAME}</span>{" "}
            <span className="marker">TVアニメの放送枠一覧と年表・編成統計</span>
          </h1>
          <p className={styles.heroLead}>
            日本のテレビアニメの放送枠と放送編成の歴史・変遷・統計を、横断的に調べるためのデータベースです。ノイタミナのような放送枠での作品の移り変わり、曜日×時間帯の編成統計、長期の変化を調べた分析と、それらの元になる番組表を載せています。番組データはしょぼいカレンダー（有志による手入力データ）の公開データを取得・保存したもので、放送枠・統計・分析は本サイトが算出しています。本サイトが番組データを独自に入力することはありません。{" "}
            <Link href="/about" className="inline-link">
              取得元と判定・集計のルール
            </Link>
          </p>
          <div className={styles.heroBar}>
            <div className={styles.heroActions}>
              <ButtonLink href="/slots" variant="primary" icon="arrowRight">
                放送枠の年表
              </ButtonLink>
              <Link href="/stats" className={styles.textLink}>
                編成統計
              </Link>
              <Link href="/analysis" className={styles.textLink}>
                分析
              </Link>
              <Link href="/schedule" className={styles.textLink}>
                今週の番組表
              </Link>
              <Link href="/seasons" className={styles.textLink}>
                クール別の新作
              </Link>
            </div>
            <div className={styles.index}>
              <nav className={styles.indexRow} aria-label="曜日から番組表へ">
                <span className={styles.indexLabel}>曜日</span>
                {WEEKDAY_LABELS.map((label, index) => (
                  <Link key={label} href={`/schedule?day=${WEEKDAY_KEYS[index]}`} className={styles.indexLink} aria-label={`${label}曜の番組表`}>
                    <WeekdayChip weekday={index} suffix="" />
                  </Link>
                ))}
              </nav>
              <nav className={styles.indexRow} aria-label="地域・媒体から探す">
                <span className={styles.indexLabel}>地域</span>
                {REGION_KEYS.map((key) => (
                  <Link key={key} href={key === "kanto" ? "/schedule" : `/schedule?region=${key}`} className={styles.indexLink}>
                    {REGIONS[key].short}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
        <div className={styles.today}>
          <Suspense fallback={<OnAirSkeleton />}>
            <OnAirPanel />
          </Suspense>
          <Suspense fallback={null}>
            <CalendarPanel />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={<SkeletonBlock rows={4} label="放送枠を読み込み中" />}>
        <FeaturedSlots />
      </Suspense>

      <Suspense fallback={<SkeletonBlock rows={4} label="統計を読み込み中" />}>
        <StatsPreview />
      </Suspense>
    </div>
  );
}

function OnAirSkeleton() {
  return (
    <aside className={styles.onAir} aria-label="今日の放送">
      <Skeleton height="1.25rem" width="40%" />
      <SkeletonBlock rows={6} label="今日の放送を読み込み中" />
    </aside>
  );
}

async function OnAirPanel() {
  await io();
  const now = new Date();
  const today = currentAnimeDate(now);
  const nowMinute = toAnimeTime(now).animeMinute;
  let items;
  try {
    ({ items } = await getSchedule({ from: today, days: 1, region: "kanto", channelSlug: null, rerun: "exclude", allKinds: false }));
  } catch {
    return (
      <aside className={styles.onAir} aria-label="今日の放送">
        <Notice tone="danger" title="番組データを読み込めませんでした">時間をおいて再読み込みしてください。</Notice>
      </aside>
    );
  }
  const upcoming = items.filter((item) => item.animeStartMinute + item.durationMinutes > nowMinute).slice(0, 8);
  return (
    <aside className={styles.onAir} aria-labelledby="onair-title">
      <div className={styles.onAirHead}>
        <h2 id="onair-title" className={styles.onAirTitle}>
          今日のこれからの新作
        </h2>
        <span className={styles.onAirMeta}>
          {formatIsoDateJa(today, { withWeekday: true })}・関東地上波
        </span>
      </div>
      {upcoming.length === 0 ? (
        <p className={styles.onAirEmpty}>本日（5時切替）の関東地上波の新作放送は終了しました。</p>
      ) : (
        <ol role="list" className={styles.onAirList} style={{ "--rows": Math.ceil(upcoming.length / 2) } as CSSProperties}>
          {upcoming.map((item) => {
            const live = item.animeStartMinute <= nowMinute;
            return (
              <li key={item.id} className={styles.onAirItem}>
                <span className={styles.onAirTime}>
                  {formatStartTime(item.animeStartMinute, "anime")}
                  {live ? <span className={styles.live}>放送中</span> : null}
                </span>
                <span className={styles.onAirChannel}>{item.channelShortName}</span>
                <span className={styles.onAirMain}>
                  <Link href={`/titles/${item.titleSlug}`} className={styles.onAirName}>
                    {item.titleName}
                  </Link>
                  <span className={styles.onAirSub}>
                    {episodeText(item.episodeNumber, item.episodeLabel)}
                    <FlagBadges flagNew={item.flagNew} flagFinal={item.flagFinal} compact />
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <Link href={`/schedule?day=${WEEKDAY_KEYS[weekdayOf(today)]}`} className={styles.onAirMore}>
        今日の番組表をすべて見る →
      </Link>
    </aside>
  );
}

/** Month calendar: every day links to its programme guide. */
async function CalendarPanel() {
  await io();
  const today = currentAnimeDate();
  const range = await coverageDates();
  return (
    <aside className={styles.calendar} aria-labelledby="calendar-title">
      <h2 id="calendar-title" className={styles.onAirTitle}>
        日付から番組表へ
      </h2>
      <MonthCalendar today={today} min={range.min} max={range.max} />
    </aside>
  );
}

async function FeaturedSlots() {
  await io(); // request-time: the build must not need a database
  let slots;
  try {
    slots = await listSlots();
  } catch {
    return (
      <section className={styles.block}>
        <Notice tone="danger" title="放送枠を読み込めませんでした">
          時間をおいて再読み込みしてください。
        </Notice>
      </section>
    );
  }
  const stripEnd = latestOrdinal(slots);
  const { featured, more } = pickFeaturedSlots(slots, seasonOrdinal(stripEnd));
  if (featured.length === 0) return null;
  // Names behind the strip ticks are a nicety: the cards still render if they cannot be read.
  const titles: StripTitles = await getSlotStripTitles(
    stripStartOrdinal(stripEnd),
    featured.map((slot) => slot.slug)
  ).catch(() => ({}));
  return (
    <section className={styles.block} aria-labelledby="featured-title">
      <div className={styles.blockHead}>
        <div>
          <h2 id="featured-title" className={styles.blockTitle}>
            放送枠の年表
          </h2>
          <p className={styles.blockLead}>放送中の主な枠（公式枠・出典記載枠を、続いたクール数の多い順に）と、直近12クールの作品</p>
        </div>
        <ButtonLink href="/slots" variant="ghost" icon="arrowRight">
          すべての放送枠
        </ButtonLink>
      </div>
      <ul role="list" className={styles.slotGrid}>
        {featured.map((slot) => (
          <SlotCard key={slot.slug} slot={slot} stripEnd={stripEnd} stripTitles={titles[slot.slug]} />
        ))}
      </ul>
      {more.length > 0 ? (
        <p className={styles.slotMore}>
          <span className={styles.slotMoreLabel}>このほかに放送中の枠</span>
          {more.map((slot, index) => (
            <Fragment key={slot.slug}>
              {index > 0 ? "、" : null}
              <Link href={`/slots/${encodeURIComponent(slot.slug)}`} className="inline-link">
                {slot.name}
              </Link>
            </Fragment>
          ))}
        </p>
      ) : null}
      <StripTooltip />
    </section>
  );
}

async function StatsPreview() {
  await io();
  const season = currentSeason();
  let stats;
  let status;
  try {
    [stats, status] = await Promise.all([getSeasonStats(season, "titles", statsFilter()), getDatasetStatus()]);
  } catch {
    return (
      <section className={styles.block}>
        <Notice tone="danger" title="統計を読み込めませんでした">
          時間をおいて再読み込みしてください。
        </Notice>
      </section>
    );
  }
  const hours = Array.from({ length: 12 }, (_, index) => index + 17);
  return (
    <section className={styles.block} aria-labelledby="stats-title">
      <div className={styles.blockHead}>
        <div>
          <h2 id="stats-title" className={styles.blockTitle}>
            {formatSeason(season)}の編成
          </h2>
          <p className={styles.blockLead}>関東地上波・新作のみ</p>
        </div>
        <ButtonLink href="/stats" variant="ghost" icon="arrowRight">
          統計を詳しく見る
        </ButtonLink>
      </div>
      <div className={styles.statsGrid}>
        <div className={styles.statsFigure}>
          <WeekdayHourHeatmap cells={stats.heatmap.cells} max={stats.heatmap.max} unitLabel="作品" hours={hours} details={stats.heatmap.details} />
          <p className={styles.statsNote}>単位: 作品本数（17時〜28時台、アニメ時刻）。</p>
        </div>
        <dl className={styles.figures}>
          <div>
            <dt>作品本数</dt>
            <dd>
              <CountUp value={stats.titleCount} />
              <span>作品</span>
            </dd>
          </div>
          <div>
            <dt>放送件数</dt>
            <dd>
              <CountUp value={stats.airingCount} />
              <span>件</span>
            </dd>
          </div>
          <div>
            <dt>最大同時放送数</dt>
            <dd>
              <CountUp value={stats.concurrency.peak?.count ?? 0} />
              <span>本</span>
            </dd>
          </div>
          <div className={styles.dataStatus}>
            <dt>データ</dt>
            <dd className={styles.dataStatusText}>
              {status.coverage ? `${formatCoverage(status.coverage)}（取得済み）` : "—"}
              <br />
              最終更新 {status.lastSuccessAt ? formatDateTime(status.lastSuccessAt) : "—"}
              <br />
              <Link href="/status" className="inline-link">
                取得範囲と更新状況
              </Link>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { latestOrdinal, SlotCard } from "@/components/slots/SlotCard";
import { WeekdayHourHeatmap } from "@/components/stats/Charts";
import { ButtonLink } from "@/components/ui/controls";
import { FlagBadges, Notice, Skeleton, SkeletonBlock } from "@/components/ui/primitives";
import { REGIONS, REGION_KEYS } from "@/domain/coverage";
import { currentSeason, formatSeason } from "@/domain/season";
import { WEEKDAY_KEYS, WEEKDAY_LABELS, currentAnimeDate, formatIsoDateJa, toAnimeTime, weekdayOf } from "@/domain/time";
import { episodeText, formatCoverage, formatDateTime, formatNumber, formatStartTime } from "@/lib/format";
import { SITE_NAME } from "@/lib/site";
import { getSchedule } from "@/server/queries/schedule";
import { listSlots } from "@/server/queries/slots";
import { getSeasonStats } from "@/server/queries/stats";
import { getDatasetStatus } from "@/server/queries/status";

import styles from "./home.module.css";

export default function HomePage() {
  return (
    <div className="container">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroText}>
          <p className={styles.kicker}>Japanese anime broadcast observatory</p>
          <h1 id="hero-title" className={styles.heroTitle}>
            アニメの放送編成を、
            <br />
            今週から過去まで。
          </h1>
          <p className={styles.heroLead}>
            今週の番組表から、ノイタミナのような放送枠の作品の移り変わり、曜日×時間帯の編成統計まで。しょぼいカレンダーの番組データを、編成の時系列として読み解けるようにまとめています。
          </p>
          <div className={styles.heroActions}>
            <ButtonLink href="/schedule" variant="primary" icon="arrowRight">
              今週の番組表
            </ButtonLink>
            <ButtonLink href="/slots">放送枠の年表を見る</ButtonLink>
          </div>
          <nav className={styles.quick} aria-label="曜日から探す">
            <span className={styles.quickLabel}>曜日</span>
            {WEEKDAY_LABELS.map((label, index) => (
              <Link key={label} href={`/schedule?day=${WEEKDAY_KEYS[index]}`} className={`${styles.quickPill} ${index === 5 ? "sat" : index === 6 ? "sun" : ""}`}>
                {label}
              </Link>
            ))}
          </nav>
          <nav className={styles.quick} aria-label="地域・媒体から探す">
            <span className={styles.quickLabel}>地域</span>
            {REGION_KEYS.map((key) => (
              <Link key={key} href={key === "kanto" ? "/schedule" : `/schedule?region=${key}`} className={styles.quickPill}>
                {REGIONS[key].short}
              </Link>
            ))}
          </nav>
        </div>
        <Suspense fallback={<OnAirSkeleton />}>
          <OnAirPanel />
        </Suspense>
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
          <span className={styles.signal} aria-hidden="true" />
          今日のこれからの新作
        </h2>
        <span className={styles.onAirMeta}>
          {formatIsoDateJa(today, { withWeekday: true })}・関東地上波
        </span>
      </div>
      {upcoming.length === 0 ? (
        <p className={styles.onAirEmpty}>本日（5時切替）の関東地上波の新作放送は終了しました。</p>
      ) : (
        <ol role="list" className={styles.onAirList}>
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

async function FeaturedSlots() {
  await io(); // request-time: the build must not need a database
  let slots;
  try {
    slots = await listSlots();
  } catch {
    return null;
  }
  const featured = slots.filter((slot) => slot.kind !== "INFERRED" && slot.seasonCount > 0).slice(0, 4);
  if (featured.length === 0) return null;
  return (
    <section className={styles.block} aria-labelledby="featured-title">
      <div className={styles.blockHead}>
        <div>
          <p className={styles.blockKicker}>Slot chronicles</p>
          <h2 id="featured-title" className={styles.blockTitle}>
            放送枠の年表
          </h2>
          <p className={styles.blockLead}>同じ枠でどの作品がどの順に放送され、時刻がいつ動いたか。出典に枠名が記載された主な枠です。</p>
        </div>
        <ButtonLink href="/slots" variant="ghost" icon="arrowRight">
          すべての放送枠
        </ButtonLink>
      </div>
      <ul role="list" className={styles.slotGrid}>
        {featured.map((slot) => (
          <SlotCard key={slot.slug} slot={slot} stripEnd={latestOrdinal(slots)} />
        ))}
      </ul>
    </section>
  );
}

async function StatsPreview() {
  await io();
  const season = currentSeason();
  let stats;
  let status;
  try {
    [stats, status] = await Promise.all([getSeasonStats({ season, region: "kanto", unit: "titles", rerun: "exclude" }), getDatasetStatus()]);
  } catch {
    return null;
  }
  const hours = Array.from({ length: 12 }, (_, index) => index + 17);
  return (
    <section className={styles.block} aria-labelledby="stats-title">
      <div className={styles.blockHead}>
        <div>
          <p className={styles.blockKicker}>This season in numbers</p>
          <h2 id="stats-title" className={styles.blockTitle}>
            {formatSeason(season)}の編成
          </h2>
          <p className={styles.blockLead}>関東地上波・新作のみ。夕方から深夜にかけて、どの曜日のどの時間に作品が集まっているか。</p>
        </div>
        <ButtonLink href="/stats" variant="ghost" icon="arrowRight">
          統計を詳しく見る
        </ButtonLink>
      </div>
      <div className={styles.statsGrid}>
        <div className={styles.statsCard}>
          <WeekdayHourHeatmap cells={stats.heatmap.cells} max={stats.heatmap.max} unitLabel="作品" hours={hours} />
          <p className={styles.statsNote}>単位: 作品本数（17時〜28時台、アニメ時刻）。</p>
        </div>
        <dl className={styles.figures}>
          <div>
            <dt>作品本数</dt>
            <dd>
              {formatNumber(stats.titleCount)}
              <span>作品</span>
            </dd>
          </div>
          <div>
            <dt>放送件数</dt>
            <dd>
              {formatNumber(stats.airingCount)}
              <span>件</span>
            </dd>
          </div>
          <div className={styles.wide}>
            <dt>最大同時放送数</dt>
            <dd>
              {stats.concurrency.peak?.count ?? 0}
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
      <p className={styles.siteNote}>
        {SITE_NAME}は放送データを独自に入力していません。番組情報はしょぼいカレンダーの公開データを取得・保存し、放送枠と統計を算出しています。
      </p>
    </section>
  );
}

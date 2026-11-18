import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { ScheduleGrid } from "@/components/schedule/ScheduleGrid";
import { ScheduleDayList } from "@/components/schedule/ScheduleList";
import { DayTabs, ScheduleLegend, WeekNav } from "@/components/schedule/ScheduleNav";
import { Disclosure, SegmentedLinks, SelectField } from "@/components/ui/controls";
import { FilterForm } from "@/components/ui/FilterForm";
import { EmptyState, Notice, PageHeader, SkeletonBlock } from "@/components/ui/primitives";
import { REGIONS, REGION_KEYS, TRACKED_CHANNELS, channelsInRegion, parseRegionKey, type RegionKey } from "@/domain/coverage";
import { formatSeason, seasonOfAnimeDate } from "@/domain/season";
import { WEEKDAY_KEYS, WEEKDAY_LABELS, addDays, animeWeekStart, currentAnimeDate, diffDays, formatIsoDateJa, parseWeekdayKey, type IsoDate } from "@/domain/time";
import type { ClockMode } from "@/lib/format";
import { buildHref, flattenParams, parseIsoDateParam, parseRerunMode, parseSlug, single, type RawSearchParams } from "@/lib/search-params";
import { getSchedule } from "@/server/queries/schedule";

import styles from "./schedule.module.css";

export const metadata: Metadata = {
  title: "週間番組表",
  description: "関東・関西・BS・CSのアニメ放送を曜日と時刻で一覧できる週間番組表。深夜25時台などのアニメ時刻表記と実時刻を切り替えられます。",
  alternates: { canonical: "/schedule" }
};

const PATH = "/schedule";

export default function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  return (
    <div className="container">
      <PageHeader
        kicker="Weekly schedule"
        title="週間番組表"
        lead="対象局のアニメ放送を、アニメ時刻（5時切替）で表示します。番組をクリックすると作品の放送履歴へ移動します。"
      />
      <Suspense fallback={<SkeletonBlock rows={10} label="番組表を読み込み中" />}>
        <ScheduleContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ScheduleContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  await io(); // "today" must be computed per request, never baked into a prerender
  const current = flattenParams(params);
  const today = currentAnimeDate();
  const requestedWeek = parseIsoDateParam(single(params, "week"));
  const weekStart = animeWeekStart(requestedWeek ?? today);
  const isCurrentWeek = weekStart === animeWeekStart(today);
  const regionParam = single(params, "region");
  const region: RegionKey | null = regionParam === "all" ? null : (parseRegionKey(regionParam) ?? "kanto");
  const channelSlug = parseSlug(single(params, "channel"));
  const view = single(params, "view") === "list" ? "list" : "grid";
  const rerun = parseRerunMode(single(params, "rerun"), "include");
  const allKinds = single(params, "kind") === "all";
  const clock: ClockMode = single(params, "clock") === "real" ? "real" : "anime";
  const requestedDay = parseWeekdayKey(single(params, "day"));
  const todayIndex = diffDays(today, weekStart);
  const activeDay = requestedDay ?? (todayIndex >= 0 && todayIndex < 7 ? todayIndex : 0);
  const activeDate: IsoDate = addDays(weekStart, activeDay);

  let data: Awaited<ReturnType<typeof getSchedule>>;
  try {
    data = await getSchedule({ from: weekStart, days: 7, region, channelSlug, rerun, allKinds });
  } catch {
    return (
      <Notice tone="danger" title="番組データを読み込めませんでした">
        時間をおいて再読み込みしてください。問題が続く場合はデータベースの接続状態を確認してください。
      </Notice>
    );
  }

  const regionSlugs = new Set((region ? channelsInRegion(region) : TRACKED_CHANNELS).map((c) => c.slug));
  const columns = data.channels.filter((c) => (channelSlug ? c.slug === channelSlug : regionSlugs.has(c.slug)));
  const byDay = Array.from({ length: 7 }, (_, index) => data.items.filter((item) => item.animeDate === addDays(weekStart, index)));
  const dayItems = byDay[activeDay] ?? [];
  const href = (overrides: Record<string, string | null>) => buildHref(PATH, current, overrides);
  const season = seasonOfAnimeDate(activeDate);

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <WeekNav
          weekStart={weekStart}
          isCurrentWeek={isCurrentWeek}
          seasonLabel={formatSeason(season)}
          hrefForWeek={(week) => href({ week: week, day: null })}
        />
        <SegmentedLinks
          label="表示形式"
          options={[
            { href: href({ view: null }), label: "番組表", active: view === "grid" },
            { href: href({ view: "list" }), label: "週間リスト", active: view === "list" }
          ]}
        />
      </div>

      <div className={styles.toolbar}>
        <SegmentedLinks
          label="地域・媒体"
          size="sm"
          options={[
            ...REGION_KEYS.map((key) => ({ href: href({ region: key === "kanto" ? null : key, channel: null }), label: REGIONS[key].short, active: region === key && !channelSlug })),
            { href: href({ region: "all", channel: null }), label: "すべて", active: region === null && !channelSlug }
          ]}
        />
        <Disclosure summary="表示設定" defaultOpen={Boolean(channelSlug || rerun !== "include" || allKinds || clock === "real")}>
          <FilterForm action={PATH} className={styles.settings} label="番組表の表示設定">
            <input type="hidden" name="week" value={requestedWeek ? weekStart : ""} />
            <input type="hidden" name="day" value={requestedDay !== null ? (WEEKDAY_KEYS[requestedDay] ?? "") : ""} />
            <input type="hidden" name="view" value={view === "list" ? "list" : ""} />
            <input type="hidden" name="region" value={regionParam ?? ""} />
            <SelectField
              label="放送局"
              name="channel"
              value={channelSlug ?? ""}
              options={[{ value: "", label: "地域内のすべて" }, ...data.channels.map((c) => ({ value: c.slug, label: c.name }))]}
            />
            <SelectField
              label="再放送"
              name="rerun"
              value={rerun === "include" ? "" : rerun}
              options={[
                { value: "", label: "含める" },
                { value: "exclude", label: "除く" },
                { value: "only", label: "再放送のみ" }
              ]}
            />
            <SelectField
              label="番組の種類"
              name="kind"
              value={allKinds ? "all" : ""}
              options={[
                { value: "", label: "アニメのみ" },
                { value: "all", label: "関連番組・特撮も含む" }
              ]}
            />
            <SelectField
              label="時刻表記"
              name="clock"
              value={clock === "real" ? "real" : ""}
              options={[
                { value: "", label: "アニメ時刻（25:30）" },
                { value: "real", label: "実時刻（翌01:30）" }
              ]}
            />
            <noscript>
              <button type="submit">適用</button>
            </noscript>
          </FilterForm>
        </Disclosure>
      </div>

      <ScheduleLegend />

      {data.items.length === 0 ? (
        <EmptyState title="この週の放送データはありません">
          対象期間外か、まだ取得していない週です。データの取得範囲は<a href="/status" className="inline-link">データ更新状況</a>で確認できます。
        </EmptyState>
      ) : view === "list" ? (
        <div className={styles.week}>
          {byDay.map((items, index) => {
            const date = addDays(weekStart, index);
            return (
              <section key={date} className={styles.daySection} aria-labelledby={`day-${index}`}>
                <h2 id={`day-${index}`} className={styles.dayHeading}>
                  <span className={index === 5 ? "sat" : index === 6 ? "sun" : undefined}>{WEEKDAY_LABELS[index]}曜</span>
                  <span className={styles.dayHeadingDate}>{formatIsoDateJa(date)}</span>
                  {date === today ? <span className={styles.todayBadge}>今日</span> : null}
                  <span className={styles.dayHeadingCount}>{items.length}件</span>
                </h2>
                <ScheduleDayList items={items} clock={clock} />
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <DayTabs weekStart={weekStart} activeDay={activeDay} today={today} counts={byDay.map((items) => items.length)} hrefForDay={(day) => href({ day: WEEKDAY_KEYS[day] ?? null })} />
          <h2 className="visually-hidden">
            {formatIsoDateJa(activeDate, { withWeekday: true })}の番組表
          </h2>
          {dayItems.length === 0 ? (
            <EmptyState title="この日の該当番組はありません">条件を変えるか、別の曜日を選んでください。</EmptyState>
          ) : (
            <>
              <div className={styles.gridOnly}>
                <ScheduleGrid items={dayItems} channels={columns} animeDate={activeDate} clock={clock} />
              </div>
              <div className={styles.listOnly}>
                <ScheduleDayList items={dayItems} clock={clock} />
              </div>
            </>
          )}
        </>
      )}

      <p className={styles.footnote}>
        出典: しょぼいカレンダー。1週間以上先の予定は変更される可能性が高いことが出典側でも案内されています。放送中止は表示から除き、作品ページの放送履歴に「削除」として残ります。
      </p>
    </div>
  );
}

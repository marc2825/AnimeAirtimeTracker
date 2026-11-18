import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { WEEKDAY_LABELS, addDays, type IsoDate } from "@/domain/time";
import { formatDateShort, weekdayClass } from "@/lib/format";

import styles from "./ScheduleNav.module.css";

export function WeekNav({ weekStart, isCurrentWeek, hrefForWeek, seasonLabel }: { weekStart: IsoDate; isCurrentWeek: boolean; hrefForWeek: (week: IsoDate | null) => string; seasonLabel: string }) {
  const end = addDays(weekStart, 6);
  const [y] = weekStart.split("-");
  return (
    <div className={styles.weekNav}>
      <Link href={hrefForWeek(addDays(weekStart, -7))} className={styles.weekArrow} aria-label="前の週" scroll={false}>
        <Icon name="chevronLeft" />
      </Link>
      <div className={styles.weekLabel}>
        <span className={styles.weekSeason}>{seasonLabel}</span>
        <span className={styles.weekRange}>
          <span className="visually-hidden">{y}年 </span>
          {formatDateShort(weekStart)}(月) – {formatDateShort(end)}(日)
        </span>
      </div>
      <Link href={hrefForWeek(addDays(weekStart, 7))} className={styles.weekArrow} aria-label="次の週" scroll={false}>
        <Icon name="chevronRight" />
      </Link>
      {!isCurrentWeek ? (
        <Link href={hrefForWeek(null)} className={styles.todayLink} scroll={false}>
          今週
        </Link>
      ) : null}
    </div>
  );
}

export function DayTabs({ weekStart, activeDay, today, counts, hrefForDay }: { weekStart: IsoDate; activeDay: number; today: IsoDate; counts: number[]; hrefForDay: (day: number) => string }) {
  return (
    <nav className={styles.dayTabs} aria-label="曜日">
      {WEEKDAY_LABELS.map((label, index) => {
        const date = addDays(weekStart, index);
        const isToday = date === today;
        return (
          <Link key={label} href={hrefForDay(index)} className={styles.dayTab} aria-current={index === activeDay ? "page" : undefined} scroll={false}>
            <span className={`${styles.dayLabel} ${weekdayClass(index) ?? ""}`}>{label}</span>
            <span className={styles.dayDate}>{formatDateShort(date)}</span>
            <span className={styles.dayCount}>{counts[index] ?? 0}</span>
            {isToday ? <span className={styles.todayDot} aria-label="今日" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function ScheduleLegend() {
  return (
    <ul role="list" className={styles.legend} aria-label="凡例">
      <li>
        <span className={`${styles.swatch} ${styles.swatchNew}`} aria-hidden="true" />新：第1話
      </li>
      <li>
        <span className={`${styles.swatch} ${styles.swatchFinal}`} aria-hidden="true" />終：最終回
      </li>
      <li>
        <span className={`${styles.swatch} ${styles.swatchRerun}`} aria-hidden="true" />再：再放送（再* は本サイト推定）
      </li>
      <li>
        <span className={styles.legendTime}>25:30</span>＝翌日1:30（5時切替のアニメ時刻）
      </li>
    </ul>
  );
}

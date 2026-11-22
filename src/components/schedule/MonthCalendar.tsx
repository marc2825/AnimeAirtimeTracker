"use client";

import Link from "next/link";
import { useState } from "react";

import { WEEKDAY_KEYS, WEEKDAY_LABELS, animeWeekStart, weekdayOf, type IsoDate } from "@/domain/time";
import { monthGrid, shiftMonth, yearMonthOf, type YearMonth } from "@/lib/month-grid";
import { buildHref } from "@/lib/search-params";

import styles from "./MonthCalendar.module.css";

const monthKey = ({ year, month }: YearMonth) => year * 12 + month;

/**
 * A month of days, each linking to that day's programme guide. Weeks start on Monday like the guide.
 * Days outside the fetched range are shown without a link. Paging through months is local state.
 */
export function MonthCalendar({
  today,
  selectedWeek,
  min,
  max,
  params = {}
}: {
  /** Today's anime date (05:00 rollover). */
  today: IsoDate;
  /** Monday of the week shown on the page, to mark it. */
  selectedWeek?: IsoDate;
  /** First and last dates with fetched data. */
  min?: IsoDate;
  max?: IsoDate;
  /** Current query of the schedule page, kept in the day links. */
  params?: Record<string, string | undefined>;
}) {
  const [shown, setShown] = useState<YearMonth>(yearMonthOf(selectedWeek ?? today));
  const first = min ? yearMonthOf(min) : null;
  const last = max ? yearMonthOf(max) : null;
  const canGo = (delta: number) => {
    const target = monthKey(shiftMonth(shown, delta));
    return (!first || target >= monthKey(first)) && (!last || target <= monthKey(last));
  };
  const go = (delta: number) => setShown((current) => shiftMonth(current, delta));
  const isThisMonth = monthKey(shown) === monthKey(yearMonthOf(today));

  return (
    <div className={styles.calendar}>
      <div className={styles.head}>
        <button type="button" className={styles.nav} onClick={() => go(-12)} disabled={!canGo(-12)} aria-label="前の年">
          «
        </button>
        <button type="button" className={styles.nav} onClick={() => go(-1)} disabled={!canGo(-1)} aria-label="前の月">
          ‹
        </button>
        <p className={styles.month} aria-live="polite">
          {shown.year}年{shown.month}月
        </p>
        <button type="button" className={styles.nav} onClick={() => go(1)} disabled={!canGo(1)} aria-label="次の月">
          ›
        </button>
        <button type="button" className={styles.nav} onClick={() => go(12)} disabled={!canGo(12)} aria-label="次の年">
          »
        </button>
      </div>
      <table className={styles.table}>
        <caption className="visually-hidden">
          {shown.year}年{shown.month}月。日付を選ぶと、その日の番組表を開きます。
        </caption>
        <thead>
          <tr>
            {WEEKDAY_LABELS.map((label, index) => (
              <th key={label} scope="col" className={index === 5 ? "sat" : index === 6 ? "sun" : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(shown).map((week, index) => {
            const monday = week.find((date) => date !== null);
            const selected = Boolean(selectedWeek && monday && animeWeekStart(monday) === selectedWeek);
            return (
              <tr key={index} className={selected ? styles.selectedWeek : undefined}>
                {week.map((date, weekday) => {
                  if (!date) return <td key={weekday} />;
                  const day = Number(date.slice(8));
                  const tone = weekday === 5 ? "sat" : weekday === 6 ? "sun" : "";
                  if ((min && date < min) || (max && date > max)) {
                    return (
                      <td key={weekday}>
                        <span className={styles.outside}>{day}</span>
                      </td>
                    );
                  }
                  return (
                    <td key={weekday}>
                      <Link
                        href={buildHref("/schedule", params, { week: animeWeekStart(date), day: WEEKDAY_KEYS[weekdayOf(date)] })}
                        className={`${styles.day} ${tone}`}
                        aria-current={date === today ? "date" : undefined}
                        aria-label={`${shown.month}月${day}日（${WEEKDAY_LABELS[weekday]}）の番組表${date === today ? "、今日" : ""}`}
                      >
                        {day}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {isThisMonth ? null : (
        <button type="button" className={styles.reset} onClick={() => setShown(yearMonthOf(today))}>
          今月に戻る
        </button>
      )}
    </div>
  );
}

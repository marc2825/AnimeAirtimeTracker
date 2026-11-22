import { addDays, weekdayOf, type IsoDate } from "@/domain/time";

export interface YearMonth {
  year: number;
  /** 1–12 */
  month: number;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

export function yearMonthOf(date: IsoDate): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** Weeks of a month, Monday first (the site's week); days outside the month are null. */
export function monthGrid({ year, month }: YearMonth): (IsoDate | null)[][] {
  const first: IsoDate = `${year}-${pad2(month)}-01`;
  const next = shiftMonth({ year, month }, 1);
  const end: IsoDate = `${next.year}-${pad2(next.month)}-01`;
  const weeks: (IsoDate | null)[][] = [];
  let week: (IsoDate | null)[] = Array<IsoDate | null>(weekdayOf(first)).fill(null);
  for (let date = first; date < end; date = addDays(date, 1)) {
    week.push(date);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push([...week, ...Array<IsoDate | null>(7 - week.length).fill(null)]);
  return weeks;
}

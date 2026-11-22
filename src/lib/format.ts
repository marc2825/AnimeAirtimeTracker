import { formatSeason, seasonFromOrdinal } from "@/domain/season";
import { formatAnimeMinute, toAnimeTime, toJstParts, WEEKDAY_LABELS, type IsoDate } from "@/domain/time";

export type ClockMode = "anime" | "real";

/** `25:30` (anime) or `翌01:30` (real clock). */
export function formatStartTime(animeMinute: number, mode: ClockMode): string {
  if (mode === "anime" || animeMinute < 24 * 60) return formatAnimeMinute(animeMinute);
  return `翌${formatAnimeMinute(animeMinute - 24 * 60)}`;
}

export function formatDateShort(isoDate: IsoDate): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${m}/${d}`;
}

export function formatDateWithWeekday(isoDate: IsoDate, weekday: number): string {
  return `${formatDateShort(isoDate)}(${WEEKDAY_LABELS[weekday]})`;
}

export function formatDateTime(value: Date): string {
  const p = toJstParts(value);
  return `${p.year}/${p.month}/${p.day} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function formatDateJa(value: Date): string {
  const p = toJstParts(value);
  return `${p.year}年${p.month}月${p.day}日`;
}

export function formatYearMonth(year: number | null, month: number | null): string | null {
  if (!year) return null;
  return month ? `${year}年${month}月` : `${year}年`;
}

export function formatSeasonOrdinal(ordinal: number): string {
  return formatSeason(seasonFromOrdinal(ordinal));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function formatDelay(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  if (abs < 60) return `${sign}${abs}分`;
  if (abs < 24 * 60) return `${sign}${Math.round(abs / 6) / 10}時間`;
  return `${sign}${Math.round(abs / 144) / 10}日`;
}

export function weekdayClass(weekday: number): string | undefined {
  return weekday === 5 ? "sat" : weekday === 6 ? "sun" : undefined;
}

export function episodeText(episodeNumber: number | null, episodeLabel: string | null): string | null {
  if (episodeNumber !== null) return `#${episodeNumber}`;
  return episodeLabel;
}

/** Coverage as inclusive anime dates: the exclusive end instant (05:00) belongs to the previous anime day. */
export function formatCoverage(range: { start: Date; end: Date }): string {
  const first = toAnimeTime(range.start).animeDate;
  const last = toAnimeTime(new Date(range.end.getTime() - 1)).animeDate;
  return `${first.replaceAll("-", "/")} 〜 ${last.replaceAll("-", "/")}`;
}


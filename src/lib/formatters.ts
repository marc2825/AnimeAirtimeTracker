import {
  companyRoleLabels,
  durationLabels,
  quarterLabels,
  slotTypeLabels,
  sourceTypeLabels,
  staffRoleLabels,
  weekdayLabels
} from "@/lib/labels";
import type {
  AnimeWeekday,
  CompanyRole,
  DurationCategory,
  SeasonQuarter,
  SlotType,
  SourceType,
  StaffRole
} from "@/lib/types";

export function formatSeason(year: number, quarter: SeasonQuarter): string {
  return `${year}年${quarterLabels[quarter]}`;
}

export function formatDateTimeJst(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function formatAnimeSchedule(day: AnimeWeekday, timeText: string): string {
  return `${weekdayLabels[day]}曜${timeText}`;
}

export function formatSourceType(sourceType: SourceType | null): string {
  return sourceType ? sourceTypeLabels[sourceType] : "未設定";
}

export function formatSlotType(slotType: SlotType): string {
  return slotTypeLabels[slotType];
}

export function formatDuration(duration: DurationCategory): string {
  return durationLabels[duration];
}

export function formatCompanyRole(role: CompanyRole): string {
  return companyRoleLabels[role];
}

export function formatStaffRole(role: StaffRole): string {
  return staffRoleLabels[role];
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatRelativeDayTime(day: AnimeWeekday, hour24: number, minute: number): string {
  return `${weekdayLabels[day]}曜${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

import type {
  AnimeWeekday,
  CompanyRole,
  DurationCategory,
  SeasonQuarter,
  SlotType,
  SourceType,
  StaffRole
} from "@/lib/types";

export const weekdayLabels: Record<AnimeWeekday, string> = {
  MON: "月",
  TUE: "火",
  WED: "水",
  THU: "木",
  FRI: "金",
  SAT: "土",
  SUN: "日"
};

export const quarterLabels: Record<SeasonQuarter, string> = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  AUTUMN: "秋"
};

export const sourceTypeLabels: Record<SourceType, string> = {
  ORIGINAL: "オリジナル",
  MANGA: "漫画",
  LIGHT_NOVEL: "ライトノベル",
  NOVEL: "小説",
  GAME: "ゲーム"
};

export const slotTypeLabels: Record<SlotType, string> = {
  OFFICIAL: "公式枠",
  COMMON_NAME: "通称枠",
  INFERRED: "推定枠",
  TEMPORARY: "一時的枠",
  ENDED: "消滅枠"
};

export const durationLabels: Record<DurationCategory, string> = {
  SHORT_5: "5分",
  SHORT_10: "10分",
  HALF_15: "15分",
  STANDARD_30: "30分",
  LONG_60: "60分"
};

export const companyRoleLabels: Record<CompanyRole, string> = {
  ANIMATION: "制作",
  PRODUCTION: "製作",
  COMMITTEE: "出資"
};

export const staffRoleLabels: Record<StaffRole, string> = {
  DIRECTOR: "監督",
  SERIES_COMPOSITION: "シリーズ構成",
  CHARACTER_DESIGN: "キャラクターデザイン",
  MUSIC: "音楽",
  SCRIPT: "脚本"
};

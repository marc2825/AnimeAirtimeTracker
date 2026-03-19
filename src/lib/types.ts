export const animeWeekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export const seasonQuarters = ["WINTER", "SPRING", "SUMMER", "AUTUMN"] as const;
export const sourceTypes = ["ORIGINAL", "MANGA", "LIGHT_NOVEL", "NOVEL", "GAME"] as const;
export const slotTypes = ["OFFICIAL", "COMMON_NAME", "INFERRED", "TEMPORARY", "ENDED"] as const;
export const durationCategories = [
  "SHORT_5",
  "SHORT_10",
  "HALF_15",
  "STANDARD_30",
  "LONG_60"
] as const;
export const channelGroups = ["KEY", "INDEPENDENT", "REGIONAL", "BS", "CS"] as const;
export const regionGroups = ["KANTO", "KANSAI", "CHUKYO", "BS", "CS"] as const;
export const companyRoles = ["ANIMATION", "PRODUCTION", "COMMITTEE"] as const;
export const staffRoles = [
  "DIRECTOR",
  "SERIES_COMPOSITION",
  "CHARACTER_DESIGN",
  "MUSIC",
  "SCRIPT"
] as const;
export const sequelRelationTypes = ["DIRECT_SEQUEL", "SPLIT_COUR", "SPIN_OFF"] as const;

export type AnimeWeekday = (typeof animeWeekdays)[number];
export type SeasonQuarter = (typeof seasonQuarters)[number];
export type SourceType = (typeof sourceTypes)[number];
export type SlotType = (typeof slotTypes)[number];
export type DurationCategory = (typeof durationCategories)[number];
export type ChannelGroup = (typeof channelGroups)[number];
export type RegionGroup = (typeof regionGroups)[number];
export type CompanyRole = (typeof companyRoles)[number];
export type StaffRole = (typeof staffRoles)[number];
export type SequelRelationType = (typeof sequelRelationTypes)[number];

export interface Region {
  id: string;
  slug: string;
  name: string;
  group: RegionGroup;
}

export interface Channel {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  group: ChannelGroup;
  regionId: string;
}

export interface Slot {
  id: string;
  slug: string;
  name: string;
  aliasNames: string[];
  slotType: SlotType;
  channelId: string;
  representativeDay: AnimeWeekday;
  representativeTimeText: string;
  startDate: string;
  endDate: string | null;
  confidence: number;
  description: string;
}

export interface Title {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  kana: string | null;
  seasonYear: number;
  seasonQuarter: SeasonQuarter;
  sourceType: SourceType | null;
  category: string | null;
  sequelType: SequelRelationType | null;
  isSequel: boolean;
  isSplitCour: boolean;
  durationCategory: DurationCategory;
  genres: string[];
  summary: string;
  sourceName: string;
  lastUpdatedAt: string;
  notes: string | null;
}

export interface Company {
  id: string;
  slug: string;
  name: string;
}

export interface TitleCompany {
  id: string;
  titleId: string;
  companyId: string;
  role: CompanyRole;
  isPrimary: boolean;
}

export interface Person {
  id: string;
  slug: string;
  name: string;
}

export interface TitleStaff {
  id: string;
  titleId: string;
  personId: string;
  role: StaffRole;
}

export interface SequelRelation {
  id: string;
  fromTitleId: string;
  toTitleId: string;
  relationType: SequelRelationType;
  note: string | null;
}

export interface Airing {
  id: string;
  titleId: string;
  channelId: string;
  regionId: string;
  slotId: string | null;
  broadcastStartAt: string;
  broadcastEndAt: string;
  animeBroadcastDay: AnimeWeekday;
  animeBroadcastTimeText: string;
  animeBroadcastHour24: number;
  animeBroadcastMinute: number;
  durationCategory: DurationCategory;
  episodeLengthMinutes: number;
  isFirstRun: boolean;
  isRebroadcast: boolean;
  hasNote: boolean;
  note: string | null;
}

import type {
  AnimeWeekday,
  ChannelGroup,
  DurationCategory,
  RegionGroup,
  SeasonQuarter,
  SourceType
} from "@/lib/types";

export const officialNonHtmlEndpoints = [
  "db.php",
  "rss2.php",
  "json.php",
  "proginfo.xml",
  "titleinfo.xml",
  "chinfo.xml",
  "mock-json"
] as const;

export type CollectorMode = "backfill" | "incremental";
export type OfficialNonHtmlEndpoint = (typeof officialNonHtmlEndpoints)[number];

export interface CollectorRequestWindow {
  label: string;
  year?: number;
  quarter?: SeasonQuarter;
  from?: string;
  to?: string;
  cursor?: string;
}

export interface CollectorRequest {
  sourceId: string;
  endpoint: OfficialNonHtmlEndpoint;
  mode: CollectorMode;
  transport: "official-non-html";
  window: CollectorRequestWindow;
}

export interface RawCollectorSnapshot<TPayload = unknown> {
  schemaVersion: 1;
  sourceId: string;
  endpoint: OfficialNonHtmlEndpoint;
  transport: "official-non-html";
  mode: CollectorMode;
  fetchedAt: string;
  requestFingerprint: string;
  payloadHash: string;
  responseMeta: {
    status: number;
    contentType: string;
    fixturePath?: string;
  };
  window: CollectorRequestWindow;
  payload: TPayload;
}

export interface CollectorFetchResponse<TPayload> {
  fetchedAt: string;
  payload: TPayload;
  responseMeta: {
    status: number;
    contentType: string;
    fixturePath?: string;
  };
}

export interface NormalizedChannelRecord {
  externalChannelId: string;
  slug: string;
  name: string;
  shortName: string;
  channelGroup: ChannelGroup;
  regionGroup: RegionGroup;
  sourcePointer: string;
}

export interface NormalizedTitleRecord {
  externalTitleId: string;
  slug: string;
  name: string;
  shortName: string | null;
  seasonYear: number;
  seasonQuarter: SeasonQuarter;
  category: string | null;
  sourceType: SourceType | null;
  summary: string | null;
  sourcePointer: string;
}

export interface NormalizedAiringRecord {
  externalProgramId: string;
  externalTitleId: string;
  externalChannelId: string;
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
  slotHintKey: string | null;
  slotHintLabel: string | null;
  sourcePointer: string;
}

export interface NormalizedSourceRecord {
  recordType: "channel" | "title" | "program";
  externalId: string;
  pointer: string;
  fetchedAt: string;
  payloadHash: string;
}

export interface CollectorEntityDigest {
  entityKey: string;
  hash: string;
}

export interface NormalizedCollectorSnapshot {
  schemaVersion: 1;
  sourceId: string;
  windowLabel: string;
  generatedAt: string;
  rawSnapshotRef: string;
  summary: {
    channelCount: number;
    titleCount: number;
    airingCount: number;
    sourceRecordCount: number;
  };
  channels: NormalizedChannelRecord[];
  titles: NormalizedTitleRecord[];
  airings: NormalizedAiringRecord[];
  sourceRecords: NormalizedSourceRecord[];
  entityDigests: CollectorEntityDigest[];
}

export interface CollectorWindowState {
  windowLabel: string;
  latestPayloadHash: string;
  entityHashes: Record<string, string>;
  updatedAt: string;
}

export interface CollectorState {
  schemaVersion: 1;
  sourceId: string;
  windows: Record<string, CollectorWindowState>;
}

export interface CollectorChangeSummary {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  changed: boolean;
}

export interface CollectorRunLog {
  schemaVersion: 1;
  runId: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  request: CollectorRequest;
  rawPath: string;
  normalizedPath: string;
  statePath: string;
  payloadHash: string;
  summary: CollectorChangeSummary;
  addedKeys: string[];
  updatedKeys: string[];
  removedKeys: string[];
  unchangedKeys: string[];
}

export interface CollectorPipelineResult {
  rawPath: string;
  normalizedPath: string;
  statePath: string;
  logPath: string;
  summary: CollectorChangeSummary;
  normalized: NormalizedCollectorSnapshot;
  rawSnapshot: RawCollectorSnapshot;
}

export interface CollectorProvider<TPayload> {
  definition: {
    sourceId: string;
    endpoint: OfficialNonHtmlEndpoint;
    transport: "official-non-html";
    description: string;
  };
  fetch(request: CollectorRequest): Promise<CollectorFetchResponse<TPayload>>;
  normalize(input: {
    snapshot: RawCollectorSnapshot<TPayload>;
    rawSnapshotRef: string;
  }): NormalizedCollectorSnapshot;
}

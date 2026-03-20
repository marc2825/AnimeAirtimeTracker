import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DurationCategory, SourceType } from "@/lib/types";

import type {
  CollectorProvider,
  NormalizedAiringRecord,
  NormalizedChannelRecord,
  NormalizedCollectorSnapshot,
  NormalizedSourceRecord,
  NormalizedTitleRecord,
  RawCollectorSnapshot
} from "../types";
import { hashValue } from "../utils";

export interface MockOfficialChannelPayload {
  channelId: string;
  slug: string;
  name: string;
  shortName: string;
  channelGroup: NormalizedChannelRecord["channelGroup"];
  regionGroup: NormalizedChannelRecord["regionGroup"];
}

export interface MockOfficialTitlePayload {
  titleId: string;
  slug: string;
  name: string;
  shortName: string | null;
  seasonYear: number;
  seasonQuarter: NormalizedTitleRecord["seasonQuarter"];
  category: string | null;
  sourceType: SourceType | null;
  summary: string | null;
}

export interface MockOfficialProgramPayload {
  programId: string;
  titleId: string;
  channelId: string;
  startAt: string;
  endAt: string;
  animeBroadcastDay: NormalizedAiringRecord["animeBroadcastDay"];
  animeBroadcastTimeText: string;
  animeBroadcastHour24: number;
  animeBroadcastMinute: number;
  episodeLengthMinutes: number;
  flags: string[];
  note: string | null;
  slotHint?: {
    key: string;
    label: string;
  } | null;
}

export interface MockOfficialFeedPayload {
  generatedAt: string;
  channels: MockOfficialChannelPayload[];
  titles: MockOfficialTitlePayload[];
  programs: MockOfficialProgramPayload[];
}

function getDurationCategory(lengthMinutes: number): DurationCategory {
  if (lengthMinutes <= 5) {
    return "SHORT_5";
  }

  if (lengthMinutes <= 10) {
    return "SHORT_10";
  }

  if (lengthMinutes <= 15) {
    return "HALF_15";
  }

  if (lengthMinutes <= 30) {
    return "STANDARD_30";
  }

  return "LONG_60";
}

function toSourcePointer(recordType: NormalizedSourceRecord["recordType"], externalId: string): string {
  return `${recordType}:${externalId}`;
}

function buildNormalizedChannels(payload: MockOfficialFeedPayload): NormalizedChannelRecord[] {
  return payload.channels.map((channel) => ({
    externalChannelId: channel.channelId,
    slug: channel.slug,
    name: channel.name,
    shortName: channel.shortName,
    channelGroup: channel.channelGroup,
    regionGroup: channel.regionGroup,
    sourcePointer: toSourcePointer("channel", channel.channelId)
  }));
}

function buildNormalizedTitles(payload: MockOfficialFeedPayload): NormalizedTitleRecord[] {
  return payload.titles.map((title) => ({
    externalTitleId: title.titleId,
    slug: title.slug,
    name: title.name,
    shortName: title.shortName,
    seasonYear: title.seasonYear,
    seasonQuarter: title.seasonQuarter,
    category: title.category,
    sourceType: title.sourceType,
    summary: title.summary,
    sourcePointer: toSourcePointer("title", title.titleId)
  }));
}

function buildNormalizedAirings(payload: MockOfficialFeedPayload): NormalizedAiringRecord[] {
  return payload.programs.map((program) => {
    const flags = new Set(program.flags.map((flag) => flag.toUpperCase()));
    const isRebroadcast = flags.has("REBROADCAST") || flags.has("REPEAT") || flags.has("RE");

    return {
      externalProgramId: program.programId,
      externalTitleId: program.titleId,
      externalChannelId: program.channelId,
      broadcastStartAt: program.startAt,
      broadcastEndAt: program.endAt,
      animeBroadcastDay: program.animeBroadcastDay,
      animeBroadcastTimeText: program.animeBroadcastTimeText,
      animeBroadcastHour24: program.animeBroadcastHour24,
      animeBroadcastMinute: program.animeBroadcastMinute,
      durationCategory: getDurationCategory(program.episodeLengthMinutes),
      episodeLengthMinutes: program.episodeLengthMinutes,
      isFirstRun: !isRebroadcast,
      isRebroadcast,
      hasNote: Boolean(program.note) || flags.has("NOTE"),
      note: program.note,
      slotHintKey: program.slotHint?.key ?? null,
      slotHintLabel: program.slotHint?.label ?? null,
      sourcePointer: toSourcePointer("program", program.programId)
    };
  });
}

function buildSourceRecords(
  snapshot: RawCollectorSnapshot<MockOfficialFeedPayload>
): NormalizedSourceRecord[] {
  const channelRecords = snapshot.payload.channels.map((channel) => ({
    recordType: "channel" as const,
    externalId: channel.channelId,
    pointer: toSourcePointer("channel", channel.channelId),
    fetchedAt: snapshot.fetchedAt,
    payloadHash: snapshot.payloadHash
  }));
  const titleRecords = snapshot.payload.titles.map((title) => ({
    recordType: "title" as const,
    externalId: title.titleId,
    pointer: toSourcePointer("title", title.titleId),
    fetchedAt: snapshot.fetchedAt,
    payloadHash: snapshot.payloadHash
  }));
  const programRecords = snapshot.payload.programs.map((program) => ({
    recordType: "program" as const,
    externalId: program.programId,
    pointer: toSourcePointer("program", program.programId),
    fetchedAt: snapshot.fetchedAt,
    payloadHash: snapshot.payloadHash
  }));

  return [...channelRecords, ...titleRecords, ...programRecords];
}

function buildEntityDigests(snapshot: Omit<NormalizedCollectorSnapshot, "entityDigests">) {
  return [
    ...snapshot.channels.map((record) => ({
      entityKey: `channel:${record.externalChannelId}`,
      hash: hashValue(record)
    })),
    ...snapshot.titles.map((record) => ({
      entityKey: `title:${record.externalTitleId}`,
      hash: hashValue(record)
    })),
    ...snapshot.airings.map((record) => ({
      entityKey: `airing:${record.externalProgramId}`,
      hash: hashValue(record)
    })),
    ...snapshot.sourceRecords.map((record) => ({
      entityKey: `source-record:${record.recordType}:${record.externalId}`,
      hash: hashValue(record)
    }))
  ];
}

function defaultFixturePath() {
  return path.join(
    process.cwd(),
    "scripts",
    "collector",
    "fixtures",
    "mock-official-feed",
    "2024-spring.json"
  );
}

export function createMockOfficialFeedProvider(options?: {
  fixturePath?: string;
}): CollectorProvider<MockOfficialFeedPayload> {
  const fixturePath = options?.fixturePath ?? defaultFixturePath();

  return {
    definition: {
      sourceId: "mock-official-feed",
      endpoint: "mock-json",
      transport: "official-non-html",
      description: "公式非HTML出力を模したダミー JSON レスポンス"
    },
    async fetch() {
      const content = await readFile(fixturePath, "utf8");
      const payload = JSON.parse(content) as MockOfficialFeedPayload;

      return {
        fetchedAt: payload.generatedAt,
        payload,
        responseMeta: {
          status: 200,
          contentType: "application/json",
          fixturePath
        }
      };
    },
    normalize({ snapshot, rawSnapshotRef }) {
      const baseSnapshot = {
        schemaVersion: 1 as const,
        sourceId: snapshot.sourceId,
        windowLabel: snapshot.window.label,
        generatedAt: snapshot.fetchedAt,
        rawSnapshotRef,
        summary: {
          channelCount: snapshot.payload.channels.length,
          titleCount: snapshot.payload.titles.length,
          airingCount: snapshot.payload.programs.length,
          sourceRecordCount:
            snapshot.payload.channels.length + snapshot.payload.titles.length + snapshot.payload.programs.length
        },
        channels: buildNormalizedChannels(snapshot.payload),
        titles: buildNormalizedTitles(snapshot.payload),
        airings: buildNormalizedAirings(snapshot.payload),
        sourceRecords: buildSourceRecords(snapshot)
      };

      return {
        ...baseSnapshot,
        entityDigests: buildEntityDigests(baseSnapshot)
      };
    }
  };
}

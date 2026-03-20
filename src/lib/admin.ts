import { channels, regions, slots, titles } from "@/data/catalog";
import type { AnimeWeekday, Region, SlotType } from "@/lib/types";

export type AdminJobStatus = "success" | "running" | "error" | "queued";
export type AdminErrorSeverity = "error" | "warning";
export type AdminCorrectionStatus = "open" | "reviewing" | "applied";

export interface AdminJobEntry {
  id: string;
  label: string;
  sourceId: string;
  mode: "backfill" | "incremental";
  windowLabel: string;
  status: AdminJobStatus;
  startedAt: string;
  finishedAt: string | null;
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  rawPath: string;
  normalizedPath: string;
}

export interface AdminErrorEntry {
  id: string;
  severity: AdminErrorSeverity;
  sourceId: string;
  stage: "fetch" | "normalize" | "diff" | "persist";
  message: string;
  detail: string;
  retryable: boolean;
  lastOccurredAt: string;
  relatedJobLabel: string;
}

export interface AdminSlotMasterDraft {
  slotId: string;
  slug: string;
  currentName: string;
  proposedName: string;
  aliasNames: string;
  slotType: SlotType;
  representativeDay: AnimeWeekday;
  representativeTimeText: string;
  confidence: number;
  channelName: string;
  regionName: string;
  description: string;
  ruleMemo: string;
  correctionNote: string;
  statusLabel: "要確認" | "運用中" | "補完候補";
}

export interface AdminRegionMasterDraft {
  regionId: string;
  slug: string;
  name: string;
  groupLabel: string;
  channelCount: number;
  channelNames: string;
  lateNightThresholdText: string;
  normalizationMemo: string;
  correctionNote: string;
}

export interface AdminCorrectionEntry {
  id: string;
  entityType: "作品" | "放送" | "放送枠" | "地域";
  targetLabel: string;
  targetHref: string | null;
  fieldLabel: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  sourceLabel: string;
  status: AdminCorrectionStatus;
  updatedAt: string;
}

export interface AdminConsoleData {
  jobs: AdminJobEntry[];
  errors: AdminErrorEntry[];
  slotDrafts: AdminSlotMasterDraft[];
  regionDrafts: AdminRegionMasterDraft[];
  corrections: AdminCorrectionEntry[];
}

function getChannelsForRegion(region: Region) {
  return channels.filter((channel) => channel.regionId === region.id);
}

export function getAdminConsoleData(): AdminConsoleData {
  const jobs: AdminJobEntry[] = [
    {
      id: "job-backfill-2024-spring",
      label: "2024年春バックフィル",
      sourceId: "mock-official-feed",
      mode: "backfill",
      windowLabel: "2024-SPRING",
      status: "success",
      startedAt: "2026-03-20T11:55:00+09:00",
      finishedAt: "2026-03-20T11:55:02+09:00",
      added: 14,
      updated: 0,
      removed: 0,
      unchanged: 0,
      rawPath: "data/collector/raw/mock-official-feed/2024-SPRING/....json",
      normalizedPath: "data/collector/normalized/mock-official-feed/2024-SPRING/....json"
    },
    {
      id: "job-incremental-last-7d",
      label: "直近7日差分更新",
      sourceId: "mock-official-feed",
      mode: "incremental",
      windowLabel: "last-7-days",
      status: "running",
      startedAt: "2026-03-20T12:10:00+09:00",
      finishedAt: null,
      added: 0,
      updated: 2,
      removed: 0,
      unchanged: 11,
      rawPath: "data/collector/raw/mock-official-feed/last-7-days/....json",
      normalizedPath: "data/collector/normalized/mock-official-feed/last-7-days/....json"
    },
    {
      id: "job-channel-refresh",
      label: "チャンネル更新通知取込",
      sourceId: "mock-official-feed",
      mode: "incremental",
      windowLabel: "channel-info",
      status: "queued",
      startedAt: "2026-03-20T12:20:00+09:00",
      finishedAt: null,
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      rawPath: "data/collector/raw/mock-official-feed/channel-info/....json",
      normalizedPath: "data/collector/normalized/mock-official-feed/channel-info/....json"
    },
    {
      id: "job-title-refresh-error",
      label: "タイトル更新通知再取得",
      sourceId: "mock-official-feed",
      mode: "incremental",
      windowLabel: "title-info",
      status: "error",
      startedAt: "2026-03-20T10:40:00+09:00",
      finishedAt: "2026-03-20T10:40:01+09:00",
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      rawPath: "data/collector/raw/mock-official-feed/title-info/....json",
      normalizedPath: "data/collector/normalized/mock-official-feed/title-info/....json"
    }
  ];

  const errors: AdminErrorEntry[] = [
    {
      id: "error-titleinfo-timeout",
      severity: "error",
      sourceId: "mock-official-feed",
      stage: "fetch",
      message: "title 更新通知の取得がタイムアウトしました。",
      detail: "指数バックオフ後に 1 回再試行済み。次回ジョブで再取得予定です。",
      retryable: true,
      lastOccurredAt: "2026-03-20T10:40:01+09:00",
      relatedJobLabel: "タイトル更新通知再取得"
    },
    {
      id: "error-slot-hint-ambiguous",
      severity: "warning",
      sourceId: "mock-official-feed",
      stage: "normalize",
      message: "放送枠候補キーが既存マスタに一意対応しません。",
      detail: "TOKYO MX 水曜26:00帯が `水曜リゾナンス帯` と `補完候補枠` に重複しています。",
      retryable: false,
      lastOccurredAt: "2026-03-20T11:58:44+09:00",
      relatedJobLabel: "直近7日差分更新"
    },
    {
      id: "error-region-rule-missing",
      severity: "warning",
      sourceId: "manual-review",
      stage: "persist",
      message: "新規チャンネルに地域正規化ルールが未設定です。",
      detail: "次回実装では region master 保存時にルールバリデーションを追加予定です。",
      retryable: false,
      lastOccurredAt: "2026-03-20T09:12:30+09:00",
      relatedJobLabel: "地域マスタ編集"
    }
  ];

  const slotDrafts: AdminSlotMasterDraft[] = slots.map((slot, index) => {
    const channel = channels.find((entry) => entry.id === slot.channelId);
    const region = channel ? regions.find((entry) => entry.id === channel.regionId) : null;
    const suffix = index % 3 === 0 ? "（仮称維持）" : index % 3 === 1 ? "・補完候補" : "";

    return {
      slotId: slot.id,
      slug: slot.slug,
      currentName: slot.name,
      proposedName: `${slot.name}${suffix}`,
      aliasNames: slot.aliasNames.join("\n"),
      slotType: slot.slotType,
      representativeDay: slot.representativeDay,
      representativeTimeText: slot.representativeTimeText,
      confidence: slot.confidence,
      channelName: channel?.name ?? "未設定",
      regionName: region?.name ?? "未設定",
      description: slot.description,
      ruleMemo: `${channel?.name ?? "局未設定"} / ${slot.representativeDay} / ${slot.representativeTimeText} / 継続2クール以上で候補化`,
      correctionNote:
        index % 2 === 0
          ? "通称枠と推定枠の境界を管理者が確認する前提。"
          : "別名が放送表表記に近いかを運用で補完する想定。",
      statusLabel: index % 3 === 0 ? "要確認" : index % 3 === 1 ? "補完候補" : "運用中"
    };
  });

  const regionDrafts: AdminRegionMasterDraft[] = regions.map((region, index) => {
    const regionChannels = getChannelsForRegion(region);

    return {
      regionId: region.id,
      slug: region.slug,
      name: region.name,
      groupLabel: region.group,
      channelCount: regionChannels.length,
      channelNames: regionChannels.map((channel) => channel.name).join(" / ") || "未割当",
      lateNightThresholdText: index % 2 === 0 ? "21:00 - 28:00" : "23:00 - 28:00",
      normalizationMemo:
        region.group === "BS" || region.group === "CS"
          ? "全国向け配信と混ざらないよう、衛星系の内部ルールを分離。"
          : "キー局・独立局・ローカル局の混在を許容しつつ、比較用にまとめる。",
      correctionNote:
        index === 0 ? "関東基準の比較軸として優先表示。" : "系列局追加時にグループ再計算を行う。"
    };
  });

  const corrections: AdminCorrectionEntry[] = [
    {
      id: "correction-slot-name-1",
      entityType: "放送枠",
      targetLabel: slots[0]?.name ?? "放送枠",
      targetHref: slots[0] ? `/slots/${slots[0].slug}` : null,
      fieldLabel: "正式表示名",
      currentValue: slots[0]?.name ?? "未設定",
      suggestedValue: "月曜アーバン枠（都市圏新作帯）",
      reason: "別名の検索ヒット率を上げつつ、正式名を崩さず補完したい。",
      sourceLabel: "手動レビュー",
      status: "open",
      updatedAt: "2026-03-20T11:48:00+09:00"
    },
    {
      id: "correction-region-group-1",
      entityType: "地域",
      targetLabel: regions[1]?.name ?? "地域",
      targetHref: null,
      fieldLabel: "比較グループ",
      currentValue: regions[1]?.group ?? "未設定",
      suggestedValue: "KANSAI",
      reason: "系列再編後も比較UIの列を安定させるため、手動固定しておきたい。",
      sourceLabel: "collector warning",
      status: "reviewing",
      updatedAt: "2026-03-20T10:55:00+09:00"
    },
    {
      id: "correction-title-short-name",
      entityType: "作品",
      targetLabel: titles[0]?.name ?? "作品",
      targetHref: titles[0] ? `/titles/${titles[0].slug}` : null,
      fieldLabel: "短縮タイトル",
      currentValue: titles[0]?.shortName ?? "未設定",
      suggestedValue: "月シグ",
      reason: "検索略称と番組表略称を揃えるため。",
      sourceLabel: "手動補完メモ",
      status: "applied",
      updatedAt: "2026-03-19T20:10:00+09:00"
    },
    {
      id: "correction-airing-note",
      entityType: "放送",
      targetLabel: "京街リゾナンス 第二幕 / TOKYO MX",
      targetHref: titles[1] ? `/titles/${titles[1].slug}` : null,
      fieldLabel: "注記",
      currentValue: "未設定",
      suggestedValue: "初回のみ5分拡大",
      reason: "collector の NOTE フラグだけでは表現が粗いため。",
      sourceLabel: "normalized review",
      status: "open",
      updatedAt: "2026-03-20T12:02:00+09:00"
    }
  ];

  return {
    jobs,
    errors,
    slotDrafts,
    regionDrafts,
    corrections
  };
}

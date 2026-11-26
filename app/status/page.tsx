import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { Badge, Notice, PageHeader, Section, SkeletonBlock, StatGrid, StatTile } from "@/components/ui/primitives";
import { isDataStale } from "@/domain/freshness";
import { formatCoverage, formatDateTime, formatNumber } from "@/lib/format";
import { getDatasetStatus } from "@/server/queries/status";

import styles from "./status.module.css";

export const metadata: Metadata = {
  title: "データ更新状況",
  description: "番組データの最終取得日時、取得済みの期間、取り込みの実行履歴。",
  alternates: { canonical: "/status" }
};

const COMMAND_LABELS: Record<string, string> = {
  season: "クール取得",
  backfill: "過去分取得",
  recent: "直近の再取得",
  update: "差分更新",
  subtitles: "サブタイトルの取得",
  channels: "放送局情報",
  derive: "放送枠の算出",
  "reparse-titles": "保存済みデータの再解析",
  fixtures: "テスト用データ"
};

const STATUS_TONE: Record<string, "accent" | "danger" | "note" | "neutral"> = { SUCCEEDED: "accent", FAILED: "danger", PARTIAL: "note", RUNNING: "neutral" };
const STATUS_LABEL: Record<string, string> = { SUCCEEDED: "成功", FAILED: "失敗", PARTIAL: "一部", RUNNING: "実行中" };

export default function StatusPage() {
  return (
    <div className="container">
      <PageHeader title="データ更新状況" lead="実際の取得履歴（停止や失敗もそのまま表示）" />
      <Suspense fallback={<SkeletonBlock rows={6} label="更新状況を読み込み中" />}>
        <StatusContent />
      </Suspense>
    </div>
  );
}

async function StatusContent() {
  await io();
  const status = await getDatasetStatus().catch(() => null);
  if (!status) return <Notice tone="danger" title="更新状況を取得できませんでした">データベースに接続できません。</Notice>;
  const stale = isDataStale(status.lastSuccessAt);
  return (
    <>
      {stale ? (
        <Notice tone="warning" title="データが2日以上更新されていません">表示中の番組表には、その後の変更が反映されていない可能性があります。</Notice>
      ) : null}
      <StatGrid>
        <StatTile label="最終取得（成功）" value={<span className={styles.small}>{status.lastSuccessAt ? formatDateTime(status.lastSuccessAt) : "—"}</span>} />
        <StatTile
          label="取得済みの期間"
          value={<span className={styles.small}>{status.coverage ? formatCoverage(status.coverage) : "—"}</span>}
          hint="対象局を欠けなく取得できた範囲の最初と最後（アニメ時刻の日付）。今後の放送予定を含みます。"
        />
        <StatTile label="放送" value={status.totals.broadcasts} unit="件" hint={`作品 ${formatNumber(status.totals.titles)}・対象局 ${status.totals.channels}`} />
        <StatTile label="放送枠" value={status.totals.slots} unit="枠" hint="出典記載枠と推定枠の合計" />
        <StatTile
          label="話数別サブタイトル"
          value={status.subtitles.total === 0 ? 0 : Math.floor((status.subtitles.done / status.subtitles.total) * 100)}
          unit="%"
          hint={
            status.subtitles.done >= status.subtitles.total
              ? `全${formatNumber(status.subtitles.total)}作品の一覧を取得済み`
              : `${formatNumber(status.subtitles.done)} / ${formatNumber(status.subtitles.total)}作品。定期取得のたびに、最近放送された作品から順に取得しています`
          }
        />
      </StatGrid>

      <Section id="runs" title="取り込みの実行履歴" description="新しい順に最大12件"
        details="リクエスト数は出典への実際のアクセス回数です。失敗時の備考は原因の概要のみを表示します。">
        <div className={styles.tableWrap} role="region" aria-label="取り込みの実行履歴" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">開始</th>
                <th scope="col">処理</th>
                <th scope="col">結果</th>
                <th scope="col">リクエスト</th>
                <th scope="col">備考</th>
              </tr>
            </thead>
            <tbody>
              {status.recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="mono">{formatDateTime(run.startedAt)}</td>
                  <td>{COMMAND_LABELS[run.command] ?? run.command}</td>
                  <td>
                    <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>{STATUS_LABEL[run.status] ?? run.status}</Badge>
                  </td>
                  <td className="mono">{run.requestCount}</td>
                  <td className={styles.note}>{run.errorSummary ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

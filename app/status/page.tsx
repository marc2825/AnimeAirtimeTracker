import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { Badge, Notice, PageHeader, Section, SkeletonBlock, StatGrid, StatTile } from "@/components/ui/primitives";
import { formatCoverage, formatDateTime, formatNumber, isOlderThan } from "@/lib/format";
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
  channels: "放送局情報",
  derive: "放送枠の算出",
  fixtures: "テスト用データ"
};

const STATUS_TONE: Record<string, "accent" | "danger" | "note" | "neutral"> = { SUCCEEDED: "accent", FAILED: "danger", PARTIAL: "note", RUNNING: "neutral" };
const STATUS_LABEL: Record<string, string> = { SUCCEEDED: "成功", FAILED: "失敗", PARTIAL: "一部", RUNNING: "実行中" };

export default function StatusPage() {
  return (
    <div className="container">
      <PageHeader kicker="Data status" title="データ更新状況" lead="本サイトのデータベースに記録された実際の取得履歴です。取得が止まっている場合や失敗した場合もそのまま表示します。" />
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
  const stale = isOlderThan(status.lastSuccessAt, 2 * 24 * 60 * 60 * 1000);
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
        <StatTile label="放送" value={formatNumber(status.totals.broadcasts)} unit="件" hint={`作品 ${formatNumber(status.totals.titles)}・対象局 ${status.totals.channels}`} />
        <StatTile label="放送枠" value={formatNumber(status.totals.slots)} unit="枠" hint="出典記載枠と推定枠の合計" />
      </StatGrid>

      <Section id="runs" title="取り込みの実行履歴" description="新しい順に最大12件。リクエスト数は出典への実際のアクセス回数です。失敗時の備考は原因の概要のみを表示します。">
        <div className={styles.tableWrap}>
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

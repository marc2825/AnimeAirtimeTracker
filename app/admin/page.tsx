import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import {
  getAdminConsoleData,
  type AdminCorrectionStatus,
  type AdminErrorSeverity,
  type AdminJobStatus
} from "@/lib/admin";
import { formatAnimeSchedule, formatDateTimeJst, formatSlotType } from "@/lib/formatters";
import { weekdayLabels } from "@/lib/labels";
import { animeWeekdays, slotTypes } from "@/lib/types";

export const metadata: Metadata = {
  title: "管理画面 | 深夜アニメ放送枠観測所"
};

function getJobStatusLabel(status: AdminJobStatus): string {
  if (status === "success") {
    return "成功";
  }

  if (status === "running") {
    return "実行中";
  }

  if (status === "queued") {
    return "待機中";
  }

  return "失敗";
}

function getJobStatusTone(status: AdminJobStatus): "neutral" | "accent" | "warm" {
  if (status === "success") {
    return "accent";
  }

  if (status === "error") {
    return "warm";
  }

  return "neutral";
}

function getSeverityTone(severity: AdminErrorSeverity): "neutral" | "accent" | "warm" {
  return severity === "error" ? "warm" : "neutral";
}

function getSeverityLabel(severity: AdminErrorSeverity): string {
  return severity === "error" ? "エラー" : "警告";
}

function getCorrectionStatusLabel(status: AdminCorrectionStatus): string {
  if (status === "reviewing") {
    return "レビュー中";
  }

  if (status === "applied") {
    return "適用済み";
  }

  return "未対応";
}

function getCorrectionStatusTone(status: AdminCorrectionStatus): "neutral" | "accent" | "warm" {
  if (status === "applied") {
    return "accent";
  }

  if (status === "reviewing") {
    return "neutral";
  }

  return "warm";
}

function getDurationLabel(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) {
    return "継続中";
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  const diffSeconds = Math.max(0, Math.round((end - start) / 1000));

  return `${diffSeconds}秒`;
}

export default function AdminPage() {
  const admin = getAdminConsoleData();
  const errorCount = admin.jobs.filter((job) => job.status === "error").length + admin.errors.filter((error) => error.severity === "error").length;
  const runningCount = admin.jobs.filter((job) => job.status === "running" || job.status === "queued").length;
  const reviewSlotCount = admin.slotDrafts.filter((draft) => draft.statusLabel !== "運用中").length;
  const openCorrectionCount = admin.corrections.filter((entry) => entry.status !== "applied").length;

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="badge-row">
          <Badge tone="warm">管理画面 初版</Badge>
          <Badge>認証なしダミーUI</Badge>
        </div>
        <h1>取得状況、マスタ編集、手動補正の土台を先に揃える</h1>
        <p>
          本番運用前の段階として、取得ジョブ確認、エラー監視、放送枠マスタ編集、地域マスタ編集、
          手動補正一覧を一画面にまとめました。保存はまだ行わず、将来の管理機能がどこに入るかを明確にするための骨組みです。
        </p>
        <div className="hero-links">
          <Link href="/search?view=slot" className="hero-link hero-link-primary">
            枠一覧と見比べる
          </Link>
          <Link href="/stats" className="hero-link hero-link-secondary">
            統計ダッシュボードへ
          </Link>
        </div>
      </section>

      <div className="summary-cards slot-summary-cards">
        <article className="metric-card">
          <span className="muted">取得ジョブ</span>
          <strong>{admin.jobs.length}</strong>
          <p className="muted">{`実行中・待機中 ${runningCount}件`}</p>
        </article>
        <article className="metric-card">
          <span className="muted">要対処エラー</span>
          <strong>{errorCount}</strong>
          <p className="muted">失敗ジョブと error レベルの合計</p>
        </article>
        <article className="metric-card">
          <span className="muted">枠マスタ確認</span>
          <strong>{reviewSlotCount}</strong>
          <p className="muted">名称補完や別名確認が必要な枠</p>
        </article>
        <article className="metric-card">
          <span className="muted">未完了補正</span>
          <strong>{openCorrectionCount}</strong>
          <p className="muted">手動レビュー継続中の補正候補</p>
        </article>
      </div>

      <div className="grid-two">
        <SectionCard title="取得ジョブ一覧" description="collector の入口に接続される想定の、実行状況一覧です。">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ジョブ</th>
                  <th>状態</th>
                  <th>期間</th>
                  <th>差分</th>
                  <th>出力先</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {admin.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      {job.label}
                      <span className="subline">{`${job.sourceId} / ${job.mode} / ${job.windowLabel}`}</span>
                    </td>
                    <td>
                      <Badge tone={getJobStatusTone(job.status)}>{getJobStatusLabel(job.status)}</Badge>
                      <span className="subline">{formatDateTimeJst(job.startedAt)}</span>
                    </td>
                    <td>
                      {getDurationLabel(job.startedAt, job.finishedAt)}
                      <span className="subline">{job.finishedAt ? formatDateTimeJst(job.finishedAt) : "完了待ち"}</span>
                    </td>
                    <td>
                      {`+${job.added} / ~${job.updated} / -${job.removed}`}
                      <span className="subline">{`unchanged ${job.unchanged}`}</span>
                    </td>
                    <td>
                      {job.rawPath}
                      <span className="subline">{job.normalizedPath}</span>
                    </td>
                    <td>
                      <div className="admin-action-row">
                        <button type="button" className="filter-reset">
                          詳細
                        </button>
                        <button type="button" className="filter-submit">
                          再実行
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="エラー一覧" description="取得失敗と正規化警告を同じ場所で確認できる土台です。">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>種別</th>
                  <th>ステージ</th>
                  <th>内容</th>
                  <th>再試行</th>
                  <th>関連ジョブ</th>
                  <th>発生時刻</th>
                </tr>
              </thead>
              <tbody>
                {admin.errors.map((error) => (
                  <tr key={error.id}>
                    <td>
                      <Badge tone={getSeverityTone(error.severity)}>{getSeverityLabel(error.severity)}</Badge>
                      <span className="subline">{error.sourceId}</span>
                    </td>
                    <td>{error.stage}</td>
                    <td>
                      {error.message}
                      <span className="subline">{error.detail}</span>
                    </td>
                    <td>{error.retryable ? "可" : "不可"}</td>
                    <td>{error.relatedJobLabel}</td>
                    <td>{formatDateTimeJst(error.lastOccurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="grid-two">
        <SectionCard
          title="放送枠マスタ編集"
          description="名称補完、別名管理、代表時刻、判定ルールを1カードにまとめ、枠名の修正と補完をしやすくしています。"
        >
          <div className="admin-master-list">
            {admin.slotDrafts.map((draft) => (
              <article key={draft.slotId} className="panel admin-master-card">
                <div className="admin-card-header">
                  <div>
                    <div className="badge-row">
                      <Badge tone="accent">{formatSlotType(draft.slotType)}</Badge>
                      <Badge>{draft.channelName}</Badge>
                      <Badge tone={draft.statusLabel === "要確認" ? "warm" : draft.statusLabel === "補完候補" ? "neutral" : "accent"}>
                        {draft.statusLabel}
                      </Badge>
                    </div>
                    <h3>{draft.currentName}</h3>
                    <p className="muted">
                      {draft.regionName} / {formatAnimeSchedule(draft.representativeDay, draft.representativeTimeText)}
                    </p>
                  </div>
                  <div className="admin-action-row">
                    <button type="button" className="filter-reset">
                      差分確認
                    </button>
                    <button type="button" className="filter-submit">
                      保存予定
                    </button>
                  </div>
                </div>

                <div className="admin-field-grid">
                  <label className="admin-field">
                    <span>正式表示名</span>
                    <input defaultValue={draft.proposedName} />
                  </label>
                  <label className="admin-field">
                    <span>スラッグ</span>
                    <input defaultValue={draft.slug} />
                  </label>
                  <label className="admin-field">
                    <span>種別</span>
                    <select defaultValue={draft.slotType}>
                      {slotTypes.map((slotType) => (
                        <option key={slotType} value={slotType}>
                          {formatSlotType(slotType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>信頼度</span>
                    <input type="number" min={0} max={100} defaultValue={draft.confidence} />
                  </label>
                  <label className="admin-field">
                    <span>代表曜日</span>
                    <select defaultValue={draft.representativeDay}>
                      {animeWeekdays.map((weekday) => (
                        <option key={weekday} value={weekday}>
                          {weekdayLabels[weekday]}曜
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>代表時刻</span>
                    <input defaultValue={draft.representativeTimeText} />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>別名</span>
                    <textarea rows={4} defaultValue={draft.aliasNames} />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>説明</span>
                    <textarea rows={4} defaultValue={draft.description} />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>判定ルールメモ</span>
                    <textarea rows={3} defaultValue={draft.ruleMemo} />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>補正メモ</span>
                    <textarea rows={3} defaultValue={draft.correctionNote} />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="地域マスタ編集" description="地域グループ、比較軸、局割当ルールを調整するための編集土台です。">
          <div className="admin-master-list">
            {admin.regionDrafts.map((draft) => (
              <article key={draft.regionId} className="panel admin-master-card">
                <div className="admin-card-header">
                  <div>
                    <div className="badge-row">
                      <Badge tone="accent">{draft.groupLabel}</Badge>
                      <Badge>{`${draft.channelCount}局`}</Badge>
                    </div>
                    <h3>{draft.name}</h3>
                    <p className="muted">{draft.channelNames}</p>
                  </div>
                  <div className="admin-action-row">
                    <button type="button" className="filter-reset">
                      ルール確認
                    </button>
                    <button type="button" className="filter-submit">
                      保存予定
                    </button>
                  </div>
                </div>

                <div className="admin-field-grid">
                  <label className="admin-field">
                    <span>地域名</span>
                    <input defaultValue={draft.name} />
                  </label>
                  <label className="admin-field">
                    <span>比較グループ</span>
                    <input defaultValue={draft.groupLabel} />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>所属局</span>
                    <textarea rows={3} defaultValue={draft.channelNames} />
                  </label>
                  <label className="admin-field">
                    <span>深夜帯閾値</span>
                    <input defaultValue={draft.lateNightThresholdText} />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>正規化メモ</span>
                    <textarea rows={3} defaultValue={draft.normalizationMemo} />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>補正メモ</span>
                    <textarea rows={3} defaultValue={draft.correctionNote} />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="手動補正一覧" description="collector から拾った差分と、運用メモ起点の補正を同じ一覧で扱う想定です。">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>対象</th>
                <th>項目</th>
                <th>現在値</th>
                <th>補正候補</th>
                <th>理由</th>
                <th>状態</th>
                <th>更新元</th>
                <th>更新時刻</th>
              </tr>
            </thead>
            <tbody>
              {admin.corrections.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {entry.targetHref ? (
                      <Link href={entry.targetHref} className="inline-link">
                        {entry.targetLabel}
                      </Link>
                    ) : (
                      entry.targetLabel
                    )}
                    <span className="subline">{entry.entityType}</span>
                  </td>
                  <td>{entry.fieldLabel}</td>
                  <td>{entry.currentValue}</td>
                  <td>{entry.suggestedValue}</td>
                  <td>{entry.reason}</td>
                  <td>
                    <Badge tone={getCorrectionStatusTone(entry.status)}>
                      {getCorrectionStatusLabel(entry.status)}
                    </Badge>
                  </td>
                  <td>{entry.sourceLabel}</td>
                  <td>{formatDateTimeJst(entry.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

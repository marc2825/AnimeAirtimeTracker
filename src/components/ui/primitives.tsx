import type { ReactNode } from "react";

import { CountUp } from "./CountUp";
import { Icon, type IconName } from "./Icon";
import styles from "./primitives.module.css";

/** Secondary explanation, collapsed: the visible text stays one line, the rest is a click away. */
export function MoreInfo({ summary = "詳しく", children }: { summary?: ReactNode; children: ReactNode }) {
  return (
    <details className={styles.more}>
      <summary className={styles.moreSummary}>
        <Icon name="chevronRight" size={12} className={styles.moreIcon} />
        {summary}
      </summary>
      <div className={styles.moreBody}>{children}</div>
    </details>
  );
}

export function PageHeader({
  title,
  lead,
  details,
  meta,
  actions
}: {
  title: ReactNode;
  /** One line: what the page is. Anything longer goes in `details`. */
  lead?: ReactNode;
  details?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderMain}>
        <h1 className={styles.pageTitle}>
          <span className="marker">{title}</span>
        </h1>
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        {details ? <MoreInfo>{details}</MoreInfo> : null}
        {meta ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  details,
  actions,
  children,
  id,
  level = 2
}: {
  title: ReactNode;
  /** One line: what the section shows, with its unit or scope. Anything longer goes in `details`. */
  description?: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section className={styles.section} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeading}>
          <Heading id={id ? `${id}-title` : undefined} className={level === 2 ? styles.sectionTitle : styles.subsectionTitle}>
            {level === 2 ? <span className="marker">{title}</span> : title}
          </Heading>
          {description ? <p className={styles.sectionDescription}>{description}</p> : null}
          {details ? <MoreInfo>{details}</MoreInfo> : null}
        </div>
        {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" | "section" | "li" }) {
  return <Tag className={`${styles.card} ${className ?? ""}`}>{children}</Tag>;
}

type BadgeTone = "neutral" | "accent" | "new" | "final" | "rerun" | "note" | "official" | "source" | "inferred" | "danger";

export function Badge({ children, tone = "neutral", title, variant = "soft" }: { children: ReactNode; tone?: BadgeTone; title?: string; variant?: "soft" | "solid" | "outline" | "dashed" }) {
  return (
    <span className={`${styles.badge} ${styles[`tone-${tone}`]} ${styles[`variant-${variant}`]}`} title={title}>
      {children}
    </span>
  );
}

/** Broadcast flags. Shape differs per flag (solid / outline / dashed) so meaning never depends on color alone. */
export function FlagBadges({
  flagNew,
  flagFinal,
  isRerun,
  rerunBasis,
  flagNote,
  compact = false
}: {
  flagNew?: boolean;
  flagFinal?: boolean;
  isRerun?: boolean;
  rerunBasis?: string;
  flagNote?: boolean;
  compact?: boolean;
}) {
  const items: ReactNode[] = [];
  if (flagNew) items.push(<Badge key="new" tone="new" variant="solid" title="新番組（第1話・出典の「新」フラグ）">新</Badge>);
  if (flagFinal) items.push(<Badge key="final" tone="final" variant="outline" title="最終回（出典の「終」フラグ）">終</Badge>);
  if (isRerun)
    items.push(
      <Badge key="rerun" tone="rerun" variant="dashed" title={rerunBasis === "AGE" ? "再放送（初回放送終了から6か月超のため本サイトが推定）" : rerunBasis === "MANUAL" ? "再放送（手動補正）" : "再放送（出典の「再」フラグ）"}>
        {rerunBasis === "AGE" ? "再*" : "再"}
      </Badge>
    );
  if (flagNote && !compact) items.push(<Badge key="note" tone="note" title="注記あり（出典の「注」フラグ）">注</Badge>);
  if (items.length === 0) return null;
  return <span className={styles.badgeRow}>{items}</span>;
}

export const SLOT_KIND_LABELS: Record<string, { label: string; tone: BadgeTone; variant: "solid" | "outline" | "dashed"; description: string }> = {
  OFFICIAL: { label: "公式枠", tone: "official", variant: "solid", description: "放送局が名称を公表している枠（本サイトで出典を確認したもの）" },
  SOURCE_LABEL: { label: "出典記載枠", tone: "source", variant: "outline", description: "しょぼいカレンダーの作品備考に「〜枠で放送」と記載された枠" },
  INFERRED: { label: "推定枠", tone: "inferred", variant: "dashed", description: "同じ局・曜日・時刻に新作が続いた位置から本サイトが推定した枠" }
};

export function SlotKindBadge({ kind }: { kind: string }) {
  const meta = SLOT_KIND_LABELS[kind] ?? SLOT_KIND_LABELS.INFERRED!;
  return (
    <Badge tone={meta.tone} variant={meta.variant} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function EmptyState({ title, children, icon = "database", action }: { title: string; children?: ReactNode; icon?: IconName; action?: ReactNode }) {
  return (
    <div className={styles.empty} role="status">
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={22} />
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      {children ? <div className={styles.emptyBody}>{children}</div> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}

export function Notice({ children, tone = "info", title }: { children: ReactNode; tone?: "info" | "warning" | "danger"; title?: string }) {
  return (
    <div className={`${styles.notice} ${styles[`notice-${tone}`]}`} role={tone === "danger" ? "alert" : "note"}>
      <Icon name={tone === "info" ? "info" : "alert"} size={16} className={styles.noticeIcon} />
      <div>
        {title ? <p className={styles.noticeTitle}>{title}</p> : null}
        <div className={styles.noticeBody}>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ height = "1rem", width = "100%", radius }: { height?: string; width?: string; radius?: string }) {
  return <span className={styles.skeleton} style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function SkeletonBlock({ rows = 6, label = "読み込み中" }: { rows?: number; label?: string }) {
  return (
    <div className={styles.skeletonBlock} role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {/* Streamed content replaces this fallback with JavaScript; without it the data never appears. */}
      <noscript>
        <p className={styles.noscript}>このページのデータを表示するには、JavaScriptを有効にしてください。</p>
      </noscript>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height="2.75rem" width={`${100 - ((index * 13) % 30)}%`} />
      ))}
    </div>
  );
}

/** A key figure. A numeric `value` counts up to its final value when it comes into view. */
export function StatTile({ label, value, unit, hint }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode }) {
  return (
    <div className={styles.statTile}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>
        {typeof value === "number" ? <CountUp value={value} /> : value}
        {unit ? <span className={styles.statUnit}>{unit}</span> : null}
      </dd>
      {hint ? <dd className={styles.statHint}>{hint}</dd> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <dl className={styles.statGrid}>{children}</dl>;
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className={styles.keyValue}>
      {items.map((item) => (
        <div key={item.label} className={styles.keyValueRow}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.external}>
      {children}
      <Icon name="external" size={13} />
      <span className="visually-hidden">（外部サイト）</span>
    </a>
  );
}

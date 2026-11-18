import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./controls.module.css";
import { Icon } from "./Icon";

/** Link-based segmented control (each option is a URL — shareable and works without JS). */
export function SegmentedLinks({ label, options, size = "md" }: { label: string; options: { href: string; label: ReactNode; active: boolean; count?: number }[]; size?: "sm" | "md" }) {
  return (
    <nav className={`${styles.segmented} ${size === "sm" ? styles.segmentedSm : ""}`} aria-label={label}>
      {options.map((option) => (
        <Link key={option.href} href={option.href} className={styles.segment} aria-current={option.active ? "true" : undefined} scroll={false}>
          {option.label}
          {option.count !== undefined ? <span className={styles.segmentCount}>{option.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function SelectField({
  label,
  name,
  value,
  options,
  autoSubmit = true,
  hideLabel = false
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  autoSubmit?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <label className={styles.field} data-autosubmit={autoSubmit ? "" : undefined}>
      <span className={hideLabel ? "visually-hidden" : styles.fieldLabel}>{label}</span>
      <span className={styles.selectWrap}>
        <select name={name} defaultValue={value} className={styles.select}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={14} className={styles.selectIcon} />
      </span>
    </label>
  );
}

export function SubmitButton({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <button type="submit" className={`${styles.button} ${variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary}`}>
      {children}
    </button>
  );
}

export function ButtonLink({ href, children, variant = "secondary", icon }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; icon?: "arrowRight" | "chevronLeft" | "chevronRight" }) {
  const variantClass = variant === "primary" ? styles.buttonPrimary : variant === "ghost" ? styles.buttonGhost : styles.buttonSecondary;
  return (
    <Link href={href} className={`${styles.button} ${variantClass}`}>
      {icon === "chevronLeft" ? <Icon name="chevronLeft" size={16} /> : null}
      {children}
      {icon && icon !== "chevronLeft" ? <Icon name={icon} size={16} /> : null}
    </Link>
  );
}

export function FilterChips({ chips, clearHref }: { chips: { label: string; removeHref: string }[]; clearHref?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={styles.chips}>
      <span className={styles.chipsLabel}>条件</span>
      <ul role="list" className={styles.chipList}>
        {chips.map((chip) => (
          <li key={chip.label}>
            <Link href={chip.removeHref} className={styles.chip} scroll={false}>
              {chip.label}
              <Icon name="close" size={12} />
              <span className="visually-hidden">を解除</span>
            </Link>
          </li>
        ))}
      </ul>
      {clearHref && chips.length > 1 ? (
        <Link href={clearHref} className={styles.clearAll} scroll={false}>
          すべて解除
        </Link>
      ) : null}
    </div>
  );
}

export function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page: number) => string }) {
  if (totalPages <= 1) return null;
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  return (
    <nav className={styles.pagination} aria-label="ページ送り">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={styles.pageLink} rel="prev">
          <Icon name="chevronLeft" size={16} />
          <span>前へ</span>
        </Link>
      ) : (
        <span className={`${styles.pageLink} ${styles.pageDisabled}`} aria-hidden="true">
          <Icon name="chevronLeft" size={16} />
          <span>前へ</span>
        </span>
      )}
      <ol role="list" className={styles.pageList}>
        {sorted.map((p, index) => (
          <li key={p} className={styles.pageItem}>
            {index > 0 && p - sorted[index - 1]! > 1 ? <span className={styles.pageGap}>…</span> : null}
            <Link href={hrefFor(p)} className={styles.pageNumber} aria-current={p === page ? "page" : undefined}>
              {p}
            </Link>
          </li>
        ))}
      </ol>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={styles.pageLink} rel="next">
          <span>次へ</span>
          <Icon name="chevronRight" size={16} />
        </Link>
      ) : (
        <span className={`${styles.pageLink} ${styles.pageDisabled}`} aria-hidden="true">
          <span>次へ</span>
          <Icon name="chevronRight" size={16} />
        </span>
      )}
    </nav>
  );
}

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className={styles.disclosure} open={defaultOpen}>
      <summary className={styles.disclosureSummary}>
        <Icon name="chevronRight" size={14} className={styles.disclosureIcon} />
        {summary}
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}

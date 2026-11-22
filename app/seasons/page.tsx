import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { EmptyState, Notice, PageHeader, SkeletonBlock } from "@/components/ui/primitives";
import { SOURCE_COMPLETE_FROM_YEAR, SPARSE_SOURCE_NOTE } from "@/domain/coverage";
import { QUARTER_LABELS, currentSeason, seasonFromOrdinal, seasonId, seasonOrdinal } from "@/domain/season";
import { getPremiereCounts } from "@/server/queries/seasons";
import { getCoveredSeasonOrdinals } from "@/server/queries/status";

import styles from "./seasons.module.css";

export const metadata: Metadata = {
  title: "クール別の新作アニメ",
  description: "取得済みの各クール（冬・春・夏・秋）に始まったテレビアニメの新作一覧への入口。曜日・時刻・放送局ごとに見られます。",
  alternates: { canonical: "/seasons" }
};

export default function SeasonsPage() {
  return (
    <div className="container">
      <PageHeader title="クール別の新作" lead="クールごとに第1話が放送された作品" />
      <Suspense fallback={<SkeletonBlock rows={6} label="クールを読み込み中" />}>
        <SeasonsContent />
      </Suspense>
    </div>
  );
}

async function SeasonsContent() {
  await io();
  let covered: number[];
  let counts: Map<number, number>;
  try {
    [covered, counts] = await Promise.all([getCoveredSeasonOrdinals(), getPremiereCounts()]);
  } catch {
    return <Notice tone="danger" title="クールを読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  const now = seasonOrdinal(currentSeason());
  const shown = covered.filter((ordinal) => ordinal <= now + 1);
  if (shown.length === 0) return <EmptyState title="取得済みのクールがまだありません" />;
  const years = [...new Set(shown.map((ordinal) => Math.floor(ordinal / 10)))].sort((a, b) => b - a);

  return (
    <div className={styles.years}>
      {years.some((year) => year < SOURCE_COMPLETE_FROM_YEAR) ? <p className={styles.footnote}>{SPARSE_SOURCE_NOTE}</p> : null}
      {years.map((year) => (
        <section key={year} className={styles.year} aria-labelledby={`year-${year}`}>
          <h2 id={`year-${year}`} className={styles.yearHeading}>
            {year}年
          </h2>
          <ul role="list" className={styles.quarters}>
            {[1, 2, 3, 4].map((quarter) => {
              const ordinal = year * 10 + quarter;
              const label = `${QUARTER_LABELS[quarter - 1]}`;
              return (
                <li key={quarter}>
                  {shown.includes(ordinal) ? (
                    <Link href={`/seasons/${seasonId(seasonFromOrdinal(ordinal))}`} className={styles.quarter} aria-current={ordinal === now ? "true" : undefined}>
                      <span className={styles.quarterLabel}>{label}</span>
                      <span className={styles.quarterCount}>
                        <span className="mono">{counts.get(ordinal) ?? 0}</span>作品
                      </span>
                    </Link>
                  ) : (
                    <span className={`${styles.quarter} ${styles.quarterEmpty}`}>
                      <span className={styles.quarterLabel}>{label}</span>
                      <span className={styles.quarterCount}>未取得</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

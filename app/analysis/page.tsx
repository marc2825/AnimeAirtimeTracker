import type { Metadata } from "next";
import Link from "next/link";

import { ANALYSES } from "@/analysis/registry";
import { PageHeader, Section } from "@/components/ui/primitives";
import { formatIsoDateJa } from "@/domain/time";

import styles from "./analysis.module.css";

export const metadata: Metadata = {
  title: "分析",
  description: "蓄積した放送データから、テレビアニメの編成の変遷を調べた分析。数値はすべて実データから計算し、対象範囲・単位・定義を明記しています。",
  alternates: { canonical: "/analysis" }
};

export default function AnalysisIndexPage() {
  return (
    <div className="container">
      <PageHeader title="分析" lead="蓄積した放送データから、編成の変遷を調べる" />
      <Section id="analyses" title="分析の一覧" description="数値と結論はデータから計算し、データが更新されると変わります">
        <ul role="list" className={styles.list}>
          {ANALYSES.map(({ meta }) => (
            <li key={meta.slug} className={styles.item}>
              <Link href={`/analysis/${meta.slug}`} className={styles.itemTitle}>
                {meta.title}
              </Link>
              <p className={styles.itemSummary}>{meta.summary}</p>
              <p className={styles.itemMeta}>
                対象: {meta.scope}
                <span aria-hidden="true">／</span>
                {formatIsoDateJa(meta.revisedAt, { withYear: true })}更新
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

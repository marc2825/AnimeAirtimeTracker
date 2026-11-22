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
      <Section id="compare" title="比べる" description="条件を選んで、自分で比べられるページ">
        <ul role="list" className={styles.list}>
          <li className={styles.item}>
            <Link href="/compare/slots" className={styles.itemTitle}>
              放送枠を比べる
            </Link>
            <p className={styles.itemSummary}>2〜4つの枠の、クールごとの放送位置・作品数・開始時刻の移動</p>
          </li>
          <li className={styles.item}>
            <Link href="/compare/channels" className={styles.itemTitle}>
              地域・放送局を比べる
            </Link>
            <p className={styles.itemSummary}>関東と関西、TOKYO MX と BS11 など。作品本数の推移、曜日×時間帯、共通の作品と同じ話数の放送時差</p>
          </li>
        </ul>
      </Section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { findAnalysis } from "@/analysis/registry";
import { ANALYSIS_SLUGS } from "@/analysis/slugs";
import { ExternalLink, PageHeader, Section, SkeletonBlock } from "@/components/ui/primitives";
import { formatIsoDateJa } from "@/domain/time";
import { formatDateTime } from "@/lib/format";
import { SITE_NAME, SOURCE_NAME, SOURCE_URL } from "@/lib/site";
import { getDatasetStatus } from "@/server/queries/status";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, datasetJsonLd } from "@/lib/seo";

import styles from "../analysis.module.css";

export function generateStaticParams() {
  return ANALYSIS_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/analysis/[slug]">): Promise<Metadata> {
  const analysis = findAnalysis((await params).slug);
  if (!analysis) return { title: "分析が見つかりません" };
  return {
    title: analysis.meta.title,
    description: analysis.meta.summary,
    alternates: { canonical: `/analysis/${analysis.meta.slug}` }
  };
}

/** Time of the data the figures were computed from (request-time; the frame itself is prerendered). */
async function DataTime() {
  await io();
  const status = await getDatasetStatus().catch(() => null);
  return <>{status?.lastSuccessAt ? `${formatDateTime(status.lastSuccessAt)} 時点の取得データ` : "取得日時を読み込めませんでした"}</>;
}

/**
 * The frame every analysis shares: what is counted (scope, unit, source, data time, revision) above the
 * computed content, and definitions, limits and ways to reproduce the figures below it.
 */
export default async function AnalysisPage({ params }: PageProps<"/analysis/[slug]">) {
  const analysis = findAnalysis((await params).slug);
  if (!analysis) notFound();
  const { meta, Content } = analysis;
  return (
    <article className="container">
      <JsonLd data={breadcrumbJsonLd([{ name: "分析", path: "/analysis" }, { name: meta.title, path: `/analysis/${meta.slug}` }])} />
      <JsonLd data={datasetJsonLd({ name: meta.title, description: `${meta.summary}。対象: ${meta.scope}。単位: ${meta.unit}。`, path: `/analysis/${meta.slug}` })} />
      <nav className={styles.breadcrumb} aria-label="パンくず">
        <Link href="/analysis">分析</Link>
        <span aria-hidden="true">/</span>
        <span>{meta.title}</span>
      </nav>
      <PageHeader title={meta.title} lead={meta.summary} />
      <dl className={styles.facts}>
        <dt>対象</dt>
        <dd>{meta.scope}</dd>
        <dt>単位</dt>
        <dd>{meta.unit}</dd>
        <dt>出典</dt>
        <dd>
          番組データは <ExternalLink href={SOURCE_URL}>{SOURCE_NAME}</ExternalLink>、集計は{SITE_NAME}
        </dd>
        <dt>データ</dt>
        <dd>
          <Suspense fallback="…">
            <DataTime />
          </Suspense>
          （数値は取得のたびに計算し直します）
        </dd>
        <dt>方法の更新</dt>
        <dd>{formatIsoDateJa(meta.revisedAt, { withYear: true })}</dd>
      </dl>

      <Suspense fallback={<SkeletonBlock rows={8} label="分析を計算中" />}>
        <Content />
      </Suspense>

      <Section id="definitions" title="定義">
        <dl className={styles.definitions}>
          {meta.definitions.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="limits" title="データの限界" description="結果を読むときに注意してほしいこと">
        <ul className={styles.notes}>
          {meta.limits.map((text) => (
            <li key={text}>{text}</li>
          ))}
          <li>
            すべての限界は<Link href="/about#limits">このサイトについて</Link>にまとめています。
          </li>
        </ul>
      </Section>

      <Section id="reproduce" title="確かめる" description="同じ条件の数値を、統計などのページで確認できます">
        <ul className={styles.notes}>
          {meta.reproduce.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="inline-link">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}

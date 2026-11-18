import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { formatDateTime } from "@/lib/format";
import { ISSUES_URL, REPOSITORY_URL, SITE_NAME, SOURCE_NAME, SOURCE_URL } from "@/lib/site";
import { getDatasetStatus } from "@/server/queries/status";

import styles from "./SiteFooter.module.css";

async function Freshness() {
  await io(); // always request-time: never bake a build-time DB miss into the static shell
  const status = await getDatasetStatus().catch(() => null);
  if (!status) return <p className={styles.freshness}>データ更新状況を取得できませんでした</p>;
  return (
    <p className={styles.freshness}>
      <span className={styles.dot} aria-hidden="true" />
      データ最終更新 {status.lastSuccessAt ? <time dateTime={status.lastSuccessAt.toISOString()}>{formatDateTime(status.lastSuccessAt)}</time> : "—"}
      <Link href="/status" className={styles.statusLink}>
        更新状況
      </Link>
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.about}>
          <p className={styles.name}>{SITE_NAME}</p>
          <p className={styles.attribution}>
            番組データ:{" "}
            <a href={SOURCE_URL} className="inline-link" rel="noopener" target="_blank">
              {SOURCE_NAME}
            </a>
            （有志による手入力データ）。放送枠・統計は本サイトが算出したものです。
          </p>
          <Suspense fallback={<p className={styles.freshness}>&nbsp;</p>}>
            <Freshness />
          </Suspense>
        </div>
        <nav className={styles.links} aria-label="フッター">
          <Link href="/about">このサイトについて</Link>
          <Link href="/about#method">方法論と定義</Link>
          <Link href="/about#limits">データの限界</Link>
          <Link href="/status">データ更新状況</Link>
          <a href={ISSUES_URL} rel="noopener" target="_blank">
            訂正・問い合わせ
          </a>
          <a href={REPOSITORY_URL} rel="noopener" target="_blank">
            ソースコード
          </a>
        </nav>
      </div>
    </footer>
  );
}

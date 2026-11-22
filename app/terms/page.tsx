import type { Metadata } from "next";
import Link from "next/link";

import { ExternalLink, PageHeader } from "@/components/ui/primitives";
import { FIRST_SEASON, SPARSE_SOURCE_NOTE, TRACKED_CHANNELS } from "@/domain/coverage";
import { CHANGELOG_URL, ISSUES_URL, POLICIES_UPDATED, PRIVATE_REPORT_URL, REPOSITORY_URL, SITE_NAME, SOURCE_NAME, SOURCE_URL } from "@/lib/site";

import styles from "../about/about.module.css";

export const metadata: Metadata = {
  title: "利用規約・免責事項",
  description: `${SITE_NAME}の位置づけ、データの出典と限界、ソースコードと掲載データの扱いの違い、訂正・権利に関する申し出の方法。`,
  alternates: { canonical: "/terms" }
};

export default function TermsPage() {
  return (
    <div className="container">
      <PageHeader title="利用規約・免責事項" lead="本サイトを利用する前に確認してほしいこと" meta={<span className="muted">最終更新 {POLICIES_UPDATED}</span>} />
      <div className={styles.prose}>
        <section id="unofficial">
          <h2>非公式のサイトです</h2>
          <p>
            {SITE_NAME}は個人が運営する非公式のサイトです。放送局、制作会社、{SOURCE_NAME}とは関係がなく、それらの見解を示すものではありません。利用は無料で、登録は不要です。
          </p>
        </section>

        <section id="data">
          <h2>データの出典と範囲</h2>
          <ul>
            <li>
              番組データは <ExternalLink href={SOURCE_URL}>{SOURCE_NAME}</ExternalLink> から取得しています。同サイトは有志が手入力している番組表です。取得の方法と条件は<Link href="/about#source">データの出典と利用条件</Link>に書いています。
            </li>
            <li>
              対象は {TRACKED_CHANNELS.length} 局、{FIRST_SEASON.year}年冬クール以降です（<Link href="/about#coverage">対象範囲</Link>）。{SPARSE_SOURCE_NOTE}
            </li>
            <li>
              放送枠には根拠の異なる種別があります。「出典記載枠」は出典の作品備考に枠名が書かれた作品を、「推定枠」は同じ局・曜日・時刻に新作が続いたことを根拠に、本サイトがまとめたものです。放送局が公式に定めた枠であることを示すものではありません（
              <Link href="/about#slots">放送枠の判定</Link>）。
            </li>
            <li>再放送の推定、統計、放送枠の判定は本サイトが算出したもので、出典や放送局の見解ではありません。</li>
          </ul>
        </section>

        <section id="disclaimer">
          <h2>免責事項</h2>
          <ul>
            <li>放送予定は、休止・時間変更・地域差などで変わることがあります。出典の登録漏れや誤り、本サイトの取得の遅れもあります。録画の予約など、正確さが必要な判断には放送局の公式発表を確認してください。</li>
            <li>本サイトは掲載内容の正確さ・完全さ・最新であることを保証しません。データの更新が止まっているときは、各ページの上部に表示します。</li>
            <li>本サイトの利用、または利用できなかったことによって生じた損害について、運営者は、故意または重大な過失がある場合を除き、責任を負いません。</li>
            <li>サイトは予告なく変更・停止することがあります。</li>
          </ul>
        </section>

        <section id="license">
          <h2>ソースコードと掲載データの扱い</h2>
          <ul>
            <li>
              ソースコードは <ExternalLink href={REPOSITORY_URL}>GitHub</ExternalLink> で MIT License のもとに公開しています。このライセンスは掲載データには適用されません。
            </li>
            <li>番組データ（タイトル、放送局、放送日時、話数、サブタイトルなど）の利用は、出典（{SOURCE_NAME}）の条件に従ってください。本サイトから番組データをまとめて取得するのではなく、出典の公式の取得方法を使ってください。</li>
            <li>本サイトが算出した集計値や放送枠の判定を紹介・引用するときは、本サイトの名前とURL、ページに表示している集計の条件（対象期間・対象局・単位）をあわせて示してください。図の書き出し（CSV・SVG・PNG）には、これらと出典をあらかじめ記載しています。</li>
            <li>作品画像は掲載していません。</li>
          </ul>
        </section>

        <section id="rules">
          <h2>禁止事項</h2>
          <ul>
            <li>短時間に大量のページを自動で取得するなど、サイトや配信基盤に負荷をかける行為</li>
            <li>本サイトを経由して出典に負荷をかける行為、本サイトの内容を出典や放送局の公式情報であるかのように示す行為</li>
            <li>法令や公序良俗に反する行為</li>
          </ul>
        </section>

        <section id="requests">
          <h2>訂正・権利に関する申し出</h2>
          <ul>
            <li>放送データそのものの誤りは、出典で修正されると次回の取得で反映されます。</li>
            <li>
              本サイトの判定・表示の誤りは <ExternalLink href={ISSUES_URL}>GitHub Issues</ExternalLink> でお知らせください（内容は公開されます。個人情報は書かないでください）。
            </li>
            <li>
              権利の侵害に関する申し出や、公開したくない連絡は <ExternalLink href={PRIVATE_REPORT_URL}>GitHub の非公開の報告</ExternalLink> を使ってください。該当するページのURLと理由を書いてください。確認のうえ、必要に応じて掲載を取りやめます。
            </li>
          </ul>
          <p>
            どちらも GitHub のアカウントが必要です。情報の扱いは<Link href="/privacy">プライバシーポリシー</Link>に書いています。
          </p>
        </section>

        <section id="changes">
          <h2>変更と更新履歴</h2>
          <p>
            この規約とプライバシーポリシーは、変更したときにこのページで日付を更新します。サイトの変更点は <ExternalLink href={CHANGELOG_URL}>更新履歴（CHANGELOG）</ExternalLink> で公開しています。
          </p>
        </section>
      </div>
    </div>
  );
}

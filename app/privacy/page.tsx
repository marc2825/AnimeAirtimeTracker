import type { Metadata } from "next";
import Link from "next/link";

import { ExternalLink, PageHeader } from "@/components/ui/primitives";
import { ISSUES_URL, POLICIES_UPDATED, PRIVATE_REPORT_URL, SITE_NAME } from "@/lib/site";

import styles from "../about/about.module.css";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: `${SITE_NAME}が扱う情報（アクセス解析、ブラウザに保存する設定、ホスティング事業者のアクセス記録）と、問い合わせの扱い。`,
  alternates: { canonical: "/privacy" }
};

/*
 * Every statement here describes how the site actually works (checked in the code on the date above):
 * no accounts, forms, cookies or ads; Vercel Web Analytics page views (app/layout.tsx; its script only writes
 * localStorage for identify/group calls, which this site does not make); two localStorage keys of our own;
 * fonts served from this site. Update this page before adding anything that collects or sends visitor information.
 */
export default function PrivacyPage() {
  return (
    <div className="container">
      <PageHeader title="プライバシーポリシー" lead={`${SITE_NAME}が扱う利用者の情報`} meta={<span className="muted">最終更新 {POLICIES_UPDATED}</span>} />
      <div className={styles.prose}>
        <section id="summary">
          <h2>概要</h2>
          <ul>
            <li>本サイトには、アカウント登録・入力フォーム・コメント機能はありません。</li>
            <li>ページの閲覧数を集計するため、Vercel Web Analytics を使っています（下記）。Cookie は使いません。</li>
            <li>広告は掲載していません。</li>
            <li>ブラウザには、表示の設定を2つだけ保存します（下記）。サーバーには送信しません。</li>
            <li>サイトの配信を委託している事業者のシステムに、通信の記録が残ります（下記）。</li>
          </ul>
        </section>

        <section id="analytics">
          <h2>アクセス解析（Vercel Web Analytics）</h2>
          <p>
            どのページがどれだけ読まれているか、どこから訪問されているかを知り、サイトの改善に役立てるため、Vercel Inc. の Vercel Web Analytics を使っています。ページを開いたときと、サイト内で別のページへ移動したときに、閲覧の記録が同社に送られます。計測用のプログラムと送信先は、どちらも本サイトのドメイン上にあります。
          </p>
          <p>Vercel の説明によると、処理されるのは次の情報です。</p>
          <ul>
            <li>閲覧した日時と、ページのURL（URLに含まれる検索語や絞り込みの条件を含むことがあります）</li>
            <li>参照元（本サイトに来る直前に見ていたページ）</li>
            <li>国・地域などのおおまかな位置</li>
            <li>ブラウザ、OS、端末の種類とバージョン</li>
          </ul>
          <p>
            Cookie は使いません。同社によると、訪問者はリクエストの情報から作ったハッシュ値で区別され、この値は1日で無効になります。記録は個人や IP アドレスと結び付けずに保存されるとされています。運営者が見るのは、ページ別の閲覧数や参照元などの集計結果だけです。
          </p>
          <p>
            広告ブロッカーなどで計測を止めても、本サイトはそのまま使えます。詳しくは
            <ExternalLink href="https://vercel.com/docs/analytics/privacy-policy">Vercel Web Analytics のプライバシーとデータの扱い（英語）</ExternalLink>
            を参照してください。
          </p>
        </section>

        <section id="browser">
          <h2>ブラウザに保存する情報</h2>
          <p>次の2つを、ブラウザの localStorage に保存します。どちらも表示を変えるためだけに使い、本サイトのサーバーや第三者には送信しません。ブラウザのサイトデータを削除すると消えます。</p>
          <ul>
            <li>
              <code>theme</code>: ライト／ダーク表示の選択（テーマ切り替えのボタンを押したときだけ保存）
            </li>
            <li>
              <code>nowAiringHiddenUntil</code>: 「放送中」の帯を閉じたとき、再表示する時刻
            </li>
          </ul>
        </section>

        <section id="hosting">
          <h2>配信事業者による記録</h2>
          <p>
            本サイトは Vercel Inc.（米国）のホスティングで配信しています。ページを開くと、通信のために IP アドレス、ブラウザの種類（User-Agent）、アクセスしたURL、日時などが同社のシステムで処理され、記録されることがあります。記録の保存期間と取り扱いは
            <ExternalLink href="https://vercel.com/legal/privacy-policy">Vercel のプライバシーポリシー</ExternalLink>
            によります。
          </p>
          <p>運営者は、障害の調査と不正なアクセスへの対処のために、この記録を参照することがあります。それ以外の目的には使いません。</p>
          <p>番組データを保存しているデータベースには、利用者の情報は保存していません。文字（フォント）も本サイトから配信しており、閲覧時に外部のフォント配信サービスへは接続しません。</p>
        </section>

        <section id="search">
          <h2>検索エンジンの管理ツール</h2>
          <p>
            運営者は、Google 検索での表示回数やクリック数を確認するため、Google Search Console を利用することがあります。これは Google が検索結果について集計する情報で、本サイトのページに計測用のプログラムを追加するものではありません。
          </p>
        </section>

        <section id="contact">
          <h2>問い合わせで受け取る情報</h2>
          <p>
            問い合わせは GitHub で受け付けています（
            <Link href="/about#contact">連絡先</Link>
            ）。
            <ExternalLink href={ISSUES_URL}>GitHub Issues</ExternalLink>
            の内容は誰でも読めるため、氏名・メールアドレス・住所などの個人情報は書かないでください。公開したくない内容は
            <ExternalLink href={PRIVATE_REPORT_URL}>GitHub の非公開の報告</ExternalLink>
            を使ってください。いずれも GitHub のアカウントが必要で、GitHub が扱う情報には
            <ExternalLink href="https://docs.github.com/ja/site-policy/privacy-policies/github-general-privacy-statement">GitHub のプライバシーステートメント</ExternalLink>
            が適用されます。
          </p>
          <p>受け取った内容は、問い合わせへの対応と、データ・サイトの訂正にだけ使います。</p>
        </section>

        <section id="links">
          <h2>外部サイトへのリンク</h2>
          <p>出典（しょぼいカレンダー）や作品の公式サイトなど、外部サイトへのリンクを掲載しています。移動した先では、そのサイトの方針が適用されます。</p>
        </section>

        <section id="changes">
          <h2>変更</h2>
          <p>
            情報の扱いを変えるとき（計測する内容や送信先を変えるときなど）は、変更より前にこのページを更新します。変更の履歴は<Link href="/terms#changes">更新履歴</Link>と GitHub のリポジトリで公開しています。
          </p>
        </section>
      </div>
    </div>
  );
}

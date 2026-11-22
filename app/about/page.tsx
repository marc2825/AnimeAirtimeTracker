import type { Metadata } from "next";
import Link from "next/link";

import { ExternalLink, PageHeader } from "@/components/ui/primitives";
import { ANIME_CATEGORIES, AREA_LABELS, MEDIUM_LABELS, REGIONS, REGION_KEYS, SPARSE_SOURCE_NOTE, SYOBOI_CATEGORY_LABELS, TRACKED_CHANNELS, channelsInRegion } from "@/domain/coverage";
import { RERUN_AGE_THRESHOLD_MONTHS } from "@/domain/flags";
import { INFERRED_MIN_SEASONS, INFERRED_MIN_TITLES, LABEL_MIN_TITLES, MIN_REGULAR_AIRINGS, SLOT_RULE_VERSION } from "@/domain/slots";
import { ISSUES_URL, PRIVATE_REPORT_URL, REPOSITORY_URL, SITE_NAME, SOURCE_NAME, SOURCE_URL } from "@/lib/site";

import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "このサイトについて・方法論",
  description: "データの出典、対象範囲、アニメ時刻の表記、集計単位、放送枠の判定方法、既知の限界、訂正の方法。",
  alternates: { canonical: "/about" }
};

const TOC = [
  { id: "about", label: "このサイトについて" },
  { id: "source", label: "データの出典と利用条件" },
  { id: "coverage", label: "対象範囲" },
  { id: "time", label: "時刻の表記" },
  { id: "method", label: "用語と集計単位" },
  { id: "slots", label: "放送枠の判定" },
  { id: "limits", label: "データの限界" },
  { id: "corrections", label: "訂正・問い合わせ" }
];

export default function AboutPage() {
  return (
    <div className="container">
      <PageHeader title="このサイトについて" lead="データの取得元と、判定・集計のルール" />
      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="目次">
          <ol role="list">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.label}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className={styles.prose}>
          <section id="about">
            <h2>このサイトについて</h2>
            <p>
              {SITE_NAME}は、日本のテレビアニメの放送枠と放送編成の歴史・変遷・統計を横断的に調べるための、非公式の専門データベースです。今週の番組表を日常の入口に、放送枠ごとの作品の変遷、曜日・時間帯・放送局の編成統計、長期の変化を調べた<Link href="/analysis">分析</Link>を提供します。
            </p>
            <p>重視しているのは、蓄積したデータの体系化、出典に記載された枠と本サイトの推定の区別、長期の時系列、地域・局・曜日・時間帯の比較、そして条件を明記した再現できる集計です。</p>
            <p>作品の内容紹介・感想・視聴記録・配信情報は扱いません。作品の詳細は各作品ページから出典や公式サイトへリンクしています。</p>
          </section>

          <section id="source">
            <h2>データの出典と利用条件</h2>
            <p>
              番組データ（タイトル・放送局・放送日時・話数・サブタイトル・新/終/再/注のフラグ・作品備考）は
              <ExternalLink href={SOURCE_URL}>{SOURCE_NAME}</ExternalLink>
              の公式の非HTMLインターフェース（db.php）から取得しています。しょぼいカレンダーは有志が手入力している番組表で、同サイトは自動取得によるコピーを認めています（
              <ExternalLink href="https://docs.cal.syoboi.jp/about/">利用について</ExternalLink>）。
            </p>
            <ul>
              <li>HTMLページのスクレイピングは行いません。</li>
              <li>
                <ExternalLink href="https://docs.cal.syoboi.jp/rule/bot/">bot向けのルール</ExternalLink>
                に従い、取得は1つずつ順番に、応答後3秒以上の間隔を空けて行い、識別可能なUser-Agentを送信します。取得結果は保存して再利用し、閲覧のたびに出典へアクセスすることはありません。
              </li>
              <li>放送枠の判定・再放送の推定・統計は本サイトが算出したもので、出典の見解ではありません。</li>
              <li>作品画像は使用していません。</li>
            </ul>
            <p>
              掲載データの扱いと免責事項は<Link href="/terms">利用規約・免責事項</Link>、利用者の情報の扱いは<Link href="/privacy">プライバシーポリシー</Link>にまとめています。
            </p>
          </section>

          <section id="coverage">
            <h2>対象範囲</h2>
            <p>取得対象は次の{TRACKED_CHANNELS.length}局です。これ以外の局（他地域の地上波、その他のBS・CS、配信）は含みません。取得済みの期間は<Link href="/status">データ更新状況</Link>で確認できます。</p>
            <div className={styles.tableWrap} role="region" aria-label="取得対象の放送局" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">局</th>
                    <th scope="col">媒体</th>
                    <th scope="col">受信地域</th>
                  </tr>
                </thead>
                <tbody>
                  {TRACKED_CHANNELS.map((channel) => (
                    <tr key={channel.slug}>
                      <td>{channel.name}</td>
                      <td>{MEDIUM_LABELS[channel.medium]}</td>
                      <td>{AREA_LABELS[channel.area]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>番組表と統計の「地域」は、その地域で受信できる局の集合です（NHKは関東・関西の両方に含みます）。媒体（地上波・BS・CS）と地域は別の軸として扱います。</p>
            <ul>
              {REGION_KEYS.map((key) => (
                <li key={key}>
                  <strong>{REGIONS[key].label}</strong>: {channelsInRegion(key).map((c) => c.name).join("・")}
                </li>
              ))}
            </ul>
            <p>
              既定では出典のカテゴリが「{ANIME_CATEGORIES.map((c) => SYOBOI_CATEGORY_LABELS[c]).join("」「")}」の番組をアニメとして扱い、アニメ関連のバラエティ・特撮などは「関連番組も含む」を選んだときだけ表示します。
            </p>
          </section>

          <section id="time">
            <h2>時刻の表記</h2>
            <p>
              深夜アニメの慣習に合わせ、<strong>午前5時を日付の切り替え</strong>とする「アニメ時刻」で表示します。火曜日の午前1時30分は「月曜 25:30」です。曜日・クール・番組表の日付はすべてこの規則で決め、内部では日本時間の実時刻も保持しています。番組表では実時刻（翌01:30）表示に切り替えられます。
            </p>
            <p>クールは1〜3月を冬、4〜6月を春、7〜9月を夏、10〜12月を秋とし、アニメ時刻の日付で判定します（12月31日 25:00 は秋）。</p>
            <p>番組表と検索の時間帯は、アニメ時刻での放送開始時刻で判定します。たとえば「深夜アニメ」は 23:00〜28:59 に始まる放送で、22:59 開始は含まず、29:00（翌日 5:00）からは翌日の朝に入ります。実時刻表示に切り替えても対象は変わりません。</p>
            <p>系列は、地上波と同じ系列のBS局を含めて扱います（例: 日本テレビ系＝日本テレビ・読売テレビ・BS日テレ）。独立局はTOKYO MX・BS11・AT-Xです。放送時間の長さは、15分以下を短編、16〜45分を30分前後、46分以上を長尺とします。</p>
          </section>

          <section id="method">
            <h2>用語と集計単位</h2>
            <dl className={styles.definitions}>
              <dt>作品本数</dt>
              <dd>しょぼいカレンダーのタイトル（TID）の数。多くの場合1シーズン＝1タイトルです。同じ作品を複数局で放送しても1作品です（局別の集計では各局で数えます）。</dd>
              <dt>放送件数</dt>
              <dd>各話の放送1回を1件として数えた値。同じ話を3局で放送すれば3件です。</dd>
              <dt>新作・再放送</dt>
              <dd>
                出典の「再」フラグがある放送、または出典に記載された初回放送の終了月から{RERUN_AGE_THRESHOLD_MONTHS}か月を超えて放送されたものを再放送とします（後者は「再*」と表示）。フラグの付け忘れがある場合、再放送が新作として数えられることがあります。
              </dd>
              <dt>定時放送の位置</dt>
              <dd>作品・局・クールごとに、新作放送の最頻の曜日・開始時刻。その位置での放送が{MIN_REGULAR_AIRINGS}回以上ある場合だけ採用します。</dd>
              <dt>同時放送数</dt>
              <dd>定時放送の位置を[開始, 終了)の区間とみなし、15分ごとに重なる本数。直前の番組の終了時刻ちょうどに始まる番組は重なりに数えません。</dd>
              <dt>関東と関西の時差</dt>
              <dd>両地域で放送された作品について、同じ話数の各地域での最初の放送時刻の差の中央値。NHKと話数のない放送は除きます。</dd>
            </dl>
          </section>

          <section id="slots">
            <h2>放送枠の判定（ルール {SLOT_RULE_VERSION}）</h2>
            <dl className={styles.definitions}>
              <dt>出典記載枠</dt>
              <dd>
                しょぼいカレンダーの作品備考に「「〇〇」枠で放送」のように明記された枠名を、{LABEL_MIN_TITLES}作品以上に記載がある場合に枠として扱います。基準局は所属作品の定時放送が最も多い局で、年表の各クールの位置は基準局での所属作品の最も早い開始時刻（30分枠が2本続く1時間枠なら、その開始）です。所属の記載がない作品は含まれないため、開始時刻の変化には記載状況による見かけの変化が含まれる場合があります。再放送についての記載（「再放送は「〇〇」枠で放送」）は区別して表示します。
              </dd>
              <dt>推定枠</dt>
              <dd>
                同じ局・曜日・開始時刻に、{INFERRED_MIN_SEASONS}クール以上にわたって{INFERRED_MIN_TITLES}作品以上の新作が定時放送された位置です。編成上の傾向を示すもので、局が公式に定めた枠であることを意味しません。時刻が移動した枠は推定枠では別の位置として扱われます。
              </dd>
              <dt>公式枠</dt>
              <dd>放送局自身が枠名を公表していることを本サイトで確認し、根拠URLを登録した枠です。現在は登録準備中のため、名前のある枠はすべて出典記載枠として表示しています。</dd>
            </dl>
          </section>

          <section id="limits">
            <h2>データの限界</h2>
            <ul>
              <li>出典は有志の手入力です。登録漏れ・誤り・遅れがあり得ます。出典自身も1週間以上先のデータは誤りの可能性が高いと案内しています。</li>
              <li>取得対象外の局で放送された作品や、取得期間より前の放送は含まれません。過去分は2000年冬クール以降を取得していますが、{SPARSE_SOURCE_NOTE}</li>
              <li>放送の中止・時間変更は、出典が更新され本サイトが再取得した時点で反映されます。取得後に観測した変更は作品ページに「変更」として表示します。</li>
              <li>出典の放送データにある開始時刻の補正値（StOffset）は意味が公開仕様で確認できないため、表示する時刻には適用していません。</li>
              <li>各話のサブタイトルは、放送ごとの記載があればそれを、なければ出典の作品ごとの話数別一覧から話数で対応させて表示します。話数が記録されていない放送には表示されません。</li>
              <li>作品のシリーズ関係は確認していません。作品ページの「関連作品の候補」は読みが一致するタイトルです。</li>
            </ul>
          </section>

          <section id="corrections">
            <h2>訂正・問い合わせ</h2>
            <p>
              放送データそのものの誤りは、出典（しょぼいカレンダー）で修正されると次回の取得で反映されます。本サイトの判定・集計・表示の誤りや、枠の所属の訂正は
              <ExternalLink href={ISSUES_URL}>GitHub Issues</ExternalLink>
              でお知らせください。訂正は根拠と理由を添えてリポジトリの補正ファイルに記録し、履歴を公開します。
            </p>
            <p id="contact">
              運営者への連絡（データ取得についての連絡を含む）も
              <ExternalLink href={ISSUES_URL}>GitHub Issues</ExternalLink>
              で受け付けます。Issues は公開されるため、個人情報は書かないでください。公開したくない内容、権利に関する申し出、セキュリティ上の問題は、
              <ExternalLink href={PRIVATE_REPORT_URL}>GitHub の非公開の報告</ExternalLink>
              を使ってください（どちらも GitHub のアカウントが必要です）。本サイトの取得プログラムは、User-Agent でこのページを連絡先として示しています。
            </p>
            <p>
              ソースコード: <ExternalLink href={REPOSITORY_URL}>{REPOSITORY_URL.replace("https://", "")}</ExternalLink>（MIT License。番組データには適用されません）
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

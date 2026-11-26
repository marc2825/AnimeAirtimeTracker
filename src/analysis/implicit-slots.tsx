import Link from "next/link";
import type { ReactNode } from "react";
import { io } from "next/cache";

import { BAND_LABELS, CREDIT_ROLE_LABELS, DOMINANT_RULE_TEXT } from "@/components/slots/SlotCredits";
import { Badge, MoreInfo, Notice, Section, SlotKindBadge } from "@/components/ui/primitives";
import { BANDS, CREDIT_ROLES, PREDICTION_DECAY, SIMILAR_MIN_KNOWN, type CreditRole } from "@/domain/credits";
import { formatAnimeSlot, type Weekday } from "@/domain/time";
import { formatNumber, formatPercent, formatSeasonOrdinal } from "@/lib/format";
import { getConfidentPredictions, getCreditSummary, getDominatedSlots, type CreditSlotRow, type CreditSummary } from "@/server/queries/credits";

import styles from "./analysis.module.css";
import type { Analysis } from "./types";

const rate = (hits: number, n: number) => (n > 0 ? formatPercent(hits / n, 1) : "—");

/** Long lists show their first rows; the rest stay on the page behind a toggle (same columns). */
const VISIBLE_ROWS = 10;

function WithMore<T>({ rows, render }: { rows: T[]; render: (rows: T[]) => ReactNode }) {
  const rest = rows.slice(VISIBLE_ROWS);
  return (
    <>
      {render(rows.slice(0, VISIBLE_ROWS))}
      {rest.length > 0 ? <MoreInfo summary={`残り${rest.length}枠を表示`}>{render(rest)}</MoreInfo> : null}
    </>
  );
}

function position(row: CreditSlotRow) {
  if (!row.latest) return row.channelShortName ?? "—";
  return `${row.channelShortName ?? ""} ${formatAnimeSlot(row.latest.weekday as Weekday, row.latest.minute)}（${formatSeasonOrdinal(row.latest.seasonOrdinal)}時点）`;
}

function SlotCell({ row }: { row: CreditSlotRow }) {
  return (
    <th scope="row" className={styles.text}>
      <SlotKindBadge kind={row.kind as "OFFICIAL" | "SOURCE_LABEL" | "INFERRED"} /> <Link href={`/slots/${encodeURIComponent(row.slug)}`}>{row.name}</Link>
    </th>
  );
}

function Findings({ summary }: { summary: CreditSummary }) {
  const studio = summary.roles.studio;
  const publisher = summary.roles.publisher;
  return (
    <ul className={styles.findings}>
      <li>
        制作会社では<strong>{formatNumber(studio.dominantSlots)}枠</strong>、出版社・レーベルでは<strong>{formatNumber(publisher.dominantSlots)}枠</strong>
        で、1社が記載のある所属作品の半数以上を占めています（記載のある作品が4以上の枠は、それぞれ{formatNumber(studio.slotsKnown)}枠・{formatNumber(publisher.slotsKnown)}枠）。
      </li>
      <li>
        枠の過去の作品から次の作品の制作会社を当てる方法で過去を予測すると、1位の的中は<strong>{rate(studio.backtest.top1, studio.backtest.n)}</strong>
        でした（基準: 同じ局でそれまで最多の社 {rate(studio.backtest.channelTop1, studio.backtest.n)}、全体で最多の社 {rate(studio.backtest.globalTop1, studio.backtest.n)}）。出版社・レーベルは
        {rate(publisher.backtest.top1, publisher.backtest.n)}（基準 {rate(publisher.backtest.channelTop1, publisher.backtest.n)}・{rate(publisher.backtest.globalTop1, publisher.backtest.n)}）です。
      </li>
      <li>
        枠の履歴が1社に偏っている場合（{BAND_LABELS.high}）でも、1位の的中は制作会社 {rate(studio.backtest.bands.high.top1, studio.backtest.bands.high.n)}・出版社
        {rate(publisher.backtest.bands.high.top1, publisher.backtest.bands.high.n)}です。暗黙の枠は一部の枠に見られる傾向で、次の作品を当てる手がかりとしては弱いと言えます。
      </li>
    </ul>
  );
}

function DominatedTable({ rows, role }: { rows: CreditSlotRow[]; role: CreditRole }) {
  const list = rows.filter((row) => row.role === role);
  if (list.length === 0) return <p>該当する枠はありません。</p>;
  return <WithMore rows={list} render={(part) => <DominatedRows rows={part} role={role} />} />;
}

function DominatedRows({ rows: list, role }: { rows: CreditSlotRow[]; role: CreditRole }) {
  return (
    <div className={styles.tableWrap} role="region" aria-label={`${CREDIT_ROLE_LABELS[role]}が偏っている枠`} tabIndex={0}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">枠</th>
            <th scope="col" className={styles.text}>
              局・最新の位置
            </th>
            <th scope="col" className={styles.text}>
              {CREDIT_ROLE_LABELS[role]}
            </th>
            <th scope="col">作品</th>
            <th scope="col">割合</th>
            <th scope="col" className={styles.text}>
              期間
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => {
            const dominant = row.profile.dominant!;
            const top = row.profile.top.find((entry) => entry.name === dominant.name);
            return (
              <tr key={`${row.slug}-${role}`}>
                <SlotCell row={row} />
                <td className={styles.text}>{position(row)}</td>
                <td className={styles.text}>{dominant.name}</td>
                <td>
                  {dominant.titles}/{row.profile.known}
                </td>
                <td>{formatPercent(dominant.share)}</td>
                <td className={styles.text}>{top?.firstSeason && top.lastSeason ? `${formatSeasonOrdinal(top.firstSeason)}〜${formatSeasonOrdinal(top.lastSeason)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BacktestTables({ summary }: { summary: CreditSummary }) {
  return (
    <>
      <div className={styles.tableWrap} role="region" aria-label="予測の検証" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">対象</th>
              <th scope="col">予測した件数</th>
              <th scope="col">1位が的中</th>
              <th scope="col">上位3に入った</th>
              <th scope="col">基準: 同じ局で最多</th>
              <th scope="col">基準: 全体で最多</th>
            </tr>
          </thead>
          <tbody>
            {CREDIT_ROLES.map((role) => {
              const b = summary.roles[role].backtest;
              return (
                <tr key={role}>
                  <th scope="row">{CREDIT_ROLE_LABELS[role]}</th>
                  <td>{formatNumber(b.n)}</td>
                  <td>{rate(b.top1, b.n)}</td>
                  <td>{rate(b.top3, b.n)}</td>
                  <td>{rate(b.channelTop1, b.n)}</td>
                  <td>{rate(b.globalTop1, b.n)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.tableWrap} role="region" aria-label="確信度別の1位の的中" tabIndex={0}>
        <table className={styles.table}>
          <caption className={styles.caption}>確信度別の1位の的中（件数）</caption>
          <thead>
            <tr>
              <th scope="col">予測の条件</th>
              {CREDIT_ROLES.map((role) => (
                <th key={role} scope="col">
                  {CREDIT_ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BANDS.map((band) => (
              <tr key={band}>
                <th scope="row">{BAND_LABELS[band]}</th>
                {CREDIT_ROLES.map((role) => {
                  const b = summary.roles[role].backtest.bands[band];
                  return (
                    <td key={role}>
                      {rate(b.top1, b.n)}（{formatNumber(b.n)}件）
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PredictionTable({ rows, summary }: { rows: CreditSlotRow[]; summary: CreditSummary }) {
  if (rows.length === 0) return <p>該当する枠はありません。</p>;
  return <WithMore rows={rows} render={(part) => <PredictionRows rows={part} summary={summary} />} />;
}

function PredictionRows({ rows, summary }: { rows: CreditSlotRow[]; summary: CreditSummary }) {
  return (
    <div className={styles.tableWrap} role="region" aria-label="次のクールの候補" tabIndex={0}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">枠</th>
            <th scope="col" className={styles.text}>
              局・最新の位置
            </th>
            <th scope="col" className={styles.text}>
              対象
            </th>
            <th scope="col" className={styles.text}>
              候補（割合）
            </th>
            <th scope="col">直近3年の記載</th>
            <th scope="col">同じ条件の的中</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const prediction = row.profile.prediction!;
            const band = summary.roles[row.role].backtest.bands[prediction.band];
            return (
              <tr key={`${row.slug}-${row.role}`}>
                <SlotCell row={row} />
                <td className={styles.text}>{position(row)}</td>
                <td className={styles.text}>{CREDIT_ROLE_LABELS[row.role]}</td>
                <td className={styles.text}>{prediction.candidates.map((candidate) => `${candidate.name} ${formatPercent(candidate.share)}`).join("、")}</td>
                <td>{prediction.history}作品</td>
                <td>{rate(band.top1, band.n)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function ImplicitSlotsContent() {
  await io(); // request-time: the build must not need a database
  let summary;
  let dominated;
  let predictions;
  try {
    [summary, dominated, predictions] = await Promise.all([getCreditSummary(), getDominatedSlots(), getConfidentPredictions()]);
  } catch {
    return <Notice tone="danger" title="データを読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  if (summary.roles.studio.slotsKnown === 0 && summary.roles.publisher.slotsKnown === 0) {
    return <Notice tone="warning" title="まだ集計できる放送枠がありません">制作会社・出版社の記載が4作品以上ある放送枠ができると、ここに結果を表示します。</Notice>;
  }
  const target = predictions[0]?.profile.prediction?.season;
  return (
    <>
      <Section id="findings" title="結果" description="本サイトの放送枠すべて（出典記載枠・推定枠）、所属作品の出典備考の記載による">
        <Findings summary={summary} />
      </Section>
      {CREDIT_ROLES.map((role) => (
        <Section
          key={role}
          id={role === "studio" ? "studios" : "publishers"}
          title={`${CREDIT_ROLE_LABELS[role]}が偏っている枠`}
          description={`${DOMINANT_RULE_TEXT}。作品は「その社の作品／記載のある作品」`}
        >
          <DominatedTable rows={dominated} role={role} />
        </Section>
      ))}
      <Section
        id="backtest"
        title="予測の検証"
        description="過去の各作品を、その枠のそれより前の作品だけで予測した結果（枠×所属作品ごとに1件）"
        details={`予測は、枠の過去の作品の会社を、1クール離れるごとに${PREDICTION_DECAY}倍の重みで数えた割合が最も大きい会社です。基準は、その作品より前のクールまでに、同じ局の枠で最も多かった会社と、全体で最も多かった会社です。同じ作品が複数の枠に属する場合は、それぞれの枠で1件と数えます。`}
      >
        <BacktestTables summary={summary} />
      </Section>
      <Section
        id="candidates"
        title={
          <>
            次のクールの候補 <Badge tone="note" variant="dashed">実験</Badge>
          </>
        }
        description={`${target ? `${formatSeasonOrdinal(target)}。` : ""}最新か前のクールに放送があり、上位の割合が60%以上（直近3年の記載が3作品以上）の枠だけ`}
        details="放送予定ではなく、過去の傾向から計算した参考値です。右端は、同じ条件の予測が過去のデータで1位で当たった割合です。"
      >
        <PredictionTable rows={predictions} summary={summary} />
      </Section>
    </>
  );
}

export const implicitSlots: Analysis = {
  meta: {
    slug: "implicit-slots",
    title: "制作会社・出版社から見た暗黙の放送枠（実験）",
    summary: "この曜日・時間帯はだいたいこの制作会社・出版社、という傾向は放送枠にどれだけあるか。過去から次の作品を当てられるか",
    scope: "本サイトが算出した放送枠すべて（出典記載枠・推定枠）の所属作品。制作会社・出版社は各作品の出典（しょぼいカレンダー）の備考の記載による",
    unit: "作品数（所属作品を1回ずつ数える）。予測の検証は、枠×所属作品ごとに1件",
    definitions: [
      { term: "制作会社", text: "出典の備考の「アニメーション制作」の行に書かれた会社。共同制作は両方に数えます。" },
      { term: "出版社・レーベル", text: "出典の備考の掲載誌・原作の行の括弧内に書かれた出版社またはレーベル（電撃文庫など）。レーベルは出版社にまとめません。" },
      { term: "暗黙の枠", text: `${DOMINANT_RULE_TEXT}を占める枠。` },
      { term: "構成が似ている枠", text: `制作会社・出版社の作品数を、多くの枠に現れる会社ほど軽く重み付けして比べた類似度（コサイン類似度）。記載のある作品が${SIMILAR_MIN_KNOWN}以上の枠どうしで、作品を共有する枠は除きます。各放送枠のページに表示します。` },
      { term: "次のクールの候補", text: `枠の過去の作品の会社を、1クール離れるごとに${PREDICTION_DECAY}倍の重みで数えた割合。直近3年（12クール）に記載のある作品がない枠は予測しません。上位3社を、最も大きい割合が60%以上で直近3年の記載が3作品以上の場合だけ表示します。` }
    ],
    limits: [
      "出典の備考は有志の手入力です。記載のない作品は数えていません（記載のある作品の割合は下の「記載率」）。",
      "同じ会社の表記ゆれは、確認できたものだけを対応表（data/credit-aliases.json）でまとめています。社名変更・合併した会社はまとめていません。",
      "出版社とレーベル（例: KADOKAWA と電撃文庫）は別に数えます。",
      "放送枠と所属は本サイトの判定です。推定枠は同じ局・曜日・時刻の機械的なまとまりで、局が定めた枠とは限りません。",
      "予測は過去の傾向の計算で、放送予定ではありません。過去のデータでの的中率は上の表のとおりです。"
    ],
    reproduce: [
      { label: "放送枠の一覧（各枠のページに制作会社・出版社の構成を表示）", href: "/slots" },
      { label: "放送枠の判定ルール", href: "/about#slots" }
    ],
    revisedAt: "2026-11-26"
  },
  Content: ImplicitSlotsContent
};

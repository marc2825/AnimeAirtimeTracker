import Link from "next/link";

import { Badge, SlotKindBadge } from "@/components/ui/primitives";
import { CREDIT_ROLES, DOMINANT_MIN_SHARE, DOMINANT_MIN_TITLES, type CreditRole } from "@/domain/credits";
import { formatPercent, formatSeasonOrdinal } from "@/lib/format";
import type { CreditSummary } from "@/server/queries/credits";
import type { SlotDetail } from "@/server/queries/slots";

import styles from "./SlotCredits.module.css";

export const CREDIT_ROLE_LABELS: Record<CreditRole, string> = { studio: "制作会社", publisher: "原作の出版社・レーベル" };
export const BAND_LABELS = { high: "上位の割合80%以上", mid: "上位の割合60〜80%", low: "上位の割合60%未満", short: "直近3年の記載が3作品未満" } as const;

const span = (first: number | null, last: number | null) => (first === null || last === null ? null : first === last ? formatSeasonOrdinal(first) : `${formatSeasonOrdinal(first)}〜${formatSeasonOrdinal(last)}`);

/**
 * Studios and publishers of a slot's titles as stated in the source comments, similar slots, and (only for the
 * confident bands) the experimental next-season candidates with their measured hit rate.
 */
export function SlotCredits({ credits, summary }: { credits: NonNullable<SlotDetail["credits"]>; summary: CreditSummary | null }) {
  const { profile, similar } = credits;
  const predictions = CREDIT_ROLES.flatMap((role) => {
    const prediction = profile.roles[role].prediction;
    const band = prediction ? summary?.roles[role].backtest.bands[prediction.band] : undefined;
    return prediction && (prediction.band === "high" || prediction.band === "mid") && band && band.n > 0 ? [{ role, prediction, band }] : [];
  });
  return (
    <>
      <div className={styles.columns}>
        {CREDIT_ROLES.map((role) => {
          const { known, top, dominant } = profile.roles[role];
          return (
            <div key={role} className={styles.role}>
              <h3 className={styles.heading}>{CREDIT_ROLE_LABELS[role]}</h3>
              <p className={styles.coverage}>
                所属{profile.members}作品のうち、記載あり{known}作品
              </p>
              {known === 0 ? (
                <p className={styles.empty}>出典の備考に記載がありません。</p>
              ) : (
                <ol role="list" className={styles.list}>
                  {top.map((entry) => (
                    <li key={entry.name}>
                      <span className={styles.name}>{entry.name}</span>
                      <span className={styles.count}>{entry.titles}作品</span>
                      {span(entry.firstSeason, entry.lastSeason) ? <span className={styles.span}>{span(entry.firstSeason, entry.lastSeason)}</span> : null}
                    </li>
                  ))}
                </ol>
              )}
              {dominant ? (
                <p className={styles.dominant}>
                  記載のある{known}作品のうち{dominant.titles}作品（{formatPercent(dominant.share)}）が<strong>{dominant.name}</strong>です。
                  1社が半数以上・{DOMINANT_MIN_TITLES}作品以上を占める「暗黙の枠」に当たります。
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {similar.length > 0 ? (
        <div className={styles.block}>
          <h3 className={styles.heading}>
            制作会社・出版社の構成が似ている枠 <Badge tone="note" variant="dashed">実験</Badge>
          </h3>
          <ul role="list" className={styles.similar}>
            {similar.map((entry) => (
              <li key={entry.slug}>
                <SlotKindBadge kind={entry.kind} />
                <Link href={`/slots/${encodeURIComponent(entry.slug)}`}>{entry.name}</Link>
                <span className={styles.score}>類似度 {entry.score.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {predictions.length > 0 ? (
        <div className={styles.block}>
          <h3 className={styles.heading}>
            次のクールの候補 <Badge tone="note" variant="dashed">実験</Badge>
          </h3>
          <ul role="list" className={styles.predictions}>
            {predictions.map(({ role, prediction, band }) => (
              <li key={role}>
                <span className={styles.predictionRole}>
                  {CREDIT_ROLE_LABELS[role]}（{formatSeasonOrdinal(prediction.season)}）
                </span>
                <span>{prediction.candidates.map((candidate) => `${candidate.name} ${formatPercent(candidate.share)}`).join("、")}</span>
                <span className={styles.note}>
                  直近3年の{prediction.history}作品を重く数えて算出。同じ条件（{BAND_LABELS[prediction.band]}）の予測は、過去のデータで{band.n}件中{band.top1}件（{formatPercent(band.top1 / band.n)}）が1位で当たりました。
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            枠の過去の作品を新しいものほど重く数えた割合です。放送予定ではありません。
            <Link href="/analysis/implicit-slots" className="inline-link">
              方法と過去の的中率
            </Link>
          </p>
        </div>
      ) : null}
    </>
  );
}

export const DOMINANT_RULE_TEXT = `記載のある所属作品が4以上の枠で、1社が${formatPercent(DOMINANT_MIN_SHARE)}以上かつ${DOMINANT_MIN_TITLES}作品以上`;

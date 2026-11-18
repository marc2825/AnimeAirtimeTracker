import Link from "next/link";

import { SlotKindBadge } from "@/components/ui/primitives";
import { seasonFromOrdinal, seasonOrdinal, shiftSeason, type Season } from "@/domain/season";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import { formatSeasonOrdinal } from "@/lib/format";
import type { SlotSummary } from "@/server/queries/slots";

import styles from "./SlotCard.module.css";

/** Mini strip: one tick per season across a fixed window, filled when the slot had a regular title. */
export function SeasonStrip({ ordinals, end, count = 12 }: { ordinals: number[]; end: Season; count?: number }) {
  const set = new Set(ordinals);
  const seasons = Array.from({ length: count }, (_, index) => shiftSeason(end, index - count + 1));
  const filled = seasons.filter((season) => set.has(seasonOrdinal(season))).length;
  return (
    <span className={styles.strip} role="img" aria-label={`直近${count}クール中${filled}クールで放送`}>
      {seasons.map((season) => (
        <span key={seasonOrdinal(season)} className={`${styles.tick} ${set.has(seasonOrdinal(season)) ? styles.tickOn : ""} ${season.quarter === 1 ? styles.tickYear : ""}`} />
      ))}
    </span>
  );
}

export function SlotCard({ slot, stripEnd }: { slot: SlotSummary; stripEnd: Season }) {
  return (
    <li className={styles.card}>
      <div className={styles.head}>
        <SlotKindBadge kind={slot.kind} />
        {slot.channel ? <span className={styles.channel}>{slot.channel.shortName}</span> : null}
      </div>
      <Link href={`/slots/${encodeURIComponent(slot.slug)}`} className={styles.name}>
        {slot.name}
      </Link>
      <p className={styles.position}>
        {slot.latest ? (
          <>
            <span className={slot.latest.weekday === 5 ? "sat" : slot.latest.weekday === 6 ? "sun" : undefined}>{WEEKDAY_LABELS[slot.latest.weekday]}曜</span>{" "}
            <span className="mono">{formatAnimeMinute(slot.latest.minute)}</span>
            <span className={styles.positionNote}>（{formatSeasonOrdinal(slot.latest.seasonOrdinal)}時点）</span>
          </>
        ) : (
          <span className="muted">対象局での定時放送なし</span>
        )}
      </p>
      <SeasonStrip ordinals={slot.seasonOrdinals} end={stripEnd} />
      <dl className={styles.stats}>
        <div>
          <dt>作品</dt>
          <dd className="mono">{slot.titleCount}</dd>
        </div>
        <div>
          <dt>クール</dt>
          <dd className="mono">{slot.seasonCount}</dd>
        </div>
        <div>
          <dt>期間</dt>
          <dd>{slot.seasonOrdinals.length ? `${formatSeasonOrdinal(slot.seasonOrdinals[0]!)}〜` : "—"}</dd>
        </div>
      </dl>
    </li>
  );
}

export function latestOrdinal(slots: SlotSummary[]): Season {
  const max = Math.max(0, ...slots.flatMap((slot) => slot.seasonOrdinals));
  return max > 0 ? seasonFromOrdinal(max) : { year: 2026, quarter: 4 };
}

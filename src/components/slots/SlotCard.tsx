import Link from "next/link";

import { SlotKindBadge } from "@/components/ui/primitives";
import { seasonFromOrdinal, seasonOrdinal, shiftSeason, type Season } from "@/domain/season";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import { formatSeasonOrdinal } from "@/lib/format";
import { stripTickLabel, stripTicks, type StripSeasonTitles } from "@/lib/season-strip";
import type { SlotSummary } from "@/server/queries/slots";

import styles from "./SlotCard.module.css";

/**
 * Mini strip: one tick per season across a fixed window, filled when the slot had a regular title. Filled
 * ticks name their season and titles in aria-label; StripTooltip shows the same on hover, focus or tap.
 * A double-click (Enter, or a second tap) opens the season's first title. The strip is one tab stop (the
 * latest filled season); arrow keys move between filled seasons. Empty
 * ticks carry no text so that /slots, with hundreds of strips, stays light.
 */
export function SeasonStrip({ ordinals, end, count = 12, titles }: { ordinals: number[]; end: Season; count?: number; titles?: StripSeasonTitles }) {
  const ticks = stripTicks(ordinals, end, count, titles);
  const filled = ticks.filter((tick) => tick.on);
  const focusable = filled.at(-1)?.ordinal;
  return (
    <span className={styles.strip} role="group" aria-label={`直近${count}クール（${filled.length}クールで放送）`} data-end={seasonOrdinal(end)}>
      {ticks.map((tick) =>
        tick.on ? (
          <span
            key={tick.ordinal}
            role="img"
            tabIndex={tick.ordinal === focusable ? 0 : -1}
            aria-label={stripTickLabel(tick)}
            data-t={tick.lines.length > 1 ? tick.lines.join("\n") : undefined}
            data-s={tick.slug ?? undefined}
            className={`${styles.tick} ${styles.tickOn} ${tick.season.quarter === 1 ? styles.tickYear : ""}`}
          />
        ) : (
          <span key={tick.ordinal} className={`${styles.tick} ${tick.season.quarter === 1 ? styles.tickYear : ""}`} />
        )
      )}
    </span>
  );
}

export function SlotCard({ slot, stripEnd, stripTitles }: { slot: SlotSummary; stripEnd: Season; stripTitles?: StripSeasonTitles }) {
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
      <SeasonStrip ordinals={slot.seasonOrdinals} end={stripEnd} titles={stripTitles} />
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

/** First season ordinal of a strip window ending at `end` (the range `getSlotStripTitles` reads). */
export function stripStartOrdinal(end: Season, count = 12): number {
  return seasonOrdinal(shiftSeason(end, 1 - count));
}

export function latestOrdinal(slots: SlotSummary[]): Season {
  const max = Math.max(0, ...slots.flatMap((slot) => slot.seasonOrdinals));
  return max > 0 ? seasonFromOrdinal(max) : { year: 2026, quarter: 4 };
}

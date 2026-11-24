import Link from "next/link";

import { SlotKindBadge, WeekdayChip } from "@/components/ui/primitives";
import { seasonFromOrdinal, seasonOrdinal, shiftSeason, type Season } from "@/domain/season";
import { formatAnimeMinute } from "@/domain/time";
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

/**
 * A slot as a card: kind and home channel, name, latest position, the 12-season strip with its first and last
 * season written under it, and the titles of the latest filled season in the strip (when their names are stored).
 */
export function SlotCard({ slot, stripEnd, stripTitles }: { slot: SlotSummary; stripEnd: Season; stripTitles?: StripSeasonTitles }) {
  const ticks = stripTicks(slot.seasonOrdinals, stripEnd, STRIP_SEASONS, stripTitles);
  const latest = ticks.findLast((tick) => tick.on);
  const latestTitles = latest ? (stripTitles?.[latest.ordinal] ?? []) : [];
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
            <WeekdayChip weekday={slot.latest.weekday} />{" "}
            <span className="mono">{formatAnimeMinute(slot.latest.minute)}</span>
            <span className={styles.positionNote}>（{formatSeasonOrdinal(slot.latest.seasonOrdinal)}時点）</span>
          </>
        ) : (
          <span className="muted">対象局での定時放送なし</span>
        )}
      </p>
      <div className={styles.stripWithAxis}>
        <SeasonStrip ordinals={slot.seasonOrdinals} end={stripEnd} count={STRIP_SEASONS} titles={stripTitles} />
        <span className={styles.stripAxis} aria-hidden="true">
          <span>{ticks[0]?.heading}</span>
          <span>{ticks.at(-1)?.heading}</span>
        </span>
      </div>
      {latest && latestTitles.length > 0 ? (
        <p className={styles.latestTitles}>
          <span className={styles.latestSeason}>{latest.heading}</span>
          <Link href={`/titles/${latestTitles[0]!.slug}`} className={styles.latestTitle}>
            {latestTitles[0]!.name}
          </Link>
          {latestTitles.length > 1 ? <span className={styles.latestMore}>ほか{latestTitles.length - 1}作品</span> : null}
        </p>
      ) : null}
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

const STRIP_SEASONS = 12;

/** First season ordinal of a strip window ending at `end` (the range `getSlotStripTitles` reads). */
export function stripStartOrdinal(end: Season, count = 12): number {
  return seasonOrdinal(shiftSeason(end, 1 - count));
}

export function latestOrdinal(slots: SlotSummary[]): Season {
  const max = Math.max(0, ...slots.flatMap((slot) => slot.seasonOrdinals));
  return max > 0 ? seasonFromOrdinal(max) : { year: 2026, quarter: 4 };
}

import Link from "next/link";

import { FlagBadges } from "@/components/ui/primitives";
import { formatAnimeMinute } from "@/domain/time";
import { episodeText, formatStartTime, type ClockMode } from "@/lib/format";
import type { ChannelInfo } from "@/server/queries/common";
import type { ScheduleItem } from "@/server/queries/schedule";

import { buildSegments, placeItems, totalHeight, PX_PER_MINUTE } from "./layout";
import { NowLine } from "./NowLine";
import styles from "./ScheduleGrid.module.css";

function itemTone(item: ScheduleItem): string {
  if (item.flagNew) return styles.toneNew!;
  if (item.flagFinal) return styles.toneFinal!;
  if (item.isRerun) return styles.toneRerun!;
  return styles.toneDefault!;
}

export function ScheduleGrid({ items, channels, animeDate, clock }: { items: ScheduleItem[]; channels: ChannelInfo[]; animeDate: string; clock: ClockMode }) {
  const segments = buildSegments(items.map((item) => ({ start: item.animeStartMinute, duration: item.durationMinutes })));
  const placed = placeItems(
    items.map((item) => ({ id: item.id, column: item.channelSlug, start: item.animeStartMinute, duration: item.durationMinutes })),
    segments
  );
  const height = totalHeight(segments);
  const columnCount = channels.length;

  return (
    <div className={styles.scroller} role="region" aria-label="番組表（局×時刻）" tabIndex={0}>
      <div className={styles.grid} style={{ "--columns": columnCount } as React.CSSProperties}>
        <div className={styles.corner} aria-hidden="true" />
        {channels.map((channel) => (
          <div key={channel.slug} className={styles.channelHead}>
            <span className={styles.channelName}>{channel.shortName}</span>
            <span className={styles.channelMedium}>{channel.medium === "TERRESTRIAL" ? "地上波" : channel.medium}</span>
          </div>
        ))}

        <div className={styles.axis} style={{ height }} aria-hidden="true">
          {segments.map((segment) =>
            segment.kind === "gap" ? (
              <div key={segment.from} className={styles.axisGap} style={{ top: segment.top, height: segment.height }}>
                <span>{formatAnimeMinute(segment.from)}–{formatAnimeMinute(segment.to)}</span>
              </div>
            ) : (
              Array.from({ length: (segment.to - segment.from) / 60 }, (_, index) => {
                const minute = segment.from + index * 60;
                return (
                  <div key={minute} className={`${styles.axisHour} ${minute === 24 * 60 ? styles.axisMidnight : ""}`} style={{ top: segment.top + index * 60 * PX_PER_MINUTE }}>
                    <span>{formatStartTime(minute, clock)}</span>
                    {minute === 24 * 60 ? <span className={styles.axisMidnightLabel}>日付変更</span> : null}
                  </div>
                );
              })
            )
          )}
        </div>

        <div className={styles.body} style={{ height, gridColumn: `2 / span ${columnCount}` }}>
          {/* Hour rules and collapsed gaps span all columns */}
          {segments.map((segment) =>
            segment.kind === "gap" ? (
              <div key={`g${segment.from}`} className={styles.gapBand} style={{ top: segment.top, height: segment.height }}>
                <span>放送なし</span>
              </div>
            ) : (
              Array.from({ length: (segment.to - segment.from) / 60 }, (_, index) => {
                const minute = segment.from + index * 60;
                return <div key={`h${minute}`} className={`${styles.hourRule} ${minute === 24 * 60 ? styles.midnightRule : ""}`} style={{ top: segment.top + index * 60 * PX_PER_MINUTE }} />;
              })
            )
          )}
          {channels.map((channel, columnIndex) => (
            <div key={channel.slug} className={styles.column} style={{ left: `calc(${columnIndex} * 100% / ${columnCount})`, width: `calc(100% / ${columnCount})` }}>
              {items
                .filter((item) => item.channelSlug === channel.slug)
                .map((item) => {
                  const position = placed.get(item.id)!;
                  const episode = episodeText(item.episodeNumber, item.episodeLabel);
                  const compact = position.height < 44;
                  // Fit whole lines only: padding 8 + time row 15, title lines 16px, episode row 14.
                  const available = position.height - 2 - 8 - 15;
                  const showEpisode = Boolean(episode) && available >= 16 * 2 + 14;
                  const titleLines = Math.max(1, Math.min(3, Math.floor((available - (showEpisode ? 14 : 0)) / 16)));
                  return (
                    <Link
                      key={item.id}
                      href={`/titles/${item.titleSlug}`}
                      className={`${styles.cell} ${itemTone(item)} ${compact ? styles.cellCompact : ""}`}
                      style={{
                        top: position.top,
                        height: position.height - 2,
                        left: `calc(${position.lane} * 100% / ${position.lanes})`,
                        width: `calc(100% / ${position.lanes} - 3px)`,
                        ["--title-lines" as string]: titleLines
                      }}
                      title={`${formatStartTime(item.animeStartMinute, clock)} ${channel.shortName} ${item.titleName}${episode ? ` ${episode}` : ""}${item.subtitle ? `「${item.subtitle}」` : ""}`}
                    >
                      <span className={styles.cellTime}>
                        {formatStartTime(item.animeStartMinute, clock)}
                        <FlagBadges flagNew={item.flagNew} flagFinal={item.flagFinal} isRerun={item.isRerun} rerunBasis={item.rerunBasis} compact />
                      </span>
                      <span className={styles.cellTitle}>{item.titleName}</span>
                      {!compact && showEpisode ? <span className={styles.cellEpisode}>{episode}</span> : null}
                    </Link>
                  );
                })}
            </div>
          ))}
          <NowLine animeDate={animeDate} segments={segments} />
        </div>
      </div>
    </div>
  );
}

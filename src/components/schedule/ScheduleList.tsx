import Link from "next/link";

import { FlagBadges } from "@/components/ui/primitives";
import { episodeText, formatStartTime, type ClockMode } from "@/lib/format";
import type { ScheduleItem } from "@/server/queries/schedule";

import styles from "./ScheduleList.module.css";

/** Compact time-ordered list for one anime day. Used for the week list view and on small screens. */
export function ScheduleDayList({ items, clock, emptyLabel = "この日の該当番組はありません" }: { items: ScheduleItem[]; clock: ClockMode; emptyLabel?: string }) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>;
  }
  return (
    <ol role="list" className={styles.list}>
      {items.map((item, index) => {
        const hour = Math.floor(item.animeStartMinute / 60);
        const previous = items[index - 1];
        const showHour = !previous || Math.floor(previous.animeStartMinute / 60) !== hour;
        const episode = episodeText(item.episodeNumber, item.episodeLabel);
        return (
          <li key={item.id} className={`${styles.row} ${item.isRerun ? styles.rerun : ""} ${showHour ? styles.hourStart : ""}`}>
            <span className={styles.time}>
              {formatStartTime(item.animeStartMinute, clock)}
              {hour === 24 && showHour ? <span className={styles.midnight}>日付変更</span> : null}
            </span>
            <span className={styles.channel}>{item.channelShortName}</span>
            <span className={styles.main}>
              <Link href={`/titles/${item.titleSlug}`} className={styles.title}>
                {item.titleName}
              </Link>
              <span className={styles.sub}>
                {episode ? <span className="mono">{episode}</span> : null}
                {item.subtitle ? <span className={styles.subtitle}>「{item.subtitle}」</span> : null}
                <span className={styles.duration}>{item.durationMinutes}分</span>
              </span>
            </span>
            <span className={styles.flags}>
              <FlagBadges flagNew={item.flagNew} flagFinal={item.flagFinal} isRerun={item.isRerun} rerunBasis={item.rerunBasis} flagNote={item.flagNote} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

import Link from "next/link";

import { QUARTER_LABELS } from "@/domain/season";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import type { TimelineSeason } from "@/server/queries/slots";

import { ScrollToEnd } from "./ScrollToEnd";
import styles from "./SlotTimeline.module.css";

/** Season-by-season chronicle of a slot: position (with moves) and the titles that occupied it. */
export function SlotTimeline({ seasons }: { seasons: TimelineSeason[] }) {
  return (
    <ScrollToEnd className={styles.scroller} label="放送枠の年表（左が古く、右が新しい）">
      <ol role="list" className={styles.timeline}>
        {seasons.map((entry, index) => {
          const showYear = index === 0 || entry.season.quarter === 1;
          const empty = entry.titles.length === 0;
          return (
            <li key={entry.ordinal} className={`${styles.season} ${empty ? styles.seasonEmpty : ""}`}>
              <div className={styles.axis}>
                <span className={styles.year} aria-hidden={!showYear}>
                  {showYear ? entry.season.year : ""}
                </span>
                <span className={styles.quarter}>
                  <span className="visually-hidden">{entry.season.year}年</span>
                  {QUARTER_LABELS[entry.season.quarter - 1]}
                </span>
                <span className={`${styles.node} ${empty ? styles.nodeEmpty : ""} ${entry.moved ? styles.nodeMoved : ""}`} aria-hidden="true" />
              </div>
              <div className={styles.position}>
                {entry.position ? (
                  <>
                    <span className={styles.positionTime}>
                      <span className={entry.position.weekday === 5 ? "sat" : entry.position.weekday === 6 ? "sun" : undefined}>{WEEKDAY_LABELS[entry.position.weekday]}</span>{" "}
                      {formatAnimeMinute(entry.position.minute)}
                    </span>
                    {entry.moved ? <span className={styles.moved}>時刻移動</span> : null}
                  </>
                ) : (
                  <span className={styles.positionNone}>—</span>
                )}
              </div>
              {empty ? (
                <p className={styles.none}>該当作品なし</p>
              ) : (
                <ul role="list" className={styles.titles}>
                  {entry.titles.map((title) => (
                    <li key={title.slug} className={`${styles.title} ${title.continuesFromPrevious ? styles.titleContinued : ""}`}>
                      <Link href={`/titles/${title.slug}`} className={styles.titleLink}>
                        {title.name}
                      </Link>
                      <span className={styles.titleMeta}>
                        {title.continuesFromPrevious ? <span className={styles.continued}>前期から継続</span> : null}
                        {entry.position && (title.weekday !== entry.position.weekday || title.minute !== entry.position.minute) ? (
                          <span>
                            {WEEKDAY_LABELS[title.weekday]} {formatAnimeMinute(title.minute)}
                          </span>
                        ) : null}
                        <span>{title.airings}回</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </ScrollToEnd>
  );
}

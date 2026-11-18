"use client";

import { useEffect, useState } from "react";

import { formatAnimeMinute, toAnimeTime } from "@/domain/time";

import { minuteToY, type TimeSegment } from "./layout";
import styles from "./ScheduleGrid.module.css";

/** Current-time indicator, rendered only on the client (the server page is cached across requests). */
export function NowLine({ animeDate, segments }: { animeDate: string; segments: TimeSegment[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) return null;
  const anime = toAnimeTime(now);
  if (anime.animeDate !== animeDate) return null;
  const y = minuteToY(segments, anime.animeMinute);
  if (y === null) return null;

  return (
    <div className={styles.nowLine} style={{ top: y }} role="presentation">
      <span className={styles.nowLabel}>
        <span className="visually-hidden">現在時刻 </span>
        {formatAnimeMinute(anime.animeMinute)}
      </span>
    </div>
  );
}

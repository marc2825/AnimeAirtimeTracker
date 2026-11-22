import { formatAnimeMinute } from "@/domain/time";
import { formatSeasonOrdinal } from "@/lib/format";

import styles from "./Charts.module.css";

const WIDTH = 720;
const HEIGHT = 240;
const LEFT = 52;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 28;
/** Up to four series: blue, ink, light blue, dark blue; each also has its own marker shape. */
const SERIES = ["var(--viz-bar)", "var(--color-ink-2)", "var(--viz-3)", "var(--viz-6)"];
const DASHES = ["", "6 4", "2 3", "10 3 2 3"];

/**
 * Start time (anime time) per season for a few series, drawn as lines over a shared season axis. Seasons
 * without a value break the line. Earlier times are at the top, like a programme guide.
 */
export function StartTimeChart({ seasons, series }: { seasons: number[]; series: { name: string; minutes: (number | null)[] }[] }) {
  const values = series.flatMap((s) => s.minutes.filter((m): m is number => m !== null));
  if (values.length === 0 || seasons.length === 0) return null;
  const low = Math.floor(Math.min(...values) / 60) * 60;
  const high = Math.max(low + 60, Math.ceil((Math.max(...values) + 1) / 60) * 60);
  const x = (index: number) => LEFT + ((WIDTH - LEFT - RIGHT) * (index + 0.5)) / seasons.length;
  const y = (minute: number) => TOP + ((HEIGHT - TOP - BOTTOM) * (minute - low)) / (high - low);
  const hours: number[] = [];
  const stepMinutes = high - low > 6 * 60 ? 120 : 60;
  for (let minute = low; minute <= high; minute += stepMinutes) hours.push(minute);
  const labelEvery = Math.max(1, Math.ceil(seasons.length / 8));
  return (
    <figure className={styles.startTime}>
      <ul role="list" className={styles.seriesLegend}>
        {series.map((s, i) => (
          <li key={s.name}>
            <svg width="28" height="12" aria-hidden="true">
              <line x1="0" x2="28" y1="6" y2="6" stroke={SERIES[i]} strokeWidth="2" strokeDasharray={DASHES[i]} />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.startTimeSvg} role="img" aria-label={`開始時刻の推移（${series.map((s) => s.name).join("、")}）。数値は表にもあります。`}>
        {hours.map((minute) => (
          <g key={minute}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(minute)} y2={y(minute)} className={styles.startTimeGrid} />
            <text x={LEFT - 6} y={y(minute) + 4} textAnchor="end" className={styles.startTimeAxis}>
              {formatAnimeMinute(minute)}
            </text>
          </g>
        ))}
        {seasons.map((ordinal, index) =>
          index % labelEvery === 0 ? (
            <text key={ordinal} x={x(index)} y={HEIGHT - 8} textAnchor="middle" className={styles.startTimeAxis}>
              {formatSeasonOrdinal(ordinal)}
            </text>
          ) : null
        )}
        {series.map((s, i) => {
          // Consecutive seasons with a value form one segment; a missing season breaks the line.
          const segments: string[][] = [[]];
          s.minutes.forEach((minute, index) => {
            if (minute === null) segments.push([]);
            else segments.at(-1)!.push(`${x(index)},${y(minute)}`);
          });
          return (
            <g key={s.name}>
              {segments.filter((points) => points.length > 1).map((points, k) => (
                <polyline key={k} points={points.join(" ")} fill="none" stroke={SERIES[i]} strokeWidth="2" strokeDasharray={DASHES[i]} />
              ))}
              {s.minutes.map((minute, index) =>
                minute === null ? null : (
                  <circle key={index} cx={x(index)} cy={y(minute)} r="3.5" fill={SERIES[i]}>
                    <title>{`${s.name} ${formatSeasonOrdinal(seasons[index]!)}: ${formatAnimeMinute(minute)}`}</title>
                  </circle>
                )
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

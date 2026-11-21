import type { ReactNode } from "react";

import { ScrollToEnd } from "@/components/slots/ScrollToEnd";
import { Disclosure } from "@/components/ui/controls";
import { ANIME_HOURS } from "@/domain/stats";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";

import styles from "./Charts.module.css";

/** Quantize to the 7-step sequential ramp; 0 stays on the neutral zero color. */
function rampStep(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(7, Math.max(1, Math.ceil((value / max) * 7)));
}

function RampLegend({ max, unit }: { max: number; unit: string }) {
  return (
    <div className={styles.legend} aria-hidden="true">
      <span>0</span>
      <span className={styles.legendSwatch} data-step="0" />
      {Array.from({ length: 7 }, (_, index) => (
        <span key={index} className={styles.legendSwatch} data-step={index + 1} />
      ))}
      <span>
        {max}
        {unit}
      </span>
    </div>
  );
}

export function ChartFrame({ title, takeaway, scope, children, table }: { title: string; takeaway?: ReactNode; scope?: ReactNode; children: ReactNode; table?: ReactNode }) {
  return (
    <figure className={styles.frame}>
      <figcaption className={styles.caption}>
        <span className={styles.chartTitle}>{title}</span>
        {takeaway ? <span className={styles.takeaway}>{takeaway}</span> : null}
      </figcaption>
      <div className={styles.plot}>{children}</div>
      {scope ? <p className={styles.scope}>{scope}</p> : null}
      {table ? <Disclosure summary="表で見る">{table}</Disclosure> : null}
    </figure>
  );
}

export function WeekdayHourHeatmap({ cells, max, unitLabel, hours = ANIME_HOURS }: { cells: number[][]; max: number; unitLabel: string; hours?: number[] }) {
  return (
    <div className={styles.heatmapWrap}>
      <div className={styles.heatmap} style={{ gridTemplateColumns: `2rem repeat(${hours.length}, minmax(1.25rem, 1fr))` }} role="img" aria-label={`曜日×時間帯ヒートマップ（最大${max}${unitLabel}）。詳細は「表で見る」を参照。`}>
        <span />
        {hours.map((hour) => (
          <span key={hour} className={`${styles.hourLabel} ${hour === 24 ? styles.hourMidnight : ""}`}>
            {hour % 3 === 0 || hour === 5 ? hour : ""}
          </span>
        ))}
        {cells.map((row, weekday) => (
          <Row key={weekday} weekday={weekday} row={row} max={max} unitLabel={unitLabel} hours={hours} />
        ))}
      </div>
      <RampLegend max={max} unit={unitLabel} />
    </div>
  );
}

function Row({ weekday, row, max, unitLabel, hours }: { weekday: number; row: number[]; max: number; unitLabel: string; hours: number[] }) {
  return (
    <>
      <span className={`${styles.rowLabel} ${weekday === 5 ? "sat" : weekday === 6 ? "sun" : ""}`}>{WEEKDAY_LABELS[weekday]}</span>
      {hours.map((hour) => {
        const value = row[hour - 5] ?? 0;
        return <span key={hour} className={styles.cell} data-step={rampStep(value, max)} title={`${WEEKDAY_LABELS[weekday]}曜 ${hour}時台: ${value}${unitLabel}`} />;
      })}
    </>
  );
}

export function HeatmapTable({ cells, unitLabel, hours = ANIME_HOURS }: { cells: number[][]; unitLabel: string; hours?: number[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.dataTable}>
        <caption className="visually-hidden">曜日×時間帯（{unitLabel}）</caption>
        <thead>
          <tr>
            <th scope="col">時台</th>
            {WEEKDAY_LABELS.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <th scope="row" className="mono">
                {hour}時
              </th>
              {cells.map((row, weekday) => (
                <td key={weekday} className="mono">
                  {row[hour - 5] || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ConcurrencyStrip({ counts, fromMinute, bucketMinutes }: { counts: number[][]; fromMinute: number; bucketMinutes: number }) {
  const max = Math.max(1, ...counts.flat());
  const buckets = counts[0]?.length ?? 0;
  return (
    <div className={styles.heatmapWrap}>
      <div className={styles.strip} style={{ gridTemplateColumns: `2rem repeat(${buckets}, minmax(0.55rem, 1fr))` }} role="img" aria-label={`同時放送数の密度（最大${max}本）。詳細は「表で見る」を参照。`}>
        <span />
        {Array.from({ length: buckets }, (_, index) => {
          const minute = fromMinute + index * bucketMinutes;
          return (
            <span key={index} className={`${styles.hourLabel} ${minute === 24 * 60 ? styles.hourMidnight : ""}`}>
              {minute % 60 === 0 && (minute / 60) % 2 === 0 ? minute / 60 : ""}
            </span>
          );
        })}
        {counts.map((row, weekday) => (
          <StripRow key={weekday} weekday={weekday} row={row} max={max} fromMinute={fromMinute} bucketMinutes={bucketMinutes} />
        ))}
      </div>
      <RampLegend max={max} unit="本" />
    </div>
  );
}

function StripRow({ weekday, row, max, fromMinute, bucketMinutes }: { weekday: number; row: number[]; max: number; fromMinute: number; bucketMinutes: number }) {
  return (
    <>
      <span className={`${styles.rowLabel} ${weekday === 5 ? "sat" : weekday === 6 ? "sun" : ""}`}>{WEEKDAY_LABELS[weekday]}</span>
      {row.map((value, index) => {
        const minute = fromMinute + index * bucketMinutes;
        return (
          <span
            key={index}
            className={`${styles.cell} ${styles.stripCell} ${minute % 60 === 0 ? styles.stripHour : ""}`}
            data-step={rampStep(value, max)}
            title={`${WEEKDAY_LABELS[weekday]}曜 ${formatAnimeMinute(minute)}〜: ${value}本`}
          />
        );
      })}
    </>
  );
}

export function BarList({ rows, unit, max: maxOverride }: { rows: { key: string; label: ReactNode; value: number; secondary?: ReactNode; highlight?: boolean }[]; unit: string; max?: number }) {
  const max = maxOverride ?? Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul role="list" className={styles.barList}>
      {rows.map((row) => (
        <li key={row.key} className={`${styles.barRow} ${row.highlight ? styles.barHighlight : ""}`}>
          <span className={styles.barLabel}>{row.label}</span>
          <span className={styles.barTrack} aria-hidden="true">
            <span className={styles.barFill} style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className={styles.barValue}>
            {row.value}
            <span className={styles.barUnit}>{unit}</span>
            {row.secondary ? <span className={styles.barSecondary}>{row.secondary}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ColumnChart({ columns, unit }: { columns: { key: string; label: string; sublabel?: string; value: number; highlight?: boolean }[]; unit: string }) {
  const max = Math.max(1, ...columns.map((column) => column.value));
  return (
    <ScrollToEnd className={styles.columnsWrap} label="クール別のグラフ（左が古く、右が新しい）">
      <ol role="list" className={styles.columns} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(2.25rem, 1fr))` }}>
        {columns.map((column) => (
          <li key={column.key} className={`${styles.column} ${column.highlight ? styles.columnHighlight : ""}`} title={`${column.label}: ${column.value}${unit}`}>
            <span className={styles.columnValue}>{column.value}</span>
            <span className={styles.columnBar} style={{ height: `${(column.value / max) * 100}%` }} aria-hidden="true" />
            <span className={styles.columnLabel}>
              {column.sublabel ? <span className={styles.columnYear}>{column.sublabel}</span> : null}
              {column.label}
            </span>
          </li>
        ))}
      </ol>
    </ScrollToEnd>
  );
}

/**
 * Stacked columns for ordered series (e.g. time of day). Series i uses the sequential step `firstStep + i`, so later
 * series are more prominent in both themes; segments are separated by a 2px surface gap and carry a hover title.
 */
export function StackedColumnChart({
  columns,
  series,
  unit,
  firstStep = 3
}: {
  columns: { key: string; label: string; sublabel?: string; segments: number[]; highlight?: boolean }[];
  series: { key: string; label: string }[];
  unit: string;
  firstStep?: number;
}) {
  const totals = columns.map((column) => column.segments.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  return (
    <div>
      <ul role="list" className={styles.seriesLegend}>
        {series.map((item, index) => (
          <li key={item.key}>
            <span className={styles.seriesSwatch} data-step={firstStep + index} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
      <ScrollToEnd className={styles.columnsWrap} label="クール別・時間帯別のグラフ（左が古く、右が新しい）">
        <ol role="list" className={styles.columns} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(2.25rem, 1fr))` }}>
          {columns.map((column, columnIndex) => (
            <li key={column.key} className={`${styles.column} ${column.highlight ? styles.columnHighlight : ""}`} title={`${column.label}: 計${totals[columnIndex]}${unit}`}>
              <span className={styles.columnValue}>{totals[columnIndex]}</span>
              <span className={styles.stack} style={{ height: `${(totals[columnIndex]! / max) * 100}%` }}>
                {column.segments.map((value, index) =>
                  value > 0 ? (
                    <span key={series[index]!.key} className={styles.stackSegment} data-step={firstStep + index} style={{ flexGrow: value }} title={`${column.sublabel ?? ""}${column.label} ${series[index]!.label}: ${value}${unit}`} />
                  ) : null
                )}
              </span>
              <span className={styles.columnLabel}>
                {column.sublabel ? <span className={styles.columnYear}>{column.sublabel}</span> : null}
                {column.label}
              </span>
            </li>
          ))}
        </ol>
      </ScrollToEnd>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { ANIME_HOURS, rampStep } from "@/domain/stats";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import type { HeatmapDetails } from "@/server/queries/stats";

import styles from "./Charts.module.css";

const RANGES = [
  { label: "全時間帯", from: 5, to: 28 },
  { label: "夕方以降", from: 17, to: 28 },
  { label: "深夜", from: 22, to: 28 }
] as const;
/** Zoom steps: [cell height, minimum column width] in rem. Counts are printed in the cells from step 1. */
const ZOOM = [
  [1.6, 1.25],
  [2.2, 2.25],
  [2.8, 3.25],
  [3.4, 4.25]
] as const;
const MAX_TITLES = 12;
const GAP = 8;
const EDGE = 8;

interface Active {
  weekday: number;
  hour: number;
  pinned: boolean;
}

/** Titles of one cell, each with the channels and times it aired on. */
function cellTitles(details: HeatmapDetails | undefined, weekday: number, hour: number) {
  const entries = details?.cells[weekday * 24 + (hour - 5)] ?? [];
  const byTitle = new Map<number, { name: string; slug: string; airings: string[] }>();
  for (const [titleIndex, channelIndex, minute] of entries) {
    const title = details!.titles[titleIndex];
    if (!title) continue;
    const group = byTitle.get(titleIndex) ?? { ...title, airings: [] };
    group.airings.push(`${details!.channels[channelIndex] ?? ""} ${formatAnimeMinute(minute)}`);
    byTitle.set(titleIndex, group);
  }
  return [...byTitle.values()];
}

/**
 * Weekday × hour heatmap. Hovering or focusing a cell names the titles and channels behind it; a click
 * (or tap, or Enter) pins that panel so its titles can be followed. With `controls`, the hour range can be
 * cropped and the cells enlarged. The colour scale never changes with the crop, so views stay comparable.
 */
export function WeekdayHourHeatmap({
  cells,
  max,
  unitLabel,
  hours = ANIME_HOURS,
  details,
  controls = false
}: {
  cells: number[][];
  max: number;
  unitLabel: string;
  hours?: number[];
  details?: HeatmapDetails;
  controls?: boolean;
}) {
  const [range, setRange] = useState({ from: hours[0] ?? 5, to: hours.at(-1) ?? 28 });
  const [zoom, setZoom] = useState(0);
  const [active, setActive] = useState<Active | null>(null);
  const [focusCell, setFocusCell] = useState<{ weekday: number; hour: number } | null>(null);
  const [moved, setMoved] = useState(0);
  const panelId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => hours.filter((hour) => hour >= range.from && hour <= range.to), [hours, range]);
  const [cellHeight, cellMin] = ZOOM[zoom]!;
  const showCounts = zoom > 0;
  const tabStop = focusCell && shown.includes(focusCell.hour) ? focusCell : { weekday: 0, hour: shown[0] ?? 5 };

  // A pinned panel closes on Escape or a click outside the chart and the panel.
  useEffect(() => {
    if (!active?.pinned) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!gridRef.current?.contains(target) && !panelRef.current?.contains(target)) setActive(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [active?.pinned]);

  // The panel is fixed to the viewport. When the page moves under it, a hover panel goes away and a
  // pinned one follows its cell (late layout shifts must not close what the reader pinned).
  useEffect(() => {
    if (!active) return;
    const onMove = () => (active.pinned ? setMoved((count) => count + 1) : setActive(null));
    window.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [active]);

  // Above the cell when there is room, otherwise below; always inside the viewport.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!active || !panel) return;
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${active.weekday}-${active.hour}"]`);
    if (!cell) return;
    const anchor = cell.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, EDGE), window.innerWidth - width - EDGE);
    const above = anchor.top - GAP - height;
    panel.style.left = `${Math.round(Math.max(EDGE, left))}px`;
    panel.style.top = `${Math.round(above >= EDGE ? above : Math.min(anchor.bottom + GAP, window.innerHeight - height - EDGE))}px`;
    panel.style.visibility = "visible";
  }, [active, shown, zoom, moved]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell) return;
    const [weekday, hour] = cell.dataset.cell!.split("-").map(Number) as [number, number];
    const column = shown.indexOf(hour);
    const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    if (!move) return;
    event.preventDefault();
    const nextWeekday = Math.min(6, Math.max(0, weekday + move[0]!));
    const nextHour = shown[Math.min(shown.length - 1, Math.max(0, column + move[1]!))]!;
    setFocusCell({ weekday: nextWeekday, hour: nextHour });
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${nextWeekday}-${nextHour}"]`)?.focus();
  };

  const titles = active ? cellTitles(details, active.weekday, active.hour) : [];
  const activeValue = active ? (cells[active.weekday]?.[active.hour - 5] ?? 0) : 0;

  return (
    <div className={styles.heatmapBox}>
      {controls ? (
        <div className={styles.tools}>
          <div className={styles.toolGroup} role="group" aria-label="表示する時間帯">
            {RANGES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={styles.toolButton}
                aria-pressed={range.from === preset.from && range.to === preset.to}
                onClick={() => setRange({ from: preset.from, to: preset.to })}
              >
                {preset.label}
              </button>
            ))}
            <label className={styles.toolSelect}>
              <span className="visually-hidden">開始の時台</span>
              <select value={range.from} onChange={(event) => setRange((r) => ({ from: Number(event.target.value), to: Math.max(r.to, Number(event.target.value)) }))}>
                {hours.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}時
                  </option>
                ))}
              </select>
            </label>
            <span aria-hidden="true">〜</span>
            <label className={styles.toolSelect}>
              <span className="visually-hidden">終了の時台</span>
              <select value={range.to} onChange={(event) => setRange((r) => ({ from: Math.min(r.from, Number(event.target.value)), to: Number(event.target.value) }))}>
                {hours.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}時台
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.toolGroup} role="group" aria-label="拡大と縮小">
            <button type="button" className={styles.toolButton} onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="縮小">
              −
            </button>
            <span className={styles.toolValue} aria-live="polite">
              {["標準", "拡大1", "拡大2", "拡大3"][zoom]}
            </span>
            <button type="button" className={styles.toolButton} onClick={() => setZoom((z) => Math.min(ZOOM.length - 1, z + 1))} disabled={zoom === ZOOM.length - 1} aria-label="拡大">
              ＋
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.heatmapScroll}>
        <div
          ref={gridRef}
          className={styles.heatmap}
          style={{ gridTemplateColumns: `2rem repeat(${shown.length}, minmax(${cellMin}rem, 1fr))` }}
          role="group"
          aria-label={`曜日×時間帯ヒートマップ（最大${max}${unitLabel}）。矢印キーでセルを移動、Enterで内訳を固定。数値は「表で見る」にもあります。`}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setActive((current) => (current?.pinned ? current : null))}
        >
          <span />
          {shown.map((hour) => (
            <span key={hour} className={`${styles.hourLabel} ${hour === 24 ? styles.hourMidnight : ""}`}>
              {showCounts || shown.length <= 12 || hour % 3 === 0 || hour === 5 ? hour : ""}
            </span>
          ))}
          {cells.map((row, weekday) => (
            <Row
              key={weekday}
              weekday={weekday}
              row={row}
              max={max}
              unitLabel={unitLabel}
              hours={shown}
              height={cellHeight}
              showCounts={showCounts}
              tabStop={tabStop}
              active={active}
              panelId={panelId}
              onHover={(hour) => setActive((current) => (current?.pinned ? current : { weekday, hour, pinned: false }))}
              onFocus={(hour) => {
                setFocusCell({ weekday, hour });
                setActive((current) => (current?.pinned ? current : { weekday, hour, pinned: false }));
              }}
              onBlur={() => setActive((current) => (current?.pinned ? current : null))}
              onPin={(hour) => setActive((current) => (current?.pinned && current.weekday === weekday && current.hour === hour ? null : { weekday, hour, pinned: true }))}
            />
          ))}
        </div>
      </div>

      <div className={styles.legend} aria-hidden="true">
        <span>0</span>
        <span className={styles.legendSwatch} data-step="0" />
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} className={styles.legendSwatch} data-step={index + 1} />
        ))}
        <span>
          {max}
          {unitLabel}
        </span>
      </div>

      {active ? (
        <div ref={panelRef} id={panelId} role="tooltip" className={`${styles.cellPanel} ${active.pinned ? styles.cellPanelPinned : ""}`} style={{ visibility: "hidden" }}>
          <p className={styles.cellPanelHead}>
            {WEEKDAY_LABELS[active.weekday]}曜 {active.hour}時台
            <span>
              {activeValue}
              {unitLabel}
            </span>
          </p>
          {titles.length > 0 ? (
            <ul role="list" className={styles.cellPanelList}>
              {titles.slice(0, MAX_TITLES).map((title) => (
                <li key={title.slug}>
                  {active.pinned ? (
                    <Link href={`/titles/${title.slug}`} className={styles.cellPanelTitle}>
                      {title.name}
                    </Link>
                  ) : (
                    <span className={styles.cellPanelTitle}>{title.name}</span>
                  )}
                  <span className={styles.cellPanelAirings}>{title.airings.join("・")}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {titles.length > MAX_TITLES ? <p className={styles.cellPanelMore}>ほか {titles.length - MAX_TITLES} 作品</p> : null}
          {titles.length > 0 && !active.pinned ? <p className={styles.cellPanelMore}>クリックで固定すると、作品ページへ移動できます</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({
  weekday,
  row,
  max,
  unitLabel,
  hours,
  height,
  showCounts,
  tabStop,
  active,
  panelId,
  onHover,
  onFocus,
  onBlur,
  onPin
}: {
  weekday: number;
  row: number[];
  max: number;
  unitLabel: string;
  hours: number[];
  height: number;
  showCounts: boolean;
  tabStop: { weekday: number; hour: number };
  active: Active | null;
  panelId: string;
  onHover: (hour: number) => void;
  onFocus: (hour: number) => void;
  onBlur: () => void;
  onPin: (hour: number) => void;
}) {
  return (
    <>
      <span className={`${styles.rowLabel} ${weekday === 5 ? "sat" : weekday === 6 ? "sun" : ""}`}>{WEEKDAY_LABELS[weekday]}</span>
      {hours.map((hour) => {
        const value = row[hour - 5] ?? 0;
        const isActive = active?.weekday === weekday && active.hour === hour;
        return (
          <button
            key={hour}
            type="button"
            className={`${styles.cell} ${styles.cellButton}`}
            style={{ height: `${height}rem` }}
            data-step={rampStep(value, max)}
            data-cell={`${weekday}-${hour}`}
            data-active={isActive || undefined}
            tabIndex={tabStop.weekday === weekday && tabStop.hour === hour ? 0 : -1}
            aria-label={`${WEEKDAY_LABELS[weekday]}曜 ${hour}時台: ${value}${unitLabel}`}
            aria-describedby={isActive ? panelId : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") onHover(hour);
            }}
            onFocus={() => onFocus(hour)}
            onBlur={onBlur}
            onClick={() => onPin(hour)}
          >
            {showCounts && value > 0 ? value : null}
          </button>
        );
      })}
    </>
  );
}

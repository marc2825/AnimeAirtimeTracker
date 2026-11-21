"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { stripTooltipText } from "@/lib/season-strip";

import styles from "./SlotCard.module.css";

const TICK = `.${styles.tick}`;
const GAP = 6;
const EDGE = 8;

interface Tip {
  heading: string;
  lines: string[];
  anchor: HTMLElement;
}

function tickOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(TICK) : null;
}

/**
 * One tooltip for every season strip on the page (event delegation, so the strips stay server-rendered).
 * Shows a tick's season and titles on hover, keyboard focus or tap. Arrow keys move between the filled
 * ticks of a strip; the strip is a single tab stop. Screen readers get the same text from aria-label.
 */
export function StripTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = (tick: HTMLElement) => {
      const strip = tick.parentElement;
      const end = Number(strip?.dataset.end);
      if (!strip || !Number.isFinite(end)) return;
      const index = Array.prototype.indexOf.call(strip.children, tick);
      const filled = tick.classList.contains(styles.tickOn!) ? { label: tick.getAttribute("aria-label"), names: tick.dataset.t ?? null } : null;
      anchorRef.current = tick;
      setTip({ ...stripTooltipText(end, strip.children.length, index, filled), anchor: tick });
    };
    const hide = () => {
      anchorRef.current = null;
      setTip(null);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const tick = tickOf(event.target);
      if (tick) show(tick);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const tick = tickOf(event.target);
      if (tick && tick === anchorRef.current && !tickOf(event.relatedTarget) && document.activeElement !== tick) hide();
    };
    // Touch has no hover: a tap on a tick toggles it, a tap elsewhere closes it.
    const onPointerDown = (event: PointerEvent) => {
      const tick = tickOf(event.target);
      if (event.pointerType !== "touch") return;
      if (!tick) {
        if (anchorRef.current) hide();
        return;
      }
      if (tick === anchorRef.current) hide();
      else show(tick);
    };
    const onFocusIn = (event: FocusEvent) => {
      const tick = tickOf(event.target);
      if (tick) show(tick);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (tickOf(event.target) === anchorRef.current && !tickOf(event.relatedTarget)) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && anchorRef.current) {
        hide();
        return;
      }
      const tick = tickOf(event.target);
      if (!tick?.parentElement) return;
      // Only filled ticks are focusable; arrows move between them.
      const ticks = [...tick.parentElement.querySelectorAll<HTMLElement>(`${TICK}[tabindex]`)];
      const index = ticks.indexOf(tick);
      const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: ticks.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = ticks[Math.max(0, Math.min(ticks.length - 1, next))]!;
      for (const item of ticks) item.tabIndex = item === target ? 0 : -1;
      target.focus();
    };
    const onScroll = () => {
      if (anchorRef.current) hide();
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Place above the tick (below when there is no room), kept inside the viewport.
  useLayoutEffect(() => {
    const element = tipRef.current;
    if (!tip || !element) return;
    const anchor = tip.anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, EDGE), window.innerWidth - width - EDGE);
    const above = anchor.top - GAP - height;
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(above >= EDGE ? above : anchor.bottom + GAP)}px`;
    element.style.visibility = "visible";
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={tipRef} className={styles.tooltip} aria-hidden="true" style={{ visibility: "hidden" }}>
      <span className={styles.tooltipHeading}>{tip.heading}</span>
      {tip.lines.map((line, index) => (
        <span key={index} className={styles.tooltipLine}>
          {line}
        </span>
      ))}
    </div>
  );
}

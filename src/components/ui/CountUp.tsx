"use client";

import { useLayoutEffect, useRef } from "react";

import { countUpValue } from "@/lib/count-up";

const DURATION_MS = 800;
const formatter = new Intl.NumberFormat("ja-JP");

/**
 * A whole number that counts up from 0 to its value when it first comes into view, and again when the value
 * changes. The server renders the final value; with reduced motion nothing moves. Width is reserved for the final
 * digits (tabular numerals), so neighbours never shift.
 */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = formatter.format(value);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const run = () => {
      const startedAt = performance.now();
      node.textContent = formatter.format(0);
      const tick = (now: number) => {
        const progress = (now - startedAt) / DURATION_MS;
        node.textContent = formatter.format(countUpValue(value, progress));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    // The final value stays in place until the count starts, so anything that never scrolls here (print, capture
    // tools, a failed observer) still shows the right number.
    const rect = node.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    let observer: IntersectionObserver | undefined;
    if (inView || !("IntersectionObserver" in window)) {
      run();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          run();
        }
      });
      observer.observe(node);
    }
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      node.textContent = final;
    };
  }, [value, final]);

  return (
    <span ref={ref} className="tabular" style={{ display: "inline-block", minWidth: `${final.length}ch` }}>
      {final}
    </span>
  );
}

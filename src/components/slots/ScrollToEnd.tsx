"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Horizontal scroller that starts at the most recent (right-most) end. */
export function ScrollToEnd({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let userScrolled = false;
    const anchor = () => {
      if (!userScrolled) element.scrollLeft = element.scrollWidth;
    };
    const onUser = () => {
      userScrolled = true;
    };
    anchor();
    // Re-anchor once fonts and layout settle, unless the reader has already scrolled.
    const frame = requestAnimationFrame(anchor);
    void document.fonts?.ready.then(anchor);
    const observer = new ResizeObserver(anchor);
    observer.observe(element);
    element.addEventListener("pointerdown", onUser, { once: true });
    element.addEventListener("wheel", onUser, { once: true, passive: true });
    element.addEventListener("keydown", onUser, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className={className} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

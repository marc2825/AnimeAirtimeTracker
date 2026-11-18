"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Horizontal scroller that starts at the most recent (right-most) end. */
export function ScrollToEnd({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, []);
  return (
    <div ref={ref} className={className} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

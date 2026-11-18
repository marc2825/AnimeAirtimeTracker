"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition, type ReactNode } from "react";

import styles from "./controls.module.css";

/**
 * GET form that works without JavaScript; with JavaScript it navigates client-side, drops empty
 * parameters from the URL and auto-submits when an element marked `data-autosubmit` changes.
 */
export function FilterForm({ action, children, className, label }: { action: string; children: ReactNode; className?: string; label: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function navigate() {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string" && value !== "") params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.push(query ? `${action}?${query}` : action, { scroll: false }));
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      role="search"
      aria-label={label}
      className={className}
      data-pending={pending ? "" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        navigate();
      }}
      onChange={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-autosubmit]")) navigate();
      }}
    >
      {children}
      <span className={styles.pending} aria-live="polite">
        {pending ? "更新中…" : ""}
      </span>
    </form>
  );
}

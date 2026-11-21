"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/Icon";
import { airingsOnAir } from "@/lib/now-airing";
import type { WindowAiring } from "@/server/queries/seasons";

import styles from "./NowAiringBanner.module.css";

const STORAGE_KEY = "nowAiringHiddenUntil";
const HIDE_EVENT = "now-airing-hidden";
const TICK_MS = 30_000;

// Current time in 30-second steps (a stable snapshot between ticks); null while server-rendering.
function subscribeClock(onChange: () => void) {
  const timer = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(timer);
}
const clockSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

function subscribeHidden(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(HIDE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(HIDE_EVENT, onChange);
  };
}
// Also kept in memory, so closing works for this visit even when storage is unavailable (private mode).
let hiddenInMemoryUntil = 0;
function hiddenUntilSnapshot(): number {
  try {
    return Math.max(hiddenInMemoryUntil, Number(window.localStorage.getItem(STORAGE_KEY) ?? 0) || 0);
  } catch {
    return hiddenInMemoryUntil;
  }
}

/** Dismissible strip listing what is on air now; hidden until the end of the anime day once closed. */
export function NowAiringBanner({ airings, dayEnd }: { airings: WindowAiring[]; dayEnd: string }) {
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => null);
  const hiddenUntil = useSyncExternalStore(subscribeHidden, hiddenUntilSnapshot, () => Number.POSITIVE_INFINITY);
  if (now === null || now < hiddenUntil) return null;
  const onAir = airingsOnAir(airings, now);
  if (onAir.length === 0) return null;

  function dismiss() {
    hiddenInMemoryUntil = Date.parse(dayEnd);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(hiddenInMemoryUntil));
    } catch {
      // Storage unavailable: the in-memory value hides it until the page is reloaded.
    }
    window.dispatchEvent(new Event(HIDE_EVENT));
  }

  return (
    <aside className={styles.banner} aria-label="放送中の番組">
      <div className={`container ${styles.inner}`}>
        <span className={styles.label}>
          <span className={styles.dot} aria-hidden="true" />
          放送中 <span className="mono">{onAir.length}</span>本
        </span>
        <ul role="list" className={styles.list}>
          {onAir.slice(0, 3).map((airing) => (
            <li key={airing.id}>
              <span className={styles.channel}>{airing.channelShortName}</span>
              <Link href={`/titles/${airing.titleSlug}`} className={styles.title}>
                {airing.titleName}
              </Link>
              {airing.isRerun ? <span className={styles.rerun}>再</span> : null}
            </li>
          ))}
        </ul>
        <Link href="/schedule?region=all" className={styles.more}>
          番組表へ
        </Link>
        <button type="button" className={styles.close} onClick={dismiss} aria-label="放送中の表示を閉じる（翌朝5時まで表示しません）">
          <Icon name="close" size={14} />
        </button>
      </div>
    </aside>
  );
}

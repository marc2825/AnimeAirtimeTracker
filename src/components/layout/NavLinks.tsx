"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/Icon";

import styles from "./SiteHeader.module.css";

export const NAV_ITEMS: { href: "/schedule" | "/search" | "/slots" | "/stats"; label: string; icon: IconName }[] = [
  { href: "/schedule", label: "番組表", icon: "schedule" },
  { href: "/search", label: "検索", icon: "search" },
  { href: "/slots", label: "放送枠", icon: "slots" },
  { href: "/stats", label: "統計", icon: "stats" }
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  return <DesktopNavView pathname={usePathname()} />;
}

/** Presentational nav; also rendered server-side (without an active item) as the Suspense fallback. */
export function DesktopNavView({ pathname }: { pathname: string }) {
  return (
    <nav className={styles.desktopNav} aria-label="メイン">
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={styles.navLink} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
      <Link href="/analysis" className={styles.navLink} aria-current={isActive(pathname, "/analysis") ? "page" : undefined}>
        分析
      </Link>
      <Link href="/about" className={styles.navLink} aria-current={isActive(pathname, "/about") ? "page" : undefined}>
        このサイトについて
      </Link>
    </nav>
  );
}

export function MobileNav() {
  return <MobileNavView pathname={usePathname()} />;
}

export function MobileNavView({ pathname }: { pathname: string }) {
  return (
    <nav className={styles.mobileNav} aria-label="メイン（モバイル）">
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={styles.mobileLink} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

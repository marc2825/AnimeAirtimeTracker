import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/ui/Icon";
import { SITE_NAME, SITE_NAME_EN } from "@/lib/site";

import { LogoMark } from "./Logo";
import { DesktopNav, DesktopNavView, MobileNav, MobileNavView } from "./NavLinks";
import styles from "./SiteHeader.module.css";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <>
      <header className={styles.header}>
        <div className={`container ${styles.inner}`}>
          <Link href="/" className={styles.brand} aria-label={`${SITE_NAME} トップへ`}>
            <LogoMark />
            <span className={styles.brandText}>
              <span className={styles.brandKicker}>{SITE_NAME_EN}</span>
              <span className={styles.brandName}>{SITE_NAME}</span>
            </span>
          </Link>
          <Suspense fallback={<DesktopNavView pathname="" />}>
            <DesktopNav />
          </Suspense>
          <div className={styles.actions}>
            <Link href="/about" className={`${styles.iconButton} ${styles.mobileOnly}`} aria-label="このサイトについて">
              <Icon name="info" />
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <Suspense fallback={<MobileNavView pathname="" />}>
        <MobileNav />
      </Suspense>
    </>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";
import { Suspense, type ReactNode } from "react";

import { NowAiring } from "@/components/layout/NowAiring";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";

import "@/styles/tokens.css";
import "@/styles/base.css";
import styles from "./layout.module.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// Japanese glyphs are split into unicode-range chunks; only the latin subset is preloaded. 900 is for headings.
const notoSansJp = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "500", "700", "900"], variable: "--font-noto-jp", display: "swap", preload: false });

/** Resolve the theme before first paint: stored choice, else OS preference. Follows OS changes until the user picks. */
const themeScript = `(function(){var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)');function s(){var t=null;try{t=localStorage.getItem('theme')}catch(e){}d.dataset.theme=(t==='light'||t==='dark')?t:(m.matches?'dark':'light')}s();try{m.addEventListener('change',function(){var t=null;try{t=localStorage.getItem('theme')}catch(e){}if(t!=='light'&&t!=='dark')s()})}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: `${SITE_NAME} — アニメ放送編成を、今週から過去まで`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "ja_JP" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
  // Search Console ownership via the HTML-tag method (a *.vercel.app domain cannot be verified through DNS).
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined
};

export const viewport: Viewport = {
  themeColor: [
    // The masthead colour (tokens.css --color-masthead), so the browser chrome continues the black band.
    { media: "(prefers-color-scheme: light)", color: "#17171c" },
    { media: "(prefers-color-scheme: dark)", color: "#060608" }
  ],
  colorScheme: "light dark"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${geist.variable} ${geistMono.variable} ${notoSansJp.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className={styles.skipLink}>
          本文へスキップ
        </a>
        <SiteHeader />
        <Suspense fallback={null}>
          <NowAiring />
        </Suspense>
        <main id="main" className={styles.main}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

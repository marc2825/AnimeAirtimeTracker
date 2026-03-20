import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Noto_Sans_JP } from "next/font/google";

import { SiteHeader } from "@/components/SiteHeader";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap"
});

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto",
  display: "swap"
});

// フラッシュ防止: 初回レンダリング前にテーマを適用する
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-theme','dark')}}catch(_){}})()`;

export const metadata: Metadata = {
  title: "深夜アニメ放送枠観測所",
  description: "深夜アニメの放送枠・放送時間・放送局・地域差を分析するためのWebアプリ土台"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${geist.variable} ${notoSansJp.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SiteHeader />
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}

import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
  { href: "/", label: "トップ" },
  { href: "/search", label: "検索一覧" },
  { href: "/stats", label: "統計ダッシュボード" }
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div>
          <Link href="/" className="site-title">
            深夜アニメ放送枠観測所
          </Link>
          <p className="site-subtitle">放送枠・放送時間・局・地域差を観測する MVP 土台</p>
        </div>
        <div className="site-header-right">
          <nav className="site-nav" aria-label="主要ナビゲーション">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link">
                {item.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

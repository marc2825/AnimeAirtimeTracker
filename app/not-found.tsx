import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="page-stack">
      <section className="hero">
        <h1>ページが見つかりません</h1>
        <p>指定された作品または放送枠は、現在のダミーデータには登録されていません。</p>
        <div className="hero-links">
          <Link href="/search" className="hero-link hero-link-primary">
            検索一覧へ戻る
          </Link>
          <Link href="/" className="hero-link hero-link-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>
    </div>
  );
}

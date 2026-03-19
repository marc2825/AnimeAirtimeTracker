import Link from "next/link";

import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import { formatAnimeSchedule, formatSeason } from "@/lib/formatters";
import { getAllTitleEntries, getFeaturedSlots, getOverviewStats } from "@/lib/catalog";

export default function HomePage() {
  const overview = getOverviewStats();
  const featuredSlots = getFeaturedSlots(3);
  const latestTitles = getAllTitleEntries().slice(0, 4);

  return (
    <div className="page-stack">
      <section className="hero">
        <Badge tone="warm">MVP土台</Badge>
        <h1>放送枠を起点に、深夜アニメの流れを追えるようにする</h1>
        <p>
          このMVPでは、作品詳細だけでなく放送枠詳細と統計ダッシュボードを先に用意し、
          「いつ・どこで・どの枠で流れたか」を追いやすい土台を整えています。
        </p>
        <div className="hero-links">
          <Link href="/search" className="hero-link hero-link-primary">
            検索一覧を見る
          </Link>
          <Link href="/stats" className="hero-link hero-link-secondary">
            統計ダッシュボードへ
          </Link>
        </div>
      </section>

      <div className="summary-cards">
        {overview.map((item) => (
          <article key={item.label} className="metric-card">
            <span className="muted">{item.label}</span>
            <strong>{item.value}</strong>
            <p className="muted">{item.help}</p>
          </article>
        ))}
      </div>

      <div className="grid-two">
        <SectionCard title="注目の放送枠" description="作品数が多い枠を優先して表示しています。">
          <div className="stack-sm">
            {featuredSlots.map((slot) => (
              <article key={slot.slot.id} className="panel">
                <div className="badge-row">
                  <Badge tone="accent">{slot.channel.name}</Badge>
                  <Badge>{slot.region.name}</Badge>
                </div>
                <h3>
                  <Link href={`/slots/${slot.slot.slug}`} className="inline-link">
                    {slot.slot.name}
                  </Link>
                </h3>
                <p className="muted">
                  {formatAnimeSchedule(slot.slot.representativeDay, slot.slot.representativeTimeText)} / 作品数{" "}
                  {slot.titles.length}
                </p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="最近のサンプル作品" description="ダミーデータに登録済みの代表作品です。">
          <div className="stack-sm">
            {latestTitles.map((entry) => (
              <article key={entry.title.id} className="panel">
                <div className="badge-row">
                  <Badge>{formatSeason(entry.title.seasonYear, entry.title.seasonQuarter)}</Badge>
                  {entry.slots[0] ? <Badge tone="accent">{entry.slots[0].name}</Badge> : null}
                </div>
                <h3>
                  <Link href={`/titles/${entry.title.slug}`} className="inline-link">
                    {entry.title.name}
                  </Link>
                </h3>
                <p className="muted">
                  初回放送:{" "}
                  {entry.firstAiring
                    ? formatAnimeSchedule(entry.firstAiring.animeBroadcastDay, entry.firstAiring.animeBroadcastTimeText)
                    : "未設定"}
                </p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

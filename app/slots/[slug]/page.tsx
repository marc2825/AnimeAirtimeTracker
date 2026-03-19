import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import { getSearchOptions, getSlotBySlug } from "@/lib/catalog";
import { formatAnimeSchedule, formatPercent, formatSeason, formatSlotType } from "@/lib/formatters";

type SlotPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getSearchOptions().slots.map((slot) => ({
    slug: slot.slug
  }));
}

export async function generateMetadata({ params }: SlotPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = getSlotBySlug(slug);

  return {
    title: detail ? `${detail.slot.name} | 放送枠詳細` : "放送枠詳細"
  };
}

export default async function SlotDetailPage({ params }: SlotPageProps) {
  const { slug } = await params;
  const detail = getSlotBySlug(slug);

  if (!detail) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="badge-row">
          <Badge tone="warm">{formatSlotType(detail.slot.slotType)}</Badge>
          <Badge>{detail.channel.name}</Badge>
          <Badge tone="accent">{detail.region.name}</Badge>
        </div>
        <h1>{detail.slot.name}</h1>
        <p>{detail.slot.description}</p>
      </section>

      <SectionCard title="枠の基本情報" description="放送枠は作品とは独立したエンティティとして管理しています。">
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>代表時刻</dt>
            <dd>{formatAnimeSchedule(detail.slot.representativeDay, detail.slot.representativeTimeText)}</dd>
          </div>
          <div className="detail-item">
            <dt>継続期間</dt>
            <dd>{detail.slot.startDate.slice(0, 10)} から</dd>
          </div>
          <div className="detail-item">
            <dt>信頼度</dt>
            <dd>{formatPercent(detail.slot.confidence)}</dd>
          </div>
          <div className="detail-item">
            <dt>別名</dt>
            <dd>{detail.slot.aliasNames.join(" / ")}</dd>
          </div>
        </dl>
      </SectionCard>

      <div className="summary-cards">
        <article className="metric-card">
          <span className="muted">作品数</span>
          <strong>{detail.titles.length}</strong>
          <p className="muted">枠に属すると判定された作品本数</p>
        </article>
        <article className="metric-card">
          <span className="muted">続編率</span>
          <strong>{formatPercent(detail.sequelRate)}</strong>
          <p className="muted">続編作品がどれくらい集まるか</p>
        </article>
        <article className="metric-card">
          <span className="muted">代表ジャンル</span>
          <strong>{detail.topGenres[0]?.label ?? "未集計"}</strong>
          <p className="muted">最頻出ジャンル</p>
        </article>
      </div>

      <div className="two-column">
        <SectionCard title="所属作品一覧" description="この枠に属する作品と開始クールを表示します。">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>作品</th>
                  <th>開始クール</th>
                  <th>主制作</th>
                  <th>初回時刻</th>
                </tr>
              </thead>
              <tbody>
                {detail.titles.map((entry) => (
                  <tr key={entry.title.id}>
                    <td>
                      <Link href={`/titles/${entry.title.slug}`} className="inline-link">
                        {entry.title.name}
                      </Link>
                    </td>
                    <td>{formatSeason(entry.title.seasonYear, entry.title.seasonQuarter)}</td>
                    <td>{entry.primaryCompanies[0]?.name ?? "未設定"}</td>
                    <td>
                      {entry.firstAiring
                        ? formatAnimeSchedule(entry.firstAiring.animeBroadcastDay, entry.firstAiring.animeBroadcastTimeText)
                        : "未設定"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="page-stack">
          <SectionCard title="代表属性" description="代表ジャンル・制作会社・スタッフを簡易集計しています。">
            <div className="stack-sm">
              <div>
                <strong>ジャンル</strong>
                <div className="badge-row">
                  {detail.topGenres.map((item) => (
                    <Badge key={item.label}>{`${item.label} (${item.count})`}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <strong>制作会社</strong>
                <div className="badge-row">
                  {detail.topCompanies.map((item) => (
                    <Badge key={item.label} tone="accent">{`${item.label} (${item.count})`}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <strong>スタッフ</strong>
                <div className="badge-row">
                  {detail.topStaff.map((item) => (
                    <Badge key={item.label} tone="warm">{`${item.label} (${item.count})`}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="年ごとの本数推移" description="枠に属する作品本数です。">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>年</th>
                    <th>作品本数</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.yearCounts.map((item) => (
                    <tr key={item.year}>
                      <td>{item.year}</td>
                      <td>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid-two">
        <SectionCard title="時間変動履歴" description="作品ごとの実例から枠の時間変化を見ます。">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>シーズン</th>
                  <th>作品</th>
                  <th>時刻</th>
                </tr>
              </thead>
              <tbody>
                {detail.timeChanges.map((item, index) => (
                  <tr key={`${item.titleName}-${index}`}>
                    <td>{item.seasonLabel}</td>
                    <td>{item.titleName}</td>
                    <td>{item.timeText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="他枠との被り傾向" description="同一クール・近接時刻で重なりやすい枠を簡易集計しています。">
          {detail.overlaps.length === 0 ? (
            <div className="empty-state">近接時間帯の他枠はまだ検出されていません。</div>
          ) : (
            <div className="stack-sm">
              {detail.overlaps.slice(0, 5).map((item) => (
                <article key={item.slot.id} className="panel">
                  <Link href={`/slots/${item.slot.slug}`} className="inline-link">
                    {item.slot.name}
                  </Link>
                  <p className="muted">近接出現回数: {item.count}</p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

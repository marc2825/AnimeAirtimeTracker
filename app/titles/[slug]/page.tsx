import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import {
  getAllTitleEntries,
  getRelatedTitlesBySeason,
  getTitleBySlug,
  getTitleSequelLinks,
  getTitlesSharingSlot
} from "@/lib/catalog";
import {
  formatAnimeSchedule,
  formatDateTimeJst,
  formatDuration,
  formatSeason,
  formatSourceType,
  formatStaffRole
} from "@/lib/formatters";

type TitlePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllTitleEntries().map((entry) => ({
    slug: entry.title.slug
  }));
}

export async function generateMetadata({ params }: TitlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getTitleBySlug(slug);

  return {
    title: entry ? `${entry.title.name} | 作品詳細` : "作品詳細"
  };
}

export default async function TitleDetailPage({ params }: TitlePageProps) {
  const { slug } = await params;
  const entry = getTitleBySlug(slug);

  if (!entry) {
    notFound();
  }

  const sequelLinks = getTitleSequelLinks(entry.title.id);
  const relatedSlotTitles = getTitlesSharingSlot(entry.title.id);
  const sameSeasonTitles = getRelatedTitlesBySeason(entry.title);

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="badge-row">
          <Badge tone="warm">{formatSeason(entry.title.seasonYear, entry.title.seasonQuarter)}</Badge>
          <Badge>{formatSourceType(entry.title.sourceType)}</Badge>
          <Badge tone="accent">{formatDuration(entry.title.durationCategory)}</Badge>
          {entry.title.isSequel ? <Badge tone="accent">続編</Badge> : null}
          {entry.title.isSplitCour ? <Badge>分割2クール想定</Badge> : null}
        </div>
        <h1>{entry.title.name}</h1>
        <p>{entry.title.summary}</p>
      </section>

      <SectionCard title="基本情報" description="文化的な放送時刻と実日時刻を並行して表示します。">
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>初回放送</dt>
            <dd>{entry.firstAiring ? formatDateTimeJst(entry.firstAiring.broadcastStartAt) : "未設定"}</dd>
          </div>
          <div className="detail-item">
            <dt>アニメ文脈時刻</dt>
            <dd>
              {entry.firstAiring
                ? formatAnimeSchedule(entry.firstAiring.animeBroadcastDay, entry.firstAiring.animeBroadcastTimeText)
                : "未設定"}
            </dd>
          </div>
          <div className="detail-item">
            <dt>最速地域</dt>
            <dd>{entry.fastestAiring?.region.name ?? "未設定"}</dd>
          </div>
          <div className="detail-item">
            <dt>主要放送枠</dt>
            <dd>{entry.slots[0]?.name ?? "未分類"}</dd>
          </div>
          <div className="detail-item">
            <dt>ジャンル</dt>
            <dd>{entry.title.genres.join(" / ")}</dd>
          </div>
          <div className="detail-item">
            <dt>制作会社</dt>
            <dd>{entry.primaryCompanies.map((company) => company.name).join(" / ") || "未設定"}</dd>
          </div>
        </dl>
      </SectionCard>

      <div className="two-column">
        <SectionCard title="放送履歴" description="地域別・局別・枠別の放送履歴です。">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>放送局</th>
                  <th>地域</th>
                  <th>実日時刻</th>
                  <th>アニメ文脈時刻</th>
                  <th>放送枠</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {entry.airings.map((airing) => (
                  <tr key={airing.id}>
                    <td>{airing.channel.name}</td>
                    <td>{airing.region.name}</td>
                    <td>{formatDateTimeJst(airing.broadcastStartAt)}</td>
                    <td>{formatAnimeSchedule(airing.animeBroadcastDay, airing.animeBroadcastTimeText)}</td>
                    <td>
                      {airing.slot ? (
                        <Link href={`/slots/${airing.slot.slug}`} className="inline-link">
                          {airing.slot.name}
                        </Link>
                      ) : (
                        "未分類"
                      )}
                    </td>
                    <td>
                      <div className="badge-row">
                        {airing.isRebroadcast ? <Badge tone="accent">再放送</Badge> : <Badge>初回系</Badge>}
                        {airing.hasNote && airing.note ? <Badge tone="warm">{airing.note}</Badge> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="page-stack">
          <SectionCard title="制作情報" description="nullable 前提のため、今後スタッフや会社を増やしやすい構造です。">
            <div className="stack-sm">
              <div>
                <strong>制作会社</strong>
                <p className="muted">{entry.companies.map((company) => company.name).join(" / ") || "未設定"}</p>
              </div>
              <div>
                <strong>主要スタッフ</strong>
                <div className="link-list">
                  {entry.staffCredits.map((credit) => (
                    <span key={`${credit.role}-${credit.person.id}`} className="badge badge-neutral">
                      {formatStaffRole(credit.role)}: {credit.person.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="続編関係" description="続編や分割2クールの接続を後から拡張できる構成です。">
            <div className="stack-sm">
              <p className="muted">
                前作:{" "}
                {sequelLinks.previous ? (
                  <Link href={`/titles/${sequelLinks.previous.title.slug}`} className="inline-link">
                    {sequelLinks.previous.title.name}
                  </Link>
                ) : (
                  "なし"
                )}
              </p>
              <p className="muted">
                次作:{" "}
                {sequelLinks.next ? (
                  <Link href={`/titles/${sequelLinks.next.title.slug}`} className="inline-link">
                    {sequelLinks.next.title.name}
                  </Link>
                ) : (
                  "なし"
                )}
              </p>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid-two">
        <SectionCard title="類似枠作品" description="同じ放送枠に属する作品を表示します。">
          {relatedSlotTitles.length === 0 ? (
            <div className="empty-state">同じ枠に属する別作品はまだありません。</div>
          ) : (
            <div className="stack-sm">
              {relatedSlotTitles.map((item) => (
                <article key={item.title.id} className="panel">
                  <Link href={`/titles/${item.title.slug}`} className="inline-link">
                    {item.title.name}
                  </Link>
                  <p className="muted">
                    {formatSeason(item.title.seasonYear, item.title.seasonQuarter)} / {item.slots[0]?.name ?? "未分類"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="同時期被り作品" description="同じ年・クールの作品を一覧します。">
          {sameSeasonTitles.length === 0 ? (
            <div className="empty-state">同時期の他作品は登録されていません。</div>
          ) : (
            <div className="stack-sm">
              {sameSeasonTitles.map((item) => (
                <article key={item.title.id} className="panel">
                  <Link href={`/titles/${item.title.slug}`} className="inline-link">
                    {item.title.name}
                  </Link>
                  <p className="muted">
                    {item.firstAiring
                      ? formatAnimeSchedule(item.firstAiring.animeBroadcastDay, item.firstAiring.animeBroadcastTimeText)
                      : "放送未設定"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="参照元と更新情報" description="MVPではダミーデータですが、データソース置換を想定しています。">
        <p className="footer-note">
          参照元: {entry.title.sourceName} / 最終更新: {formatDateTimeJst(entry.title.lastUpdatedAt)}
        </p>
      </SectionCard>
    </div>
  );
}

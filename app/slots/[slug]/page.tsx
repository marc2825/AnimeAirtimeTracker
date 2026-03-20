import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import { getSearchOptions, getSlotBySlug, type SlotDistributionItem } from "@/lib/catalog";
import {
  formatAnimeSchedule,
  formatDateTimeJst,
  formatDuration,
  formatPercent,
  formatSeason,
  formatSlotType
} from "@/lib/formatters";
import { weekdayLabels } from "@/lib/labels";

type SlotPageProps = {
  params: Promise<{ slug: string }>;
};

type ChartRow = {
  key: string;
  label: string;
  value: string;
  width: number;
  meta?: string;
  tone?: "accent" | "warm" | "neutral";
};

function getBarWidth(width: number): string {
  return `${Math.max(width, 8)}%`;
}

function InlineBarList({ items, emptyMessage }: { items: ChartRow[]; emptyMessage: string }) {
  if (items.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="inline-bars">
      {items.map((item) => (
        <article key={item.key} className="inline-bar-card">
          <div className="inline-bar-head">
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </div>
          {item.meta ? <p className="muted">{item.meta}</p> : null}
          <div className="inline-bar-track">
            <div
              className={`inline-bar-fill inline-bar-fill-${item.tone ?? "accent"}`}
              style={{ width: getBarWidth(item.width) }}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function DistributionTable({
  rows,
  labelHeader
}: {
  rows: SlotDistributionItem[];
  labelHeader: string;
}) {
  if (rows.length === 0) {
    return <div className="empty-state">まだ集計できるデータがありません。</div>;
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>{labelHeader}</th>
            <th>本数</th>
            <th>構成比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.label}>
              <td>{item.label}</td>
              <td>{item.count}</td>
              <td>{formatPercent(item.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

  const topChannel = detail.channelDistribution[0] ?? null;
  const topWeekday = detail.weekdayDistribution[0] ?? null;
  const topTime = detail.timeDistribution[0] ?? null;
  const activeStartYear = detail.yearCounts[0]?.year ?? null;
  const activeEndYear = detail.yearCounts[detail.yearCounts.length - 1]?.year ?? null;
  const yearPeak = Math.max(...detail.yearCounts.map((item) => item.count), 1);

  const observedSummary = [topChannel?.channel.name, topWeekday ? `${weekdayLabels[topWeekday.weekday]}曜` : null, topTime?.label]
    .filter((value): value is string => Boolean(value))
    .join(" / ");

  const yearRows: ChartRow[] = detail.yearCounts.map((item) => ({
    key: String(item.year),
    label: `${item.year}年`,
    value: `${item.count}本`,
    width: (item.count / yearPeak) * 100,
    meta: `${formatPercent(item.share)}`
  }));

  const channelRows: ChartRow[] = detail.channelDistribution.slice(0, 4).map((item) => ({
    key: item.channel.id,
    label: item.channel.name,
    value: `${item.count}件`,
    width: item.share,
    meta: `${formatPercent(item.share)} / ${item.channel.shortName}`,
    tone: "neutral"
  }));

  const weekdayRows: ChartRow[] = detail.weekdayDistribution.slice(0, 4).map((item) => ({
    key: item.weekday,
    label: `${weekdayLabels[item.weekday]}曜`,
    value: `${item.count}件`,
    width: item.share,
    meta: formatPercent(item.share),
    tone: "warm"
  }));

  const timeRows: ChartRow[] = detail.timeDistribution.slice(0, 4).map((item) => ({
    key: item.label,
    label: item.label,
    value: `${item.count}件`,
    width: item.share,
    meta: formatPercent(item.share)
  }));

  const genreRows: ChartRow[] = detail.genreDistribution.slice(0, 6).map((item) => ({
    key: item.label,
    label: item.label,
    value: `${item.count}本`,
    width: item.share,
    meta: formatPercent(item.share)
  }));

  const companyRows: ChartRow[] = detail.companyDistribution.slice(0, 6).map((item) => ({
    key: item.label,
    label: item.label,
    value: `${item.count}本`,
    width: item.share,
    meta: formatPercent(item.share),
    tone: "warm"
  }));

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="badge-row">
          <Badge tone="warm">{formatSlotType(detail.slot.slotType)}</Badge>
          <Badge>{detail.channel.name}</Badge>
          <Badge tone="accent">{detail.region.name}</Badge>
          {activeStartYear && activeEndYear ? <Badge>{`${activeStartYear} - ${activeEndYear}`}</Badge> : null}
        </div>
        <h1>{detail.slot.name}</h1>
        <p>{detail.slot.description}</p>
        <div className="hero-links">
          <Link href={`/search?view=title&slot=${detail.slot.slug}`} className="hero-link hero-link-primary">
            この枠の作品を検索
          </Link>
          <Link href={`/search?view=airing&slot=${detail.slot.slug}`} className="hero-link hero-link-secondary">
            放送単位で見る
          </Link>
        </div>
        <div className="hero-summary-strip">
          <article className="hero-summary-item">
            <span className="muted">観測上の中心</span>
            <strong>{observedSummary || "未観測"}</strong>
          </article>
          <article className="hero-summary-item">
            <span className="muted">観測期間</span>
            <strong>
              {detail.firstObservedAt && detail.lastObservedAt
                ? `${detail.firstObservedAt.slice(0, 10)} 〜 ${detail.lastObservedAt.slice(0, 10)}`
                : "未観測"}
            </strong>
          </article>
          <article className="hero-summary-item">
            <span className="muted">代表ジャンル</span>
            <strong>{detail.topGenres[0]?.label ?? "未集計"}</strong>
          </article>
        </div>
      </section>

      <div className="summary-cards slot-summary-cards">
        <article className="metric-card">
          <span className="muted">所属作品数</span>
          <strong>{detail.titles.length}</strong>
          <p className="muted">枠に属すると判定された作品本数</p>
        </article>
        <article className="metric-card">
          <span className="muted">初回放送件数</span>
          <strong>{detail.firstRunCount}</strong>
          <p className="muted">再放送を除く観測件数</p>
        </article>
        <article className="metric-card">
          <span className="muted">続編傾向</span>
          <strong>{formatPercent(detail.sequelRate)}</strong>
          <p className="muted">{`${detail.sequelCount}本が続編扱い`}</p>
        </article>
        <article className="metric-card">
          <span className="muted">時刻パターン</span>
          <strong>{detail.schedulePatternCount}</strong>
          <p className="muted">曜日×時刻の観測パターン数</p>
        </article>
      </div>

      <div className="grid-two">
        <SectionCard title="枠の基本情報" description="定義値と観測値の両方から、枠の基本像を確認します。">
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>主局</dt>
              <dd>{detail.channel.name}</dd>
            </div>
            <div className="detail-item">
              <dt>対象地域</dt>
              <dd>{detail.region.name}</dd>
            </div>
            <div className="detail-item">
              <dt>定義上の代表放送</dt>
              <dd>{formatAnimeSchedule(detail.slot.representativeDay, detail.slot.representativeTimeText)}</dd>
            </div>
            <div className="detail-item">
              <dt>観測上最多時刻</dt>
              <dd>{topTime?.label ?? "未観測"}</dd>
            </div>
            <div className="detail-item">
              <dt>定義開始日</dt>
              <dd>{detail.slot.startDate.slice(0, 10)}</dd>
            </div>
            <div className="detail-item">
              <dt>観測上の初出</dt>
              <dd>{detail.firstObservedAt ? formatDateTimeJst(detail.firstObservedAt) : "未観測"}</dd>
            </div>
            <div className="detail-item">
              <dt>観測上の最終出現</dt>
              <dd>{detail.lastObservedAt ? formatDateTimeJst(detail.lastObservedAt) : "未観測"}</dd>
            </div>
            <div className="detail-item">
              <dt>信頼度 / 別名</dt>
              <dd>
                {formatPercent(detail.slot.confidence)}
                <span className="subline">{detail.slot.aliasNames.join(" / ") || "別名なし"}</span>
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard
          title="関連する局・曜日・代表時刻"
          description={
            observedSummary
              ? `観測上は ${observedSummary} が中心です。`
              : "観測データが揃うと、この枠に集まりやすい局・曜日・時刻が見えてきます。"
          }
        >
          <div className="grid-three slot-profile-grid">
            <article className="panel slot-profile-panel">
              <p className="muted">関連局</p>
              <h3>{topChannel?.channel.name ?? "未観測"}</h3>
              <p className="muted">{topChannel ? `${topChannel.count}件 / ${formatPercent(topChannel.share)}` : "未観測"}</p>
              <InlineBarList items={channelRows} emptyMessage="局データはまだありません。" />
            </article>
            <article className="panel slot-profile-panel">
              <p className="muted">中心曜日</p>
              <h3>{topWeekday ? `${weekdayLabels[topWeekday.weekday]}曜` : "未観測"}</h3>
              <p className="muted">{topWeekday ? `${topWeekday.count}件 / ${formatPercent(topWeekday.share)}` : "未観測"}</p>
              <InlineBarList items={weekdayRows} emptyMessage="曜日データはまだありません。" />
            </article>
            <article className="panel slot-profile-panel">
              <p className="muted">代表時刻</p>
              <h3>{topTime?.label ?? "未観測"}</h3>
              <p className="muted">{topTime ? `${topTime.count}件 / ${formatPercent(topTime.share)}` : "未観測"}</p>
              <InlineBarList items={timeRows} emptyMessage="時刻データはまだありません。" />
            </article>
          </div>
        </SectionCard>
      </div>

      <div className="grid-two">
        <SectionCard title="年次推移" description="作品本数の増減を簡易グラフと表で確認します。">
          <div className="chart-table-layout">
            <InlineBarList items={yearRows} emptyMessage="まだ年次推移を描けるデータがありません。" />
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>年</th>
                    <th>作品本数</th>
                    <th>構成比</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.yearCounts.map((item) => (
                    <tr key={item.year}>
                      <td>{item.year}</td>
                      <td>{item.count}</td>
                      <td>{formatPercent(item.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="時間変動履歴" description="アニメ文脈時刻と実日時刻の両方で、枠の揺れ方を見ます。">
          {detail.timeChanges.length === 0 ? (
            <div className="empty-state">時間変動を追える放送データはまだありません。</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>シーズン</th>
                    <th>作品</th>
                    <th>アニメ時刻</th>
                    <th>実日時刻</th>
                    <th>局</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.timeChanges.map((item) => (
                    <tr key={`${item.titleName}-${item.broadcastStartAt}`}>
                      <td>{item.seasonLabel}</td>
                      <td>
                        {item.titleSlug ? (
                          <Link href={`/titles/${item.titleSlug}`} className="inline-link">
                            {item.titleName}
                          </Link>
                        ) : (
                          item.titleName
                        )}
                      </td>
                      <td>{item.animeScheduleText}</td>
                      <td>{formatDateTimeJst(item.broadcastStartAt)}</td>
                      <td>{item.channelName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid-two">
        <SectionCard title="ジャンル分布" description="この枠で目立つジャンルを比率つきで確認できます。">
          <div className="chart-table-layout">
            <InlineBarList items={genreRows} emptyMessage="ジャンル情報はまだありません。" />
            <DistributionTable rows={detail.genreDistribution} labelHeader="ジャンル" />
          </div>
        </SectionCard>

        <SectionCard title="制作会社分布" description="主制作を中心に、どの制作会社が多いかを集計しています。">
          <div className="chart-table-layout">
            <InlineBarList items={companyRows} emptyMessage="制作会社情報はまだありません。" />
            <DistributionTable rows={detail.companyDistribution} labelHeader="制作会社" />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="所属作品一覧" description="所属作品と、その枠内での初回放送を一覧できます。">
        {detail.titles.length === 0 ? (
          <div className="empty-state">この枠に紐づく作品はまだありません。</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>作品</th>
                  <th>開始クール</th>
                  <th>ジャンル</th>
                  <th>主制作</th>
                  <th>続編</th>
                  <th>枠内初回放送</th>
                </tr>
              </thead>
              <tbody>
                {detail.titles.map((entry) => (
                  <tr key={entry.title.id}>
                    <td>
                      <Link href={`/titles/${entry.title.slug}`} className="inline-link">
                        {entry.title.name}
                      </Link>
                      <span className="subline">
                        {entry.title.category ?? "分類未設定"} / {formatDuration(entry.title.durationCategory)}
                      </span>
                    </td>
                    <td>{formatSeason(entry.title.seasonYear, entry.title.seasonQuarter)}</td>
                    <td>{entry.title.genres.length > 0 ? entry.title.genres.join(" / ") : "未設定"}</td>
                    <td>{entry.primaryCompanies[0]?.name ?? entry.companies[0]?.name ?? "未設定"}</td>
                    <td>
                      <Badge tone={entry.title.isSequel ? "warm" : "neutral"}>
                        {entry.title.isSequel ? "続編" : "新規"}
                      </Badge>
                    </td>
                    <td>
                      {entry.firstAiring ? (
                        <>
                          {formatAnimeSchedule(
                            entry.firstAiring.animeBroadcastDay,
                            entry.firstAiring.animeBroadcastTimeText
                          )}
                          <span className="subline">{formatDateTimeJst(entry.firstAiring.broadcastStartAt)}</span>
                        </>
                      ) : (
                        "未設定"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="被り傾向の簡易表示" description="同一クール・同曜日・30分以内で近接した他枠を簡易集計しています。">
        {detail.overlaps.length === 0 ? (
          <div className="empty-state">近接時間帯の他枠はまだ検出されていません。</div>
        ) : (
          <div className="grid-two">
            {detail.overlaps.slice(0, 6).map((item) => (
              <article key={item.slot.id} className="panel slot-overlap-panel">
                <div className="badge-row">
                  <Badge tone="accent">{formatSlotType(item.slot.slotType)}</Badge>
                  <Badge>{formatAnimeSchedule(item.slot.representativeDay, item.slot.representativeTimeText)}</Badge>
                </div>
                <h3>
                  <Link href={`/slots/${item.slot.slug}`} className="inline-link">
                    {item.slot.name}
                  </Link>
                </h3>
                <p className="muted">{item.slot.description}</p>
                <div className="slot-overlap-meta">
                  <span>{`近接出現 ${item.count}回`}</span>
                  <span>{`母数比 ${formatPercent(item.share)}`}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

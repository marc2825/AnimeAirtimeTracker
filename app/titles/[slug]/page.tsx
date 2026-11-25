import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Disclosure } from "@/components/ui/controls";
import { Badge, EmptyState, ExternalLink, FlagBadges, KeyValue, PageHeader, Section, SkeletonBlock, SlotKindBadge, WeekdayChip } from "@/components/ui/primitives";
import { MEDIUM_LABELS, type Medium } from "@/domain/coverage";
import { formatSeason } from "@/domain/season";
import { WEEKDAY_LABELS, formatIsoDateJa } from "@/domain/time";
import { episodeText, formatDateShort, formatDateTime, formatStartTime, formatYearMonth } from "@/lib/format";
import { getTitleDetail, type TitleChannelGroup } from "@/server/queries/titles";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, titleJsonLd, titlePageDescription, titlePageTitle } from "@/lib/seo";
import { headlineSlots, nextAiring } from "@/lib/title-headline";

import styles from "./title.module.css";

export async function generateMetadata({ params }: PageProps<"/titles/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  let title: Awaited<ReturnType<typeof getTitleDetail>>;
  try {
    title = await getTitleDetail(decodeURIComponent(slug));
  } catch {
    // A database failure is not a missing title: keep the metadata neutral (the page shows the error).
    return { title: "作品", robots: { index: false } };
  }
  if (!title) return { title: "作品が見つかりません" };
  return {
    title: titlePageTitle(title.name),
    description: titlePageDescription(title),
    alternates: { canonical: `/titles/${title.slug}` }
  };
}

export default function TitlePage({ params }: PageProps<"/titles/[slug]">) {
  return (
    <div className="container">
      <Suspense fallback={<SkeletonBlock rows={8} label="作品情報を読み込み中" />}>
        <TitleContent params={params} />
      </Suspense>
    </div>
  );
}

async function TitleContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = await getTitleDetail(decodeURIComponent(slug));
  if (!title) notFound();

  const firstRun = title.groups.filter((g) => g.firstRunCount > 0);
  const headline = firstRun[0] ?? title.groups[0];
  // The next airing depends on the time of the request, after the cached title data.
  await io();
  const next = nextAiring(title.groups, new Date());
  const slotLine = headlineSlots(title.slots, headline?.channel.shortName ?? null);

  return (
    <article>
      <JsonLd data={breadcrumbJsonLd([{ name: "作品を探す", path: "/search" }, { name: title.name, path: `/titles/${title.slug}` }])} />
      <JsonLd data={titleJsonLd(title)} />
      <nav className={styles.breadcrumb} aria-label="パンくず">
        <Link href="/search">作品を探す</Link>
        <span aria-hidden="true">/</span>
        <span>TID {title.slug}</span>
      </nav>
      <PageHeader
        title={title.name}
        lead={
          <>
            {title.yomi ? <span>{title.yomi}</span> : null}
            {title.nameEn ? <span className={styles.en}>{title.nameEn}</span> : null}
          </>
        }
        meta={
          <>
            {title.categoryLabel ? <Badge>{title.categoryLabel}</Badge> : null}
            {title.seasons.map((season) => (
              <Badge key={`${season.year}-${season.quarter}`} tone="accent">
                {formatSeason(season)}
              </Badge>
            ))}
            {title.detailsFetchedAt === null ? <Badge tone="danger">タイトル情報未取得</Badge> : null}
          </>
        }
      />

      {headline?.regular || next || slotLine.shown.length > 0 ? (
        <div className={styles.headline}>
          {headline?.regular ? (
            <p className={styles.headlineMain}>
              <span className={styles.headlineChannel}>{headline.channel.name}</span>
              <span className={styles.headlineTime}>
                <WeekdayChip weekday={headline.regular.weekday} /> {formatStartTime(headline.regular.minute, "anime")}
              </span>
              <span className={styles.headlineNote}>{firstRun.length > 0 ? "最も早い新作放送局での主な放送時刻" : "主な放送時刻"}</span>
            </p>
          ) : null}
          {slotLine.shown.length > 0 ? (
            <p className={styles.headlineFact}>
              <span className={styles.headlineLabel}>放送枠</span>
              {slotLine.shown.map((slot) => (
                <span key={slot.slug} className={styles.headlineSlot}>
                  <SlotKindBadge kind={slot.kind} />
                  <Link href={`/slots/${encodeURIComponent(slot.slug)}`}>{slot.name}</Link>
                </span>
              ))}
              {slotLine.more > 0 ? (
                <a href="#slots" className="inline-link">
                  ほか{slotLine.more}枠
                </a>
              ) : null}
            </p>
          ) : null}
          {next ? (
            <p className={styles.headlineFact}>
              <span className={styles.headlineLabel}>次回の放送</span>
              <span>
                {formatIsoDateJa(next.airing.animeDate, { withWeekday: true })} <span className="mono">{formatStartTime(next.airing.animeStartMinute, "anime")}</span>
              </span>
              <span>{next.group.channel.shortName}</span>
              {episodeText(next.airing.episodeNumber, next.airing.episodeLabel) ? <span className="mono">{episodeText(next.airing.episodeNumber, next.airing.episodeLabel)}</span> : null}
              <FlagBadges isRerun={next.airing.isRerun} />
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <Section id="channels" title="放送局別の放送" description="各局の主な放送位置（新作放送の最頻の曜日・時刻）、初回の放送日、放送回数">
            {title.groups.length === 0 ? (
              <EmptyState title="対象局での放送記録はありません">本サイトは対象局の放送のみを取得しています。</EmptyState>
            ) : (
              <ul role="list" className={styles.channelCards}>
                {title.groups.map((group) => (
                  <ChannelCard key={group.channel.slug} group={group} />
                ))}
              </ul>
            )}
          </Section>

          {title.slots.length > 0 ? (
            <Section id="slots" title="関連する放送枠" description="出典の記載、または同じ位置に新作が続いたことによる判定">
              <ul role="list" className={styles.slotList}>
                {title.slots.map((slot) => (
                  <li key={slot.slug} className={styles.slotItem}>
                    <div className={styles.slotHead}>
                      <SlotKindBadge kind={slot.kind} />
                      <Link href={`/slots/${encodeURIComponent(slot.slug)}`} className={styles.slotName}>
                        {slot.name}
                      </Link>
                      {slot.channelShortName ? <span className="muted">{slot.channelShortName}</span> : null}
                    </div>
                    {slot.evidence ? (
                      <p className={styles.evidence}>
                        出典の記載: <q className={styles.quote}>{slot.evidence}</q>
                        {slot.confidence !== "HIGH" ? "（再放送時の記載）" : null}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="history" title="放送履歴" description="出典に登録された各回の放送（時刻は5時切替のアニメ時刻）"
            details="変更回数は本サイトが取得後に観測した変更です。">
            <div className={styles.histories}>
              {title.groups.map((group, index) => (
                <Disclosure
                  key={group.channel.slug}
                  defaultOpen={index === 0}
                  summary={
                    <span className={styles.historySummary}>
                      <strong>{group.channel.name}</strong>
                      <span className="muted">{group.broadcasts.length}件</span>
                    </span>
                  }
                >
                  <div className={styles.tableWrap} role="region" aria-label={`${group.channel.name}の放送履歴`} tabIndex={0}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">放送日</th>
                          <th scope="col">時刻</th>
                          <th scope="col">話数</th>
                          <th scope="col">サブタイトル・備考</th>
                          <th scope="col">区分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.broadcasts.map((b) => (
                          <tr key={b.id} className={b.deleted || b.missing ? styles.struck : undefined}>
                            <td className="mono">
                              {formatDateShort(b.animeDate)}
                              <span className={b.animeWeekday === 5 ? "sat" : b.animeWeekday === 6 ? "sun" : "muted"}>({WEEKDAY_LABELS[b.animeWeekday]})</span>
                            </td>
                            <td className="mono">{formatStartTime(b.animeStartMinute, "anime")}</td>
                            <td className="mono">{episodeText(b.episodeNumber, b.episodeLabel) ?? "—"}</td>
                            <td>
                              <div className={styles.subtitleCell}>
                                {b.subtitle ? <span>「{b.subtitle}」</span> : null}
                                {/* Syoboi prefixes notable notes with "!" */}
                                {b.comment ? <span className={styles.comment}>{b.comment.replace(/^!+\s*/, "")}</span> : null}
                              </div>
                            </td>
                            <td>
                              <span className={styles.flagCell}>
                                <FlagBadges flagNew={b.flagNew} flagFinal={b.flagFinal} isRerun={b.isRerun} rerunBasis={b.rerunBasis} flagNote={b.flagNote} />
                                {b.deleted ? <Badge tone="danger" variant="outline">削除</Badge> : null}
                                {b.missing ? <Badge tone="danger" variant="dashed" title="出典の再取得で見つからなくなった放送">消失</Badge> : null}
                                {b.revisionCount > 0 ? <Badge title="本サイトが観測した変更回数">変更{b.revisionCount}</Badge> : null}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Disclosure>
              ))}
            </div>
          </Section>
        </div>

        <aside className={styles.sideColumn} aria-label="作品データ">
          <section className={styles.sideCard}>
            <h2 className={styles.sideTitle}>出典データ</h2>
            <KeyValue
              items={[
                { label: "放送開始（出典）", value: formatYearMonth(title.firstYear, title.firstMonth) ?? "不明" },
                { label: "放送終了（出典）", value: formatYearMonth(title.firstEndYear, title.firstEndMonth) ?? "未設定" },
                { label: "初回放送局（出典）", value: title.firstChannelText ?? "不明" },
                { label: "公式サイト", value: title.officialUrl ? <ExternalLink href={title.officialUrl}>リンク</ExternalLink> : "記載なし" },
                { label: "出典ページ", value: <ExternalLink href={title.sourceUrl}>TID {title.slug}</ExternalLink> },
                { label: "出典の最終更新", value: title.sourceUpdatedAt ? formatDateTime(title.sourceUpdatedAt) : "不明" },
                { label: "本サイトの最終確認", value: title.lastSeenAt ? formatDateTime(title.lastSeenAt) : "—" }
              ]}
            />
          </section>
          {title.related.length > 0 ? (
            <section className={styles.sideCard}>
              <h2 className={styles.sideTitle}>関連作品の候補</h2>
              <p className={styles.sideNote}>読み（よみがな）が一致するタイトル。シリーズ関係は確認していません。</p>
              <ul role="list" className={styles.relatedList}>
                {title.related.map((related) => (
                  <li key={related.slug}>
                    <Link href={`/titles/${related.slug}`}>{related.name}</Link>
                    <span className="muted">{formatYearMonth(related.firstYear, related.firstMonth) ?? ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

function ChannelCard({ group }: { group: TitleChannelGroup }) {
  const reruns = group.broadcasts.filter((b) => b.isRerun && !b.deleted).length;
  return (
    <li className={styles.channelCard}>
      <div className={styles.channelCardHead}>
        <span className={styles.channelCardName}>{group.channel.name}</span>
        <span className="muted">{group.channel.medium ? MEDIUM_LABELS[group.channel.medium as Medium] : ""}</span>
      </div>
      <p className={styles.channelCardTime}>
        {group.regular ? (
          <>
            <WeekdayChip weekday={group.regular.weekday} />{" "}
            <span className="mono">{formatStartTime(group.regular.minute, "anime")}</span>
          </>
        ) : (
          "—"
        )}
      </p>
      <dl className={styles.channelCardMeta}>
        <div>
          <dt>初回</dt>
          <dd className="mono">{group.firstStartAt ? formatDateTime(group.firstStartAt).split(" ")[0] : "—"}</dd>
        </div>
        <div>
          <dt>新作</dt>
          <dd className="mono">{group.firstRunCount}回</dd>
        </div>
        <div>
          <dt>再放送</dt>
          <dd className="mono">{reruns}回</dd>
        </div>
      </dl>
    </li>
  );
}

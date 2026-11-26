import type { Metadata } from "next";
import { Suspense } from "react";

import Link from "next/link";

import { latestOrdinal, SeasonStrip, SlotCard, stripStartOrdinal } from "@/components/slots/SlotCard";
import { StripTooltip } from "@/components/slots/StripTooltip";
import { ButtonLink, Disclosure, SegmentedLinks } from "@/components/ui/controls";
import { EmptyState, MoreInfo, PageHeader, Section, SkeletonBlock, SLOT_KIND_LABELS, WeekdayChip } from "@/components/ui/primitives";
import { isTokyoChannel, tokyoFirstRank } from "@/domain/coverage";
import { formatAnimeMinute } from "@/domain/time";
import { buildHref, parseSlug, single, type RawSearchParams } from "@/lib/search-params";
import { datasetCacheProfile } from "@/server/cache";
import { getSlotStripTitles, listSlots, type SlotSummary, type StripTitles } from "@/server/queries/slots";

import styles from "./slots.module.css";

export const metadata: Metadata = {
  title: "アニメの放送枠一覧と年表",
  description: "アニメの放送枠を、出典に記載された枠名と、同じ局・曜日・時刻に新作が続いた推定枠の両方から一覧。各枠の年表で作品の変遷を確認できます。",
  alternates: { canonical: "/slots" }
};

export default function SlotsPage({ searchParams }: PageProps<"/slots">) {
  return (
    <div className="container">
      <PageHeader
        title="放送枠"
        lead="局・曜日・時刻ごとの作品の移り変わり"
        actions={
          <ButtonLink href="/compare/slots" variant="secondary">
            放送枠を比べる
          </ButtonLink>
        }
      />
      <Suspense fallback={<SkeletonBlock rows={6} label="放送枠を読み込み中" />}>
        <SlotsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SlotsContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const kindParam = single(params, "kind");
  const kind = kindParam === "source" ? "SOURCE_LABEL" : kindParam === "inferred" ? "INFERRED" : kindParam === "official" ? "OFFICIAL" : null;
  const channel = parseSlug(single(params, "channel"));
  return <SlotsList kind={kind} channel={channel} />;
}

/**
 * The rendered list is cached per (kind, channel): with 866 slots, rendering cost more than the cached data
 * reads (0.23 s per request, measured 2026-11-22). A database failure throws out of the cache to the route's
 * error page, so an outage is never cached as content.
 */
async function SlotsList({ kind, channel }: { kind: SlotSummary["kind"] | null; channel: string | null }) {
  "use cache";
  datasetCacheProfile();
  const current = { kind: kind === "SOURCE_LABEL" ? "source" : kind === "INFERRED" ? "inferred" : kind === "OFFICIAL" ? "official" : undefined, channel: channel ?? undefined };
  const slots = await listSlots();
  const filtered = slots.filter((slot) => (!kind || slot.kind === kind) && (!channel || slot.channel?.slug === channel));
  // TOKYO MX first, then the other Tokyo stations, then the rest (src/domain/coverage.ts `tokyoFirstRank`).
  const channels = [...new Map(slots.filter((s) => s.channel).map((s) => [s.channel!.slug, s.channel!])).values()].sort(
    (a, b) => tokyoFirstRank(a.slug) - tokyoFirstRank(b.slug)
  );
  const stripEnd = latestOrdinal(slots);
  // Names behind the strip ticks are a nicety: the list still renders if they cannot be read.
  const stripTitles: StripTitles = await getSlotStripTitles(stripStartOrdinal(stripEnd)).catch(() => ({}));
  const href = (overrides: Record<string, string | null>) => buildHref("/slots", current, overrides);
  const labelled = filtered.filter((slot) => slot.kind !== "INFERRED");
  const inferred = filtered.filter((slot) => slot.kind === "INFERRED");

  return (
    <>
      <div className={styles.toolbar}>
        <SegmentedLinks
          label="種別"
          options={[
            { href: href({ kind: null }), label: "すべて", active: kind === null, count: slots.length },
            { href: href({ kind: "source" }), label: "出典記載枠", active: kind === "SOURCE_LABEL", count: slots.filter((s) => s.kind === "SOURCE_LABEL").length },
            { href: href({ kind: "inferred" }), label: "推定枠", active: kind === "INFERRED", count: slots.filter((s) => s.kind === "INFERRED").length }
          ]}
        />
        <SegmentedLinks
          label="放送局"
          size="sm"
          options={[{ href: href({ channel: null }), label: "全局", active: channel === null }, ...channels.map((c) => ({ href: href({ channel: c.slug }), label: c.shortName, active: channel === c.slug }))]}
        />
      </div>

      <div className={styles.kindsInfo}>
        <MoreInfo summary="枠の種別について">
          <dl className={styles.kinds}>
            {Object.entries(SLOT_KIND_LABELS).map(([key, meta]) => (
              <div key={key}>
                <dt>{meta.label}</dt>
                <dd>{meta.description}</dd>
              </div>
            ))}
          </dl>
        </MoreInfo>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="該当する放送枠はありません">条件を変えてください。推定枠は2クール以上のデータが揃うと表示されます。</EmptyState>
      ) : null}

      {labelled.length > 0 ? (
        <Section id="labelled" title="名前のある枠" description="出典の作品備考に「〜枠で放送」と記載された枠">
          <ul role="list" className={styles.grid}>
            {labelled.map((slot) => (
              <SlotCard key={slot.slug} slot={slot} stripEnd={stripEnd} stripTitles={stripTitles[slot.slug]} />
            ))}
          </ul>
        </Section>
      ) : null}

      {inferred.length > 0 ? (
        <Section
          id="inferred"
          title="推定枠"
          description="同じ局・曜日・時刻に新作が続いた位置（3クール・3作品以上）"
          details="枠の公式な存在を示すものではありません。局ごとに位置を時刻順に並べています。局は TOKYO MX、在京キー局（日テレ・TBS・フジ・テレ朝・テレ東）の順で、東京の局は開いた状態で表示します。"
        >
          <div className={styles.channelGroups}>
            {groupByChannel(inferred).map(({ slug, name: channelName, items }) => (
              <Disclosure
                key={slug ?? channelName}
                defaultOpen={(slug !== null && isTokyoChannel(slug)) || Boolean(channel)}
                summary={
                  <span className={styles.groupSummary}>
                    <strong>{channelName}</strong>
                    <span className="muted">{items.length}位置</span>
                  </span>
                }
              >
                <div className={styles.tableWrap} role="region" aria-label={`${channelName}の推定枠`} tabIndex={0}>
                  <table className={styles.positionTable}>
                    <thead>
                      <tr>
                        <th scope="col">位置</th>
                        <th scope="col">作品</th>
                        <th scope="col">クール</th>
                        <th scope="col">直近12クール</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((slot) => (
                        <tr key={slot.slug}>
                          <td>
                            <Link href={`/slots/${encodeURIComponent(slot.slug)}`} className={styles.positionLink}>
                              {slot.latest ? (
                                <>
                                  <WeekdayChip weekday={slot.latest.weekday} />{" "}
                                  <span className="mono">{formatAnimeMinute(slot.latest.minute)}</span>
                                </>
                              ) : (
                                slot.name
                              )}
                            </Link>
                          </td>
                          <td className="mono">{slot.titleCount}</td>
                          <td className="mono">{slot.seasonCount}</td>
                          <td className={styles.stripCell}>
                            <SeasonStrip ordinals={slot.seasonOrdinals} end={stripEnd} titles={stripTitles[slot.slug]} />
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
      ) : null}
      <StripTooltip />
    </>
  );
}

/** Inferred slots by channel, Tokyo first (`tokyoFirstRank`); within a channel by weekday and time. */
function groupByChannel(slots: SlotSummary[]): { slug: string | null; name: string; items: SlotSummary[] }[] {
  const groups = new Map<string, { slug: string | null; name: string; items: SlotSummary[] }>();
  for (const slot of slots) {
    const key = slot.channel?.slug ?? "";
    const group = groups.get(key) ?? { slug: slot.channel?.slug ?? null, name: slot.channel?.name ?? "その他", items: [] };
    group.items.push(slot);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => (a.latest?.weekday ?? 9) - (b.latest?.weekday ?? 9) || (a.latest?.minute ?? 0) - (b.latest?.minute ?? 0));
  }
  return [...groups.values()].sort((a, b) => tokyoFirstRank(a.slug) - tokyoFirstRank(b.slug) || b.items.length - a.items.length);
}

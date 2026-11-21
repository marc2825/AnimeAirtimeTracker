import type { Metadata } from "next";
import { Suspense } from "react";

import Link from "next/link";

import { latestOrdinal, SeasonStrip, SlotCard } from "@/components/slots/SlotCard";
import { Disclosure, SegmentedLinks } from "@/components/ui/controls";
import { EmptyState, Notice, PageHeader, Section, SkeletonBlock, SLOT_KIND_LABELS } from "@/components/ui/primitives";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import { buildHref, flattenParams, parseSlug, single, type RawSearchParams } from "@/lib/search-params";
import { listSlots, type SlotSummary } from "@/server/queries/slots";

import styles from "./slots.module.css";

export const metadata: Metadata = {
  title: "放送枠",
  description: "アニメの放送枠を、出典に記載された枠名と、同じ局・曜日・時刻に新作が続いた推定枠の両方から一覧。各枠の年表で作品の変遷を確認できます。",
  alternates: { canonical: "/slots" }
};

export default function SlotsPage({ searchParams }: PageProps<"/slots">) {
  return (
    <div className="container">
      <PageHeader
        title="放送枠"
        lead="「どの局の、どの曜日・時刻に、どの作品が続いてきたか」を枠ごとに追えます。枠には判定の根拠に応じた種別があります。"
      />
      <Suspense fallback={<SkeletonBlock rows={6} label="放送枠を読み込み中" />}>
        <SlotsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SlotsContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const current = flattenParams(params);
  const kindParam = single(params, "kind");
  const kind = kindParam === "source" ? "SOURCE_LABEL" : kindParam === "inferred" ? "INFERRED" : kindParam === "official" ? "OFFICIAL" : null;
  const channel = parseSlug(single(params, "channel"));
  let slots;
  try {
    slots = await listSlots();
  } catch {
    return <Notice tone="danger" title="放送枠を読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  const filtered = slots.filter((slot) => (!kind || slot.kind === kind) && (!channel || slot.channel?.slug === channel));
  const channels = [...new Map(slots.filter((s) => s.channel).map((s) => [s.channel!.slug, s.channel!])).values()];
  const stripEnd = latestOrdinal(slots);
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

      <dl className={styles.kinds}>
        {Object.entries(SLOT_KIND_LABELS).map(([key, meta]) => (
          <div key={key}>
            <dt>{meta.label}</dt>
            <dd>{meta.description}</dd>
          </div>
        ))}
      </dl>

      {filtered.length === 0 ? (
        <EmptyState title="該当する放送枠はありません">条件を変えてください。推定枠は2クール以上のデータが揃うと表示されます。</EmptyState>
      ) : null}

      {labelled.length > 0 ? (
        <Section id="labelled" title="名前のある枠" description="出典（しょぼいカレンダーの作品備考）に「〜枠で放送」と記載された枠。">
          <ul role="list" className={styles.grid}>
            {labelled.map((slot) => (
              <SlotCard key={slot.slug} slot={slot} stripEnd={stripEnd} />
            ))}
          </ul>
        </Section>
      ) : null}

      {inferred.length > 0 ? (
        <Section
          id="inferred"
          title="推定枠"
          description="同じ局・曜日・開始時刻に、3クール以上にわたり3作品以上の新作が定時放送された位置。枠の公式な存在を示すものではありません。局ごとに位置を時刻順に並べています。"
        >
          <div className={styles.channelGroups}>
            {groupByChannel(inferred).map(([channelName, items], index) => (
              <Disclosure
                key={channelName}
                defaultOpen={index < 2 || Boolean(channel)}
                summary={
                  <span className={styles.groupSummary}>
                    <strong>{channelName}</strong>
                    <span className="muted">{items.length}位置</span>
                  </span>
                }
              >
                <div className={styles.tableWrap}>
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
                                  <span className={slot.latest.weekday === 5 ? "sat" : slot.latest.weekday === 6 ? "sun" : undefined}>{WEEKDAY_LABELS[slot.latest.weekday]}曜</span>{" "}
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
                            <SeasonStrip ordinals={slot.seasonOrdinals} end={stripEnd} />
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
    </>
  );
}

function groupByChannel(slots: SlotSummary[]): [string, SlotSummary[]][] {
  const groups = new Map<string, SlotSummary[]>();
  for (const slot of slots) {
    const key = slot.channel?.name ?? "その他";
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.latest?.weekday ?? 9) - (b.latest?.weekday ?? 9) || (a.latest?.minute ?? 0) - (b.latest?.minute ?? 0));
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

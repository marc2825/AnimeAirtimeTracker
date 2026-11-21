import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { Notice, PageHeader, SkeletonBlock } from "@/components/ui/primitives";
import { TRACKED_CHANNELS, networkLabelOf, type TrackedChannel } from "@/domain/coverage";
import { currentSeason, formatSeason, seasonFromOrdinal, seasonOrdinal } from "@/domain/season";
import { getSeasonStats, statsFilter } from "@/server/queries/stats";
import { getCoveredSeasonOrdinals } from "@/server/queries/status";

import styles from "./channels.module.css";

export const metadata: Metadata = {
  title: "放送局",
  description: "対象20局（関東・関西の地上波、NHK、BS、CS）ごとのアニメの放送本数・時間帯・放送枠への入口。",
  alternates: { canonical: "/channels" }
};

const GROUPS: { label: string; match: (c: TrackedChannel) => boolean }[] = [
  { label: "全国（NHK）", match: (c) => c.medium === "TERRESTRIAL" && c.area === "NATIONWIDE" },
  { label: "関東地上波", match: (c) => c.medium === "TERRESTRIAL" && c.area === "KANTO" },
  { label: "関西地上波", match: (c) => c.medium === "TERRESTRIAL" && c.area === "KANSAI" },
  { label: "BS", match: (c) => c.medium === "BS" },
  { label: "CS", match: (c) => c.medium === "CS" }
];

export default function ChannelsPage() {
  return (
    <div className="container">
      <PageHeader title="放送局" lead="局ごとに、アニメの本数の推移、時間帯の内訳、曜日×時間帯の分布、放送枠を見られます。" />
      <Suspense fallback={<SkeletonBlock rows={6} label="放送局を読み込み中" />}>
        <ChannelsContent />
      </Suspense>
    </div>
  );
}

async function ChannelsContent() {
  await io();
  let counts = new Map<string, number>();
  let seasonLabel = "";
  try {
    const covered = await getCoveredSeasonOrdinals();
    if (covered.length > 0) {
      const latest = seasonFromOrdinal(Math.min(covered.at(-1)!, seasonOrdinal(currentSeason())));
      const stats = await getSeasonStats(latest, "titles", statsFilter({ region: null }));
      counts = new Map(stats.byChannel.map((row) => [row.channel.slug, row.titles]));
      seasonLabel = formatSeason(latest);
    }
  } catch {
    return <Notice tone="danger" title="放送局の情報を読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  return (
    <div className={styles.groups}>
      {GROUPS.map((group) => (
        <section key={group.label} aria-labelledby={`group-${group.label}`}>
          <h2 id={`group-${group.label}`} className={styles.groupHeading}>
            {group.label}
          </h2>
          <ul role="list" className={styles.cards}>
            {TRACKED_CHANNELS.filter(group.match).map((channel) => (
              <li key={channel.slug}>
                <Link href={`/channels/${channel.slug}`} className={styles.card}>
                  <span className={styles.cardName}>{channel.name}</span>
                  <span className={styles.cardMeta}>{networkLabelOf(channel)}</span>
                  {seasonLabel ? (
                    <span className={styles.cardMeta}>
                      {seasonLabel} <span className="mono">{counts.get(channel.slug) ?? 0}</span>作品
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

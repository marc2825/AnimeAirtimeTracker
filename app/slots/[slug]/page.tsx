import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SlotTimeline } from "@/components/slots/SlotTimeline";
import { Badge, EmptyState, ExternalLink, Notice, PageHeader, Section, SkeletonBlock, SlotKindBadge, SLOT_KIND_LABELS, StatGrid, StatTile } from "@/components/ui/primitives";
import { INFERRED_MIN_SEASONS, INFERRED_MIN_TITLES, MIN_REGULAR_AIRINGS } from "@/domain/slots";
import { WEEKDAY_LABELS, formatAnimeMinute, formatAnimeSlot, type Weekday } from "@/domain/time";
import { formatDateTime, formatSeasonOrdinal } from "@/lib/format";
import { getSlotDetail, type SlotDetail } from "@/server/queries/slots";

import styles from "./slot.module.css";

export async function generateMetadata({ params }: PageProps<"/slots/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const slot = await getSlotDetail(decodeURIComponent(slug)).catch(() => null);
  if (!slot) return { title: "放送枠が見つかりません" };
  const kind = SLOT_KIND_LABELS[slot.kind]?.label ?? "";
  return {
    title: `${slot.name}（${kind}）の年表`,
    description: `${slot.channel?.name ?? ""}の放送枠「${slot.name}」でクールごとに放送された作品と、放送時刻の変遷。${slot.titleCount}作品・${slot.seasonCount}クール分。`,
    alternates: { canonical: `/slots/${encodeURIComponent(slot.slug)}` }
  };
}

export default function SlotPage({ params }: PageProps<"/slots/[slug]">) {
  return (
    <div className="container">
      <Suspense fallback={<SkeletonBlock rows={8} label="放送枠を読み込み中" />}>
        <SlotContent params={params} />
      </Suspense>
    </div>
  );
}

function positionChanges(slot: SlotDetail) {
  const changes: { ordinal: number; from: string; to: string }[] = [];
  let previous: { weekday: number; minute: number } | null = null;
  for (const entry of slot.timeline) {
    if (!entry.position) continue;
    if (previous && (previous.weekday !== entry.position.weekday || previous.minute !== entry.position.minute)) {
      changes.push({
        ordinal: entry.ordinal,
        from: formatAnimeSlot(previous.weekday as Weekday, previous.minute),
        to: formatAnimeSlot(entry.position.weekday as Weekday, entry.position.minute)
      });
    }
    previous = entry.position;
  }
  return changes;
}

async function SlotContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const slot = await getSlotDetail(decodeURIComponent(slug));
  if (!slot) notFound();

  const changes = positionChanges(slot);
  const maxYear = Math.max(1, ...slot.byYear.map((row) => row.titles));
  const first = slot.seasonOrdinals[0];
  const last = slot.seasonOrdinals.at(-1);

  return (
    <article>
      <nav className={styles.breadcrumb} aria-label="パンくず">
        <Link href="/slots">放送枠</Link>
        <span aria-hidden="true">/</span>
        <span>{slot.name}</span>
      </nav>
      <PageHeader
        title={slot.name}
        meta={
          <>
            <SlotKindBadge kind={slot.kind} />
            {slot.channel ? <Badge>{slot.channel.name}</Badge> : null}
            {slot.latest ? (
              <span className={styles.latest}>
                <span className={slot.latest.weekday === 5 ? "sat" : slot.latest.weekday === 6 ? "sun" : undefined}>{WEEKDAY_LABELS[slot.latest.weekday]}曜</span>{" "}
                <span className="mono">{formatAnimeMinute(slot.latest.minute)}</span>
                <span className="muted">（{formatSeasonOrdinal(slot.latest.seasonOrdinal)}時点・{slot.latest.durationMinutes}分）</span>
              </span>
            ) : null}
          </>
        }
      />

      <StatGrid>
        <StatTile label="作品" value={slot.titleCount} unit="作品" hint="この枠に属すると判定した作品数" />
        <StatTile label="観測クール" value={slot.seasonCount} unit="クール" hint={first && last ? `${formatSeasonOrdinal(first)}〜${formatSeasonOrdinal(last)}` : "対象局での定時放送なし"} />
        <StatTile label="開始時刻の変化" value={changes.length} unit="回" hint="枠の開始（所属作品の最も早い開始）の曜日・時刻がクール間で変わった回数" />
        <StatTile label="関連枠" value={slot.related.length} unit="枠" hint="作品が重なる他の枠" />
      </StatGrid>

      <Section id="timeline" title="クール別の年表" description="左から右へ時系列。各クールの位置は、所属作品の定時放送のうち最も早い開始時刻（同じ曜日内）です。灰色の上線は前クールから継続している作品。出典記載枠では、所属の記載がない作品は含まれないため、開始時刻の変化が記載状況による場合があります。">
        {slot.timeline.length === 0 ? (
          <EmptyState title="対象局での定時放送が確認できません">
            出典にこの枠名の記載はありますが、本サイトの対象局・取得期間では{MIN_REGULAR_AIRINGS}回以上の定時放送を確認できませんでした。
          </EmptyState>
        ) : (
          <SlotTimeline seasons={slot.timeline} />
        )}
      </Section>

      <div className={styles.columns}>
        <Section id="changes" title="開始時刻の変化" level={3}>
          {changes.length === 0 ? (
            <p className={styles.muted}>取得期間内に時刻・曜日の変更はありません。</p>
          ) : (
            <ol role="list" className={styles.changes}>
              {changes.map((change) => (
                <li key={change.ordinal}>
                  <span className={styles.changeSeason}>{formatSeasonOrdinal(change.ordinal)}</span>
                  <span className="mono">{change.from}</span>
                  <span aria-label="から">→</span>
                  <span className="mono">{change.to}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section id="years" title="年別の作品数" level={3}>
          {slot.byYear.length === 0 ? (
            <p className={styles.muted}>データがありません。</p>
          ) : (
            <table className={styles.yearTable}>
              <caption className="visually-hidden">年別の作品数（その年に定時放送された作品）</caption>
              <tbody>
                {slot.byYear.map((row) => (
                  <tr key={row.year}>
                    <th scope="row" className="mono">
                      {row.year}
                    </th>
                    <td>
                      <span className={styles.bar} style={{ width: `${(row.titles / maxYear) * 100}%` }} aria-hidden="true" />
                    </td>
                    <td className="mono">{row.titles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section id="basis" title="判定根拠">
        <div className={styles.basis}>
          {slot.kind === "INFERRED" ? (
            <p>
              {slot.channel?.name}の{slot.latest ? formatAnimeSlot(slot.latest.weekday as Weekday, slot.latest.minute) : "同一位置"}に、{INFERRED_MIN_SEASONS}クール以上にわたって
              {INFERRED_MIN_TITLES}作品以上の新作が定時放送（同じ曜日・時刻で{MIN_REGULAR_AIRINGS}回以上）されたため、本サイトが「推定枠」として扱っています。局が公式に定めた枠であるとは限りません。
            </p>
          ) : (
            <p>
              しょぼいカレンダーの作品備考に「{slot.name}」枠で放送と記載された作品をまとめています。年表は各作品の{slot.channel?.name ?? "基準局"}
              での定時放送から算出しています。
            </p>
          )}
          {slot.evidenceUrl ? (
            <p>
              公式情報: <ExternalLink href={slot.evidenceUrl}>{slot.evidenceUrl}</ExternalLink>
            </p>
          ) : null}
          <p className={styles.muted}>
            判定ルール {slot.ruleVersion}・算出 {formatDateTime(slot.computedAt)}。誤りを見つけた場合は<Link href="/about#corrections" className="inline-link">訂正の方法</Link>をご覧ください。
          </p>
        </div>
      </Section>

      <Section id="members" title="所属作品" description="新しい順。根拠が出典記載の場合は、しょぼいカレンダーの作品備考の該当行を引用しています。">
        <div className={styles.tableWrap}>
          <table className={styles.memberTable}>
            <thead>
              <tr>
                <th scope="col">作品</th>
                <th scope="col">初クール</th>
                <th scope="col">判定</th>
                <th scope="col">根拠</th>
              </tr>
            </thead>
            <tbody>
              {slot.members.map((member) => (
                <tr key={member.slug}>
                  <td>
                    <Link href={`/titles/${member.slug}`} className={styles.memberName}>
                      {member.name}
                    </Link>
                  </td>
                  <td className="mono">{member.seasonOrdinal ? formatSeasonOrdinal(member.seasonOrdinal) : "—"}</td>
                  <td>
                    {member.method === "SOURCE_COMMENT" ? (member.confidence === "HIGH" ? "出典記載" : "出典記載（再放送時）") : member.method === "MANUAL" ? "手動補正" : "時刻位置"}
                  </td>
                  <td className={styles.evidenceCell}>{member.evidence ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {slot.related.length > 0 ? (
        <Section id="related" title="関連する枠" description="所属作品が重なる枠（例: 出典記載枠と同じ位置の推定枠）。">
          <ul role="list" className={styles.related}>
            {slot.related.map((related) => (
              <li key={related.slug}>
                <SlotKindBadge kind={related.kind} />
                <Link href={`/slots/${encodeURIComponent(related.slug)}`}>{related.name}</Link>
                <span className="muted">共通 {related.shared}作品</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {slot.kind === "INFERRED" ? (
        <Notice tone="info" title="推定枠について">
          推定枠は機械的な判定です。特番・時刻変更・地域差によって実際の編成と異なる場合があります。
        </Notice>
      ) : null}
    </article>
  );
}

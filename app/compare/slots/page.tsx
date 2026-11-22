import type { Metadata } from "next";
import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { ChartFrame } from "@/components/stats/Charts";
import { StartTimeChart } from "@/components/stats/StartTimeChart";
import { EmptyState, Notice, PageHeader, Section, SkeletonBlock, SlotKindBadge } from "@/components/ui/primitives";
import { alignSeasons, summarizeSlot, type SlotForCompare } from "@/domain/compare";
import { WEEKDAY_LABELS, formatAnimeMinute } from "@/domain/time";
import type { ChartSpec } from "@/lib/chart-export";
import { formatDateTime, formatSeasonOrdinal } from "@/lib/format";
import type { RawSearchParams } from "@/lib/search-params";
import { absoluteUrl } from "@/lib/site";
import { getSlotDetail, listSlots, type SlotDetail } from "@/server/queries/slots";
import { getDatasetStatus } from "@/server/queries/status";

import styles from "../compare.module.css";

const PATH = "/compare/slots";
const MAX_SLOTS = 4;

export const metadata: Metadata = {
  title: "放送枠を比べる",
  description: "ノイタミナとアニメイズムなど、2〜4つの放送枠を、クールごとの放送位置・作品数・時刻の移動で比べる。",
  alternates: { canonical: PATH }
};

/** Slot slugs from `?s=…&s=…`, deduplicated, at most four. */
function slugsOf(params: RawSearchParams): string[] {
  const raw = params.s;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((value) => value.trim()).filter((value) => value.length > 0 && value.length <= 80);
  return [...new Set(list)].slice(0, MAX_SLOTS);
}

const hrefFor = (slugs: string[]) => (slugs.length ? `${PATH}?${slugs.map((slug) => `s=${encodeURIComponent(slug)}`).join("&")}` : PATH);

export default function CompareSlotsPage({ searchParams }: PageProps<"/compare/slots">) {
  return (
    <div className="container">
      <PageHeader title="放送枠を比べる" lead="2〜4つの枠の、クールごとの放送位置と作品数" />
      <Suspense fallback={<SkeletonBlock rows={10} label="比較を計算中" />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function positionText(position: { weekday: number; minute: number } | null | undefined): string {
  return position ? `${WEEKDAY_LABELS[position.weekday]}曜 ${formatAnimeMinute(position.minute)}` : "—";
}

async function CompareContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  await io();
  const requested = slugsOf(params);
  let all;
  let details: (SlotDetail | null)[];
  let dataset;
  try {
    [all, details, dataset] = await Promise.all([listSlots(), Promise.all(requested.map((slug) => getSlotDetail(slug))), getDatasetStatus().catch(() => null)]);
  } catch {
    return <Notice tone="danger" title="放送枠を読み込めませんでした">時間をおいて再読み込みしてください。</Notice>;
  }
  const slots = details.filter((slot): slot is SlotDetail => slot !== null);
  const missing = requested.length - slots.length;
  const chosen = slots.map((slot) => slot.slug);
  const labelled = all.filter((slot) => slot.kind !== "INFERRED" && !chosen.includes(slot.slug)).slice(0, 8);

  const picker = (
    <form action={PATH} method="get" className={styles.form} aria-label="比べる枠を追加">
      {chosen.map((slug) => (
        <input key={slug} type="hidden" name="s" value={slug} />
      ))}
      <label className={styles.form}>
        <span className="visually-hidden">追加する枠</span>
        <input name="s" list="slot-options" className={styles.input} placeholder="枠の名前（例: ノイタミナ）" disabled={chosen.length >= MAX_SLOTS} />
      </label>
      <datalist id="slot-options">
        {all.map((slot) => (
          <option key={slot.slug} value={slot.slug}>
            {`${slot.name}${slot.channel ? `（${slot.channel.shortName}）` : ""}`}
          </option>
        ))}
      </datalist>
      <button type="submit" className={styles.chip} disabled={chosen.length >= MAX_SLOTS}>
        追加
      </button>
    </form>
  );

  const chips = (
    <ul role="list" className={styles.chips} aria-label="比べている枠">
      {slots.map((slot) => (
        <li key={slot.slug} className={styles.chip}>
          {slot.name}
          <Link href={hrefFor(chosen.filter((slug) => slug !== slot.slug))} aria-label={`${slot.name}を外す`}>
            外す
          </Link>
        </li>
      ))}
    </ul>
  );

  if (slots.length < 2) {
    return (
      <div className={styles.layout}>
        {missing > 0 ? <Notice tone="warning" title="見つからない枠を除きました">URLの枠の名前を確かめてください。</Notice> : null}
        {chips}
        {picker}
        <EmptyState title="枠を2つ以上選んでください">
          名前を入れて追加するか、次の枠から選んでください：{" "}
          {labelled.map((slot, index) => (
            <span key={slot.slug}>
              {index > 0 ? "・" : ""}
              <Link href={hrefFor([...chosen, slot.slug])}>{slot.name}</Link>
            </span>
          ))}
        </EmptyState>
      </div>
    );
  }

  const forCompare: SlotForCompare[] = slots.map((slot) => ({
    slug: slot.slug,
    timeline: slot.timeline.map((season) => ({ ordinal: season.ordinal, position: season.position, titles: season.titles.length, moved: season.moved }))
  }));
  const summaries = forCompare.map(summarizeSlot);
  const rows = alignSeasons(forCompare);
  const names = slots.map((slot) => slot.name);
  const query = hrefFor(chosen);
  const meta = (anchor: string, title: string) => ({
    title: `${names.join("・")}: ${title}`,
    scope: `${slots.map((slot) => `${slot.name}（${slot.channel?.shortName ?? "局なし"}）`).join("、")}、各枠の基準局での定時放送`,
    url: absoluteUrl(`${query}#${anchor}`),
    dataTime: dataset?.lastSuccessAt ? formatDateTime(dataset.lastSuccessAt) : undefined,
    filename: `compare-slots-${anchor}`
  });

  return (
    <div className={styles.layout}>
      {missing > 0 ? <Notice tone="warning" title="見つからない枠を除きました">URLの枠の名前を確かめてください。</Notice> : null}
      {chips}
      {chosen.length < MAX_SLOTS ? picker : null}

      <Section id="summary" title="概要" description="各枠の基準局での定時放送から数えています">
        <div className={styles.tableWrap} role="region" aria-label="放送枠の比較の要約" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">項目</th>
                {slots.map((slot) => (
                  <th key={slot.slug} scope="col">
                    <Link href={`/slots/${encodeURIComponent(slot.slug)}`}>{slot.name}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">種別</th>
                {slots.map((slot) => (
                  <td key={slot.slug}>
                    <SlotKindBadge kind={slot.kind} />
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">局</th>
                {slots.map((slot) => (
                  <td key={slot.slug}>{slot.channel?.name ?? "—"}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">最新の位置</th>
                {slots.map((slot) => (
                  <td key={slot.slug} className={styles.num}>
                    {slot.latest ? `${positionText(slot.latest)}（${formatSeasonOrdinal(slot.latest.seasonOrdinal)}）` : "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">作品数</th>
                {slots.map((slot) => (
                  <td key={slot.slug} className={styles.num}>
                    {slot.titleCount}作品
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">放送のあったクール</th>
                {summaries.map((summary) => (
                  <td key={summary.slug} className={styles.num}>
                    {summary.seasons}クール
                    {summary.firstOrdinal !== null ? `（${formatSeasonOrdinal(summary.firstOrdinal)}〜${formatSeasonOrdinal(summary.lastOrdinal!)}）` : ""}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">1クールあたりの作品数</th>
                {summaries.map((summary) => (
                  <td key={summary.slug} className={styles.num}>
                    {summary.titlesPerSeason === null ? "—" : summary.titlesPerSeason.toFixed(1)}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">平均の放送時間</th>
                {summaries.map((summary) => (
                  <td key={summary.slug} className={styles.num}>
                    {summary.averageDuration === null ? "—" : `${Math.round(summary.averageDuration)}分`}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">開始時刻の変化</th>
                {summaries.map((summary) => (
                  <td key={summary.slug} className={styles.num}>
                    {summary.moves}回
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="start"
        title="開始時刻の推移"
        description="クールごとの枠の開始（所属作品の最も早い開始、同じ曜日内）"
        details="曜日が違っても時刻だけで描きます。曜日を含む位置は下の表で確認できます。放送のないクールでは線が途切れます。"
      >
        <ChartFrame
          title="開始時刻（アニメ時刻）"
          scope="単位: アニメ時刻（5時切替、25:30 = 翌1:30）。各枠の基準局での定時放送。"
          exportData={{
            spec: {
              kind: "columns",
              categoryLabel: "クール",
              categories: rows.map((row) => formatSeasonOrdinal(row.ordinal)),
              series: slots.map((slot, i) => ({ name: slot.name, values: rows.map((row) => (row.cells[i]?.position ? Math.round((row.cells[i]!.position!.minute / 60) * 100) / 100 : null)) })),
              unit: "時（アニメ時刻）",
              lines: true
            } satisfies ChartSpec,
            meta: meta("start", "開始時刻の推移")
          }}
        >
          <StartTimeChart
            seasons={rows.map((row) => row.ordinal)}
            series={slots.map((slot, i) => ({ name: slot.name, minutes: rows.map((row) => row.cells[i]?.position?.minute ?? null) }))}
          />
        </ChartFrame>
      </Section>

      <Section id="seasons" title="クール別の放送位置" description="各クールの位置と作品数。赤字は前のクールから開始が変わったクール">
        <div className={styles.tableWrap} role="region" aria-label="クール別の放送位置" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">クール</th>
                {slots.map((slot) => (
                  <th key={slot.slug} scope="col">
                    {slot.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => (
                <tr key={row.ordinal}>
                  <th scope="row">{formatSeasonOrdinal(row.ordinal)}</th>
                  {row.cells.map((cell, i) => (
                    <td key={slots[i]!.slug} className={styles.num}>
                      {cell?.position ? (
                        <>
                          <span className={cell.moved ? styles.moved : undefined}>
                            {positionText(cell.position)}
                            {cell.moved ? "（変更）" : ""}
                          </span>{" "}
                          <span className={styles.muted}>{cell.titles}作品</span>
                        </>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

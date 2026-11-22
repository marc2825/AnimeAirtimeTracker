"use client";

import { useState } from "react";

import { toCsv, toSvg, type ChartSpec, type ExportMeta } from "@/lib/chart-export";

import styles from "./Charts.module.css";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Rasterise the export SVG at twice its size (sharp on high-density screens and in documents). */
async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Export menu under a figure: the figures as CSV, the chart as SVG or PNG, and a link that reproduces the view.
 * Everything is generated in the browser from the spec the server passed (no extra request).
 */
export function ChartExport({ spec, meta }: { spec: ChartSpec; meta: ExportMeta }) {
  const [status, setStatus] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const run = async (action: () => Promise<void> | void, done: string) => {
    try {
      await action();
      setStatus(done);
    } catch {
      setStatus("書き出せませんでした");
    }
  };

  const share = async () => {
    setFallbackUrl(null);
    try {
      await navigator.clipboard.writeText(meta.url);
      setStatus("この条件のリンクをコピーしました");
    } catch {
      // Clipboard refused (permissions, older browsers): show the link to copy by hand.
      setFallbackUrl(meta.url);
      setStatus(null);
    }
  };

  return (
    <div className={styles.export}>
      <span className={styles.exportLabel}>書き出し</span>
      <button type="button" className={styles.exportButton} onClick={() => run(() => download(new Blob([toCsv(spec, meta)], { type: "text/csv;charset=utf-8" }), `${meta.filename}.csv`), "CSVを保存しました")}>
        CSV
      </button>
      <button type="button" className={styles.exportButton} onClick={() => run(() => download(new Blob([toSvg(spec, meta)], { type: "image/svg+xml" }), `${meta.filename}.svg`), "SVGを保存しました")}>
        SVG
      </button>
      <button type="button" className={styles.exportButton} onClick={() => run(async () => download(await svgToPng(toSvg(spec, meta)), `${meta.filename}.png`), "PNGを保存しました")}>
        PNG
      </button>
      <button type="button" className={styles.exportButton} onClick={share}>
        リンクをコピー
      </button>
      <span className={styles.exportStatus} role="status">
        {status}
      </span>
      {fallbackUrl ? (
        <input className={styles.exportUrl} readOnly value={fallbackUrl} aria-label="この条件のリンク" onFocus={(event) => event.currentTarget.select()} autoFocus />
      ) : null}
    </div>
  );
}

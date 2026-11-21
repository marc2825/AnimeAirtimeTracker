/**
 * Public summary of a failed ingest run.
 *
 * `ImportRun.error` keeps the full `Name: message` for operators (`npm run ingest -- status`, the Actions log).
 * Public pages show only one of these fixed sentences, chosen from the error's class name. The message text is
 * never used, so connection details, SQL, file paths or environment values in an exception cannot reach the site.
 */
const SUMMARIES = {
  source: "取得元からエラー応答がありました",
  sourceResponse: "取得元の応答を処理できませんでした",
  network: "取得元に接続できませんでした",
  database: "データベースの処理でエラーが発生しました",
  unknown: "取り込み処理でエラーが発生しました"
} as const;

export function summarizeRunError(error: string | null): string | null {
  if (!error) return null;
  const name = error.slice(0, error.indexOf(":") === -1 ? error.length : error.indexOf(":")).trim();
  if (name === "SyoboiHttpError") return SUMMARIES.source;
  if (name === "SyoboiResultError") return SUMMARIES.sourceResponse;
  if (name === "AbortError" || name === "TimeoutError" || error.startsWith("TypeError: fetch failed")) return SUMMARIES.network;
  if (name.startsWith("Prisma") || name === "DriverAdapterError") return SUMMARIES.database;
  return SUMMARIES.unknown;
}

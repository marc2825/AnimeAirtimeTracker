export const SITE_NAME = "アニメ放送枠観測所";
export const SITE_NAME_EN = "Anime Airtime Tracker";
export const SITE_DESCRIPTION =
  "日本のアニメ放送編成を、今週の番組表から過去の放送枠の変遷・編成統計まで横断して調べられるサイト。番組データはしょぼいカレンダーに基づきます。";
export const REPOSITORY_URL = "https://github.com/marc2825/AnimeAirtimeTracker";
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;
export const SOURCE_NAME = "しょぼいカレンダー";
export const SOURCE_URL = "https://cal.syoboi.jp/";

export function siteUrl(): URL {
  // SITE_URL wins; on Vercel fall back to the production domain it injects.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
  const raw = process.env.SITE_URL ?? vercel ?? "http://localhost:3000";
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

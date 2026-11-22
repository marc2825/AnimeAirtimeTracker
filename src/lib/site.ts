export const SITE_NAME = "アニメ放送枠観測所";
export const SITE_NAME_EN = "Anime Airtime Tracker";
export const SITE_DESCRIPTION =
  "日本のテレビアニメの放送枠と放送編成の歴史・変遷・統計を横断的に調べられるデータベース。今週の番組表から放送枠の年表、編成統計、分析まで。番組データはしょぼいカレンダーに基づきます。";
export const REPOSITORY_URL = "https://github.com/marc2825/AnimeAirtimeTracker";
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;
/** GitHub's private report form: the non-public channel for security issues and anything not to be posted in public. */
export const PRIVATE_REPORT_URL = `${REPOSITORY_URL}/security/advisories/new`;
export const CHANGELOG_URL = `${REPOSITORY_URL}/blob/main/CHANGELOG.md`;
/** Date the privacy policy and terms were last changed (shown on both pages). */
export const POLICIES_UPDATED = "2026年11月22日";
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

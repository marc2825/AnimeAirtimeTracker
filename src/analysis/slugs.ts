/**
 * Slugs of the published analyses. Kept apart from the registry (which imports page components) so that
 * proxy.ts can answer unknown analysis URLs with a 404 without bundling React code.
 */
export const ANALYSIS_SLUGS = ["implicit-slots", "late-night"] as const;

export type AnalysisSlug = (typeof ANALYSIS_SLUGS)[number];

export function isAnalysisSlug(value: string): value is AnalysisSlug {
  return (ANALYSIS_SLUGS as readonly string[]).includes(value);
}

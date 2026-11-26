import { implicitSlots } from "./implicit-slots";
import { lateNight } from "./late-night";
import type { AnalysisSlug } from "./slugs";
import type { Analysis } from "./types";

/** Published analyses, newest first. Adding one: write src/analysis/<slug>.tsx, add it here and to slugs.ts. */
export const ANALYSES: Analysis[] = [implicitSlots, lateNight];

export function findAnalysis(slug: string): Analysis | null {
  return ANALYSES.find((analysis) => analysis.meta.slug === (slug as AnalysisSlug)) ?? null;
}

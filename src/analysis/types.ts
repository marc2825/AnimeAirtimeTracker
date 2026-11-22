import type { ComponentType } from "react";

import type { AnalysisSlug } from "./slugs";

/**
 * Everything an analysis page states about itself, besides its computed content. Findings are never written
 * here: they are computed from the data in the content component, so they follow the data when it changes.
 */
export interface AnalysisMeta {
  slug: AnalysisSlug;
  /** Page title: the question or a short noun phrase. */
  title: string;
  /** One line for the index and the meta description. */
  summary: string;
  /** What is counted, where and when (channels, period, rerun handling). */
  scope: string;
  /** Counting unit of the figures. */
  unit: string;
  definitions: { term: string; text: string }[];
  /** Known limits of the data for this question. */
  limits: string[];
  /** Pages that show the same figures with the same conditions, to check or explore them. */
  reproduce: { label: string; href: string }[];
  /** Date the analysis (its method and wording) was written or last revised, ISO yyyy-mm-dd. */
  revisedAt: string;
}

export interface Analysis {
  meta: AnalysisMeta;
  /** Async server component that reads the data and renders findings, figures and tables. */
  Content: ComponentType;
}

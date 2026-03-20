export const searchViews = ["title", "airing", "slot"] as const;
export const pageSizeOptions = [5, 10, 20] as const;

export type SearchView = (typeof searchViews)[number];

export interface SearchState {
  q: string;
  year: string;
  quarter: string;
  weekday: string;
  timeBand: string;
  channel: string;
  region: string;
  slot: string;
  genre: string;
  company: string;
  sequel: string;
  duration: string;
  view: SearchView;
  sort: string;
  page: number;
  pageSize: number;
}

export const defaultSearchState: SearchState = {
  q: "",
  year: "",
  quarter: "",
  weekday: "",
  timeBand: "",
  channel: "",
  region: "",
  slot: "",
  genre: "",
  company: "",
  sequel: "",
  duration: "",
  view: "title",
  sort: "",
  page: 1,
  pageSize: 5
};

export const searchViewLabels: Record<SearchView, string> = {
  title: "作品",
  airing: "放送",
  slot: "枠"
};

export const searchSortOptions: Record<SearchView, Array<{ value: string; label: string }>> = {
  title: [
    { value: "latest", label: "新しいクール順" },
    { value: "title", label: "タイトル順" },
    { value: "airtime", label: "初回放送日時順" },
    { value: "slot", label: "枠順" },
    { value: "matches", label: "一致放送件数順" }
  ],
  airing: [
    { value: "latest", label: "新しい放送順" },
    { value: "airtime", label: "古い放送順" },
    { value: "title", label: "タイトル順" },
    { value: "channel", label: "放送局順" },
    { value: "slot", label: "枠順" }
  ],
  slot: [
    { value: "titles", label: "作品本数順" },
    { value: "airings", label: "放送件数順" },
    { value: "slot", label: "枠名順" },
    { value: "confidence", label: "信頼度順" }
  ]
};

function readSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clampPositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampPageSize(value: string): number {
  const parsed = clampPositiveInteger(value, defaultSearchState.pageSize);
  return pageSizeOptions.includes(parsed as (typeof pageSizeOptions)[number])
    ? parsed
    : defaultSearchState.pageSize;
}

export function getDefaultSortForView(view: SearchView): string {
  return searchSortOptions[view][0]?.value ?? "";
}

export function readSearchState(
  params: Record<string, string | string[] | undefined>
): SearchState {
  const viewValue = readSingle(params.view);
  const view = searchViews.includes(viewValue as SearchView) ? (viewValue as SearchView) : defaultSearchState.view;

  return {
    q: readSingle(params.q),
    year: readSingle(params.year),
    quarter: readSingle(params.quarter),
    weekday: readSingle(params.weekday),
    timeBand: readSingle(params.timeBand),
    channel: readSingle(params.channel),
    region: readSingle(params.region),
    slot: readSingle(params.slot),
    genre: readSingle(params.genre),
    company: readSingle(params.company),
    sequel: readSingle(params.sequel),
    duration: readSingle(params.duration),
    view,
    sort: readSingle(params.sort),
    page: clampPositiveInteger(readSingle(params.page), defaultSearchState.page),
    pageSize: clampPageSize(readSingle(params.pageSize))
  };
}

export function buildSearchHref(
  basePath: string,
  currentState: SearchState,
  overrides: Partial<SearchState> = {}
): string {
  const nextState = {
    ...currentState,
    ...overrides
  };
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(nextState)) {
    if (typeof value === "number") {
      if (key === "page" && value === defaultSearchState.page) {
        continue;
      }

      if (key === "pageSize" && value === defaultSearchState.pageSize) {
        continue;
      }

      searchParams.set(key, String(value));
      continue;
    }

    if (!value) {
      continue;
    }

    if (key === "view" && value === defaultSearchState.view) {
      continue;
    }

    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

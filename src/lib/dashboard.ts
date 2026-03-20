export interface DashboardState {
  year: string;
  quarter: string;
  channel: string;
  slot: string;
}

export const defaultDashboardState: DashboardState = {
  year: "",
  quarter: "",
  channel: "",
  slot: ""
};

function readSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function readDashboardState(
  params: Record<string, string | string[] | undefined>
): DashboardState {
  return {
    year: readSingle(params.year),
    quarter: readSingle(params.quarter),
    channel: readSingle(params.channel),
    slot: readSingle(params.slot)
  };
}

export function buildDashboardHref(
  basePath: string,
  currentState: DashboardState,
  overrides: Partial<DashboardState> = {}
): string {
  const nextState = {
    ...currentState,
    ...overrides
  };
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(nextState)) {
    if (!value) {
      continue;
    }

    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

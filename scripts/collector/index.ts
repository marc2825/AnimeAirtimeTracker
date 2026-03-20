import path from "node:path";

import type { SeasonQuarter } from "@/lib/types";

import { runCollectorPipeline } from "./pipeline";
import { createMockOfficialFeedProvider } from "./providers/mock-official-feed";
import type { CollectorMode, CollectorRequest, CollectorRequestWindow } from "./types";

type CliArgs = Record<string, string>;

const validQuarters = ["WINTER", "SPRING", "SUMMER", "AUTUMN"] as const;

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current?.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function toQuarter(value: string | undefined): SeasonQuarter | undefined {
  if (!value) {
    return undefined;
  }

  return validQuarters.includes(value as (typeof validQuarters)[number])
    ? (value as SeasonQuarter)
    : undefined;
}

function buildWindow(args: CliArgs): CollectorRequestWindow {
  const year = args.year ? Number.parseInt(args.year, 10) : undefined;
  const quarter = toQuarter(args.quarter);
  const from = args.from;
  const to = args.to;
  const label =
    args["window-label"] ??
    (year && quarter ? `${year}-${quarter}` : from && to ? `${from}-${to}` : "manual-window");

  return {
    label,
    year: Number.isFinite(year) ? year : undefined,
    quarter,
    from,
    to,
    cursor: args.cursor
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.source ?? "mock-official-feed";

  if (source !== "mock-official-feed") {
    throw new Error(`Unsupported source: ${source}`);
  }

  const provider = createMockOfficialFeedProvider({
    fixturePath: args.fixture ? path.resolve(args.fixture) : undefined
  });
  const request: CollectorRequest = {
    sourceId: provider.definition.sourceId,
    endpoint: provider.definition.endpoint,
    transport: provider.definition.transport,
    mode: (args.mode as CollectorMode | undefined) === "incremental" ? "incremental" : "backfill",
    window: buildWindow(args)
  };
  const storageRoot = path.resolve(args["storage-root"] ?? path.join(process.cwd(), "data", "collector"));
  const result = await runCollectorPipeline({
    provider,
    request,
    storageRoot
  });

  console.log(
    JSON.stringify(
      {
        sourceId: request.sourceId,
        mode: request.mode,
        window: request.window,
        summary: result.summary,
        rawPath: result.rawPath,
        normalizedPath: result.normalizedPath,
        statePath: result.statePath,
        logPath: result.logPath
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

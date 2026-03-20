import type {
  CollectorChangeSummary,
  CollectorPipelineResult,
  CollectorProvider,
  CollectorRequest,
  CollectorRunLog,
  CollectorState,
  CollectorWindowState,
  RawCollectorSnapshot
} from "./types";
import {
  buildCollectorPaths,
  createEmptyCollectorState,
  readJsonIfExists,
  writeJson,
  writeJsonIfMissing
} from "./storage";
import { createRunId, hashValue } from "./utils";

function createRawSnapshot<TPayload>(
  request: CollectorRequest,
  response: Awaited<ReturnType<CollectorProvider<TPayload>["fetch"]>>
): RawCollectorSnapshot<TPayload> {
  return {
    schemaVersion: 1,
    sourceId: request.sourceId,
    endpoint: request.endpoint,
    transport: request.transport,
    mode: request.mode,
    fetchedAt: response.fetchedAt,
    requestFingerprint: hashValue({
      sourceId: request.sourceId,
      endpoint: request.endpoint,
      mode: request.mode,
      transport: request.transport,
      window: request.window
    }),
    payloadHash: hashValue(response.payload),
    responseMeta: response.responseMeta,
    window: request.window,
    payload: response.payload
  };
}

function diffEntityHashes(
  previousHashes: Record<string, string>,
  nextHashes: Record<string, string>
): {
  summary: CollectorChangeSummary;
  addedKeys: string[];
  updatedKeys: string[];
  removedKeys: string[];
  unchangedKeys: string[];
} {
  const previousKeys = new Set(Object.keys(previousHashes));
  const nextKeys = new Set(Object.keys(nextHashes));
  const addedKeys = [...nextKeys].filter((key) => !previousKeys.has(key)).sort((left, right) =>
    left.localeCompare(right, "en")
  );
  const removedKeys = [...previousKeys].filter((key) => !nextKeys.has(key)).sort((left, right) =>
    left.localeCompare(right, "en")
  );
  const unchangedKeys = [...nextKeys]
    .filter((key) => previousHashes[key] === nextHashes[key])
    .sort((left, right) => left.localeCompare(right, "en"));
  const updatedKeys = [...nextKeys]
    .filter((key) => previousKeys.has(key) && previousHashes[key] !== nextHashes[key])
    .sort((left, right) => left.localeCompare(right, "en"));

  return {
    summary: {
      added: addedKeys.length,
      updated: updatedKeys.length,
      removed: removedKeys.length,
      unchanged: unchangedKeys.length,
      changed: addedKeys.length + updatedKeys.length + removedKeys.length > 0
    },
    addedKeys,
    updatedKeys,
    removedKeys,
    unchangedKeys
  };
}

function toEntityHashMap(entityDigests: Array<{ entityKey: string; hash: string }>): Record<string, string> {
  return Object.fromEntries(entityDigests.map((entry) => [entry.entityKey, entry.hash]));
}

function upsertWindowState(
  state: CollectorState,
  windowState: CollectorWindowState
): CollectorState {
  return {
    ...state,
    windows: {
      ...state.windows,
      [windowState.windowLabel]: windowState
    }
  };
}

export async function runCollectorPipeline<TPayload>(input: {
  provider: CollectorProvider<TPayload>;
  request: CollectorRequest;
  storageRoot: string;
}): Promise<CollectorPipelineResult> {
  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const response = await input.provider.fetch(input.request);
  const rawSnapshot = createRawSnapshot(input.request, response);
  const paths = buildCollectorPaths({
    storageRoot: input.storageRoot,
    sourceId: input.request.sourceId,
    windowLabel: input.request.window.label,
    payloadHash: rawSnapshot.payloadHash,
    startedAt,
    runId
  });

  await writeJsonIfMissing(paths.rawPath, rawSnapshot);

  const normalized = input.provider.normalize({
    snapshot: rawSnapshot,
    rawSnapshotRef: paths.rawPath
  });
  const entityHashes = toEntityHashMap(normalized.entityDigests);
  const previousState =
    (await readJsonIfExists<CollectorState>(paths.statePath)) ??
    createEmptyCollectorState(input.request.sourceId, input.request.window.label);
  const previousWindowState = previousState.windows[input.request.window.label];
  const diff = diffEntityHashes(previousWindowState?.entityHashes ?? {}, entityHashes);
  const finishedAt = new Date().toISOString();

  await writeJsonIfMissing(paths.normalizedPath, normalized);

  const nextState = upsertWindowState(previousState, {
    windowLabel: input.request.window.label,
    latestPayloadHash: rawSnapshot.payloadHash,
    entityHashes,
    updatedAt: finishedAt
  });
  await writeJson(paths.statePath, nextState);

  const log: CollectorRunLog = {
    schemaVersion: 1,
    runId,
    sourceId: input.request.sourceId,
    startedAt,
    finishedAt,
    request: input.request,
    rawPath: paths.rawPath,
    normalizedPath: paths.normalizedPath,
    statePath: paths.statePath,
    payloadHash: rawSnapshot.payloadHash,
    summary: diff.summary,
    addedKeys: diff.addedKeys,
    updatedKeys: diff.updatedKeys,
    removedKeys: diff.removedKeys,
    unchangedKeys: diff.unchangedKeys
  };
  await writeJson(paths.logPath, log);

  return {
    rawPath: paths.rawPath,
    normalizedPath: paths.normalizedPath,
    statePath: paths.statePath,
    logPath: paths.logPath,
    summary: diff.summary,
    normalized,
    rawSnapshot
  };
}

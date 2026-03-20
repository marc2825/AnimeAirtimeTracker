import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CollectorState } from "./types";
import { toSafeFileSegment } from "./utils";

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function readJsonIfExists<TValue>(filePath: string): Promise<TValue | null> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as TValue;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeJsonIfMissing(filePath: string, value: unknown): Promise<void> {
  const existing = await readJsonIfExists<unknown>(filePath);

  if (existing !== null) {
    return;
  }

  await writeJson(filePath, value);
}

export function buildCollectorPaths(input: {
  storageRoot: string;
  sourceId: string;
  windowLabel: string;
  payloadHash: string;
  startedAt: string;
  runId: string;
}) {
  const sourceSegment = toSafeFileSegment(input.sourceId);
  const windowSegment = toSafeFileSegment(input.windowLabel);
  const timestampSegment = toSafeFileSegment(input.startedAt.replace(/[:.]/g, "-"));

  return {
    rawPath: path.join(input.storageRoot, "raw", sourceSegment, windowSegment, `${input.payloadHash}.json`),
    normalizedPath: path.join(
      input.storageRoot,
      "normalized",
      sourceSegment,
      windowSegment,
      `${input.payloadHash}.json`
    ),
    statePath: path.join(input.storageRoot, "state", sourceSegment, `${windowSegment}.json`),
    logPath: path.join(
      input.storageRoot,
      "logs",
      sourceSegment,
      `${timestampSegment}-${toSafeFileSegment(input.runId)}.json`
    )
  };
}

export function createEmptyCollectorState(sourceId: string, windowLabel: string): CollectorState {
  return {
    schemaVersion: 1,
    sourceId,
    windows: {
      [windowLabel]: {
        windowLabel,
        latestPayloadHash: "",
        entityHashes: {},
        updatedAt: ""
      }
    }
  };
}

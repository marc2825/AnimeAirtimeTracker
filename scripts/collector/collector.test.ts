import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCollectorPipeline } from "./pipeline";
import {
  createMockOfficialFeedProvider,
  type MockOfficialFeedPayload
} from "./providers/mock-official-feed";
import type { CollectorRequest } from "./types";

const tempDirectories: string[] = [];
const fixturePath = path.join(
  process.cwd(),
  "scripts",
  "collector",
  "fixtures",
  "mock-official-feed",
  "2024-spring.json"
);

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function createTempDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "collector-test-"));
  tempDirectories.push(directory);
  return directory;
}

function createRequest(): CollectorRequest {
  return {
    sourceId: "mock-official-feed",
    endpoint: "mock-json",
    transport: "official-non-html",
    mode: "backfill",
    window: {
      label: "2024-SPRING",
      year: 2024,
      quarter: "SPRING"
    }
  };
}

describe("collector pipeline", () => {
  it("stores raw and normalized data in separated paths", async () => {
    const storageRoot = await createTempDirectory();
    const provider = createMockOfficialFeedProvider({ fixturePath });

    const result = await runCollectorPipeline({
      provider,
      request: createRequest(),
      storageRoot
    });
    const rawSnapshot = JSON.parse(await readFile(result.rawPath, "utf8")) as {
      payload: MockOfficialFeedPayload;
    };
    const normalizedSnapshot = JSON.parse(await readFile(result.normalizedPath, "utf8")) as {
      airings: Array<{ externalProgramId: string }>;
      sourceRecords: Array<{ externalId: string }>;
      summary: { airingCount: number };
    };

    expect(result.rawPath).toContain(`${path.sep}raw${path.sep}`);
    expect(result.normalizedPath).toContain(`${path.sep}normalized${path.sep}`);
    expect(rawSnapshot.payload.programs).toHaveLength(3);
    expect(normalizedSnapshot.airings).toHaveLength(3);
    expect(normalizedSnapshot.sourceRecords.length).toBeGreaterThan(3);
    expect(normalizedSnapshot.summary.airingCount).toBe(3);
  });

  it("is idempotent for identical reruns and detects diffs on changed payloads", async () => {
    const storageRoot = await createTempDirectory();
    const request = createRequest();
    const baseProvider = createMockOfficialFeedProvider({ fixturePath });

    const firstRun = await runCollectorPipeline({
      provider: baseProvider,
      request,
      storageRoot
    });
    const secondRun = await runCollectorPipeline({
      provider: baseProvider,
      request,
      storageRoot
    });

    expect(firstRun.summary.changed).toBe(true);
    expect(secondRun.summary.changed).toBe(false);
    expect(secondRun.summary.unchanged).toBeGreaterThan(0);
    expect(secondRun.rawPath).toBe(firstRun.rawPath);
    expect(secondRun.normalizedPath).toBe(firstRun.normalizedPath);

    const modifiedFixturePath = path.join(storageRoot, "modified-fixture.json");
    const modifiedPayload = JSON.parse(await readFile(fixturePath, "utf8")) as MockOfficialFeedPayload;
    modifiedPayload.programs[0] = {
      ...modifiedPayload.programs[0],
      endAt: "2024-04-09T02:05:00+09:00",
      note: "初回のみ5分拡大"
    };
    await writeFile(modifiedFixturePath, `${JSON.stringify(modifiedPayload, null, 2)}\n`, "utf8");

    const modifiedProvider = createMockOfficialFeedProvider({
      fixturePath: modifiedFixturePath
    });
    const thirdRun = await runCollectorPipeline({
      provider: modifiedProvider,
      request,
      storageRoot
    });

    expect(thirdRun.summary.changed).toBe(true);
    expect(thirdRun.summary.updated).toBeGreaterThan(0);
  });
});

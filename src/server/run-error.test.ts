import { describe, expect, it } from "vitest";

import { summarizeRunError } from "./run-error";

// Shapes stored by withImportRun (`${error.name}: ${error.message}`), with the kinds of detail that must stay private.
const LEAKY = [
  "PrismaClientKnownRequestError: Can't reach database server at `ep-example-123456.c-1.ap-southeast-1.aws.neon.tech:5432`",
  'DriverAdapterError: relation "Broadcast" does not exist — SELECT "id" FROM "Broadcast" WHERE "pid" = $1',
  "Error: getaddrinfo ENOTFOUND db.internal.example /home/runner/work/app/src/server/prisma.ts:10",
  "Error: DATABASE_URL=postgresql://owner:hunter2@db.example:5432/app is invalid",
  "SyoboiHttpError: HTTP 503",
  "SyoboiResultError: Syoboi Result/Code 400: bad request",
  "TypeError: fetch failed",
  "AbortError: This operation was aborted"
];

describe("summarizeRunError", () => {
  it("returns null when the run has no error", () => {
    expect(summarizeRunError(null)).toBeNull();
    expect(summarizeRunError("")).toBeNull();
  });

  it("maps known error classes to fixed public sentences", () => {
    expect(summarizeRunError("SyoboiHttpError: HTTP 503")).toBe("取得元からエラー応答がありました");
    expect(summarizeRunError("SyoboiResultError: Malformed XML: unexpected end")).toBe("取得元の応答を処理できませんでした");
    expect(summarizeRunError("TypeError: fetch failed")).toBe("取得元に接続できませんでした");
    expect(summarizeRunError("TimeoutError: The operation timed out")).toBe("取得元に接続できませんでした");
    expect(summarizeRunError("PrismaClientInitializationError: timed out")).toBe("データベースの処理でエラーが発生しました");
    expect(summarizeRunError("DriverAdapterError: deadlock detected")).toBe("データベースの処理でエラーが発生しました");
  });

  it("falls back to a generic sentence for anything else, including errors without a class name", () => {
    expect(summarizeRunError("Error: Another ingest run holds the lock; refusing to overlap runs.")).toBe("取り込み処理でエラーが発生しました");
    expect(summarizeRunError("TypeError: Cannot read properties of undefined")).toBe("取り込み処理でエラーが発生しました");
    expect(summarizeRunError("something odd")).toBe("取り込み処理でエラーが発生しました");
  });

  it.each(LEAKY)("never echoes the stored message: %s", (stored) => {
    const summary = summarizeRunError(stored)!;
    const message = stored.slice(stored.indexOf(":") + 1);
    for (const fragment of ["neon.tech", "5432", "SELECT", "Broadcast", "/home/", "hunter2", "DATABASE_URL", "ENOTFOUND", "HTTP 503", "400"]) {
      if (message.includes(fragment)) expect(summary).not.toContain(fragment);
    }
    expect(summary).toMatch(/^[^\x00-\x7F]+$/u); // a fixed Japanese sentence, nothing copied from the message
  });
});

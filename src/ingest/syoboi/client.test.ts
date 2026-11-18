import { describe, expect, it } from "vitest";

import { assertValidUserAgent, parseRetryAfter, SyoboiClient, SyoboiHttpError, type FetchImpl } from "./client";

const UA = "TestApp/1.0 (+https://example.com/app)";

/** Deterministic clock + sleep: sleeping advances the clock instantly and records the delay. */
function fakeTime() {
  let now = Date.parse("2026-11-18T00:00:00Z");
  const sleeps: number[] = [];
  return {
    now: () => new Date(now),
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps
  };
}

function response(status: number, body = "<ok/>", headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

describe("SyoboiClient", () => {
  it("refuses to run without an identifying User-Agent or with an aggressive interval", () => {
    expect(() => assertValidUserAgent(undefined)).toThrow();
    expect(() => assertValidUserAgent("node-fetch/1.0")).toThrow();
    expect(() => new SyoboiClient({ userAgent: "curl/8" })).toThrow(/SYOBOI_USER_AGENT/);
    expect(() => new SyoboiClient({ userAgent: UA, minIntervalMs: 200 })).toThrow(/minIntervalMs/);
  });

  it("sends the User-Agent and serialises requests with the minimum interval after each response", async () => {
    const time = fakeTime();
    const calls: { url: string; ua: string; at: number }[] = [];
    let inFlight = 0;
    const fetchImpl: FetchImpl = async (url, init) => {
      inFlight += 1;
      expect(inFlight).toBe(1);
      calls.push({ url, ua: init.headers["User-Agent"]!, at: time.now().getTime() });
      time.advance(500); // response latency
      inFlight -= 1;
      return response(200);
    };
    const client = new SyoboiClient({ userAgent: UA, minIntervalMs: 2000, fetchImpl, sleep: time.sleep, now: time.now, random: () => 0 });
    await Promise.all([client.get({ Command: "A" }, "a"), client.get({ Command: "B" }, "b"), client.get({ Command: "C" }, "c")]);
    expect(calls.map((call) => call.ua)).toEqual([UA, UA, UA]);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(2500);
    expect(calls[2]!.at - calls[1]!.at).toBeGreaterThanOrEqual(2500);
    expect(client.requestCount).toBe(3);
  });

  it("honours 429 Retry-After and then succeeds", async () => {
    const time = fakeTime();
    const statuses = [429, 200];
    const fetchImpl: FetchImpl = async () => response(statuses.shift()!, "<ok/>", { "retry-after": "120" });
    const client = new SyoboiClient({ userAgent: UA, fetchImpl, sleep: time.sleep, now: time.now, random: () => 0, baseBackoffMs: 1000 });
    await expect(client.get({ Command: "X" }, "x")).resolves.toBe("<ok/>");
    expect(Math.max(...time.sleeps)).toBeGreaterThanOrEqual(120_000);
  });

  it("backs off exponentially on 5xx and gives up after maxRetries", async () => {
    const time = fakeTime();
    const attemptTimes: number[] = [];
    const fetchImpl: FetchImpl = async () => {
      attemptTimes.push(time.now().getTime());
      return response(503);
    };
    const logs: string[] = [];
    const client = new SyoboiClient({
      userAgent: UA,
      fetchImpl,
      sleep: time.sleep,
      now: time.now,
      random: () => 0,
      minIntervalMs: 1000,
      maxRetries: 3,
      baseBackoffMs: 1000,
      onAttempt: (log) => void logs.push(`${log.attempt}:${log.httpStatus}`)
    });
    await expect(client.get({ Command: "X" }, "x")).rejects.toBeInstanceOf(SyoboiHttpError);
    expect(logs).toEqual(["1:503", "2:503", "3:503", "4:503"]);
    const gaps = attemptTimes.slice(1).map((at, index) => at - attemptTimes[index]!);
    expect(gaps).toEqual([1000, 2000, 4000]);
  });

  it("does not retry client errors such as HTTP 400", async () => {
    let attempts = 0;
    const time = fakeTime();
    const client = new SyoboiClient({
      userAgent: UA,
      fetchImpl: async () => {
        attempts += 1;
        return response(400, "Bad Request");
      },
      sleep: time.sleep,
      now: time.now
    });
    await expect(client.get({ Command: "X" }, "x")).rejects.toThrow("HTTP 400");
    expect(attempts).toBe(1);
  });

  it("retries network failures", async () => {
    const time = fakeTime();
    let attempts = 0;
    const client = new SyoboiClient({
      userAgent: UA,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("fetch failed");
        return response(200, "<ok/>");
      },
      sleep: time.sleep,
      now: time.now,
      random: () => 0,
      baseBackoffMs: 1000
    });
    await expect(client.get({ Command: "X" }, "x")).resolves.toBe("<ok/>");
    expect(attempts).toBe(2);
  });

  it("reuses responses within Cache-Control max-age", async () => {
    const time = fakeTime();
    let attempts = 0;
    const store = new Map<string, { body: string; expiresAt: number }>();
    const client = new SyoboiClient({
      userAgent: UA,
      fetchImpl: async () => {
        attempts += 1;
        return response(200, "<cached/>", { "cache-control": "max-age=180" });
      },
      sleep: time.sleep,
      now: time.now,
      cache: {
        get: async (url, now) => {
          const entry = store.get(url);
          return entry && entry.expiresAt > now.getTime() ? entry.body : null;
        },
        set: async (url, body, maxAge, now) => void store.set(url, { body, expiresAt: now.getTime() + maxAge * 1000 })
      }
    });
    await client.get({ Command: "X" }, "x");
    await client.get({ Command: "X" }, "x");
    expect(attempts).toBe(1);
  });

  it("parses Retry-After in seconds and HTTP-date form", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    expect(parseRetryAfter("30", now)).toBe(30_000);
    expect(parseRetryAfter("Wed, 18 Nov 2026 00:01:00 GMT", now)).toBe(60_000);
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

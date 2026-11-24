import { describe, expect, it } from "vitest";

import { parseJstDateTime } from "@/domain/time";

import { halveWindow, splitRange, toLastUpdateSinceParam, toRangeParam } from "./plan";
import { fetchProgramWindow } from "./sync";
import { SyoboiHttpError, type SyoboiClient } from "./syoboi/client";

function progXml(rows: number): string {
  const items = Array.from(
    { length: rows },
    (_, index) =>
      `<ProgItem id="${index}"><PID>${index + 1}</PID><TID>1</TID><ChID>19</ChID><StTime>2026-11-16 23:00:00</StTime><EdTime>2026-11-16 23:30:00</EdTime><Count>1</Count><Flag>0</Flag><Deleted>0</Deleted></ProgItem>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><ProgLookupResponse><Result><Code>200</Code><Message></Message></Result><ProgItems>${items}</ProgItems></ProgLookupResponse>`;
}

describe("planning", () => {
  const range = { start: parseJstDateTime("2026-10-01 05:00:00"), end: parseJstDateTime("2027-01-01 05:00:00") };

  it("splits a season into ≤7-day windows without gaps or overlap", () => {
    const windows = splitRange(range, 7);
    expect(windows).toHaveLength(14);
    expect(windows[0]!.start).toEqual(range.start);
    expect(windows.at(-1)!.end).toEqual(range.end);
    windows.slice(1).forEach((window, index) => expect(window.start).toEqual(windows[index]!.end));
  });

  it("formats Syoboi Range and LastUpdate parameters in JST", () => {
    expect(toRangeParam(splitRange(range, 7)[0]!)).toBe("20261001_050000-20261008_050000");
    expect(toLastUpdateSinceParam(parseJstDateTime("2026-11-18 09:00:00"))).toBe("20261118_090000-");
  });

  it("halves on minute boundaries", () => {
    const [a, b] = halveWindow({ start: parseJstDateTime("2026-11-16 05:00:00"), end: parseJstDateTime("2026-11-17 05:00:00") });
    expect(a.end).toEqual(b.start);
    expect(a.end.getUTCSeconds()).toBe(0);
  });
});

describe("fetchProgramWindow", () => {
  it("splits a window whose response hits the 5,000-row cap and never treats it as complete", async () => {
    const requested: string[] = [];
    const client = {
      get: async (params: Record<string, string>) => {
        requested.push(params.Range!);
        return requested.length === 1 ? progXml(5000) : progXml(10);
      }
    } as unknown as SyoboiClient;
    const window = { start: parseJstDateTime("2026-11-16 05:00:00"), end: parseJstDateTime("2026-11-23 05:00:00") };
    const result = await fetchProgramWindow({ client, log: () => {} }, window, ["19"]);
    expect(requested).toHaveLength(3);
    expect(result).toHaveLength(2);
    expect(result[0]!.window.start).toEqual(window.start);
    expect(result[1]!.window.end).toEqual(window.end);
  });

  it("fails the window instead of treating a refused or oversized response as an empty one", async () => {
    // An empty window would count as complete and could mark airings as missing; the last good data must stay.
    const window = { start: parseJstDateTime("2026-11-16 05:00:00"), end: parseJstDateTime("2026-11-17 05:00:00") };
    const oversized = {
      get: async () => {
        throw new SyoboiHttpError("Response too large (over 1000 bytes)", 200, false);
      }
    } as unknown as SyoboiClient;
    await expect(fetchProgramWindow({ client: oversized, log: () => {} }, window, ["19"])).rejects.toThrow(/too large/);
    const doctype = { get: async () => progXml(1).replace("?>", "?><!DOCTYPE ProgLookupResponse>") } as unknown as SyoboiClient;
    await expect(fetchProgramWindow({ client: doctype, log: () => {} }, window, ["19"])).rejects.toThrow(/DOCTYPE/);
  });

  it("gives up rather than returning a truncated small window", async () => {
    const client = { get: async () => progXml(5000) } as unknown as SyoboiClient;
    const window = { start: parseJstDateTime("2026-11-16 05:00:00"), end: parseJstDateTime("2026-11-16 08:00:00") };
    await expect(fetchProgramWindow({ client, log: () => {} }, window, ["19"])).rejects.toThrow(/truncated/);
  });
});

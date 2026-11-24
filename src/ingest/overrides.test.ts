import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { overridesFileSchema, slotRegistrySchema } from "./overrides";

const base = { broadcasts: [], slotMemberships: [] };
const officialUrl = (value: string | null) => ({
  ...base,
  titles: [{ externalId: "1", field: "officialUrl", value, reason: "公式サイトの移転", evidence: "放送局の告知", addedAt: "2026-11-22" }]
});

describe("overridesFileSchema", () => {
  it("accepts the repository's own overrides file", () => {
    const file = JSON.parse(readFileSync(path.join(process.cwd(), "data/overrides.json"), "utf8"));
    expect(overridesFileSchema.safeParse(file).success).toBe(true);
  });

  it("accepts only http(s) official URLs, since they are rendered as links", () => {
    expect(overridesFileSchema.safeParse(officialUrl("https://example.jp/")).success).toBe(true);
    expect(overridesFileSchema.safeParse(officialUrl(null)).success).toBe(true);
    expect(overridesFileSchema.safeParse(officialUrl("javascript:alert(1)")).success).toBe(false);
    expect(overridesFileSchema.safeParse(officialUrl("data:text/html,x")).success).toBe(false);
  });
});

describe("slotRegistrySchema", () => {
  const registry = (evidenceUrl: string) => ({ slots: [{ label: "枠", slug: "waku", name: "枠", kind: "OFFICIAL", evidenceUrl }] });

  it("accepts the repository's own registry", () => {
    const file = JSON.parse(readFileSync(path.join(process.cwd(), "data/slots.json"), "utf8"));
    expect(slotRegistrySchema.safeParse(file).success).toBe(true);
  });

  it("accepts only http(s) evidence URLs, since they are rendered as links", () => {
    expect(slotRegistrySchema.safeParse(registry("https://example.jp/waku/")).success).toBe(true);
    expect(slotRegistrySchema.safeParse(registry("javascript:alert(1)")).success).toBe(false);
    expect(slotRegistrySchema.safeParse(registry("data:text/html,x")).success).toBe(false);
  });
});

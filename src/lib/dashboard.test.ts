import { describe, expect, it } from "vitest";

import { buildDashboardHref, readDashboardState } from "@/lib/dashboard";

describe("dashboard state", () => {
  it("reads single-value query params", () => {
    const state = readDashboardState({
      year: "2024",
      quarter: "SUMMER",
      channel: "tokyo-mx",
      slot: "urban-monday"
    });

    expect(state).toEqual({
      year: "2024",
      quarter: "SUMMER",
      channel: "tokyo-mx",
      slot: "urban-monday"
    });
  });

  it("builds hrefs while omitting empty values", () => {
    const href = buildDashboardHref(
      "/stats",
      {
        year: "2024",
        quarter: "SUMMER",
        channel: "",
        slot: "urban-monday"
      },
      {
        quarter: "",
        channel: "tokyo-mx"
      }
    );

    expect(href).toContain("/stats?");
    expect(href).toContain("year=2024");
    expect(href).toContain("channel=tokyo-mx");
    expect(href).toContain("slot=urban-monday");
    expect(href).not.toContain("quarter=");
  });
});

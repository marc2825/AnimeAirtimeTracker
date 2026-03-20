import { describe, expect, it } from "vitest";

import { getAdminConsoleData } from "@/lib/admin";

describe("admin console data", () => {
  it("builds the initial admin sections from dummy data", () => {
    const admin = getAdminConsoleData();

    expect(admin.jobs.length).toBeGreaterThanOrEqual(4);
    expect(admin.errors.length).toBeGreaterThanOrEqual(3);
    expect(admin.slotDrafts.length).toBeGreaterThan(0);
    expect(admin.regionDrafts.length).toBeGreaterThan(0);
    expect(admin.corrections.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps slot draft and manual correction links navigable", () => {
    const admin = getAdminConsoleData();
    const draft = admin.slotDrafts[0];
    const correction = admin.corrections.find((entry) => entry.entityType === "放送枠");

    expect(draft?.slug).toBeTruthy();
    expect(draft?.currentName).toBeTruthy();
    expect(correction?.targetHref).toMatch(/^\/slots\//);
  });
});

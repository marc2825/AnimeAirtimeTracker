import { describe, expect, it } from "vitest";

import { ANALYSES } from "./registry";
import { ANALYSIS_SLUGS } from "./slugs";

describe("analysis registry", () => {
  it("lists exactly the slugs the proxy knows, each once", () => {
    expect(ANALYSES.map((a) => a.meta.slug).sort()).toEqual([...ANALYSIS_SLUGS].sort());
  });

  it("states scope, unit, definitions, limits and a way to reproduce for every analysis", () => {
    for (const { meta } of ANALYSES) {
      expect(meta.scope.length, meta.slug).toBeGreaterThan(10);
      expect(meta.unit.length, meta.slug).toBeGreaterThan(2);
      expect(meta.definitions.length, meta.slug).toBeGreaterThan(0);
      expect(meta.limits.length, meta.slug).toBeGreaterThan(0);
      expect(meta.reproduce.length, meta.slug).toBeGreaterThan(0);
      expect(meta.revisedAt, meta.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const link of meta.reproduce) expect(link.href.startsWith("/"), link.href).toBe(true);
    }
  });
});

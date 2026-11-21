import { describe, expect, it } from "vitest";

import { countUpValue } from "./count-up";

describe("countUpValue", () => {
  it("starts at 0 and ends exactly on the target", () => {
    expect(countUpValue(1055, 0)).toBe(0);
    expect(countUpValue(1055, 1)).toBe(1055);
    expect(countUpValue(1055, 1.3)).toBe(1055);
    expect(countUpValue(3, -0.2)).toBe(0);
  });

  it("only ever counts upward, in whole numbers, and never overshoots", () => {
    for (const to of [3, 97, 1055, 326151]) {
      let previous = 0;
      for (let step = 0; step <= 100; step += 1) {
        const value = countUpValue(to, step / 100);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(previous);
        expect(value).toBeLessThanOrEqual(to);
        previous = value;
      }
    }
  });

  it("eases out: most of the distance is covered early", () => {
    expect(countUpValue(1000, 0.3)).toBeGreaterThan(800);
  });
});

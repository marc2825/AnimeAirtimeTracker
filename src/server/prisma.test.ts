import { describe, expect, it } from "vitest";

import { normalizeSslMode } from "./prisma";

describe("normalizeSslMode", () => {
  it("states verify-full for the modes node-postgres already treats as verify-full", () => {
    for (const mode of ["require", "prefer", "verify-ca"]) {
      const url = new URL(normalizeSslMode(`postgresql://user:p%40ss@db.example:5432/app?sslmode=${mode}&channel_binding=require`));
      expect(url.searchParams.get("sslmode")).toBe("verify-full");
      expect(url.searchParams.get("channel_binding")).toBe("require");
      expect(url.password).toBe("p%40ss");
    }
  });

  it("leaves other URLs untouched", () => {
    const local = "postgresql://postgres:postgres@localhost:54320/app";
    expect(normalizeSslMode(local)).toBe(local);
    expect(normalizeSslMode("postgresql://u:p@h/db?sslmode=disable")).toBe("postgresql://u:p@h/db?sslmode=disable");
    expect(normalizeSslMode("not a url")).toBe("not a url");
  });
});

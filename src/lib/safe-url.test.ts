import { describe, expect, it } from "vitest";

import { safeExternalUrl } from "./safe-url";

describe("safeExternalUrl", () => {
  it("keeps absolute http and https URLs", () => {
    expect(safeExternalUrl("https://example.jp/anime/")).toBe("https://example.jp/anime/");
    expect(safeExternalUrl("http://example.jp")).toBe("http://example.jp/");
  });

  it("rejects other schemes, relative and protocol-relative paths, and malformed text", () => {
    for (const value of ["javascript:alert(1)", " JavaScript:alert(1)", "\tjava\nscript:alert(1)", "data:text/html,x", "vbscript:x", "mailto:a@example.jp", "file:///etc/hosts", "//example.jp/", "/about", "example.jp", "", null, undefined]) {
      expect(safeExternalUrl(value), String(value)).toBeNull();
    }
  });
});

/**
 * The only URLs rendered as outbound links: absolute http(s). Anything else (javascript:, data:, relative or
 * protocol-relative paths, malformed text) returns null, so a bad value in the data shows as text, not a link.
 * Sources are already checked at ingest (normalize.ts, overrides.ts); this is the last check before rendering.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
}

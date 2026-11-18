/**
 * Parsers for db.php XML responses. HTTP 200 does not imply success: `Result/Code` must be checked
 * (200 = OK, 400 = bad parameter, 404 = no data, 500 = server error). Rows that fail validation are
 * returned as `rejected` instead of aborting the batch, so one malformed record cannot block an import.
 */
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export class SyoboiResultError extends Error {
  constructor(
    readonly code: number | null,
    message: string
  ) {
    super(message);
    this.name = "SyoboiResultError";
  }
}

const ITEM_TAGS = new Set(["ChItem", "ChGroupItem", "TitleItem", "ProgItem"]);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  isArray: (tagName) => ITEM_TAGS.has(tagName)
});

export interface Rejected {
  reason: string;
  raw: unknown;
}

export interface ParseResult<T> {
  items: T[];
  rejected: Rejected[];
  /** Number of item elements in the response (before validation) — compared against the 5,000 row cap. */
  rowCount: number;
}

type RawRecord = Record<string, unknown>;

function parseEnvelope(xml: string, rootName: string, containerName: string, itemName: string): RawRecord[] {
  let document: Record<string, unknown>;
  try {
    document = parser.parse(xml) as Record<string, unknown>;
  } catch (error) {
    throw new SyoboiResultError(null, `Malformed XML: ${error instanceof Error ? error.message : String(error)}`);
  }
  const root = document[rootName] as RawRecord | undefined;
  if (!root || typeof root !== "object") {
    throw new SyoboiResultError(null, `Unexpected response: missing <${rootName}>`);
  }
  const result = root.Result as RawRecord | undefined;
  const code = Number(result?.Code);
  if (!Number.isFinite(code)) {
    throw new SyoboiResultError(null, "Unexpected response: missing Result/Code");
  }
  if (code === 404) {
    return [];
  }
  if (code !== 200) {
    throw new SyoboiResultError(code, `Syoboi Result/Code ${code}: ${String(result?.Message ?? "").trim() || "(no message)"}`);
  }
  const container = root[containerName] as RawRecord | undefined | "";
  if (!container || typeof container !== "object") {
    return [];
  }
  const items = container[itemName];
  return Array.isArray(items) ? (items as RawRecord[]) : [];
}

/** Coerce XML text: empty or whitespace-only → null. */
const text = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return null; // e.g. unexpected nested element
  const asString = String(value);
  return asString.trim() === "" ? null : asString;
}, z.string().nullable());

const requiredText = z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().min(1));

const optionalInt = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}, z.number().int().nullable());

const requiredId = z.preprocess((value) => String(value ?? "").trim(), z.string().regex(/^\d+$/));

const jstTimestamp = z.preprocess(
  (value) => String(value ?? "").trim(),
  z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
);

const optionalJstTimestamp = z.preprocess((value) => {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" || trimmed.startsWith("0000") ? null : trimmed;
}, z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).nullable());

export const syoboiChannelSchema = z.object({
  ChID: requiredId,
  ChName: requiredText,
  ChGID: text,
  ChURL: text,
  ChComment: text,
  ChNumber: text,
  LastUpdate: optionalJstTimestamp
});
export type SyoboiChannel = z.infer<typeof syoboiChannelSchema>;

export const syoboiChannelGroupSchema = z.object({
  ChGID: requiredId,
  ChGroupName: requiredText,
  ChGroupOrder: optionalInt
});
export type SyoboiChannelGroup = z.infer<typeof syoboiChannelGroupSchema>;

export const syoboiTitleSchema = z.object({
  TID: requiredId,
  Title: requiredText,
  ShortTitle: text,
  TitleYomi: text,
  TitleEN: text,
  Cat: optionalInt,
  TitleFlag: optionalInt,
  FirstYear: optionalInt,
  FirstMonth: optionalInt,
  FirstEndYear: optionalInt,
  FirstEndMonth: optionalInt,
  FirstCh: text,
  Comment: text,
  LastUpdate: optionalJstTimestamp
});
export type SyoboiTitle = z.infer<typeof syoboiTitleSchema>;

export const syoboiProgramSchema = z.object({
  PID: requiredId,
  TID: requiredId,
  ChID: requiredId,
  StTime: jstTimestamp,
  EdTime: jstTimestamp,
  StOffset: optionalInt,
  Count: text,
  SubTitle: text,
  ProgComment: text,
  Flag: optionalInt,
  Deleted: optionalInt,
  Warn: optionalInt,
  Revision: optionalInt,
  LastUpdate: optionalJstTimestamp
});
export type SyoboiProgram = z.infer<typeof syoboiProgramSchema>;

function validate<T>(rows: RawRecord[], schema: z.ZodType<T>): ParseResult<T> {
  const items: T[] = [];
  const rejected: Rejected[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      rejected.push({
        reason: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
        raw: row
      });
    }
  }
  return { items, rejected, rowCount: rows.length };
}

export function parseChLookup(xml: string): ParseResult<SyoboiChannel> {
  return validate(parseEnvelope(xml, "ChLookupResponse", "ChItems", "ChItem"), syoboiChannelSchema);
}

export function parseChGroupLookup(xml: string): ParseResult<SyoboiChannelGroup> {
  return validate(parseEnvelope(xml, "ChGroupLookupResponse", "ChGroupItems", "ChGroupItem"), syoboiChannelGroupSchema);
}

export function parseTitleLookup(xml: string): ParseResult<SyoboiTitle> {
  return validate(parseEnvelope(xml, "TitleLookupResponse", "TitleItems", "TitleItem"), syoboiTitleSchema);
}

export function parseProgLookup(xml: string): ParseResult<SyoboiProgram> {
  return validate(parseEnvelope(xml, "ProgLookupResponse", "ProgItems", "ProgItem"), syoboiProgramSchema);
}

/** ProgLookup returns at most this many rows; a response at the cap must be treated as truncated. */
export const PROG_LOOKUP_ROW_CAP = 5000;

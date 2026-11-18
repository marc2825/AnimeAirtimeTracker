/**
 * Manual corrections (data/overrides.json) and the curated slot registry (data/slots.json).
 * Both are reviewed in pull requests, so every change is attributable and reversible via git history.
 * Overrides are applied on top of source values at import/derive time; source values remain the basis
 * for change detection, so a correction never causes perpetual "changed" revisions.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const provenance = {
  reason: z.string().min(4),
  evidence: z.string().min(4),
  addedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
};

const broadcastOverride = z.object({
  externalId: z.string().regex(/^\d+$/),
  field: z.literal("isRerun"),
  value: z.boolean(),
  ...provenance
});

const titleOverride = z.discriminatedUnion("field", [
  z.object({ externalId: z.string().regex(/^\d+$/), field: z.literal("name"), value: z.string().min(1), ...provenance }),
  z.object({ externalId: z.string().regex(/^\d+$/), field: z.literal("seriesKey"), value: z.string().min(2).nullable(), ...provenance }),
  z.object({ externalId: z.string().regex(/^\d+$/), field: z.literal("officialUrl"), value: z.url().nullable(), ...provenance }),
  z.object({ externalId: z.string().regex(/^\d+$/), field: z.literal("sourceCategory"), value: z.number().int().nullable(), ...provenance })
]);

const slotMembershipOverride = z.object({
  slot: z.string().min(1),
  titleExternalId: z.string().regex(/^\d+$/),
  action: z.enum(["add", "remove"]),
  ...provenance
});

export const overridesFileSchema = z.object({
  $comment: z.string().optional(),
  broadcasts: z.array(broadcastOverride),
  titles: z.array(titleOverride),
  slotMemberships: z.array(slotMembershipOverride)
});

export type OverridesFile = z.infer<typeof overridesFileSchema>;
export type TitleOverride = z.infer<typeof titleOverride>;

export const slotRegistrySchema = z.object({
  $comment: z.string().optional(),
  slots: z.array(
    z
      .object({
        /** Label exactly as normalised from the source comment. */
        label: z.string().min(1),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        name: z.string().min(1),
        kind: z.enum(["OFFICIAL", "SOURCE_LABEL"]),
        description: z.string().optional(),
        evidenceUrl: z.url().optional()
      })
      .refine((entry) => entry.kind !== "OFFICIAL" || Boolean(entry.evidenceUrl), {
        message: "OFFICIAL slots require evidenceUrl"
      })
  )
});

export type SlotRegistry = z.infer<typeof slotRegistrySchema>;

const EMPTY_OVERRIDES: OverridesFile = { broadcasts: [], titles: [], slotMemberships: [] };

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadOverrides(dataDir = path.resolve("data")): Promise<OverridesFile> {
  const raw = await readJson(path.join(dataDir, "overrides.json"));
  return raw === null ? EMPTY_OVERRIDES : overridesFileSchema.parse(raw);
}

export async function loadSlotRegistry(dataDir = path.resolve("data")): Promise<SlotRegistry> {
  const raw = await readJson(path.join(dataDir, "slots.json"));
  return raw === null ? { slots: [] } : slotRegistrySchema.parse(raw);
}

/** Map TID → field → override value, last entry wins. */
export function indexTitleOverrides(overrides: OverridesFile): Map<string, Partial<Record<TitleOverride["field"], unknown>>> {
  const index = new Map<string, Partial<Record<TitleOverride["field"], unknown>>>();
  for (const entry of overrides.titles) {
    const current = index.get(entry.externalId) ?? {};
    current[entry.field] = entry.value;
    index.set(entry.externalId, current);
  }
  return index;
}

export function indexBroadcastOverrides(overrides: OverridesFile): Map<string, boolean> {
  return new Map(overrides.broadcasts.map((entry) => [entry.externalId, entry.value]));
}

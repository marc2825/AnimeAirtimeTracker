import { cacheLife, cacheTag } from "next/cache";

/** Call at the top of every `"use cache"` data function: 15-minute revalidation, purgeable via the "dataset" tag. */
export function datasetCacheProfile(): void {
  cacheLife("dataset");
  cacheTag("dataset");
}

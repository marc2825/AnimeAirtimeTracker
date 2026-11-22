import { createPrismaClient, type PrismaClient } from "./prisma";

const globalForDb = globalThis as unknown as { __prisma?: PrismaClient };

/**
 * Web queries finish in well under a second on the full dataset (measured 2026-11-22); anything slower is a
 * runaway that would pile up on the database's small compute, so the server cancels it.
 */
const WEB_STATEMENT_TIMEOUT_MS = 15_000;

/** Lazily created singleton (dev HMR safe). Never instantiated at build time unless a query runs. */
export function db(): PrismaClient {
  globalForDb.__prisma ??= createPrismaClient(undefined, { statementTimeoutMs: WEB_STATEMENT_TIMEOUT_MS });
  return globalForDb.__prisma;
}

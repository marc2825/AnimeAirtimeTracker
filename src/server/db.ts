import { createPrismaClient, type PrismaClient } from "./prisma";

const globalForDb = globalThis as unknown as { __prisma?: PrismaClient };

/** Lazily created singleton (dev HMR safe). Never instantiated at build time unless a query runs. */
export function db(): PrismaClient {
  globalForDb.__prisma ??= createPrismaClient();
  return globalForDb.__prisma;
}

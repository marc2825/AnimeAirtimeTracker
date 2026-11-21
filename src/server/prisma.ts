import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

export type { PrismaClient };

/**
 * node-postgres treats sslmode=prefer/require/verify-ca as verify-full and warns on every connection. State
 * verify-full explicitly: same behaviour, no warning (provider URLs such as Neon's use sslmode=require).
 */
export function normalizeSslMode(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get("sslmode");
    if (mode !== "prefer" && mode !== "require" && mode !== "verify-ca") return connectionString;
    url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  } catch {
    return connectionString;
  }
}

/** Create a Prisma client for the given connection string (CLI scripts and tests own their lifecycle). */
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example and docs/operations.md.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: normalizeSslMode(connectionString), max: 5 }) });
}

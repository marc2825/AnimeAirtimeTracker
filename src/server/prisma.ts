import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

export type { PrismaClient };

/** Create a Prisma client for the given connection string (CLI scripts and tests own their lifecycle). */
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example and docs/operations.md.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
}

/** Stored error of a failed run seeded into the E2E database; /status must never show any part of it. */
export const LEAKY_RUN_ERROR =
  'PrismaClientKnownRequestError: Can\'t reach database server at `ep-e2e-leak.example.neon.tech:5432` while running SELECT "id" FROM "Broadcast" (/home/runner/work/app/src/server/prisma.ts)';
export const LEAKY_FRAGMENTS = ["ep-e2e-leak", "neon.tech", 'SELECT "id"', "/home/runner"];

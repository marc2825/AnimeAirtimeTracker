import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection when the runtime goes through a pooler (Neon).
    // The placeholder keeps `prisma generate` working without a database (postinstall, CI build).
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder"
  }
});

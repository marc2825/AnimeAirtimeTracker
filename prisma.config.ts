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
    // Placeholder keeps `prisma generate` working without a database (postinstall, CI build).
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder"
  }
});

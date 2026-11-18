import { existsSync } from "node:fs";

// Vitest does not read .env; DB tests need TEST_DATABASE_URL from it locally (CI sets it explicitly).
if (existsSync(".env")) process.loadEnvFile(".env");

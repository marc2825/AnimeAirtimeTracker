import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts"]
        }
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          // DB tests share one database; run files serially.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000
        }
      }
    ]
  }
});

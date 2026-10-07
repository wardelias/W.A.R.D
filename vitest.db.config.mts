import { defineConfig } from "vitest/config";

// Database tests need a running local Supabase (`pnpm db:start`).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});

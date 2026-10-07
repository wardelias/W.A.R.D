import { defineConfig } from "vitest/config";

// Database tests need a running local Supabase (`pnpm db:start`).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/server-only.ts", "tests/integration/env.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/server-only.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**"],
      reporter: ["text", "html"],
    },
  },
});

import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Per-attempt ceiling: no single test may hang; slow external calls are
    // bounded by lib/fetchWithRetry.ts (3s timeout) well under this limit.
    testTimeout: 10000,
    // Deterministic replay: tests/replay/* fixtures assert shape while
    // normalizing dynamic timestamps (retrievedAt/checkedAt) — see
    // `mise run replay`. Flaky reruns are recorded in infra/flaky.json.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/api/**/*.ts", "components/**/*.tsx"],
      thresholds: { lines: 35, branches: 35 },
    },
  },
});

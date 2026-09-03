import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: {
    command: "npx next dev --port 3000",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: true,
    timeout: 30_000,
    env: { NODE_ENV: "development" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

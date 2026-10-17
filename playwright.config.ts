import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

const PORT = 3100;
const e2eDb = process.env.E2E_DATABASE_URL;

/**
 * End-to-end tests run against an isolated dev server: separate database, separate build
 * directory, the labelled mock AI provider, in-process worker and the test clock enabled.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx prisma migrate deploy && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL: e2eDb ?? "",
      NEXT_DIST_DIR: ".next-e2e",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      AI_PROVIDER: "mock",
      RUN_WORKER_IN_PROCESS: "true",
      ENABLE_TEST_CLOCK: "true",
      ENABLE_DEMO_TOOLS: "true",
      STORAGE_DIR: "./storage-e2e",
      OCR_LOCAL_ENABLED: "false",
    } as Record<string, string>,
  },
});

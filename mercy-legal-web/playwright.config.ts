import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_WEB_PORT || 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);
const workers = process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : isCI ? 2 : 4;
const webServerCommand = isCI
  ? `npm run build && npm run start -- --hostname 127.0.0.1 --port ${PORT}`
  : `node ./node_modules/next/dist/bin/next dev --turbopack --hostname 127.0.0.1 --port ${PORT}`;
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/support/global-teardown.ts",
  fullyParallel: true,
  workers,
  retries: isCI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: useExternalServer ? undefined : {
    command: webServerCommand,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MERCY_ENV: process.env.MERCY_ENV || "local",
      MERCY_AUTH_MODE: process.env.MERCY_AUTH_MODE || "dev",
      MERCY_API_TOKEN: process.env.MERCY_API_TOKEN || "playwright-local-token",
      MERCY_CORE_API_TOKEN: process.env.MERCY_CORE_API_TOKEN || process.env.MERCY_API_TOKEN || "playwright-local-token",
      MERCY_TENANT_ID: process.env.MERCY_TENANT_ID || "playwright-tenant",
      MERCY_USER_ID: process.env.MERCY_USER_ID || "playwright-user",
      MERCY_ROLES: process.env.MERCY_ROLES || "attorney",
      NEXT_PUBLIC_MERCY_TENANT_ID: process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "playwright-tenant",
      NEXT_PUBLIC_MERCY_USER_ID: process.env.NEXT_PUBLIC_MERCY_USER_ID || "playwright-user",
      NEXT_PUBLIC_MERCY_API_TOKEN: process.env.NEXT_PUBLIC_MERCY_API_TOKEN || "playwright-local-token",
      NEXT_PUBLIC_MERCY_CORE_API_URL: process.env.NEXT_PUBLIC_MERCY_CORE_API_URL || "http://127.0.0.1:8000",
      MERCY_CORE_API_URL: process.env.MERCY_CORE_API_URL || "http://127.0.0.1:8000",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
    gracefulShutdown: { signal: "SIGTERM", timeout: 500 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

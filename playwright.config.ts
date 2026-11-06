import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    actionTimeout: 30000,
    baseURL: "http://127.0.0.1:3001",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node --import tsx tests/supabase-emulator.ts",
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        "npm run build && npm run start -- --hostname 127.0.0.1 --port 3001",
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3001",
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      url: "http://127.0.0.1:3001/events",
      reuseExistingServer: false,
      timeout: 180000,
    },
  ],
});

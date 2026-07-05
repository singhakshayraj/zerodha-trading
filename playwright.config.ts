import { defineConfig } from "@playwright/test";

// Local run (default): spins up `npm run dev`. NOTE: the mock validation
// suite needs SIM_SUPABASE_* vars, which only exist on Vercel — run it
// against the deployment instead:
//   E2E_BASE_URL=https://zerodha-trading-liard.vercel.app npx playwright test
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isLocal = baseURL.includes("localhost");

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000, // validation suite includes a 40s poll window + real reload
  fullyParallel: false, // suite mutates staging state; keep runs serialized
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: isLocal
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      }
    : undefined,
});

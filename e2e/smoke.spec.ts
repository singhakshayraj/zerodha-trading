import { test, expect } from "@playwright/test";

// Read-only smoke checks + the full mock validation suite.
// NEVER presses START on the real /trading page — that would create a
// session against the prod brain. Mock pages hit the staging Supabase
// project and are safe to drive.

test.describe("pages load", () => {
  test("home redirects to /connect", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/connect/);
  });

  test("real trading dashboard renders", async ({ page }) => {
    await page.goto("/trading");
    await expect(page.getByRole("heading", { name: "Auto Trade" })).toBeVisible();
  });

  test("mock dashboard renders with MOCK banner", async ({ page }) => {
    await page.goto("/mock/trading");
    await expect(page.getByText(/MOCK ENVIRONMENT/i).first()).toBeVisible();
  });

  test("validations page renders with MOCK banner", async ({ page }) => {
    await page.goto("/mock/validations");
    await expect(page.getByText(/MOCK ENVIRONMENT/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Run Validations" })).toBeVisible();
  });
});

test.describe("API health", () => {
  test("prod Supabase reachable via /api/db/health", async ({ request }) => {
    const res = await request.get("/api/db/health");
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).connected).toBe(true);
  });

  test("brain heartbeat alive via /api/brain/status", async ({ request }) => {
    const res = await request.get("/api/brain/status", {
      headers: { "x-enc-token": "e2e-smoke" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Railway brain pings every 30s; anything but OFFLINE with a recent
    // ping means the deployed brain is up.
    expect(body.status).not.toBe("OFFLINE");
    expect(body.isAlive).toBe(true);
  });
});

test.describe("mock validation suite", () => {
  test("all 7 steps pass end-to-end (incl. real reload)", async ({ page }) => {
    await page.goto("/mock/validations");
    await page.getByRole("button", { name: "Run Validations" }).click();

    // Steps A-D run (C polls up to 40s), then the app itself reloads the
    // page (step E) and F/G resume from sessionStorage. Wait through all
    // of it for the final verdict line.
    const verdict = page.getByText(/ALL CHECKS PASSED|FAILURES DETECTED/);
    await expect(verdict).toBeVisible({ timeout: 150_000 });
    await expect(verdict).toHaveText(/ALL CHECKS PASSED/);
  });
});

import { test, expect } from "@playwright/test";

// Realistic control-plane scenarios beyond the basic happy path in
// control-plane.spec.ts. Each of these mirrors something that can actually
// happen during the month-long unattended run: the brain hits its own limit
// and ends itself, someone refreshes the dashboard mid-session, someone
// clicks Stop then Start again in a hurry. Only runs against the QA stack
// (real dashboard + QA-mode brain + sim Supabase) — see scripts/qa-stack.sh.

test.describe("QA scenarios (QA stack)", () => {
  test.skip(process.env.QA_STACK !== "1", "run via scripts/qa-stack.sh");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("enc_token", "qa-e2e-token");
    });
  });

  test("session self-ends when max trades hit — no manual Stop needed", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/trading");
    await expect(page.getByText(/Brain (ONLINE|RUNNING)/)).toBeVisible({ timeout: 60_000 });

    // Max trades = 1 so the synthetic market's aggressive signals hit the
    // limit almost immediately — this exercises check_session_limits'
    // MAX_TRADES_HIT path ending the session from inside the brain, not
    // from a dashboard click.
    await page.getByRole("spinbutton").nth(3).fill("1");

    const startBtn = page.getByRole("button", { name: "Start Auto Trade" });
    await expect(startBtn).toBeEnabled({ timeout: 30_000 });
    await startBtn.click();
    await page.getByRole("button", { name: "Confirm & Start" }).click();

    await expect(page.getByText("running", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });

    // No Stop click anywhere in this test — the brain ends it, the poll's
    // 60s-grace "session vanished" branch (app/trading/page.tsx) detects
    // active_session_id clearing and flips the UI to "stopped" on its own.
    await expect(page.getByText("stopped", { exact: true }).first()).toBeVisible({
      timeout: 150_000,
    });

    await page.getByRole("button", { name: "Reset Session" }).click();
    await expect(page.getByText("idle", { exact: true }).first()).toBeVisible();
  });

  test("page refresh mid-session restores the running state, not /connect", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/trading");
    await expect(page.getByText(/Brain (ONLINE|RUNNING)/)).toBeVisible({ timeout: 60_000 });

    const startBtn = page.getByRole("button", { name: "Start Auto Trade" });
    await expect(startBtn).toBeEnabled({ timeout: 30_000 });
    await startBtn.click();
    await page.getByRole("button", { name: "Confirm & Start" }).click();
    await expect(page.getByText("running", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });

    // Let at least one cycle land so there's a trade count to preserve
    await expect(page.getByText(/Analyzing|Signal:/).first()).toBeVisible({ timeout: 120_000 });
    const tradesBefore = await page.locator("text=/^\\d+ \\/ /").first().textContent();

    // Regression guard for the 2026-07-06 redirect-race bug: a hard reload
    // of /trading with a valid stored token must NOT bounce to /connect.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Auto Trade" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).not.toHaveURL(/\/connect/);

    // Session-restore branch (poll sees sessionId + status idle on mount)
    // must flip back to "running", not leave the page thinking it's idle.
    await expect(page.getByText("running", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    const tradesAfter = await page.locator("text=/^\\d+ \\/ /").first().textContent();
    expect(tradesAfter).toBeTruthy();
    if (tradesBefore) {
      const before = parseInt(tradesBefore.split("/")[0].trim(), 10);
      const after = parseInt((tradesAfter as string).split("/")[0].trim(), 10);
      expect(after).toBeGreaterThanOrEqual(before);
    }

    // Cleanup
    await page.getByRole("button", { name: "Stop Trading" }).click();
    await page.getByRole("button", { name: "Stop & Square Off" }).click();
    await expect(page.getByText("stopped", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });
    await page.getByRole("button", { name: "Reset Session" }).click();
  });

  test("rapid Stop then Start doesn't leave a stuck or duplicate session", async ({ page }) => {
    test.setTimeout(180_000);

    // Regression guard for the 2026-07-06 ghost-session race: a STOP
    // immediately followed by a START used to get lost because brain_status
    // is a single mutable key the brain only polled every 5 minutes. Fixed
    // by 10s-slice polling + the active_session_id re-verification.
    await page.goto("/trading");
    await expect(page.getByText(/Brain (ONLINE|RUNNING)/)).toBeVisible({ timeout: 60_000 });

    const startBtn = page.getByRole("button", { name: "Start Auto Trade" });
    await expect(startBtn).toBeEnabled({ timeout: 30_000 });
    await startBtn.click();
    await page.getByRole("button", { name: "Confirm & Start" }).click();
    await expect(page.getByText("running", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });

    // Stop, then immediately Start again — no waiting for the 10s command
    // slice to land, deliberately racing it.
    await page.getByRole("button", { name: "Stop Trading" }).click();
    await page.getByRole("button", { name: "Stop & Square Off" }).click();
    await page.getByRole("button", { name: "Reset Session" }).click();

    const startBtn2 = page.getByRole("button", { name: "Start Auto Trade" });
    await expect(startBtn2).toBeEnabled({ timeout: 15_000 });
    await startBtn2.click();
    await page.getByRole("button", { name: "Confirm & Start" }).click();

    await expect(page.getByText("running", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });

    // Poll /trades/live twice, a few seconds apart, and require a single
    // stable session id — a ghost/duplicate session would show as flapping
    // ids or the UI stuck on the old one while the brain trades a new one.
    const first = await page.request.get("/api/trades/live");
    const firstBody = await first.json();
    await page.waitForTimeout(5000);
    const second = await page.request.get("/api/trades/live");
    const secondBody = await second.json();

    expect(firstBody.sessionId).toBeTruthy();
    expect(firstBody.sessionId).toBe(secondBody.sessionId);

    // Cleanup
    await page.getByRole("button", { name: "Stop Trading" }).click();
    await page.getByRole("button", { name: "Stop & Square Off" }).click();
    await expect(page.getByText("stopped", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });
    await page.getByRole("button", { name: "Reset Session" }).click();
  });
});

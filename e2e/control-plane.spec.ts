import { test, expect } from "@playwright/test";

// Control-plane rehearsal: drives the REAL Start/Stop buttons against the
// QA stack (sim Supabase + QA-mode brain with a synthetic market). This is
// the test that could have caught every shakedown-day bug: lost STOP,
// duplicate sessions, ignored universe toggle, stale session pointers.
//
// Only runs inside scripts/qa-stack.sh (QA_STACK=1) — it presses START,
// which must never happen against prod.

test.describe("control plane (QA stack)", () => {
  test.skip(process.env.QA_STACK !== "1", "run via scripts/qa-stack.sh");

  test("start → brain trades → stop → clean idle", async ({ page }) => {
    test.setTimeout(300_000);

    // Bypass /connect: the store treats a stored token as connected.
    // QA brain never uses it (FakeKiteClient).
    await page.addInitScript(() => {
      localStorage.setItem("enc_token", "qa-e2e-token");
    });

    await page.goto("/trading");
    await expect(page.getByRole("heading", { name: "Auto Trade" })).toBeVisible();

    // Brain heartbeat must be live before Start enables. The header renders
    // as one flattened text node: "idle Brain ONLINE · 1s ago Waiting for…"
    await expect(page.getByText(/Brain (ONLINE|RUNNING)/)).toBeVisible({ timeout: 60_000 });

    const startBtn = page.getByRole("button", { name: "Start Auto Trade" });
    await expect(startBtn).toBeEnabled({ timeout: 30_000 });
    await startBtn.click();
    await page.getByRole("button", { name: "Confirm & Start" }).click();

    // Brain picks up START within ~30s (idle loop) and creates the session;
    // the poll then flips the UI to running. The status badge's raw DOM/
    // accessible text is lowercase ("running") — only styled uppercase via
    // CSS text-transform — so match case-insensitively.
    await expect(page.getByText("running", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });

    // Synthetic market + first cycle runs immediately → brain activity and
    // (usually) trades within one cycle. Assert activity feed fills.
    await expect(page.getByText(/Analyzing|Signal:/).first()).toBeVisible({
      timeout: 120_000,
    });

    // Stop: brain polls commands in 10s slices → session ends within ~60s.
    // Stopping is a two-step UX by design: the store flips to "stopped"
    // immediately (a terminal summary state, shown in red) and stays there
    // until the user explicitly dismisses it via "Reset Session" — it does
    // NOT auto-return to "idle" on its own.
    await page.getByRole("button", { name: "Stop Trading" }).click();
    await page.getByRole("button", { name: "Stop & Square Off" }).click();

    await expect(page.getByText("stopped", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });
    await page.getByRole("button", { name: "Reset Session" }).click();
    await expect(page.getByText("idle", { exact: true }).first()).toBeVisible();
  });
});

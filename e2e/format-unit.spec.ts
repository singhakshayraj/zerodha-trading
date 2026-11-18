import { test, expect } from "@playwright/test";
import { inr } from "../lib/format";

// Shared ₹ formatter — pure, no server.
test("defaults: whole rupees, Indian grouping, true minus", () => {
  expect(inr(1234567)).toBe("₹12,34,567");
  expect(inr(-2500.6)).toBe("−₹2,501");
  expect(inr(null)).toBe("—");
  expect(inr(undefined)).toBe("—");
});

test("decimals, fixed and signed", () => {
  expect(inr(12.5, { dp: 2 })).toBe("₹12.5");
  expect(inr(12.5, { dp: 2, fixed: true })).toBe("₹12.50");
  expect(inr(300, { signed: true })).toBe("+₹300");
  expect(inr(0, { signed: true })).toBe("₹0");
});

test("a value that rounds to zero carries no minus", () => {
  expect(inr(-0.3)).toBe("₹0");
});

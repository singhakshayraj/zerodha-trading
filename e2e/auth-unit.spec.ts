import { test, expect } from "@playwright/test";
import { gate } from "../lib/basicAuth";

// Dashboard password gate — pure decision, no server.
const b = (s: string) => "Basic " + Buffer.from(s).toString("base64");

test("right password passes, any username", () => {
  expect(gate(b("me:s3cret"), "s3cret", "production")).toBe("allow");
  expect(gate(b("anything:s3cret"), "s3cret", "production")).toBe("allow");
});

test("wrong, missing or malformed credentials are challenged", () => {
  expect(gate(b("me:nope"), "s3cret", "production")).toBe("challenge");
  expect(gate(null, "s3cret", "production")).toBe("challenge");
  expect(gate("Bearer xyz", "s3cret", "production")).toBe("challenge");
  expect(gate("Basic !!!not-base64", "s3cret", "production")).toBe("challenge");
});

test("password with a colon still works", () => {
  expect(gate(b("me:a:b:c"), "a:b:c", "production")).toBe("allow");
});

test("no password configured: locked on Vercel, open locally", () => {
  expect(gate(null, undefined, "production")).toBe("locked");
  expect(gate(null, "", "preview")).toBe("locked");
  expect(gate(null, undefined, undefined)).toBe("allow");     // local next dev / e2e
});

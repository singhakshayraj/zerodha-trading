import { test, expect } from "@playwright/test";
import { gate, safeNext, sessionToken } from "../lib/auth";

// Dashboard password gate — pure decision, no server.
const b = (s: string) => "Basic " + Buffer.from(s).toString("base64");
const base = { cookie: null, header: null, password: "s3cret", vercelEnv: "production" };

test("signed-in cookie passes; wrong or missing cookie goes to the login page", async () => {
  const token = await sessionToken("s3cret");
  expect(gate({ ...base, cookie: token, token })).toBe("allow");
  expect(gate({ ...base, cookie: "forged", token })).toBe("login");
  expect(gate({ ...base, token })).toBe("login");
});

test("changing the password signs every device out", async () => {
  const old = await sessionToken("s3cret");
  expect(old).toMatch(/^[0-9a-f]{64}$/);
  expect(gate({ ...base, password: "n3w", cookie: old, token: await sessionToken("n3w") })).toBe("login");
});

test("scripts may still send HTTP Basic (any username); bad headers go to login", async () => {
  const token = await sessionToken("s3cret");
  expect(gate({ ...base, header: b("e2e:s3cret"), token })).toBe("allow");
  expect(gate({ ...base, header: b("me:a:b:c"), password: "a:b:c", token: await sessionToken("a:b:c") })).toBe("allow");
  expect(gate({ ...base, header: b("me:nope"), token })).toBe("login");
  expect(gate({ ...base, header: "Basic !!!not-base64", token })).toBe("login");
  expect(gate({ ...base, header: "Bearer xyz", token })).toBe("login");
});

test("no password configured: locked on Vercel, open locally", () => {
  expect(gate({ ...base, password: undefined, token: "" })).toBe("locked");
  expect(gate({ ...base, password: "", vercelEnv: "preview", token: "" })).toBe("locked");
  expect(gate({ ...base, password: undefined, vercelEnv: undefined, token: "" })).toBe("allow"); // local next dev / e2e
});

test("after sign-in, only same-site paths are followed", () => {
  expect(safeNext("/advisor?x=1")).toBe("/advisor?x=1");
  expect(safeNext(null)).toBe("/");
  expect(safeNext("https://evil.example")).toBe("/");
  expect(safeNext("//evil.example")).toBe("/");
  expect(safeNext("/\\evil.example")).toBe("/");
});

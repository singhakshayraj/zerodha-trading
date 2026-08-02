# Credential rotation runbook (P-04)

_Audit + steps, 2026-08-03. Owner: **you** (the actual rotation needs BotFather /
the Supabase dashboard); I did the audit + verification below._

## Audit result — the repos and DB are clean

- **No secret was ever committed** to either repo (code or full git history):
  scanned for JWT-shaped keys and Telegram-token-shaped strings across all
  tracked files and all history — zero hits. Only `.env.*.example` placeholders
  are tracked.
- **RLS is airtight** (verified against prod `gilmuwmtdpjccibfhqtx`):
  - Sensitive tables — `app_config` (holds enc_token), `trades`,
    `trading_sessions`, `brain_heartbeat` — are RLS-on with a single
    `Service role full access` policy scoped to `{service_role}` only.
  - `portfolio_advice` + the rest are RLS-on with **no policy = deny-all**.
  - Security advisor shows only INFO `rls_enabled_no_policy` notices (that's
    deny-by-default, i.e. secure) — **no** `rls_disabled` errors anywhere.

So the only real exposure was **runtime** (the Telegram bot token appeared in
Railway logs before the 07-27 scrub). That's the one credential to rotate.

## 1. Telegram bot token — ROTATE (the one real action)

Used only by the brain (`TELEGRAM_BOT_TOKEN`; brain-only, dashboard doesn't use
it). `TELEGRAM_CHAT_ID` is not a secret.

1. Telegram → **@BotFather** → `/mybots` → pick the bot → **API Token** →
   **Revoke current token**. A new token is issued; the old one dies instantly.
2. Set it on the brain service (market closed, so a restart is fine):
   ```
   railway variables --set "TELEGRAM_BOT_TOKEN=<new-token>" --service zerodha-brain
   ```
   (or Railway dashboard → zerodha-brain → Variables). Railway restarts the
   service on the change.
3. Verify: run `scripts/grade_advice.py`'s digest path or wait for the next
   advisor digest, and confirm a message lands in the chat.

## 2. Supabase anon key — rotation is UNNECESSARY (safe to skip)

The anon/publishable key is **designed to be public** (it ships to browsers).
It's only dangerous with weak RLS — and RLS here is airtight (§audit), so the
anon key is effectively inert: it can't read or write any table. Rotating it is
not a security win.

If you still want to for peace of mind, know the cost: for legacy JWT keys,
rotating the anon key means **regenerating the project JWT secret**, which also
invalidates the `service_role` key and every existing token — you'd then have to
update `SUPABASE_SERVICE_KEY` on Railway (brain) and any dashboard server env in
the same change. High disruption, ~zero benefit. **Recommendation: skip.**

## 3. Supabase service_role key — rotate only on suspected exposure

Server-side only (`SUPABASE_SERVICE_KEY` in the brain's Railway env). Never in
code, git history, or logs. No evidence of exposure → leave it. If you ever
suspect it leaked, rotate via Supabase dashboard → Project Settings → API (new
secret-key projects allow per-key rotation; legacy JWT projects require the JWT
secret regen described in §2), then update the Railway var.

## Bottom line
Rotate **the Telegram token** (§1). Skip the anon key (§2). Leave service_role
unless you have a reason (§3). After the Telegram rotation, this item is done.

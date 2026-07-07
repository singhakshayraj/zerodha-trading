#!/usr/bin/env bash
# Chaos drill (ENGINEERING_SPEC REQ-083): enc_token expires mid-session.
#
# Before the propagation fix, an expired token was swallowed by
# market_data's blanket excepts → universal empty-candle SKIPs → the brain
# kept "running" with zero trades forever (silent stall, VISION gate #4).
# Now it must: propagate to the cycle handler → end the session cleanly →
# leave a durable token_incident flag the watchdog alerts on and consumes.
#
# Drives the real brain with QA_FAULT=token_expiry@N (qa_market injects a
# TokenExpiredError on the Nth market-data fetch), then asserts the session
# ended and the durable flag is present.
#
# Usage:  ./scripts/qa-scenario-token-expiry.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BRAIN_DIR="${BRAIN_DIR:-../zerodha-brain}"
PORT="${QA_PORT:-3103}"

[ -f .env.qa ] || { echo "Missing .env.qa — copy .env.qa.example and fill sim keys"; exit 1; }
[ -d "$BRAIN_DIR" ] || { echo "Brain repo not found at $BRAIN_DIR (set BRAIN_DIR)"; exit 1; }

set -a; . ./.env.qa; set +a

BRAIN_LOG=/tmp/qa-brain-token-expiry.log
: > "$BRAIN_LOG"

echo "[scenario] Starting dashboard on :$PORT (sim env)…"
npx next dev -p "$PORT" > /tmp/qa-dashboard-token-expiry.log 2>&1 &
DASH_PID=$!

# Inject token expiry a few fetches in, so the session opens + trades at
# least one cycle before the token dies (realistic mid-session expiry).
(
  cd "$BRAIN_DIR"
  exec env QA_MODE=true PAPER_TRADING=true QA_FAULT="token_expiry@40" \
    SUPABASE_URL="$SIM_SUPABASE_URL" \
    SUPABASE_SERVICE_KEY="$SIM_SUPABASE_SERVICE_KEY" \
    python3 -u main.py
) >> "$BRAIN_LOG" 2>&1 &
BRAIN_PID=$!

cleanup() {
  echo "[scenario] Cleaning up (brain=${BRAIN_PID:-none} dash=$DASH_PID)"
  kill "${BRAIN_PID:-}" "$DASH_PID" 2>/dev/null || true
  sleep 1
  kill -9 "${BRAIN_PID:-}" "$DASH_PID" 2>/dev/null || true
  pkill -9 -f "next dev -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "[scenario] Waiting for dashboard…"
for i in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/api/db/health" >/dev/null && break
  sleep 2
done

# Known-idle control plane, and clear any stale incident flag.
curl -s -X POST "http://localhost:$PORT/api/trade/stop" -H "x-enc-token: qa" -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1 || true
curl -s -X POST "$SIM_SUPABASE_URL/rest/v1/app_config" \
  -H "apikey: $SIM_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SIM_SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d '{"key":"token_incident","value":""}' >/dev/null 2>&1 || true

echo "[scenario] Kicking off a session…"
curl -s -X POST "http://localhost:$PORT/api/trade/start" \
  -H "Content-Type: application/json" -H "x-enc-token: qa" \
  -d '{"config":{"capital":25000,"maxTrades":25,"maxLossPct":5,"maxProfitPct":15,"intervalMinutes":5,"mode":"market"}}' \
  >/dev/null

echo "[scenario] Waiting ~70s for the session to open, trade, then hit the injected expiry…"
sleep 70

# 1) brain logged the expiry + session end
if grep -q "Token expired" "$BRAIN_LOG"; then
  echo "[scenario] Brain detected token expiry:"
  grep "Token expired" "$BRAIN_LOG" | head -1
else
  echo "[scenario] FAIL — brain never detected the injected token expiry; check $BRAIN_LOG"
  exit 1
fi

# 2) durable token_incident flag is present (this is what the watchdog alerts on)
INCIDENT=$(curl -s "$SIM_SUPABASE_URL/rest/v1/app_config?key=eq.token_incident&select=value" \
  -H "apikey: $SIM_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SIM_SUPABASE_SERVICE_KEY" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print((d[0]['value'] if d else '').strip())")

if [ -n "$INCIDENT" ]; then
  echo "[scenario] Durable token_incident flag set: $INCIDENT"
else
  echo "[scenario] FAIL — no durable token_incident flag; watchdog would not alert"
  exit 1
fi

# 3) session no longer active (clean end, not a stall)
ACTIVE=$(curl -s "$SIM_SUPABASE_URL/rest/v1/app_config?key=eq.active_session_id&select=value" \
  -H "apikey: $SIM_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SIM_SUPABASE_SERVICE_KEY" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print((d[0]['value'] if d else '').strip())")

if [ -z "$ACTIVE" ]; then
  echo "[scenario] PASS — token expiry ended the session cleanly + left a durable incident, no silent stall"
  exit 0
else
  echo "[scenario] FAIL — active_session_id still set ($ACTIVE); session did not end"
  exit 1
fi

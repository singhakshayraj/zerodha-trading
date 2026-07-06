#!/usr/bin/env bash
# Scenario: brain process restarts mid-session (Railway redeploy, crash,
# host maintenance) — the single most realistic failure mode for a month-
# long unattended run. Regression guard for zerodha-brain 9b64f9b: before
# that fix, a restarted brain either duplicated the session or, worse,
# silently abandoned it (trading_sessions stuck RUNNING forever, dashboard
# still showing it as active, zero new trades — see VISION.md gate #4).
#
# Not a Playwright test: this drives the brain process itself (kill +
# restart), which is simpler done from the shell than from a browser.
#
# Prereqs: same as scripts/qa-stack.sh (.env.qa filled, zerodha-brain sibling).
# Usage:  ./scripts/qa-scenario-brain-restart.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BRAIN_DIR="${BRAIN_DIR:-../zerodha-brain}"
PORT="${QA_PORT:-3102}"

[ -f .env.qa ] || { echo "Missing .env.qa — copy .env.qa.example and fill sim keys"; exit 1; }
[ -d "$BRAIN_DIR" ] || { echo "Brain repo not found at $BRAIN_DIR (set BRAIN_DIR)"; exit 1; }

set -a; . ./.env.qa; set +a

BRAIN_LOG=/tmp/qa-brain-restart.log
: > "$BRAIN_LOG"

start_brain() {
  # `exec` makes the subshell's PID equal python3's PID — without it,
  # `kill $BRAIN_PID` only signals the bash wrapper and python3 (the
  # non-exec'd last command) survives as an orphan. This scenario kills and
  # restarts the brain deliberately, so the bug bites hardest here: every
  # earlier iteration left an orphan still writing to the sim project,
  # which is what actually caused this scenario's confusing early failures.
  (
    cd "$BRAIN_DIR"
    exec env QA_MODE=true PAPER_TRADING=true \
      SUPABASE_URL="$SIM_SUPABASE_URL" \
      SUPABASE_SERVICE_KEY="$SIM_SUPABASE_SERVICE_KEY" \
      python3 -u main.py
  ) >> "$BRAIN_LOG" 2>&1 &
  echo $!
}

echo "[scenario] Starting dashboard on :$PORT (sim env)…"
npx next dev -p "$PORT" > /tmp/qa-dashboard-restart.log 2>&1 &
DASH_PID=$!

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

# Defensive: clear any stale brain_status/active_session_id from a prior
# run so this scenario starts from a known-idle control plane.
curl -s -X POST "http://localhost:$PORT/api/trade/stop" -H "x-enc-token: qa" -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1 || true

echo "[scenario] Starting brain (first process)…"
BRAIN_PID=$(start_brain)
sleep 8

echo "[scenario] Kicking off a session via /api/trade/start…"
curl -s -X POST "http://localhost:$PORT/api/trade/start" \
  -H "Content-Type: application/json" -H "x-enc-token: qa" \
  -d '{"config":{"capital":25000,"maxTrades":25,"maxLossPct":5,"maxProfitPct":15,"intervalMinutes":5,"mode":"market"}}' \
  >/dev/null

echo "[scenario] Waiting ~40s for the brain to create the session and trade…"
# The outer loop's idle branch sleeps 30s between command polls, so give it
# a full cycle plus margin rather than racing the poll interval.
sleep 40

SESSION_ID=$(curl -s "http://localhost:$PORT/api/trades/live" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sessionId') or '')")
if [ -z "$SESSION_ID" ]; then
  echo "[scenario] FAIL — no active session before restart; brain never started trading"
  exit 1
fi
echo "[scenario] Session before restart: $SESSION_ID"

# 'Z' suffix, not '+00:00' — a literal '+' in a GET query string gets
# decoded as a space by curl/PostgREST, silently corrupting the timestamp
# filter into a Postgres error. That error object (4 JSON keys: code,
# details, hint, message) got counted by `len()` as "4 new sessions" the
# first time this ran — a false positive, not a real duplicate.
RESTART_TS=$(python3 -c "import datetime; print(datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'))")

echo "[scenario] Killing brain (simulating a Railway redeploy mid-session)…"
kill "$BRAIN_PID"
wait "$BRAIN_PID" 2>/dev/null || true

echo "[scenario] Restarting brain (fresh process, same env)…"
BRAIN_PID=$(start_brain)

echo "[scenario] Waiting ~25s for the restarted brain to resume…"
sleep 25

if grep -q "Resuming existing RUNNING session" "$BRAIN_LOG"; then
  echo "[scenario] Restart log confirms resume path was taken:"
  grep "Resuming existing RUNNING session" "$BRAIN_LOG"
else
  echo "[scenario] FAIL — restarted brain never logged a resume; check $BRAIN_LOG"
  exit 1
fi

# The real invariant: no SECOND session row appears after the restart. The
# resumed session may legitimately end on its own afterward (max loss/profit/
# trades hit) — that's normal operation, not a regression, so we don't
# require it to still be RUNNING when we check.
NEW_SESSIONS=$(curl -s "$SIM_SUPABASE_URL/rest/v1/trading_sessions?select=id,status&created_at=gte.${RESTART_TS}&id=neq.${SESSION_ID}" \
  -H "apikey: $SIM_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SIM_SUPABASE_SERVICE_KEY" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
if not isinstance(d, list):
    print(f'ERROR: expected a list, got {d}', file=sys.stderr)
    sys.exit(1)
print(len(d))
")

echo "[scenario] New sessions created after restart (excluding the resumed one): $NEW_SESSIONS"

FAIL=0
if [ "$NEW_SESSIONS" -ne 0 ]; then
  echo "[scenario] FAIL — restart created $NEW_SESSIONS extra session(s) instead of resuming (duplicate-session bug)"
  FAIL=1
fi

echo "[scenario] Stopping session (harmless no-op if it already self-ended)…"
curl -s -X POST "http://localhost:$PORT/api/trade/stop" -H "x-enc-token: qa" -H "Content-Type: application/json" -d '{}' >/dev/null
sleep 12

if [ "$FAIL" -eq 0 ]; then
  echo "[scenario] PASS — brain restart resumed the same session, no duplicate, no silent abandonment"
  exit 0
else
  exit 1
fi

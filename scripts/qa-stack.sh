#!/usr/bin/env bash
# Off-hours QA rehearsal of the FULL stack: real dashboard + real brain
# (QA_MODE synthetic market) + sim Supabase. Drives the actual START/STOP
# control plane with Playwright — the seams that broke on shakedown day.
#
# Prereqs:
#   - .env.qa exists (copy .env.qa.example, fill sim keys)
#   - zerodha-brain checked out as a sibling directory
#
# Usage:  ./scripts/qa-stack.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BRAIN_DIR="${BRAIN_DIR:-../zerodha-brain}"
PORT="${QA_PORT:-3100}"

[ -f .env.qa ] || { echo "Missing .env.qa — copy .env.qa.example and fill sim keys"; exit 1; }
[ -d "$BRAIN_DIR" ] || { echo "Brain repo not found at $BRAIN_DIR (set BRAIN_DIR)"; exit 1; }

set -a; . ./.env.qa; set +a

# Reset sim control-plane state so a previous run can't bleed in
echo "[qa-stack] Starting brain (QA_MODE, sim Supabase)…"
# `exec` replaces the subshell's process image with python3 itself, so its
# PID IS python3's PID. Without it, `kill $BRAIN_PID` only signals the bash
# subshell — python3 (the last command, not exec'd) survives as an orphan
# that keeps polling/writing to the sim project. Found the hard way: 10
# orphaned brain processes accumulated from a night of iterating on this
# script, all silently corrupting each other's runs via shared DB state.
(
  cd "$BRAIN_DIR"
  exec env QA_MODE=true PAPER_TRADING=true \
    SUPABASE_URL="$SIM_SUPABASE_URL" \
    SUPABASE_SERVICE_KEY="$SIM_SUPABASE_SERVICE_KEY" \
    python3 -u main.py
) > /tmp/qa-brain.log 2>&1 &
BRAIN_PID=$!

echo "[qa-stack] Starting dashboard on :$PORT (sim env)…"
npx next dev -p "$PORT" > /tmp/qa-dashboard.log 2>&1 &
DASH_PID=$!

cleanup() {
  echo "[qa-stack] Cleaning up (brain=$BRAIN_PID dash=$DASH_PID)"
  kill "$BRAIN_PID" "$DASH_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$BRAIN_PID" "$DASH_PID" 2>/dev/null || true
  # next dev spawns its own child process tree under the npx wrapper PID;
  # belt-and-suspenders in case any survive on this port.
  pkill -9 -f "next dev -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "[qa-stack] Waiting for dashboard…"
for i in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/api/db/health" >/dev/null && break
  sleep 2
done

echo "[qa-stack] Running control-plane + scenario E2E…"
QA_STACK=1 E2E_BASE_URL="http://localhost:$PORT" npx playwright test \
  e2e/control-plane.spec.ts e2e/qa-scenarios.spec.ts
echo "[qa-stack] DONE — logs: /tmp/qa-brain.log /tmp/qa-dashboard.log"
echo "[qa-stack] Brain-restart scenario runs separately: ./scripts/qa-scenario-brain-restart.sh"

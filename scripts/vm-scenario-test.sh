#!/usr/bin/env bash
# Functional scenario test: writes a session with tabs in main/work/waste
# (waste active), restarts, and verifies the waste tab came back parked while
# the others lazy-restored and the active tab loaded.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rm -rf ~/.neutrino   # fresh profile

echo "=== phase 1: write session ==="
NEUTRINO_SCENARIO=write bash "$ROOT/scripts/vm-run.sh" 45 2>/dev/null | grep -a SCENARIO

echo "=== phase 2: restart & verify ==="
NEUTRINO_SCENARIO=read bash "$ROOT/scripts/vm-run.sh" 45 2>/dev/null | grep -aA30 SCENARIO_READ

echo "expected: waste tab parked=true live=false; others parked=false; active live=true"

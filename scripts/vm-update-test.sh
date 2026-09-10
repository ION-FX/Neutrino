#!/usr/bin/env bash
# E2E self-update test: launches the INSTALLED Neutrino (~/.local/share/neutrino)
# under Xvfb with NEUTRINO_SCENARIO=update-test and reports the result.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VMROOT="$ROOT/scripts/.vm-root"
export LD_LIBRARY_PATH="$VMROOT/usr/lib/x86_64-linux-gnu:$VMROOT/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
export FONTCONFIG_PATH="$VMROOT/etc/fonts"
export PATH="$VMROOT/usr/bin:$PATH"

pkill -9 -x Xvfb 2>/dev/null || true
pkill -9 -x electron 2>/dev/null || true
rm -f /tmp/.X98-lock /tmp/.X11-unix/X98
mkdir -p /tmp/xxx && ln -sf "$VMROOT/usr/bin/xkbcomp" /tmp/xxx/xkbcomp
Xvfb :98 -screen 0 1440x900x24 -xkbdir "$VMROOT/usr/share/X11/xkb" -nolisten tcp >/dev/null 2>&1 &
XVFB_PID=$!
for i in $(seq 1 30); do [ -e /tmp/.X11-unix/X98 ] && break; sleep 0.25; done
if [ ! -e /tmp/.X11-unix/X98 ]; then echo "FATAL: Xvfb did not start"; exit 1; fi
echo "Xvfb up"

NEUTRINO_SCENARIO=update-test NEUTRINO_NO_SANDBOX=1 DISPLAY=:98 \
  timeout --kill-after=10 90 "$HOME/.local/bin/neutrino" --disable-gpu --disable-dev-shm-usage \
  > /tmp/e2e.log 2>&1
echo "app exited: $?"

grep -aE "UPDATE_|NO_UPDATE" /tmp/e2e.log || { echo "--- no scenario output; last log lines: ---"; grep -avE "GLib|keysym|xkbcomp|Errors from|Warning" /tmp/e2e.log | tail -6; }

sleep 3
python3 -c "import json; print('installed version now:', json.load(open('$HOME/.local/share/neutrino/package.json'))['version'])"
if pgrep -f "local/share/neutrino/.runtime/electron/electron" >/dev/null; then
  echo "relaunched instance running"
else
  echo "no relaunched process found"
fi

kill $XVFB_PID 2>/dev/null || true
pkill -9 -x electron 2>/dev/null || true
exit 0

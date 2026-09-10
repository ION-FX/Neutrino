#!/usr/bin/env bash
# Reliable headless runner: ensures a clean Xvfb :98 and runs electron with
# the portable libs. Extra args/env pass through. Usage:
#   scripts/vm-run.sh [timeout-secs] -- env VAR=1 ...
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VMROOT="$ROOT/scripts/.vm-root"
TMO="${1:-40}"; shift || true

export LD_LIBRARY_PATH="$VMROOT/usr/lib/x86_64-linux-gnu:$VMROOT/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
export FONTCONFIG_PATH="$VMROOT/etc/fonts"
export PATH="$VMROOT/usr/bin:$PATH"

if ! pgrep -x Xvfb >/dev/null 2>&1 || [ ! -e /tmp/.X11-unix/X98 ]; then
  pkill -9 -x Xvfb 2>/dev/null || true
  rm -f /tmp/.X98-lock /tmp/.X11-unix/X98
  mkdir -p /tmp/xxx && ln -sf "$VMROOT/usr/bin/xkbcomp" /tmp/xxx/xkbcomp
  (Xvfb :98 -screen 0 1440x900x24 -xkbdir "$VMROOT/usr/share/X11/xkb" -nolisten tcp >/dev/null 2>&1 &)
  for i in $(seq 1 20); do [ -e /tmp/.X11-unix/X98 ] && break; sleep 0.25; done
fi

cd "$ROOT"
DISPLAY=:98 timeout --kill-after=5 "$TMO" "$ROOT/.runtime/electron/electron" . \
  --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"
exit $?

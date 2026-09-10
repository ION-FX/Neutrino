#!/usr/bin/env bash
# Boots Neutrino headless (Xvfb + portable libs) and captures screenshots via
# the NEUTRINO_SHOOT test hook in main.js. CI/dev aid for machines with no
# display server.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VMROOT="$ROOT/scripts/.vm-root"
OUT="${1:-/tmp/neutrino-shots}"
THEME="${2:-liquid}"
URL="${3:-https://example.com}"
mkdir -p "$OUT"

export LD_LIBRARY_PATH="$VMROOT/usr/lib/x86_64-linux-gnu:$VMROOT/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
export FONTCONFIG_PATH="$VMROOT/etc/fonts"
export PATH="$VMROOT/usr/bin:$PATH"

pkill -f "Xvfb :99" 2>/dev/null || true
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true
# Xvfb's compiled-in xkbcomp path is patched to /tmp/xxx/xkbcomp (same-length
# binary patch of the portable copy) because we cannot write to /usr/bin.
mkdir -p /tmp/xxx
ln -sf "$VMROOT/usr/bin/xkbcomp" /tmp/xxx/xkbcomp
Xvfb :99 -screen 0 1440x900x24 -xkbdir "$VMROOT/usr/share/X11/xkb" -nolisten tcp &
XVFB_PID=$!
sleep 1.2

cd "$ROOT"
DISPLAY=:99 NEUTRINO_SHOOT="$OUT/shot.png" NEUTRINO_TEST_THEME="$THEME" NEUTRINO_TEST_URL="$URL" \
  timeout 60 "$ROOT/.runtime/electron/electron" . --no-sandbox --disable-gpu --disable-dev-shm-usage \
  > /tmp/neutrino-app.log 2>&1
EXIT=$?

kill $XVFB_PID 2>/dev/null || true
echo "exit: $EXIT"
ls -la "$OUT" 2>/dev/null
echo "--- app log (tail) ---"
tail -40 /tmp/neutrino-app.log

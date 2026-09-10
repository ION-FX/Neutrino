#!/usr/bin/env bash
# Neutrino launcher.
# No npm anywhere: the Electron runtime is fetched directly from the official
# electron/electron GitHub release artifacts (first run only), or you can
# supply your own via NEUTRINO_ELECTRON=/path/to/electron.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -n "${NEUTRINO_ELECTRON:-}" ]; then
  ELECTRON="$NEUTRINO_ELECTRON"
elif command -v electron >/dev/null 2>&1; then
  ELECTRON="electron"
elif [ -x "$ROOT/.runtime/electron/electron" ]; then
  ELECTRON="$ROOT/.runtime/electron/electron"
else
  echo "Neutrino: downloading Electron runtime from GitHub releases (one time)…"
  bash "$ROOT/scripts/fetch-runtime.sh"
  ELECTRON="$ROOT/.runtime/electron/electron"
fi

# The SUID sandbox helper can't be configured without root on some systems
# (containers, shared VMs). Escape hatch only for those cases.
FLAGS=()
if [ "$(id -u)" = "0" ] || [ -n "${NEUTRINO_NO_SANDBOX:-}" ]; then
  FLAGS+=(--no-sandbox)
  echo "Neutrino: running with --no-sandbox (configure chrome-sandbox for full sandboxing)" >&2
fi

exec "$ELECTRON" "${FLAGS[@]}" . "$@"

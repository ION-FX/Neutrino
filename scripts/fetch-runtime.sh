#!/usr/bin/env bash
# Downloads the Electron runtime directly from the official electron/electron
# GitHub releases. This is deliberately NOT npm — no package manager, no
# dependency resolution, nothing executed from the registry. The zip comes from
# the Electron project's own release artifacts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/.runtime"
MARKER="$RUNTIME_DIR/.ok"

mkdir -p "$RUNTIME_DIR"

if [ -n "${NEUTRINO_ELECTRON_VERSION:-}" ]; then
  VERSION="$NEUTRINO_ELECTRON_VERSION"
else
  VERSION=$(curl -fsSL --max-time 30 \
    "https://api.github.com/repos/electron/electron/releases/latest" \
    | grep -m1 '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
fi

echo "Neutrino runtime: Electron $VERSION"
ZIP_URL="https://github.com/electron/electron/releases/download/${VERSION}/electron-${VERSION}-linux-x64.zip"
ZIP_PATH="$RUNTIME_DIR/electron-${VERSION}-linux-x64.zip"

curl -fL --retry 5 --retry-all-errors --max-time 540 -o "$ZIP_PATH" "$ZIP_URL"
unzip -q -o "$ZIP_PATH" -d "$RUNTIME_DIR/electron"
rm -f "$ZIP_PATH"
touch "$MARKER"
echo "Runtime installed at $RUNTIME_DIR/electron/electron"

#!/usr/bin/env bash
# Downloads the Electron runtime directly from the official electron/electron
# GitHub releases. This is deliberately NOT npm — no package manager, no
# dependency resolution, nothing executed from the registry. The zip comes from
# the Electron project's own release artifacts.
#
# Fallback version used when the GitHub API can't be reached (offline mirrors,
# rate limits, broken pipes): a known-good release that Neutrino supports.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/.runtime"
MARKER="$RUNTIME_DIR/.ok"
FALLBACK_VERSION="v44.3.0"

mkdir -p "$RUNTIME_DIR"

if [ -n "${NEUTRINO_ELECTRON_VERSION:-}" ]; then
  VERSION="$NEUTRINO_ELECTRON_VERSION"
else
  VERSION=""
  # quiet + retried; if the API is unreachable we fall back to the pinned version
  VERSION="$(curl -fsSL --retry 5 --retry-all-errors --max-time 30 \
    "https://api.github.com/repos/electron/electron/releases/latest" \
    2>/dev/null | grep -m1 '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' || true)"
  VERSION="${VERSION:-$FALLBACK_VERSION}"
fi

echo "Neutrino runtime: Electron $VERSION"
ZIP_URL="https://github.com/electron/electron/releases/download/${VERSION}/electron-${VERSION}-linux-x64.zip"
ZIP_PATH="$RUNTIME_DIR/electron-${VERSION}-linux-x64.zip"

curl -fsSL --retry 5 --retry-all-errors --max-time 540 -o "$ZIP_PATH" "$ZIP_URL"
unzip -q -o "$ZIP_PATH" -d "$RUNTIME_DIR/electron"
rm -f "$ZIP_PATH"
touch "$MARKER"
echo "Runtime installed at $RUNTIME_DIR/electron/electron"

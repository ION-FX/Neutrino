#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Neutrino installer
#
#    curl -fsSL https://raw.githubusercontent.com/ION-FX/Neutrino/main/install.sh | bash
#
#  No npm, no root, no dependencies beyond curl/tar/unzip (and bash).
#  Installs to ~/.local/share/neutrino, links the `neutrino` command into
#  ~/.local/bin, and pre-fetches the Electron runtime from the official
#  electron/electron GitHub releases so the first launch is instant.
#
#  Options (environment):
#    NEUTRINO_DIR      install location   (default ~/.local/share/neutrino)
#    NEUTRINO_BIN      bin directory      (default ~/.local/bin)
#    NEUTRINO_VERSION  specific version   (default: latest release)
#    NEUTRINO_SKIP_RUNTIME=1  don't pre-download the Electron runtime
#    GITHUB_TOKEN      only needed for private forks / API rate limits
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="ION-FX/Neutrino"
INSTALL_DIR="${NEUTRINO_DIR:-$HOME/.local/share/neutrino}"
BIN_DIR="${NEUTRINO_BIN:-$HOME/.local/bin}"
BRANCH="main"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

for cmd in curl tar bash; do command -v "$cmd" >/dev/null || fail "'$cmd' is required"; done

AUTH=()
if [ -n "${GITHUB_TOKEN:-}" ]; then AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN"); fi

api() { curl -fsSL "${AUTH[@]}" -H "Accept: application/vnd.github+json" "$1"; }

# ── resolve what to download ────────────────────────────────────────────────
VERSION="${NEUTRINO_VERSION:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -n "$VERSION" ]; then
  log "Installing Neutrino $VERSION (pinned)"
  TARBALL_URL="https://github.com/$REPO/releases/download/v$VERSION/neutrino-$VERSION.tar.gz"
  FLAT=1
else
  log "Looking up the latest release…"
  TAG="$(api "https://api.github.com/repos/$REPO/releases/latest" \
        | grep -m1 '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/')" || TAG=""
  if [ -n "$TAG" ]; then
    VERSION="$TAG"
    log "Latest release: v$VERSION"
    TARBALL_URL="https://github.com/$REPO/releases/download/v$TAG/neutrino-$TAG.tar.gz"
    FLAT=1
  else
    log "No release found, installing from the $BRANCH branch"
    VERSION="0.0.0-branch"
    TARBALL_URL="https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH"
    FLAT=0   # branch tarballs have a Neutrino-<ref>/ prefix
  fi
fi

# ── download & extract ──────────────────────────────────────────────────────
log "Downloading…"
curl -fsSL --retry 5 --retry-all-errors -o "$TMP/neutrino.tar.gz" "$TARBALL_URL"

STAGE="$TMP/app"
mkdir -p "$STAGE"
if [ "$FLAT" = 1 ]; then
  tar -xzf "$TMP/neutrino.tar.gz" -C "$STAGE"
else
  tar -xzf "$TMP/neutrino.tar.gz" -C "$STAGE" --strip-components=1
fi
[ -f "$STAGE/package.json" ] || fail "downloaded archive doesn't look like Neutrino"

# ── install (preserving the cached runtime & config across upgrades) ───────
if [ -d "$INSTALL_DIR" ]; then
  log "Upgrading existing install at $INSTALL_DIR"
  [ -d "$INSTALL_DIR/.runtime" ] && mv "$INSTALL_DIR/.runtime" "$TMP/kept-runtime"
  rm -rf "$INSTALL_DIR"
fi
mkdir -p "$(dirname "$INSTALL_DIR")"
mv "$STAGE" "$INSTALL_DIR"
[ -d "$TMP/kept-runtime" ] && mv "$TMP/kept-runtime" "$INSTALL_DIR/.runtime"
touch "$INSTALL_DIR/.neutrino-managed"

# ── Electron runtime (from electron/electron GitHub releases — never npm) ──
if [ "${NEUTRINO_SKIP_RUNTIME:-0}" != "1" ] && [ ! -x "$INSTALL_DIR/.runtime/electron/electron" ]; then
  log "Fetching the Electron runtime (one time, ~120 MB)…"
  bash "$INSTALL_DIR/scripts/fetch-runtime.sh"
else
  log "Runtime already present — skipping download"
fi

# ── `neutrino` command + desktop entry ──────────────────────────────────────
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/run.sh" "$BIN_DIR/neutrino"
chmod +x "$INSTALL_DIR/run.sh"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) PATH_NOTE=1 ;;
esac

APP_DIR="$HOME/.local/share/applications"
if mkdir -p "$APP_DIR" 2>/dev/null; then
  cat > "$APP_DIR/neutrino.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Neutrino
Comment=A memory-conscious Chromium browser with tabs on the left
Exec=$BIN_DIR/neutrino
Terminal=false
Categories=Network;WebBrowser;
EOF
fi

log "Neutrino v$VERSION installed to $INSTALL_DIR"
[ -n "${PATH_NOTE:-}" ] && printf '   note: add %s to your PATH to use the \033[1mneutrino\033[0m command\n' "$BIN_DIR"
printf '   launch it with: \033[1m%s/neutrino\033[0m\n' "$BIN_DIR"

#!/usr/bin/env bash
# Headless-VM test support only: this machine has no display server and no
# system GTK/NSS libraries, and we have no root. `apt-get download` works
# unprivileged, so we pull the needed debs and extract them into a private
# prefix that we point LD_LIBRARY_PATH / FONTCONFIG at. Nothing is installed
# system-wide.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKGDIR="$ROOT/scripts/.vm-pkgs"
VMROOT="$ROOT/scripts/.vm-root"
mkdir -p "$PKGDIR" "$VMROOT"
cd "$PKGDIR"

# Both classic and t64 (Ubuntu 24.04) names are attempted; failures are fine.
PKGS=(
  xvfb libgtk-3-0 libgtk-3-0t64 libnss3 libnspr4 libasound2 libasound2t64
  libatk1.0-0 libatk1.0-0t64 libatk-bridge2.0-0 libatk-bridge2.0-0t64
  libcups2 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libxss1 libxtst6
  libxext6 libxrender1 libx11-xcb1 libxi6 libxcursor1 libxinerama1
  libglib2.0-0 libglib2.0-0t64 libexpat1 libxslt1.1 libdbus-1-3
  fonts-liberation fonts-dejavu-core fontconfig-config libfontconfig1
  shared-mime-info libjpeg-turbo8 libpng16-16
)

DEPS=$(apt-cache depends --recurse --no-recommends --no-suggests \
        --no-conflicts --no-breaks --no-replaces --no-enhances \
        "${PKGS[@]}" 2>/dev/null | grep -E '^\w' | sort -u || true)

for p in ${PKGS[@]} $DEPS; do
  apt-get download "$p" >/dev/null 2>&1 || true
done

echo "extracting debs..."
for d in "$PKGDIR"/*.deb; do
  [ -e "$d" ] || continue
  dpkg-deb -x "$d" "$VMROOT" || true
done
touch "$VMROOT/.ok"
echo "portable root ready: $VMROOT"

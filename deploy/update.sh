#!/usr/bin/env bash
# Update one ChordVault instance to the newest release, keeping the previous version
# so a failed update switches straight back. Run it from the instance it should update:
#   sudo bash /opt/chordvault/current/deploy/update.sh
#   sudo bash /opt/grace/current/deploy/update.sh        (another church on the same server)
set -euo pipefail

REPO="${REPO:-rajedmaglinte/chordvault}"
RELEASE_BRANCH="${RELEASE_BRANCH:-release}"
# The instance is the /opt/<instance> folder this script was started from.
SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
GUESS=$(dirname "$(dirname "$SELF_DIR")")
[ "$(basename "$GUESS")" = releases ] && GUESS=$(dirname "$GUESS")
INSTANCE="${INSTANCE:-$(basename "$GUESS")}"
APP="/opt/${INSTANCE}"
DATA="/var/lib/${INSTANCE}"
ETC="/etc/${INSTANCE}"
export PATH="$APP/node/bin:$PATH"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { red "run with sudo"; exit 1; }
[ -L "$APP/current" ] && [ -f "$ETC/chordvault.env" ] || { red "No ChordVault instance '${INSTANCE}' installed with install.sh (looked in ${APP})"; exit 1; }
PORT=$(grep -E '^PORT=' "$ETC/chordvault.env" | cut -d= -f2); PORT=${PORT:-3100}

render_unit() {
  sed -e "s#/opt/chordvault#${APP}#g" -e "s#/var/lib/chordvault#${DATA}#g" -e "s#/etc/chordvault#${ETC}#g" \
      -e "s#^User=chordvault\$#User=${INSTANCE}#" -e "s#^Group=chordvault\$#Group=${INSTANCE}#" "$1" > "$2"
  chmod 644 "$2"
}

URL="https://raw.githubusercontent.com/${REPO}/${RELEASE_BRANCH}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$URL/chordvault-release.tar.gz" -o "$tmp/release.tar.gz"
curl -fsSL "$URL/chordvault-release.tar.gz.sha256" -o "$tmp/release.sha256"
(cd "$tmp" && echo "$(cut -d' ' -f1 release.sha256)  release.tar.gz" | sha256sum -c --quiet)
VERSION=$(tar -xzOf "$tmp/release.tar.gz" chordvault/RELEASE)
PREVIOUS=$(readlink -f "$APP/current")
REL="$APP/releases/$VERSION"
if [ "$REL" = "$PREVIOUS" ]; then green "Already on ${VERSION}."; exit 0; fi

echo "Updating ${INSTANCE}: $(basename "$PREVIOUS") -> ${VERSION}"
rm -rf "$REL"; mkdir -p "$REL"
tar -xzf "$tmp/release.tar.gz" -C "$REL" --strip-components=1
if [ -d "$REL/node_modules" ] && (cd "$REL" && node -e "new (require('better-sqlite3'))(':memory:').close()") >/dev/null 2>&1; then
  echo "  bundled packages work on this server (no download or compiling needed)"
else
  # Fallback: install packages here. better-sqlite3 then needs its prebuilt download or build tools.
  rm -rf "$REL/node_modules"
  (cd "$REL" && npm ci --omit=dev --no-audit --no-fund --loglevel=error > "$tmp/npm.log" 2>&1) || { cat "$tmp/npm.log"; red "installing packages failed; nothing switched"; rm -rf "$REL"; exit 1; }
fi
chown -R root:root "$REL"

echo "Backing up the database first..."
systemctl start "${INSTANCE}-backup.service"
cp -a "$DATA/chordvault.db" "$DATA/backups/before-${VERSION}.db"
chown "$INSTANCE:$INSTANCE" "$DATA/backups/before-${VERSION}.db"

render_unit "$REL/deploy/chordvault.service" "/etc/systemd/system/${INSTANCE}.service"
render_unit "$REL/deploy/chordvault-backup.service" "/etc/systemd/system/${INSTANCE}-backup.service"
render_unit "$REL/deploy/chordvault-backup.timer" "/etc/systemd/system/${INSTANCE}-backup.timer"
systemctl daemon-reload
ln -sfn "$REL" "$APP/current"
systemctl restart "$INSTANCE"

for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:${PORT}/api/auth/config" >/dev/null && break; sleep 1; done
if curl -fs "http://127.0.0.1:${PORT}/api/auth/config" >/dev/null; then
  green "ChordVault ${INSTANCE} ${VERSION} is running."
  # Keep the three newest releases.
  ls -1dt "$APP"/releases/* | tail -n +4 | xargs -r rm -rf
else
  red "New version did not start. Switching back to $(basename "$PREVIOUS")."
  journalctl -u "$INSTANCE" -n 30 --no-pager || true
  ln -sfn "$PREVIOUS" "$APP/current"
  render_unit "$PREVIOUS/deploy/chordvault.service" "/etc/systemd/system/${INSTANCE}.service" 2>/dev/null || true
  systemctl daemon-reload; systemctl restart "$INSTANCE"
  exit 1
fi

#!/usr/bin/env bash
# Update ChordVault to the newest release (or TAG=<tag>), keeping the previous version
# so a failed update switches straight back.
#   sudo bash /opt/chordvault/current/deploy/update.sh
set -euo pipefail

REPO="${REPO:-rajedmaglinte/chordvault}"
TAG="${TAG:-latest}"
APP=/opt/chordvault
DATA=/var/lib/chordvault
export PATH="$APP/node/bin:$PATH"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { red "run with sudo"; exit 1; }
[ -L "$APP/current" ] || { red "ChordVault is not installed with install.sh"; exit 1; }
PORT=$(grep -E '^PORT=' /etc/chordvault/chordvault.env | cut -d= -f2); PORT=${PORT:-3100}

if [ "$TAG" = latest ]; then URL="https://github.com/${REPO}/releases/latest/download"; else URL="https://github.com/${REPO}/releases/download/${TAG}"; fi
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$URL/chordvault-release.tar.gz" -o "$tmp/release.tar.gz"
curl -fsSL "$URL/chordvault-release.tar.gz.sha256" -o "$tmp/release.sha256"
(cd "$tmp" && echo "$(cut -d' ' -f1 release.sha256)  release.tar.gz" | sha256sum -c --quiet)
VERSION=$(tar -xzOf "$tmp/release.tar.gz" chordvault/RELEASE)
PREVIOUS=$(readlink -f "$APP/current")
REL="$APP/releases/$VERSION"
if [ "$REL" = "$PREVIOUS" ]; then green "Already on ${VERSION}."; exit 0; fi

echo "Updating $(basename "$PREVIOUS") -> ${VERSION}"
rm -rf "$REL"; mkdir -p "$REL"
tar -xzf "$tmp/release.tar.gz" -C "$REL" --strip-components=1
(cd "$REL" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
chown -R root:root "$REL"

echo "Backing up the database first..."
systemctl start chordvault-backup.service
cp -a "$DATA/chordvault.db" "$DATA/backups/before-${VERSION}.db"
chown chordvault:chordvault "$DATA/backups/before-${VERSION}.db"

install -m 644 "$REL/deploy/chordvault.service" /etc/systemd/system/chordvault.service
install -m 644 "$REL/deploy/chordvault-backup.service" /etc/systemd/system/chordvault-backup.service
install -m 644 "$REL/deploy/chordvault-backup.timer" /etc/systemd/system/chordvault-backup.timer
systemctl daemon-reload
ln -sfn "$REL" "$APP/current"
systemctl restart chordvault

for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:${PORT}/api/auth/config" >/dev/null && break; sleep 1; done
if curl -fs "http://127.0.0.1:${PORT}/api/auth/config" >/dev/null; then
  green "ChordVault ${VERSION} is running."
  # Keep the three newest releases.
  ls -1dt "$APP"/releases/* | tail -n +4 | xargs -r rm -rf
else
  red "New version did not start. Switching back to $(basename "$PREVIOUS")."
  journalctl -u chordvault -n 30 --no-pager || true
  ln -sfn "$PREVIOUS" "$APP/current"
  install -m 644 "$PREVIOUS/deploy/chordvault.service" /etc/systemd/system/chordvault.service 2>/dev/null || true
  systemctl daemon-reload; systemctl restart chordvault
  exit 1
fi

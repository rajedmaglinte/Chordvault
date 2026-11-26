#!/usr/bin/env bash
# ChordVault installer for a server that already runs other sites with nginx + certbot.
#
#   sudo bash install.sh songs.magrem.net                 first church (instance "chordvault")
#   sudo bash install.sh songs.otherchurch.org grace      another church on the same server
#
# Each instance is a completely separate ChordVault: its own database, accounts, super admin,
# port, service and backups. It ADDS ChordVault next to what is already there and never edits
# existing sites or other instances:
#   - its own Node.js copy in /opt/<instance>/node   (no system-wide Node, no apt changes)
#   - the app in /opt/<instance>/releases/<version>, data in /var/lib/<instance>
#   - a system user and systemd service named <instance>, listening on 127.0.0.1 only
#   - one new nginx site file: /etc/nginx/sites-available/<domain>
# Before changing anything it checks for clashes and stops if it finds one.
set -euo pipefail

DOMAIN="${1:-}"
INSTANCE="${2:-${INSTANCE:-chordvault}}"
REPO="${REPO:-rajedmaglinte/chordvault}"
RELEASE_BRANCH="${RELEASE_BRANCH:-release}"
APP="/opt/${INSTANCE}"
DATA="/var/lib/${INSTANCE}"
ETC="/etc/${INSTANCE}"
SITE_AVAIL="/etc/nginx/sites-available/${DOMAIN}"
SITE_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { red "STOPPED: $*"; exit 1; }

[ -n "$DOMAIN" ] || fail "usage: sudo bash install.sh your.domain.name [instance-name]"
[ "$(id -u)" -eq 0 ] || fail "run with sudo"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || fail "domain looks wrong: $DOMAIN"
[[ "$INSTANCE" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || fail "instance name must be lowercase letters, digits or dashes (2-31 characters), e.g. grace"

port_free() { ! ss -tln | grep -qE "[:.]$1\\b"; }
# The first instance uses 3100; others take the next free port unless PORT is given.
if [ -z "${PORT:-}" ]; then
  PORT=3100
  if [ "$INSTANCE" != chordvault ]; then PORT=3101; while ! port_free "$PORT" && [ "$PORT" -lt 3199 ]; do PORT=$((PORT + 1)); done; fi
fi

# Systemd units come from the release with /opt/chordvault etc.; rewrite them for this instance.
render_unit() {
  sed -e "s#/opt/chordvault#${APP}#g" -e "s#/var/lib/chordvault#${DATA}#g" -e "s#/etc/chordvault#${ETC}#g" \
      -e "s#^User=chordvault\$#User=${INSTANCE}#" -e "s#^Group=chordvault\$#Group=${INSTANCE}#" "$1" > "$2"
  chmod 644 "$2"
}

# The compiled release bundle lives on its own branch (see deploy/make-release.sh).
RELEASE_URL="https://raw.githubusercontent.com/${REPO}/${RELEASE_BRANCH}"

step "Checking the server (read-only) for instance '${INSTANCE}'"
problems=0
check() { if eval "$2"; then green "  ok   $1"; else red "  FAIL $1"; problems=$((problems + 1)); fi; }
check "port ${PORT} is free" "port_free ${PORT}"
check "${APP} does not exist yet (use update.sh for updates)" "[ ! -e '${APP}' ]"
check "no service named ${INSTANCE} yet" "[ ! -e '/etc/systemd/system/${INSTANCE}.service' ]"
check "no nginx site file named ${DOMAIN}" "[ ! -e '${SITE_AVAIL}' ] && [ ! -e '${SITE_ENABLED}' ]"
check "no existing nginx site uses ${DOMAIN}" "! grep -RqsE 'server_name[^;]*[[:space:]]${DOMAIN//./\\.}([[:space:];]|$)' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/"
check "current nginx config is valid (before any change)" "nginx -t >/dev/null 2>&1"
check "at least 600 MB free disk" "[ \$(df --output=avail -m / | tail -1) -ge 600 ]"
check "curl, tar, xz, openssl, sha256sum available" "command -v curl >/dev/null && command -v tar >/dev/null && command -v xz >/dev/null && command -v openssl >/dev/null && command -v sha256sum >/dev/null"
# A user of that name is fine if it is ours (from an earlier attempt): its home is the data folder.
if id "$INSTANCE" >/dev/null 2>&1; then
  check "existing user '${INSTANCE}' belongs to ChordVault" "[ \"\$(getent passwd '${INSTANCE}' | cut -d: -f6)\" = '${DATA}' ]"
fi
[ "$problems" -eq 0 ] || fail "${problems} check(s) failed, see above. Nothing was changed."

EXISTING_DB=0
if [ -f "$DATA/chordvault.db" ]; then
  EXISTING_DB=1
  red "  note ${DATA}/chordvault.db already exists (an earlier install?). It will be kept and reused,"
  red "       with its existing accounts, so no new super admin is created."
fi

SERVER_IPS=$(hostname -I)
DNS_IP=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)
if [ -n "$DNS_IP" ] && grep -qw -- "$DNS_IP" <<<"$SERVER_IPS"; then
  green "  ok   ${DOMAIN} points to this server (${DNS_IP})"
else
  red   "  note ${DOMAIN} resolves to '${DNS_IP:-nothing}', this server is '${SERVER_IPS% }'."
  red   "       Install can continue; HTTPS (certbot) only works once DNS points here."
fi

cat <<PLAN

This will install ChordVault instance '${INSTANCE}' for ${DOMAIN}:
  1. create system user '${INSTANCE}' (no login)
  2. download Node.js 24 into ${APP}/node (checksum verified)
  3. download the ChordVault release from github.com/${REPO} (checksum verified) into ${APP}/releases/
  4. create ${DATA} (database + daily backups) and ${ETC}/chordvault.env (random secret)
  5. create the super admin account (you choose the username and password now; skipped if a database exists)
  6. install and start systemd services: ${INSTANCE}, ${INSTANCE}-backup.timer
  7. add nginx site ${SITE_AVAIL} for ${DOMAIN} -> 127.0.0.1:${PORT}, test, reload nginx
It does not touch any other site, instance, app, port, certificate or package.

PLAN
read -r -p "Type yes to continue: " answer
[ "$answer" = yes ] || fail "cancelled. Nothing was changed."

if [ "$EXISTING_DB" -eq 0 ]; then
  read -r -p "Super admin username (3-50 characters): " ADMIN_USER
  [ ${#ADMIN_USER} -ge 3 ] && [ ${#ADMIN_USER} -le 50 ] || fail "username must be 3-50 characters. Nothing was changed."
  read -r -s -p "Super admin password (6+ characters): " ADMIN_PASS; echo
  read -r -s -p "Repeat password: " ADMIN_PASS2; echo
  [ "$ADMIN_PASS" = "$ADMIN_PASS2" ] || fail "passwords do not match. Nothing was changed."
  [ ${#ADMIN_PASS} -ge 6 ] || fail "password must be at least 6 characters. Nothing was changed."
fi

# From here on, undo what we created if a step fails.
created_site=0
cleanup() {
  code=$?
  [ $code -eq 0 ] && return
  red "Install failed (exit ${code}). Undoing the changes for instance '${INSTANCE}'..."
  if [ $created_site -eq 1 ]; then rm -f "$SITE_ENABLED" "$SITE_AVAIL"; nginx -t >/dev/null 2>&1 && systemctl reload nginx; fi
  systemctl disable --now "${INSTANCE}" "${INSTANCE}-backup.timer" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/${INSTANCE}.service" "/etc/systemd/system/${INSTANCE}-backup.service" "/etc/systemd/system/${INSTANCE}-backup.timer"
  systemctl daemon-reload
  rm -rf "$APP"
  red "Removed ${APP} and the services. ${DATA} and ${ETC} were kept; delete them by hand if you start over."
}
trap cleanup EXIT

step "1/7 System user"
id "$INSTANCE" >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin "$INSTANCE"
green "  user ${INSTANCE} ready"

step "2/7 Node.js 24 (private copy)"
mkdir -p "$APP"
tmp=$(mktemp -d)
curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$tmp/SHASUMS256.txt"
NODE_FILE=$(grep -oE 'node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz' "$tmp/SHASUMS256.txt" | head -1)
[ -n "$NODE_FILE" ] || fail "could not find Node.js 24 for linux-x64"
curl -fsSL "https://nodejs.org/dist/latest-v24.x/${NODE_FILE}" -o "$tmp/${NODE_FILE}"
(cd "$tmp" && grep " ${NODE_FILE}\$" SHASUMS256.txt | sha256sum -c --quiet)
mkdir -p "$APP/node"
tar -xJf "$tmp/${NODE_FILE}" -C "$APP/node" --strip-components=1
green "  $("$APP/node/bin/node" --version) installed in ${APP}/node"
export PATH="$APP/node/bin:$PATH"

step "3/7 ChordVault release"
curl -fsSL "${RELEASE_URL}/chordvault-release.tar.gz" -o "$tmp/release.tar.gz"
curl -fsSL "${RELEASE_URL}/chordvault-release.tar.gz.sha256" -o "$tmp/release.sha256"
(cd "$tmp" && echo "$(cut -d' ' -f1 release.sha256)  release.tar.gz" | sha256sum -c --quiet)
VERSION=$(tar -xzOf "$tmp/release.tar.gz" chordvault/RELEASE 2>/dev/null || date +%Y%m%d%H%M)
REL="$APP/releases/$VERSION"
mkdir -p "$REL"
tar -xzf "$tmp/release.tar.gz" -C "$REL" --strip-components=1
if [ -d "$REL/node_modules" ] && (cd "$REL" && node -e "new (require('better-sqlite3'))(':memory:').close()") >/dev/null 2>&1; then
  echo "  bundled packages work on this server (no download or compiling needed)"
else
  # Fallback: install packages here. better-sqlite3 then needs its prebuilt download or build tools.
  rm -rf "$REL/node_modules"
  (cd "$REL" && npm ci --omit=dev --no-audit --no-fund --loglevel=error > "$tmp/npm.log" 2>&1) || { cat "$tmp/npm.log"; fail "installing packages failed. If the log mentions make or g++, run: sudo apt install build-essential python3, then try again"; }
fi
ln -sfn "$REL" "$APP/current"
chown -R root:root "$APP"
rm -rf "$tmp"
green "  ChordVault ${VERSION} installed"

step "4/7 Data folder and secret"
mkdir -p "$DATA/backups" "$ETC"
chown -R "$INSTANCE:$INSTANCE" "$DATA"; chmod 750 "$DATA"
if [ ! -f "$ETC/chordvault.env" ]; then
  printf 'JWT_SECRET=%s\nPORT=%s\n' "$(openssl rand -hex 32)" "$PORT" > "$ETC/chordvault.env"
fi
chown "root:$INSTANCE" "$ETC/chordvault.env"; chmod 640 "$ETC/chordvault.env"
PORT=$(grep -E '^PORT=' "$ETC/chordvault.env" | cut -d= -f2)
green "  ${DATA} and ${ETC}/chordvault.env ready"

step "5/7 Services"
render_unit "$REL/deploy/chordvault.service" "/etc/systemd/system/${INSTANCE}.service"
render_unit "$REL/deploy/chordvault-backup.service" "/etc/systemd/system/${INSTANCE}-backup.service"
render_unit "$REL/deploy/chordvault-backup.timer" "/etc/systemd/system/${INSTANCE}-backup.timer"
systemctl daemon-reload
systemctl enable --now "$INSTANCE" >/dev/null
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:${PORT}/api/auth/config" >/dev/null && break; sleep 1; done
curl -fs "http://127.0.0.1:${PORT}/api/auth/config" >/dev/null || { journalctl -u "$INSTANCE" -n 30 --no-pager; fail "ChordVault did not start"; }
systemctl enable --now "${INSTANCE}-backup.timer" >/dev/null
green "  ${INSTANCE} running on 127.0.0.1:${PORT} (not reachable from outside yet)"

step "6/7 Super admin account"
if [ "$EXISTING_DB" -eq 1 ]; then
  green "  kept the existing database and its accounts"
else
# Created before nginx exposes the site, so nobody else can grab the first (super admin) account.
body=$(ADMIN_USER="$ADMIN_USER" ADMIN_PASS="$ADMIN_PASS" node -e 'process.stdout.write(JSON.stringify({username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS}))')
reply=$(curl -s -w '\n%{http_code}' -H 'Content-Type: application/json' -d "$body" "http://127.0.0.1:${PORT}/api/auth/register")
[ "$(tail -1 <<<"$reply")" = 200 ] || fail "could not create super admin: $(head -1 <<<"$reply")"
unset ADMIN_PASS ADMIN_PASS2 body
green "  super admin '${ADMIN_USER}' created"
fi

step "7/7 nginx site for ${DOMAIN}"
sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__PORT__/${PORT}/g" "$REL/deploy/nginx-site.conf" > "$SITE_AVAIL"
# Servers without IPv6 cannot listen on [::]; drop that line there.
[ -s /proc/net/if_inet6 ] || sed -i '/listen \[::\]/d' "$SITE_AVAIL"
ln -s "$SITE_AVAIL" "$SITE_ENABLED"
created_site=1
if ! nginx -t >/dev/null 2>&1; then nginx -t || true; fail "nginx rejected the new site"; fi
systemctl reload nginx
green "  http://${DOMAIN} -> ChordVault (${INSTANCE})"

trap - EXIT
cat <<DONE

$(green "ChordVault '${INSTANCE}' is installed.")

Next: turn on HTTPS (needs ${DOMAIN} pointing to this server):
  sudo certbot --nginx -d ${DOMAIN}

Then open https://${DOMAIN} and sign in${ADMIN_USER:+ as '${ADMIN_USER}'}.

Useful commands:
  systemctl status ${INSTANCE}          is it running?
  journalctl -u ${INSTANCE} -f          live log
  sudo bash ${APP}/current/deploy/update.sh   update this instance to the newest release
  Backups: ${DATA}/backups (daily, last 14 days)
DONE

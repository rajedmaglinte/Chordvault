# Deploying ChordVault next to other sites (nginx + certbot)

Built for a small Ubuntu server that already hosts other apps. Nothing existing is edited:
ChordVault gets its own Node.js copy, user, systemd service (127.0.0.1 only) and one new nginx site.

## Install

1. Point DNS at the server: an `A` record for your domain (e.g. `songs.magrem.net`) → the server's IP.
2. On the server:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/rajedmaglinte/chordvault/main/deploy/install.sh
   less install.sh          # read it first
   sudo bash install.sh songs.magrem.net
   ```

   It checks for clashes (port 3100, existing site names, nginx config) and stops before
   changing anything if it finds one. It asks for the super admin username and password.
3. Turn on HTTPS: `sudo certbot --nginx -d songs.magrem.net`

## Update

```bash
sudo bash /opt/chordvault/current/deploy/update.sh
```

Takes a database backup, installs the newest release next to the current one, restarts,
and switches back automatically if the new version does not start.

## Where things are

| What | Where |
|---|---|
| App releases | `/opt/chordvault/releases/<version>`, active one at `/opt/chordvault/current` |
| Node.js (private) | `/opt/chordvault/node` |
| Database | `/var/lib/chordvault/chordvault.db` |
| Daily backups (14 days) | `/var/lib/chordvault/backups/` |
| Secret / port | `/etc/chordvault/chordvault.env` |
| nginx site | `/etc/nginx/sites-available/<domain>` |
| Services | `chordvault.service`, `chordvault-backup.timer` |

Logs: `journalctl -u chordvault -f`. Memory is capped at 300 MB (`MemoryMax`).

## Remove completely

```bash
sudo systemctl disable --now chordvault chordvault-backup.timer
sudo rm /etc/systemd/system/chordvault.service /etc/systemd/system/chordvault-backup.*
sudo rm /etc/nginx/sites-enabled/songs.magrem.net /etc/nginx/sites-available/songs.magrem.net
sudo nginx -t && sudo systemctl reload nginx
sudo rm -rf /opt/chordvault            # app
# sudo rm -rf /var/lib/chordvault /etc/chordvault   # data and secret: only if you are sure
sudo certbot delete --cert-name songs.magrem.net
```

## Making a release (maintainers)

`deploy/make-release.sh 1.33.0-church.N --publish` builds `dist/chordvault-release.tar.gz` and
its `.sha256` and replaces the single commit on the `release` branch, which servers download from.

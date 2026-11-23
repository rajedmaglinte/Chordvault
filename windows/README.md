# ChordVault on a Windows PC (church hub)

Runs ChordVault in the background on a Windows PC so phones on the same Wi-Fi can use it,
including live leader sync, with no internet needed.

## One-time setup

1. Install **Node.js 24 LTS** from nodejs.org.
2. Double-click **`windows\Setup ChordVault.cmd`**.
   - Creates `.env` with a random secret (so sign-ins survive restarts), installs packages if needed.
   - Adds desktop icons: **Start ChordVault**, **Stop ChordVault**, **ChordVault Status**.
   - Makes ChordVault start by itself (silently) when you log in to Windows.
   - Asks once for administrator permission to allow port 3100 in Windows Firewall.
3. Set Windows **Sleep** to **Never** while plugged in (Settings > System > Power).

## Every day

Nothing: it starts with Windows. If it did not, double-click **Start ChordVault**
(or `windows\Start ChordVault.cmd`). **ChordVault Status** shows the address phones open.

## Notes

- Logs: `logs\server.log` (previous run: `server.log.previous`).
- Data: `data\chordvault.db`. Copy the `data` folder and `.env` to move or back up.
- Stop starting with Windows: `powershell -ExecutionPolicy Bypass -File windows\ChordVault.ps1 remove-autostart`.
- Over plain `http://` on the LAN, offline downloads, installing as an app and "keep screen on"
  are unavailable (browsers require HTTPS for those). Everything else works.

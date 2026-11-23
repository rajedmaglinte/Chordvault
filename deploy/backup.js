// Daily SQLite backup for ChordVault: a consistent copy taken while the app runs,
// keeping the last KEEP_DAYS days. Run by chordvault-backup.timer.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || './data/chordvault.db';
const dir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
const keepDays = Number(process.env.KEEP_DAYS) || 14;

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const target = path.join(dir, `chordvault-${stamp}.db`);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.backup(target)
  .then(() => {
    db.close();
    const cutoff = Date.now() - keepDays * 86_400_000;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (/^chordvault-\d{4}-\d{2}-\d{2}\.db$/.test(name) && fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
    }
    console.log(`Backup written: ${target}`);
  })
  .catch((err) => { console.error('Backup failed:', err.message); process.exit(1); });

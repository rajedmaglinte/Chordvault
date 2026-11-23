const { db } = require('../db');

/*
 * The history log: who added, changed, deactivated, reactivated or deleted a song,
 * and who added, blocked, unblocked, promoted or deleted a user.
 * `snapshot` keeps the song text as it was before a change or removal, so nothing is lost.
 */

const insertStmt = db.prepare(`
  INSERT INTO activity_log (actor_id, actor_name, action, target_type, target_id, target_name, details, snapshot)
  VALUES (@actorId, @actorName, @action, @targetType, @targetId, @targetName, @details, @snapshot)
`);
const getStmt = db.prepare('SELECT * FROM activity_log WHERE id = ?');

const ACTIONS = {
  SONG_ADDED: 'song.added',
  SONG_IMPORTED: 'song.imported',
  SONG_MODIFIED: 'song.modified',
  SONG_DEACTIVATED: 'song.deactivated',
  SONG_REACTIVATED: 'song.reactivated',
  SONG_DELETED: 'song.deleted',
  USER_ADDED: 'user.added',
  USER_BLOCKED: 'user.blocked',
  USER_UNBLOCKED: 'user.unblocked',
  USER_ROLE: 'user.role',
  USER_DELETED: 'user.deleted',
};

function log(actor, action, { type, id = null, name = '', details = null, snapshot = null }) {
  insertStmt.run({
    actorId: actor?.id ?? null,
    actorName: actor?.username ?? '',
    action,
    targetType: type,
    targetId: id,
    targetName: name || '',
    details: details ? JSON.stringify(details) : null,
    snapshot,
  });
}

const parse = row => (row ? { ...row, details: row.details ? JSON.parse(row.details) : null } : row);

/** Newest first. `type` is 'song' or 'user'; `q` matches the song/user name or who did it. */
function list({ type = null, q = '', targetId = null, page = 1, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (type) { where.push('target_type = ?'); params.push(type); }
  if (targetId) { where.push('target_id = ?'); params.push(targetId); }
  if (q.trim()) {
    where.push("(target_name LIKE ? ESCAPE '\\' OR actor_name LIKE ? ESCAPE '\\')");
    const like = `%${q.trim().replace(/[\\%_]/g, c => `\\${c}`)}%`;
    params.push(like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM activity_log ${clause}`).get(...params).count;
  const rows = db.prepare(`SELECT id, created_at, actor_id, actor_name, action, target_type, target_id, target_name, details,
      snapshot IS NOT NULL AS has_snapshot
    FROM activity_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  return { entries: rows.map(r => ({ ...parse(r), has_snapshot: !!r.has_snapshot })), total, page, limit };
}

module.exports = { ACTIONS, log, list, get: id => parse(getStmt.get(id)) };

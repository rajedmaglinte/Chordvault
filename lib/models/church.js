const { db } = require('../db');
const { AppError } = require('../errors');

const listStmt = db.prepare(`
  SELECT c.id, c.name, c.created_at,
    (SELECT COUNT(*) FROM users u WHERE u.church_id = c.id) AS member_count,
    (SELECT u.username FROM users u WHERE u.church_id = c.id AND u.role IN ('church_owner', 'owner') ORDER BY u.id LIMIT 1) AS super_admin
  FROM churches c ORDER BY c.id
`);
const findStmt = db.prepare('SELECT id, name, created_at FROM churches WHERE id = ?');
const firstStmt = db.prepare('SELECT id, name FROM churches ORDER BY id LIMIT 1');
const insertStmt = db.prepare('INSERT INTO churches (name) VALUES (?)');
const renameStmt = db.prepare('UPDATE churches SET name = ? WHERE id = ?');

function cleanName(name) {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (n.length < 2 || n.length > 80) throw new AppError('Church name must be 2-80 characters', 400);
  return n;
}

function create(name) {
  try {
    return { id: Number(insertStmt.run(cleanName(name)).lastInsertRowid), name: cleanName(name) };
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (String(e.message).includes('UNIQUE')) throw new AppError('A church with that name already exists', 400);
    throw e;
  }
}

/** The church new accounts join when none is given (the first one; created if there is none). */
function defaultId() {
  const first = firstStmt.get();
  return first ? first.id : create('My Church').id;
}

module.exports = {
  list: () => listStmt.all(),
  find: id => findStmt.get(id),
  create,
  defaultId,
  rename(id, name) {
    try {
      return renameStmt.run(cleanName(name), id).changes > 0;
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new AppError('A church with that name already exists', 400);
      throw e;
    }
  },
};

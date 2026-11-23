const test = require('node:test');
const assert = require('node:assert/strict');
const { db, user, serve } = require('./helpers/app');
const { createSongsRouter } = require('../routes/songs');
const { createAdminRouter } = require('../routes/admin');
const { createSetlistsRouter } = require('../routes/setlists');

// Super admin (owner) deletes for good; admins and song owners only deactivate;
// admins block users but cannot delete them; every change lands in the history log.

const owner = user('superadmin', 'owner');
const admin = user('leader', 'admin');
const alice = user('alice');
const bob = user('bob');

const mount = app => {
  app.use('/api', createSongsRouter());
  app.use('/api', createSetlistsRouter());
  app.use('/api', createAdminRouter());
};
const json = async res => ({ status: res.status, body: await res.json() });
const content = title => `{title: ${title}}\n{key: G}\n{x_language: en}\n[G]Amazing ${title}`;

test('song lifecycle: add, edit, deactivate, reactivate, delete, all in the history', async (t) => {
  const call = await serve(t, mount);
  const add = await json(await call('/api/songs', { method: 'POST', token: alice.token, body: { content: content('Grace') } }));
  assert.equal(add.status, 200, JSON.stringify(add.body));
  const id = add.body.id;

  const edit = await call(`/api/songs/${id}`, { method: 'PUT', token: alice.token, body: { content: content('Grace').replace('Amazing', 'Wonderful') } });
  assert.equal(edit.status, 200);

  // The owner of the song "deletes" it: it is only deactivated.
  const del = await json(await call(`/api/songs/${id}`, { method: 'DELETE', token: alice.token }));
  assert.deepEqual(del.body, { success: true, result: 'deactivated' });
  assert.equal(db.prepare('SELECT status FROM songs WHERE id = ?').get(id).status, 'inactive');

  // Hidden from everyone but admins.
  assert.equal((await call(`/api/songs/${id}`)).status, 404);
  assert.equal((await call(`/api/songs/${id}`, { token: alice.token })).status, 404);
  assert.equal((await call(`/api/songs/${id}`, { token: admin.token })).status, 200);
  const list = await json(await call('/api/songs/public'));
  const listed = Array.isArray(list.body) ? list.body : list.body.songs;
  assert.ok(!listed.some(s => s.id === id), 'deactivated song must not be listed');

  // Cannot be edited or deactivated again until reactivated.
  assert.equal((await call(`/api/songs/${id}`, { method: 'PUT', token: admin.token, body: { content: content('Grace') } })).status, 409);
  assert.equal((await call(`/api/songs/${id}`, { method: 'DELETE', token: admin.token })).status, 404);

  // Admins see it in the deactivated list and can switch it back on; members cannot.
  const inactive = await json(await call('/api/admin/songs/inactive', { token: admin.token }));
  assert.equal(inactive.body[0].id, id);
  assert.equal(inactive.body[0].deactivated_by, 'alice');
  assert.equal((await call(`/api/admin/songs/${id}/active`, { method: 'PUT', token: alice.token, body: { active: true } })).status, 403);
  assert.equal((await call(`/api/admin/songs/${id}/active`, { method: 'PUT', token: admin.token, body: { active: true } })).status, 200);
  assert.equal((await call(`/api/songs/${id}`)).status, 200);

  // An admin "deleting" also only deactivates; the super admin deletes for good.
  assert.equal((await json(await call(`/api/admin/songs/${id}`, { method: 'DELETE', token: admin.token }))).body.result, 'deactivated');
  assert.equal((await json(await call(`/api/admin/songs/${id}`, { method: 'DELETE', token: owner.token }))).body.result, 'deleted');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM songs WHERE id = ?').get(id).n, 0);

  const history = await json(await call('/api/admin/history?type=song', { token: admin.token }));
  const actions = history.body.entries.filter(e => e.target_id === id).map(e => `${e.action}:${e.actor_name}`).reverse();
  assert.deepEqual(actions, [
    'song.added:alice', 'song.modified:alice', 'song.deactivated:alice',
    'song.reactivated:leader', 'song.deactivated:leader', 'song.deleted:superadmin',
  ]);
  const modified = history.body.entries.find(e => e.target_id === id && e.action === 'song.modified');
  assert.deepEqual(modified.details.fields, ['content']);

  // The deleted song's text is still recoverable from the log.
  const deleted = history.body.entries.find(e => e.target_id === id && e.action === 'song.deleted');
  assert.equal(deleted.has_snapshot, true);
  const full = await json(await call(`/api/admin/history/${deleted.id}`, { token: admin.token }));
  assert.match(full.body.snapshot, /Wonderful Grace/);
});

test('a deactivated song in a setlist shows as unavailable', async (t) => {
  const call = await serve(t, mount);
  const song = (await json(await call('/api/songs', { method: 'POST', token: alice.token, body: { content: content('Holy') } }))).body.id;
  const sl = (await json(await call('/api/setlists', { method: 'POST', token: alice.token, body: { name: 'Sunday', visibility: 'public' } }))).body.id;
  await call(`/api/setlists/${sl}/songs`, { method: 'POST', token: alice.token, body: { song_id: song } });
  await call(`/api/songs/${song}`, { method: 'DELETE', token: admin.token });
  const entry = (await json(await call(`/api/setlists/public/${sl}`))).body.entries[0];
  assert.equal(entry.is_deactivated, true);
  assert.equal(entry.content, '');
});

test('admins add and block users; only the super admin deletes them', async (t) => {
  const call = await serve(t, mount);
  const carol = await json(await call('/api/admin/users', { method: 'POST', token: admin.token, body: { username: 'carol', password: 'secret12' } }));
  assert.equal(carol.status, 200);

  assert.equal((await call(`/api/admin/users/${carol.body.id}/disabled`, { method: 'PUT', token: admin.token, body: { disabled: true } })).status, 200);
  assert.equal((await call(`/api/admin/users/${carol.body.id}/disabled`, { method: 'PUT', token: admin.token, body: { disabled: false } })).status, 200);

  const refused = await json(await call(`/api/admin/users/${carol.body.id}`, { method: 'DELETE', token: admin.token }));
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'Only the super admin can do this');
  assert.equal((await call(`/api/admin/users/${carol.body.id}`, { method: 'DELETE', token: owner.token })).status, 200);

  const history = await json(await call('/api/admin/history?type=user&q=carol', { token: admin.token }));
  assert.deepEqual(history.body.entries.map(e => `${e.action}:${e.actor_name}`).reverse(),
    ['user.added:leader', 'user.blocked:leader', 'user.unblocked:leader', 'user.deleted:superadmin']);
});

test('the history log is for admins only', async (t) => {
  const call = await serve(t, mount);
  assert.equal((await call('/api/admin/history', { token: bob.token })).status, 403);
  assert.equal((await call('/api/admin/history')).status, 401);
});

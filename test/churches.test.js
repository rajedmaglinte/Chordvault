const test = require('node:test');
const assert = require('node:assert/strict');
const { db, user, serve } = require('./helpers/app');
const { createAuthRouter } = require('../routes/auth');
const { createSongsRouter } = require('../routes/songs');
const { createSetlistsRouter } = require('../routes/setlists');
const { createAdminRouter } = require('../routes/admin');

// One site, several churches: public songs are shared by everyone; people, setlists,
// admin rights and the history log belong to a church.

const owner = user('site-owner', 'owner');            // first church ("My Church")
const leader = user('my-leader', 'admin');
const member = user('my-member');

const mount = app => {
  app.use('/api/auth', createAuthRouter());
  app.use('/api', createSongsRouter());
  app.use('/api', createSetlistsRouter());
  app.use('/api', createAdminRouter());
};
const json = async res => ({ status: res.status, body: await res.json() });
const content = title => `{title: ${title}}\n{key: G}\n{x_language: en}\n[G]Amazing ${title}`;

test('a second church joins, shares public songs and stays separate otherwise', async (t) => {
  const call = await serve(t, mount);

  // The owner adds a church and gets an invite for its super admin.
  const added = await json(await call('/api/admin/churches', { method: 'POST', token: owner.token, body: { name: 'Grace Church' } }));
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.equal((await call('/api/admin/churches', { method: 'POST', token: leader.token, body: { name: 'Nope' } })).status, 403);

  const joined = await json(await call('/api/auth/redeem-invite', { method: 'POST', body: { code: added.body.code, username: 'grace-boss', password: 'secret12' } }));
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.equal(joined.body.role, 'church_owner');
  assert.equal(joined.body.church_name, 'Grace Church');
  const graceBoss = { token: joined.body.token, id: joined.body.id };

  // Grace's super admin invites a member into Grace only.
  const inv = await json(await call('/api/admin/invites', { method: 'POST', token: graceBoss.token, body: { role: 'user' } }));
  const graceMember = (await json(await call('/api/auth/redeem-invite', { method: 'POST', body: { code: inv.body.code, username: 'grace-singer', password: 'secret12' } }))).body;
  assert.equal(graceMember.church_name, 'Grace Church');
  // ...but cannot hand out the owner-only role, or invite into another church.
  assert.equal((await call('/api/admin/invites', { method: 'POST', token: graceBoss.token, body: { role: 'church_owner' } })).status, 403);

  // Public songs are open to every church; private ones are not.
  const pub = (await json(await call('/api/songs', { method: 'POST', token: member.token, body: { content: content('Shared') } }))).body.id;
  const priv = (await json(await call('/api/songs', { method: 'POST', token: member.token, body: { content: content('Mine'), visibility: 'private' } }))).body.id;
  assert.equal((await call(`/api/songs/${pub}`, { token: graceMember.token })).status, 200);
  assert.equal((await call(`/api/songs/${priv}`, { token: graceMember.token })).status, 404);

  // Each church's admins see and manage only their own people.
  const graceUsers = (await json(await call('/api/admin/users', { token: graceBoss.token }))).body.map(u => u.username);
  assert.deepEqual(graceUsers.sort(), ['grace-boss', 'grace-singer']);
  const myUsers = (await json(await call('/api/admin/users', { token: leader.token }))).body.map(u => u.username);
  assert.ok(!myUsers.includes('grace-boss') && myUsers.includes('my-member'));
  assert.equal((await call(`/api/admin/users/${member.id}/disabled`, { method: 'PUT', token: graceBoss.token, body: { disabled: true } })).status, 403);
  assert.equal((await call(`/api/admin/users/${graceMember.id}/disabled`, { method: 'PUT', token: graceBoss.token, body: { disabled: true } })).status, 200);
  assert.equal((await call(`/api/admin/users/${graceMember.id}/disabled`, { method: 'PUT', token: graceBoss.token, body: { disabled: false } })).status, 200);
  // The owner sees everyone.
  const everyone = (await json(await call('/api/admin/users', { token: owner.token }))).body.map(u => u.username);
  assert.ok(everyone.includes('grace-boss') && everyone.includes('my-member'));

  // Another church cannot edit, deactivate or delete our songs.
  assert.equal((await call(`/api/songs/${pub}`, { method: 'PUT', token: graceBoss.token, body: { content: content('Hacked') } })).status, 404);
  assert.equal((await call(`/api/admin/songs/${pub}`, { method: 'DELETE', token: graceBoss.token })).status, 404);
  assert.equal((await call(`/api/admin/songs/${pub}/active`, { method: 'PUT', token: graceBoss.token, body: { active: false } })).status, 403);
  // A church super admin deletes their own church's songs for good.
  const graceSong = (await json(await call('/api/songs', { method: 'POST', token: graceMember.token, body: { content: content('Grace song') } }))).body.id;
  assert.equal((await json(await call(`/api/admin/songs/${graceSong}`, { method: 'DELETE', token: graceBoss.token }))).body.result, 'deleted');

  // Public setlists are listed only for their church; a direct link still opens.
  const sl = (await json(await call('/api/setlists', { method: 'POST', token: member.token, body: { name: 'Our Sunday', visibility: 'public' } }))).body.id;
  const listFor = async token => (await json(await call('/api/setlists/public', { token }))).body.map(s => s.name);
  assert.ok((await listFor(leader.token)).includes('Our Sunday'));
  assert.ok(!(await listFor(graceMember.token)).includes('Our Sunday'));
  assert.deepEqual(await listFor(undefined), []);
  assert.equal((await call(`/api/setlists/public/${sl}`)).status, 200);

  // History is per church; the owner sees all of it.
  const historyFor = async token => (await json(await call('/api/admin/history', { token }))).body.entries.map(e => e.target_name);
  const graceHistory = await historyFor(graceBoss.token);
  assert.ok(graceHistory.includes('Grace song') && graceHistory.includes('grace-singer'));
  assert.ok(!graceHistory.includes('Shared'));
  assert.ok(!(await historyFor(leader.token)).includes('Grace song'));
  const all = await historyFor(owner.token);
  assert.ok(all.includes('Grace song') && all.includes('Shared') && all.includes('Grace Church'));
});

test('/api/auth/me reports the current role and church', async (t) => {
  const call = await serve(t, mount);
  const me = await json(await call('/api/auth/me', { token: leader.token }));
  assert.deepEqual({ role: me.body.role, church: me.body.church_name }, { role: 'admin', church: 'My Church' });
  assert.equal((await call('/api/auth/me')).status, 401);
});

test('existing accounts are placed in the first church', () => {
  const orphans = db.prepare('SELECT COUNT(*) AS n FROM users WHERE church_id IS NULL').get().n;
  assert.equal(orphans, 0);
});

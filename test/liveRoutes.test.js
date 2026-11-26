/* global AbortController, TextDecoder */
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../lib/db');
const { createLiveRouter, closeLiveStreams } = require('../routes/live');
const { errorHandler } = require('../lib/errors');

const Church = require('../lib/models/church');
const church = Church.defaultId();
const otherChurch = Church.create('Other Church').id;
const addUser = (name, role = 'user', churchId = church) =>
  db.prepare('INSERT INTO users (username, password_hash, role, church_id) VALUES (?, ?, ?, ?)').run(name, 'x', role, churchId).lastInsertRowid;
const leaderId = addUser('leader');
const memberId = addUser('member');
const adminId = addUser('boss', 'admin');
const otherAdminId = addUser('elsewhere', 'admin', otherChurch);
const publicId = db.prepare("INSERT INTO setlists (user_id, name, visibility) VALUES (?, 'Sunday', 'public')").run(leaderId).lastInsertRowid;
const privateId = db.prepare("INSERT INTO setlists (user_id, name, visibility) VALUES (?, 'Mine', 'private')").run(leaderId).lastInsertRowid;
const tokenFor = id => jwt.sign({ id }, process.env.JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/live', createLiveRouter());
app.use(errorHandler);
const server = app.listen(0);
server.unref();
test.after(() => { closeLiveStreams(); server.close(); });

const url = path => `http://127.0.0.1:${server.address().port}/api/live${path}`;
const lead = (id, body, userId = leaderId) => fetch(url(`/${id}`), {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(userId)}` },
  body: JSON.stringify(body),
});

/** Opens a stream and returns a function that resolves with the next event matching `pred`. */
async function listen(id, userId = memberId) {
  const ctrl = new AbortController();
  const res = await fetch(url(`/${id}/stream`), { signal: ctrl.signal, headers: { authorization: `Bearer ${tokenFor(userId)}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const next = async (pred = () => true) => {
    for (;;) {
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const data = chunk.split('\n').find(l => l.startsWith('data: '));
        if (data) { const ev = JSON.parse(data.slice(6)); if (pred(ev)) return ev; }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      buf += decoder.decode(value, { stream: true });
    }
  };
  return { next, close: () => ctrl.abort() };
}

test('a follower gets the current state, then every leader move', async () => {
  const f = await listen(publicId);
  const first = await f.next();
  assert.equal(first.active, false);
  assert.equal(first.listeners, 1);

  assert.equal((await lead(publicId, { index: 2, section: 1 })).status, 200);
  const moved = await f.next(ev => ev.active);
  assert.deepEqual([moved.index, moved.section, moved.leader], [2, 1, 'leader']);

  await lead(publicId, { active: false });
  assert.equal((await f.next(ev => !ev.active)).active, false);
  f.close();
});

test('a late joiner sees where the leader already is', async () => {
  await lead(publicId, { index: 3, section: -1 });
  const f = await listen(publicId);
  const ev = await f.next();
  assert.deepEqual([ev.active, ev.index, ev.section], [true, 3, -1]);
  f.close();
  await lead(publicId, { active: false });
});

test('an admin of another church may not lead', async () => {
  assert.equal((await lead(publicId, { index: 0 }, otherAdminId)).status, 403);
});

test('only the owner or an admin may lead', async () => {
  assert.equal((await lead(publicId, { index: 0 }, memberId)).status, 403);
  assert.equal((await lead(publicId, { index: 0 }, adminId)).status, 200);
  const anon = await fetch(url(`/${publicId}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"index":0}' });
  assert.equal(anon.status, 401);
});

test('following needs a signed-in member of the same church', async () => {
  assert.equal((await fetch(url(`/${publicId}/stream`))).status, 401);
  const other = await fetch(url(`/${publicId}/stream`), { headers: { authorization: `Bearer ${tokenFor(otherAdminId)}` } });
  assert.equal(other.status, 404);
});

test('private setlists cannot go live', async () => {
  assert.equal((await fetch(url(`/${privateId}/stream`), { headers: { authorization: `Bearer ${tokenFor(memberId)}` } })).status, 404);
  assert.equal((await lead(privateId, { index: 0 })).status, 404);
});

test('bad positions are rejected', async () => {
  assert.equal((await lead(publicId, { index: -1 })).status, 400);
  assert.equal((await lead(publicId, { index: 1.5 })).status, 400);
  assert.equal((await lead(publicId, { index: 0, section: -5 })).status, 400);
});

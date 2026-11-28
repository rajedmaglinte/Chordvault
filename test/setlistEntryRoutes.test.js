process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../lib/db');
const { createSetlistsRouter } = require('../routes/setlists');
const { errorHandler } = require('../lib/errors');

// Drives the real routes over a real HTTP listener against a throwaway
// in-memory database. The unit tests cover validateTargetKey/canonicalTargetKey
// themselves; this covers the wiring, which is where a key reached storage
// untrimmed and un-normalised.

const userId = db.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run().lastInsertRowid;
const songId = db
  .prepare("INSERT INTO songs (user_id, title, content, visibility, status) VALUES (?, 's', '{key: C}', 'public', 'active')")
  .run(userId).lastInsertRowid;
const setlistId = db.prepare("INSERT INTO setlists (user_id, name) VALUES (?, 'sl')").run(userId).lastInsertRowid;
const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api', createSetlistsRouter());
app.use(errorHandler);
const server = app.listen(0);
server.unref();
test.after(() => server.close());

function api(method, path, body) {
  return fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const addEntry = async (target_key) => {
  const res = await api('POST', `/setlists/${setlistId}/songs`, { song_id: songId, target_key });
  assert.equal(res.status, 200, `POST returned ${res.status}`);
  return (await res.json()).entry_id;
};

const keyOf = (entryId) =>
  db.prepare('SELECT target_key FROM setlist_songs WHERE id = ?').get(entryId).target_key;

test('POST stores the key trimmed', async () => {
  assert.equal(keyOf(await addEntry('  Bb  ')), 'Bb');
});

test('POST stores an awkward enharmonic in the picker spelling', async () => {
  assert.equal(keyOf(await addEntry('Db')), 'C#');
});

test('PUT stores the key trimmed', async () => {
  const entryId = await addEntry(null);
  const res = await api('PUT', `/setlists/${setlistId}/entries/${entryId}`, { target_key: '  F#  ' });
  assert.equal(res.status, 200);
  assert.equal(keyOf(entryId), 'F#');
});

test('PUT stores an awkward enharmonic in the picker spelling', async () => {
  const entryId = await addEntry(null);
  const res = await api('PUT', `/setlists/${setlistId}/entries/${entryId}`, { target_key: 'Ab' });
  assert.equal(res.status, 200);
  assert.equal(keyOf(entryId), 'G#');
});

test('PUT clears the key on an explicit null', async () => {
  const entryId = await addEntry('A');
  const res = await api('PUT', `/setlists/${setlistId}/entries/${entryId}`, { target_key: null });
  assert.equal(res.status, 200);
  assert.equal(keyOf(entryId), null);
});

test('PUT leaves the key alone when the field is absent', async () => {
  const entryId = await addEntry('A');
  const res = await api('PUT', `/setlists/${setlistId}/entries/${entryId}`, { nashville: true });
  assert.equal(res.status, 200);
  assert.equal(keyOf(entryId), 'A');
});

test('both routes reject a key the renderer cannot use', async () => {
  const post = await api('POST', `/setlists/${setlistId}/songs`, { song_id: songId, target_key: '1' });
  assert.equal(post.status, 400);
  assert.equal((await post.json()).error, 'Invalid key: 1');

  const entryId = await addEntry('A');
  const put = await api('PUT', `/setlists/${setlistId}/entries/${entryId}`, { target_key: 'Do' });
  assert.equal(put.status, 400);
  assert.equal(keyOf(entryId), 'A');
});

test('reorder rejects an id that is not an entry of this setlist', async () => {
  await addEntry('C');
  const order = () => db.prepare('SELECT id FROM setlist_songs WHERE setlist_id = ? ORDER BY position, id').all(setlistId).map(r => r.id);
  const before = order();
  const res = await api('PUT', `/setlists/${setlistId}/reorder`, { entry_ids: [...before.slice(0, -1), 999999] });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'entry_ids must be the entries of this setlist');
  assert.deepEqual(order(), before);
});

test('each song in a setlist keeps its own metronome tempo and beats per bar', async () => {
  const entry = await addEntry('G');
  const put = body => api('PUT', `/setlists/${setlistId}/entries/${entry}`, body);
  assert.equal((await put({ metronome_bpm: 76, metronome_beats: 3 })).status, 200);
  let row = db.prepare('SELECT metronome_bpm, metronome_beats, target_key FROM setlist_songs WHERE id = ?').get(entry);
  assert.deepEqual({ ...row }, { metronome_bpm: 76, metronome_beats: 3, target_key: 'G' });
  // Other edits leave it alone; null clears it.
  assert.equal((await put({ target_key: 'A' })).status, 200);
  assert.equal(db.prepare('SELECT metronome_bpm FROM setlist_songs WHERE id = ?').get(entry).metronome_bpm, 76);
  assert.equal((await put({ metronome_bpm: null })).status, 200);
  row = db.prepare('SELECT metronome_bpm, metronome_beats FROM setlist_songs WHERE id = ?').get(entry);
  assert.deepEqual({ ...row }, { metronome_bpm: null, metronome_beats: 3 });
  for (const bad of [{ metronome_bpm: 10 }, { metronome_bpm: 80.5 }, { metronome_bpm: '80' }, { metronome_beats: 5 }]) {
    assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
  }
  const listed = await (await api('GET', `/setlists/${setlistId}`)).json();
  assert.ok('metronome_bpm' in listed.entries[0] && 'metronome_beats' in listed.entries[0]);
});

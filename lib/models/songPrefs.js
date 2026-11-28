const { db } = require('../db');

/*
 * A leader's own key and metronome per song. Saved whenever they set them on a song in one of
 * their setlists; filled in when they next add that song to a setlist.
 */
const getStmt = db.prepare('SELECT target_key, metronome_bpm, metronome_beats FROM user_song_prefs WHERE user_id = ? AND song_id = ?');
const ensureStmt = db.prepare('INSERT OR IGNORE INTO user_song_prefs (user_id, song_id) VALUES (?, ?)');
const keyStmt = db.prepare('UPDATE user_song_prefs SET target_key = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND song_id = ?');
const bpmStmt = db.prepare('UPDATE user_song_prefs SET metronome_bpm = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND song_id = ?');
const beatsStmt = db.prepare('UPDATE user_song_prefs SET metronome_beats = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND song_id = ?');
const cleanupStmt = db.prepare('DELETE FROM user_song_prefs WHERE user_id = ? AND song_id = ? AND target_key IS NULL AND metronome_bpm IS NULL AND metronome_beats IS NULL');

/** Saves whichever of key / bpm / beats are given (undefined = leave as is, null = forget). */
const save = db.transaction((userId, songId, { targetKey, metronomeBpm, metronomeBeats }) => {
  ensureStmt.run(userId, songId);
  if (targetKey !== undefined) keyStmt.run(targetKey, userId, songId);
  if (metronomeBpm !== undefined) bpmStmt.run(metronomeBpm, userId, songId);
  if (metronomeBeats !== undefined) beatsStmt.run(metronomeBeats, userId, songId);
  cleanupStmt.run(userId, songId);
});

module.exports = {
  get: (userId, songId) => getStmt.get(userId, songId) || null,
  save,
};

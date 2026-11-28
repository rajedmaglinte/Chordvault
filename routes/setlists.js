const express = require('express');
const { requireAuth, optionalAuth } = require('../lib/auth');
const { STATUS, LIMITS } = require('../lib/constants');
const { validateListQuery, validateObjectBody, parseId, requireId, assertValid, validateSetlistInput, validateTargetKey, canonicalTargetKey, validateNashville, validateContentOverride, setlistListOptions } = require('../lib/validation');
const { AppError, requireFound, requireChanged } = require('../lib/errors');
const Setlist = require('../lib/models/setlist');
const Song = require('../lib/models/song');
const SongPrefs = require('../lib/models/songPrefs');
const { maskSetlistEntry, canViewSongVisibility, canOpenChurchSetlist } = require('../lib/songAccess');
const { normalizeVisibility } = require('../shared/access.mjs');

const requireSetlistId = raw => requireId(raw, 'Invalid setlist ID');

function resolveSetlist(setlistId, userId) {
  return requireFound(Setlist.findById(setlistId, userId), 'Setlist not found');
}

const findOwnSetlist = (rawId, user) => resolveSetlist(requireSetlistId(rawId), user.id);

const withEntries = (setlist, user) => ({ ...setlist, entries: Setlist.getEntries(setlist.id).map(entry => maskSetlistEntry(entry, user)) });

const storedTargetKey = key => (key == null ? null : canonicalTargetKey(key));

function createSetlistsRouter() {
  const router = express.Router();
  router.use(validateObjectBody);

  router.get('/setlists', requireAuth, validateListQuery, (req, res) => {
    res.json(Setlist.listForUser(req.user.id, setlistListOptions(req.query)));
  });

  router.post('/setlists', requireAuth, (req, res) => {
    const { name, visibility, event_date } = req.body;
    assertValid(validateSetlistInput(name, event_date, visibility));
    const vis = normalizeVisibility(visibility);
    const result = Setlist.create(req.user.id, name.trim(), vis, event_date || null);
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  });

  // Each church sees its own public setlists; signed-out visitors open them by link.
  router.get('/setlists/public', optionalAuth, validateListQuery, (req, res) => {
    // No church (signed out) matches no setlists, keeping the usual response shape.
    res.json(Setlist.listPublic(setlistListOptions(req.query), req.user?.church_id ?? null));
  });

  // A church's setlists are for its signed-in members only, even with a direct link.
  router.get('/setlists/public/:id', requireAuth, (req, res) => {
    const setlist = Setlist.findPublicById(requireSetlistId(req.params.id));
    if (!canOpenChurchSetlist(req.user, setlist)) throw new AppError('Setlist not found', 404);
    res.json(withEntries(setlist, req.user));
  });

  router.get('/setlists/:id', requireAuth, (req, res) => {
    res.json(withEntries(findOwnSetlist(req.params.id, req.user), req.user));
  });

  router.put('/setlists/:id', requireAuth, (req, res) => {
    const id = requireSetlistId(req.params.id);
    const { name, visibility, event_date } = req.body;
    assertValid(validateSetlistInput(name, event_date, visibility));
    requireChanged(Setlist.update(id, req.user.id, name.trim(), normalizeVisibility(visibility), event_date || null), 'Setlist not found');
    res.json({ success: true });
  });

  router.delete('/setlists/:id', requireAuth, (req, res) => {
    const id = requireSetlistId(req.params.id);
    requireChanged(Setlist.delete(id, req.user.id), 'Setlist not found');
    res.json({ success: true });
  });

  router.post('/setlists/:id/songs', requireAuth, (req, res) => {
    const { id } = findOwnSetlist(req.params.id, req.user);
    const { song_id, target_key, nashville } = req.body;
    if (!song_id) throw new AppError('song_id is required', 400);
    const songIdParsed = requireId(song_id, 'Invalid song_id');
    assertValid(validateTargetKey(target_key));
    assertValid(validateNashville(nashville));
    const song = requireFound(Song.findById(songIdParsed), 'Song not found');
    if (song.status === STATUS.PENDING) throw new AppError('Cannot add a pending correction to a setlist', 400);
    if (!canViewSongVisibility(req.user, song)) throw new AppError('Cannot add a private song you don\'t own', 403);
    // No key chosen: use this leader's own key (and tempo) for the song, if they set one before.
    const pref = target_key === undefined ? SongPrefs.get(req.user.id, songIdParsed) : null;
    const key = target_key !== undefined ? storedTargetKey(target_key) : (pref?.target_key ?? null);
    const result = Setlist.addSongEntry(id, songIdParsed, { targetKey: key, nashville });
    if (pref && (pref.metronome_bpm != null || pref.metronome_beats != null)) {
      Setlist.updateSongEntry(result.entry_id, id, { metronomeBpm: pref.metronome_bpm, metronomeBeats: pref.metronome_beats });
    }
    if (target_key !== undefined) SongPrefs.save(req.user.id, songIdParsed, { targetKey: key });
    res.json({
      entry_id: result.entry_id, position: result.position,
      remembered: pref ? { target_key: pref.target_key, metronome_bpm: pref.metronome_bpm, metronome_beats: pref.metronome_beats } : null,
    });
  });

  router.put('/setlists/:setlistId/entries/:entryId', requireAuth, (req, res) => {
    const setlistId = requireSetlistId(req.params.setlistId);
    const entryId = requireId(req.params.entryId, 'Invalid entry ID');
    resolveSetlist(setlistId, req.user.id);
    const { target_key, nashville, content_override, metronome_bpm, metronome_beats } = req.body;
    assertValid(validateTargetKey(target_key));
    assertValid(validateNashville(nashville));
    assertValid(validateContentOverride(content_override));
    // Metronome for this song in this setlist: null clears it (back to the song's tempo / 4 beats).
    if (metronome_bpm !== undefined && metronome_bpm !== null && !(Number.isInteger(metronome_bpm) && metronome_bpm >= 30 && metronome_bpm <= 250)) {
      throw new AppError('Metronome tempo must be a whole number from 30 to 250', 400);
    }
    if (metronome_beats !== undefined && metronome_beats !== null && ![2, 3, 4, 6].includes(metronome_beats)) {
      throw new AppError('Beats per bar must be 2, 3, 4 or 6', 400);
    }
    requireChanged(Setlist.updateSongEntry(entryId, setlistId, {
      targetKey: storedTargetKey(target_key),
      targetKeyProvided: 'target_key' in req.body,
      nashville,
      contentOverride: content_override,
      metronomeBpm: metronome_bpm,
      metronomeBeats: metronome_beats,
    }), 'Entry not found');
    // Remember the leader's choice for this song, for their next setlists.
    if ('target_key' in req.body || metronome_bpm !== undefined || metronome_beats !== undefined) {
      const songId = Setlist.getEntryById(entryId, setlistId)?.song_id;
      if (songId) {
        SongPrefs.save(req.user.id, songId, {
          targetKey: 'target_key' in req.body ? storedTargetKey(target_key) : undefined,
          metronomeBpm: metronome_bpm, metronomeBeats: metronome_beats,
        });
      }
    }
    res.json({ success: true });
  });

  router.delete('/setlists/:setlistId/entries/:entryId', requireAuth, (req, res) => {
    const setlistId = requireSetlistId(req.params.setlistId);
    const entryId = requireId(req.params.entryId, 'Invalid entry ID');
    resolveSetlist(setlistId, req.user.id);
    requireChanged(Setlist.deleteSongEntry(entryId, setlistId), 'Entry not found');
    res.json({ success: true });
  });

  router.put('/setlists/:id/reorder', requireAuth, (req, res) => {
    const { id } = findOwnSetlist(req.params.id, req.user);
    const { entry_ids } = req.body;
    if (!Array.isArray(entry_ids)) throw new AppError('entry_ids array is required', 400);
    if (entry_ids.length > LIMITS.MAX_REORDER) throw new AppError('Too many entries', 400);
    const parsedIds = entry_ids.map(e => parseId(e));
    if (parsedIds.some(e => e === null)) throw new AppError('All entry_ids must be valid integers', 400);
    if (new Set(parsedIds).size !== parsedIds.length) throw new AppError('Duplicate entry_ids are not allowed', 400);
    const entries = Setlist.getEntries(id);
    if (parsedIds.length !== entries.length) throw new AppError('entry_ids count must match the number of entries in the setlist', 400);
    const entryIds = new Set(entries.map(e => e.entry_id));
    if (parsedIds.some(e => !entryIds.has(e))) throw new AppError('entry_ids must be the entries of this setlist', 400);
    Setlist.reorderEntries(id, parsedIds);
    res.json({ success: true });
  });

  return router;
}

module.exports = { createSetlistsRouter };

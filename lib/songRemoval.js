const Song = require('./models/song');
const Activity = require('./models/activity');
const { STATUS } = require('./constants');
const { AppError } = require('./errors');
const { canManageSong } = require('./auth');
const { isSuperAdmin, isAdminRole } = require('../shared/access.mjs');

/**
 * "Delete" for everyone except the super admin deactivates the song: it disappears
 * everywhere but stays in the database and can be reactivated. Only the super admin
 * removes a song for good. Either way the history log keeps a copy of the text.
 * Returns 'deleted' or 'deactivated'.
 */
function removeSong(user, song) {
  if (song.status === STATUS.PENDING) throw new AppError('Use the corrections list to remove a correction', 400);
  const target = { type: 'song', id: song.id, name: song.title, snapshot: song.content, details: { owner: song.username } };

  if (isSuperAdmin(user.role)) {
    Song.delete(song.id);
    Activity.log(user, Activity.ACTIONS.SONG_DELETED, target);
    return 'deleted';
  }
  if (!canManageSong(user, song.user_id) || song.status !== STATUS.ACTIVE) throw new AppError('Song not found or not yours', 404);
  Song.setStatus(song.id, STATUS.ACTIVE, STATUS.INACTIVE);
  Activity.log(user, Activity.ACTIONS.SONG_DEACTIVATED, target);
  return 'deactivated';
}

/** Admins and the super admin can switch a song back on (or off). */
function setSongActive(user, song, active) {
  if (!isAdminRole(user.role)) throw new AppError('Admin access required', 403);
  const [from, to, action] = active
    ? [STATUS.INACTIVE, STATUS.ACTIVE, Activity.ACTIONS.SONG_REACTIVATED]
    : [STATUS.ACTIVE, STATUS.INACTIVE, Activity.ACTIONS.SONG_DEACTIVATED];
  if (!Song.setStatus(song.id, from, to)) throw new AppError(active ? 'Song is not deactivated' : 'Song is not active', 400);
  Activity.log(user, action, { type: 'song', id: song.id, name: song.title, snapshot: active ? null : song.content, details: { owner: song.username } });
}

module.exports = { removeSong, setSongActive };

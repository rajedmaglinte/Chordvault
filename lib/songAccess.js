const { VISIBILITY, STATUS } = require('./constants');
const { canManageSong } = require('./auth');

/** May `user` manage this song row (needs user_id and owner_church_id, as Song.findById returns)? */
const canManageSongRow = (user, song) => canManageSong(user, song.user_id, song.owner_church_id);

/** Public songs are open to every user of every church; private ones to their author and that church's admins. */
function canViewSongVisibility(user, song) {
  return song.visibility === VISIBILITY.PUBLIC || canManageSongRow(user, song);
}

function maskSetlistEntry(entry, user) {
  const deactivated = entry.status !== undefined && entry.status !== STATUS.ACTIVE;
  if (deactivated || !canViewSongVisibility(user, { visibility: entry.visibility, user_id: entry.song_user_id, owner_church_id: entry.song_church_id })) {
    return {
      entry_id: entry.entry_id, song_id: entry.song_id, position: entry.position,
      target_key: null, nashville: 0, content_override: null,
      title: '[Private Song]', artist: '', content: '', key: '',
      youtube_url: null, bpm: null, tags: null, language: '',
      username: '', is_private_placeholder: true,
      ...(deactivated ? { title: '[Deactivated Song]', is_deactivated: true } : {}),
    };
  }
  const { song_user_id: _, status: _s, song_church_id: _c, ...safe } = entry;
  return safe;
}

/** Setlist entry fields for display; aliases ss (entry), so (song), u (song owner). */
const ENTRY_COLUMNS = `ss.id AS entry_id, ss.song_id, ss.position, ss.target_key, ss.nashville, ss.content_override,
  so.title, so.artist, so.content, so.key, so.youtube_url, so.bpm, so.tags, so.language, so.visibility, so.user_id AS song_user_id, so.status, u.church_id AS song_church_id, u.username`;

/** Songs the viewer may see; binds VISIBILITY.PUBLIC then the viewer id (0 when signed out). */
const visibleToViewer = alias => `(${alias}.visibility = ? OR ${alias}.user_id = ?)`;

const familyRootId = song => song.parent_id || song.id;

/** Setlists belong to a church: only its members (and the site owner) may open or follow one. */
function canOpenChurchSetlist(user, setlist) {
  if (!user || !setlist) return false;
  return user.role === 'owner' || setlist.user_id === user.id
    || (setlist.owner_church_id != null && user.church_id === setlist.owner_church_id);
}

module.exports = { canOpenChurchSetlist, canManageSongRow, canViewSongVisibility, maskSetlistEntry, ENTRY_COLUMNS, visibleToViewer, familyRootId };

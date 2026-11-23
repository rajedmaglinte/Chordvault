const express = require('express');
const crypto = require('crypto');
const { setSetting, isRegistrationAllowed } = require('../lib/db');
const User = require('../lib/models/user');
const Song = require('../lib/models/song');
const Invite = require('../lib/models/invite');
const { requireAuth, requireAdmin, createAccount, setPassword } = require('../lib/auth');
const { validateObjectBody, requireId, assertValid, validateUserCredentials, validatePassword, validateBoolean, validateTagList } = require('../lib/validation');
const { AppError, requireFound, requireChanged } = require('../lib/errors');
const { ROLES, SETTING_KEYS } = require('../lib/constants');
const { manageUserError, isSuperAdmin } = require('../shared/access.mjs');
const Activity = require('../lib/models/activity');
const { removeSong, setSongActive } = require('../lib/songRemoval');
const Tags = require('../lib/models/tags');
const { blockInDemo } = require('../lib/demo');

function resolveAdminTarget(req) {
  const targetId = requireId(req.params.id, 'Invalid user ID');
  const target = requireFound(User.getFullById(targetId), 'User not found');
  const refusal = manageUserError(req.user, target);
  if (refusal) throw new AppError(refusal, 403);
  return { targetId, target };
}

function requireSuperAdmin(req, _res, next) {
  if (!isSuperAdmin(req.user.role)) throw new AppError('Only the super admin can do this', 403);
  next();
}

const findSongForAdmin = raw => requireFound(Song.findById(requireId(raw, 'Invalid song ID')), 'Song not found');
const userTarget = target => ({ type: 'user', id: target.id, name: target.username });

function createAdminRouter() {
  const router = express.Router();
  router.use(validateObjectBody);
  router.use('/admin', requireAuth, requireAdmin);

  router.get('/admin/stats', (req, res) => {
    const userCount = User.count().count;
    const songCount = Song.count();
    const pendingCount = Song.countPending();
    const recentUsers = User.getRecent(5);
    const recentSongs = Song.getRecent(5);
    const noFormatCount = Song.countNoFormat();
    const languageDistribution = Song.getLanguageDistribution();
    res.json({ userCount, songCount, pendingCount, noFormatCount, languageDistribution, recentUsers, recentSongs });
  });

  router.get('/admin/users', (req, res) => {
    const users = User.listWithSongCount();
    res.json(users);
  });

  router.put('/admin/users/:id/role', blockInDemo, (req, res) => {
    const { role } = req.body;
    const resolved = resolveAdminTarget(req);

    if (role === ROLES.ADMIN && req.user.role !== ROLES.OWNER) throw new AppError('Only the owner can promote or demote admins', 403);
    if (role !== ROLES.USER && role !== ROLES.ADMIN) throw new AppError('Role must be "user" or "admin"', 400);

    User.updateRole(resolved.targetId, role);
    Activity.log(req.user, Activity.ACTIONS.USER_ROLE, { ...userTarget(resolved.target), details: { from: resolved.target.role, to: role } });
    res.json({ success: true });
  });

  router.put('/admin/users/:id/disabled', blockInDemo, (req, res) => {
    const { disabled } = req.body;
    assertValid(validateBoolean(disabled, 'disabled'));
    const { targetId, target } = resolveAdminTarget(req);
    User.updateDisabled(targetId, disabled);
    Activity.log(req.user, disabled ? Activity.ACTIONS.USER_BLOCKED : Activity.ACTIONS.USER_UNBLOCKED, userTarget(target));
    res.json({ success: true });
  });

  router.put('/admin/users/:id/password', blockInDemo, async (req, res) => {
    const { targetId } = resolveAdminTarget(req);
    const { password } = req.body;
    assertValid(validatePassword(password));

    await setPassword(targetId, password);
    res.json({ success: true });
  });

  router.post('/admin/users', blockInDemo, async (req, res) => {
    const { username, password } = req.body;
    assertValid(validateUserCredentials(username, password));
    const { id, username: name } = await createAccount(username, password, (trimmed, hash) => User.create(trimmed, hash, ROLES.USER));
    Activity.log(req.user, Activity.ACTIONS.USER_ADDED, { type: 'user', id, name });
    res.json({ id, username: name });
  });

  // Admins block users; only the super admin deletes them (with all their songs and setlists).
  router.delete('/admin/users/:id', blockInDemo, (req, res) => {
    const { targetId, target } = resolveAdminTarget(req);
    requireSuperAdmin(req, res, () => {});
    const songCount = User.listWithSongCount().find(u => u.id === targetId)?.song_count ?? 0;
    User.delete(targetId);
    Activity.log(req.user, Activity.ACTIONS.USER_DELETED, { ...userTarget(target), details: { songs: songCount } });
    res.json({ success: true });
  });

  // Admins deactivate; the super admin deletes for good.
  router.delete('/admin/songs/:id', (req, res) => {
    res.json({ success: true, result: removeSong(req.user, findSongForAdmin(req.params.id)) });
  });

  router.get('/admin/songs/inactive', (_req, res) => res.json(Song.listInactive()));

  router.put('/admin/songs/:id/active', (req, res) => {
    const { active } = req.body;
    assertValid(validateBoolean(active, 'active'));
    setSongActive(req.user, findSongForAdmin(req.params.id), active);
    res.json({ success: true });
  });

  router.get('/admin/history', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const type = ['song', 'user'].includes(req.query.type) ? req.query.type : null;
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    res.json(Activity.list({ type, q, page, limit }));
  });

  router.get('/admin/history/:id', (req, res) => {
    res.json(requireFound(Activity.get(requireId(req.params.id, 'Invalid history ID')), 'History entry not found'));
  });

  router.post('/admin/invites', blockInDemo, (req, res) => {
    const code = crypto.randomBytes(8).toString('hex');
    Invite.create(code, req.user.id);
    res.json({ code });
  });

  router.get('/admin/invites', (req, res) => {
    const invites = Invite.list();
    res.json(invites);
  });

  router.delete('/admin/invites/:id', blockInDemo, (req, res) => {
    requireChanged(Invite.deleteUnused(requireId(req.params.id, 'Invalid invite ID')), 'Invite not found or already used');
    res.json({ success: true });
  });

  router.get('/admin/corrections', (req, res) => {
    const corrections = Song.getPendingCorrections();
    res.json(corrections);
  });

  router.get('/admin/config', (req, res) => {
    res.json({ allowRegistration: isRegistrationAllowed() });
  });

  router.get('/admin/tags', (_req, res) => res.json(Tags.withUsage()));

  router.put('/admin/tags', blockInDemo, (req, res) => {
    const { tags, error } = validateTagList(req.body.tags);
    assertValid(error);
    Tags.saveTags(tags);
    res.json(Tags.withUsage());
  });

  router.delete('/admin/tags', blockInDemo, (_req, res) => {
    Tags.resetTags();
    res.json(Tags.withUsage());
  });

  router.put('/admin/config', blockInDemo, (req, res) => {
    const { allowRegistration } = req.body;
    assertValid(validateBoolean(allowRegistration, 'allowRegistration'));
    setSetting(SETTING_KEYS.ALLOW_REGISTRATION, allowRegistration ? '1' : '0');
    res.json({ success: true, allowRegistration });
  });

  return router;
}

module.exports = { createAdminRouter };

const express = require('express');
const crypto = require('crypto');
const { setSetting, isRegistrationAllowed } = require('../lib/db');
const User = require('../lib/models/user');
const Song = require('../lib/models/song');
const Invite = require('../lib/models/invite');
const Church = require('../lib/models/church');
const { requireAuth, requireAdmin, createAccount, setPassword } = require('../lib/auth');
const { validateObjectBody, requireId, assertValid, validateUserCredentials, validatePassword, validateBoolean, validateTagList } = require('../lib/validation');
const { AppError, requireFound, requireChanged } = require('../lib/errors');
const { ROLES, SETTING_KEYS } = require('../lib/constants');
const { manageUserError, isSuperAdmin, isSiteOwner, assignableRoles, ROLE_LABELS } = require('../shared/access.mjs');
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

function requireSiteOwner(req, _res, next) {
  if (!isSiteOwner(req.user.role)) throw new AppError('Only the owner can do this', 403);
  next();
}

/** Which church an admin request is about: the owner may pick one (?church= or body.church_id), everyone else is their own. */
function churchScope(req, requested) {
  if (!isSiteOwner(req.user.role)) return req.user.church_id;
  const id = Number(requested);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The church a new account or invite goes to; the owner may choose, others use their own. */
function targetChurch(req) {
  const id = churchScope(req, req.body?.church_id) ?? req.user.church_id;
  requireFound(Church.find(id), 'Church not found');
  return id;
}

function assertMayGiveRole(req, role) {
  if (!assignableRoles(req.user).includes(role)) {
    throw new AppError(`You cannot make someone ${ROLE_LABELS[role] ? `a ${ROLE_LABELS[role]}` : 'that role'}`, 403);
  }
}

const findSongForAdmin = raw => requireFound(Song.findById(requireId(raw, 'Invalid song ID')), 'Song not found');
const userTarget = target => ({ type: 'user', id: target.id, name: target.username, churchId: target.church_id });

function createAdminRouter() {
  const router = express.Router();
  router.use(validateObjectBody);
  router.use('/admin', requireAuth, requireAdmin);

  router.get('/admin/stats', (req, res) => {
    const scope = churchScope(req, req.query.church);
    const userCount = scope == null ? User.count().count : User.countInChurch(scope);
    const songCount = Song.count();
    const pendingCount = Song.countPending();
    const recentUsers = User.getRecent(5);
    const recentSongs = Song.getRecent(5);
    const noFormatCount = Song.countNoFormat();
    const languageDistribution = Song.getLanguageDistribution();
    res.json({ userCount, songCount, pendingCount, noFormatCount, languageDistribution, recentUsers, recentSongs });
  });

  router.get('/admin/users', (req, res) => {
    res.json(User.listWithSongCount(churchScope(req, req.query.church)));
  });

  router.put('/admin/users/:id/role', blockInDemo, (req, res) => {
    const { role } = req.body;
    const resolved = resolveAdminTarget(req);

    if (![ROLES.USER, ROLES.ADMIN, ROLES.CHURCH_OWNER].includes(role)) throw new AppError('Role must be "user", "admin" or "church_owner"', 400);
    assertMayGiveRole(req, role);

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
    const churchId = targetChurch(req);
    const { id, username: name } = await createAccount(username, password, (trimmed, hash) => User.create(trimmed, hash, ROLES.USER, churchId));
    Activity.log(req.user, Activity.ACTIONS.USER_ADDED, { type: 'user', id, name });
    res.json({ id, username: name });
  });

  // Admins block users; only the super admin deletes them (with all their songs and setlists).
  router.delete('/admin/users/:id', blockInDemo, (req, res) => {
    const { targetId, target } = resolveAdminTarget(req);
    requireSuperAdmin(req, res, () => {});
    const songCount = User.listWithSongCount(target.church_id ?? null).find(u => u.id === targetId)?.song_count ?? 0;
    User.delete(targetId);
    Activity.log(req.user, Activity.ACTIONS.USER_DELETED, { ...userTarget(target), details: { songs: songCount } });
    res.json({ success: true });
  });

  // Admins deactivate; the super admin deletes for good.
  router.delete('/admin/songs/:id', (req, res) => {
    res.json({ success: true, result: removeSong(req.user, findSongForAdmin(req.params.id)) });
  });

  router.get('/admin/songs/inactive', (req, res) => res.json(Song.listInactive(churchScope(req, req.query.church))));

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
    res.json(Activity.list({ type, q, page, limit, churchId: churchScope(req, req.query.church) }));
  });

  router.get('/admin/history/:id', (req, res) => {
    const entry = requireFound(Activity.get(requireId(req.params.id, 'Invalid history ID')), 'History entry not found');
    if (!isSiteOwner(req.user.role) && entry.church_id !== req.user.church_id) throw new AppError('History entry not found', 404);
    res.json(entry);
  });

  router.post('/admin/invites', blockInDemo, (req, res) => {
    const role = req.body?.role || ROLES.USER;
    if (![ROLES.USER, ROLES.ADMIN, ROLES.CHURCH_OWNER].includes(role)) throw new AppError('Invalid role', 400);
    assertMayGiveRole(req, role);
    const churchId = targetChurch(req);
    const code = crypto.randomBytes(8).toString('hex');
    Invite.create(code, req.user.id, churchId, role);
    res.json({ code, role, church_id: churchId });
  });

  router.get('/admin/invites', (req, res) => {
    res.json(Invite.list(churchScope(req, req.query.church)));
  });

  router.delete('/admin/invites/:id', blockInDemo, (req, res) => {
    const id = requireId(req.params.id, 'Invalid invite ID');
    const invite = Invite.findById(id);
    if (invite && !isSiteOwner(req.user.role) && invite.church_id !== req.user.church_id) throw new AppError('Invite not found or already used', 404);
    requireChanged(Invite.deleteUnused(id), 'Invite not found or already used');
    res.json({ success: true });
  });

  router.get('/admin/corrections', (req, res) => {
    res.json(Song.getPendingCorrections(churchScope(req, req.query.church)));
  });

  router.get('/admin/config', (req, res) => {
    res.json({ allowRegistration: isRegistrationAllowed() });
  });

  router.get('/admin/tags', (_req, res) => res.json(Tags.withUsage()));

  router.put('/admin/tags', blockInDemo, requireSiteOwner, (req, res) => {
    const { tags, error } = validateTagList(req.body.tags);
    assertValid(error);
    Tags.saveTags(tags);
    res.json(Tags.withUsage());
  });

  router.delete('/admin/tags', blockInDemo, requireSiteOwner, (_req, res) => {
    Tags.resetTags();
    res.json(Tags.withUsage());
  });

  router.put('/admin/config', blockInDemo, requireSiteOwner, (req, res) => {
    const { allowRegistration } = req.body;
    assertValid(validateBoolean(allowRegistration, 'allowRegistration'));
    setSetting(SETTING_KEYS.ALLOW_REGISTRATION, allowRegistration ? '1' : '0');
    res.json({ success: true, allowRegistration });
  });

  // Churches: the owner adds them; a church super admin may rename their own.
  router.get('/admin/churches', (req, res) => {
    const all = Church.list();
    res.json(isSiteOwner(req.user.role) ? all : all.filter(c => c.id === req.user.church_id));
  });

  router.post('/admin/churches', blockInDemo, requireSiteOwner, (req, res) => {
    const church = Church.create(req.body?.name);
    const code = crypto.randomBytes(8).toString('hex');
    Invite.create(code, req.user.id, church.id, ROLES.CHURCH_OWNER);
    Activity.log(req.user, Activity.ACTIONS.CHURCH_ADDED, { type: 'church', id: church.id, name: church.name, churchId: church.id });
    res.json({ church, code });
  });

  router.put('/admin/churches/:id', blockInDemo, (req, res) => {
    const id = requireId(req.params.id, 'Invalid church ID');
    requireFound(Church.find(id), 'Church not found');
    if (!isSiteOwner(req.user.role) && !(req.user.role === ROLES.CHURCH_OWNER && req.user.church_id === id)) {
      throw new AppError('Only the owner or this church\'s super admin can rename it', 403);
    }
    Church.rename(id, req.body?.name);
    res.json({ success: true });
  });

  return router;
}

module.exports = { createAdminRouter };

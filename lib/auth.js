const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('./models/user');
const { isAdminRole, isSiteOwner } = require('../shared/access.mjs');
const { AppError, handleDbError } = require('./errors');

const BCRYPT_ROUNDS = 10;

const JWT_SECRET = process.env.JWT_SECRET;

const AUTH_RESULT = Symbol('authResult');

function resolveAuth(req) {
  if (req[AUTH_RESULT]) return req[AUTH_RESULT];
  const token = req.headers.authorization?.split(' ')[1];
  let result;
  if (!token) {
    result = { status: 401, error: 'Authentication required' };
  } else {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = User.findById(decoded.id);
      result = !user ? { status: 401, error: 'User not found' }
        : user.disabled ? { status: 403, error: 'Account is disabled' }
          : { user: { id: user.id, username: user.username, role: user.role, church_id: user.church_id, church_name: user.church_name } };
    } catch {
      result = { status: 401, error: 'Invalid or expired token' };
    }
  }
  req[AUTH_RESULT] = result;
  return result;
}

function requireAuth(req, res, next) {
  const result = resolveAuth(req);
  if (!result.user) throw new AppError(result.error, result.status);
  req.user = result.user;
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdminRole(req.user.role)) throw new AppError('Admin access required', 403);
  next();
}

function optionalAuth(req, res, next) {
  const result = resolveAuth(req);
  if (result.user) req.user = result.user;
  next();
}

const viewerId = req => req.user?.id ?? 0;

/**
 * May `user` edit or deactivate a song? Its author can; admins of the author's church can; the
 * site owner can. `ownerChurchId` is the author's church (songs are shared, people are not).
 */
function canManageSong(user, ownerId, ownerChurchId) {
  if (!user) return false;
  if (user.id === ownerId || isSiteOwner(user.role)) return true;
  return isAdminRole(user.role) && ownerChurchId != null && user.church_id === ownerChurchId;
}

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Compared against when the username does not exist, so that case costs the same as a wrong password.
const missingUserHash = hashPassword('chordvault-missing-user');

async function checkPassword(password, hash) {
  return bcrypt.compare(password, hash ?? await missingUserHash);
}

function issueToken({ id, username }) {
  return jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
}

function sessionResponse({ id, username, role }) {
  const full = User.findById(id);
  return { token: issueToken({ id, username }), id, username, role, church_id: full?.church_id ?? null, church_name: full?.church_name ?? null };
}

/** Hashes the password and runs `create(trimmedUsername, hash)` for `{ id, role }`; a taken username becomes a 400. */
async function createAccount(username, password, create) {
  const name = username.trim();
  const hash = await hashPassword(password);
  try {
    return { ...(await create(name, hash)), username: name };
  } catch (e) {
    throw handleDbError(e, { uniqueMessage: 'Username already taken' });
  }
}

async function setPassword(id, password) {
  User.updatePassword(id, await hashPassword(password));
}

module.exports = {
  resolveAuth,
  canManageSong,
  viewerId,
  isAdminRole,
  requireAuth,
  requireAdmin,
  optionalAuth,
  hashPassword,
  checkPassword,
  issueToken,
  sessionResponse,
  createAccount,
  setPassword,
};

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../lib/auth');
const { canOpenChurchSetlist } = require('../lib/songAccess');
const { AppError, requireFound } = require('../lib/errors');
const { requireId } = require('../lib/validation');
const Setlist = require('../lib/models/setlist');
const { isAdminRole, isSiteOwner } = require('../shared/access.mjs');

/*
 * Live setlist sessions: a leader sends "song N, section M" and every device
 * watching that setlist jumps there. Followers listen with Server-Sent Events
 * (plain HTTP, reconnects by itself, works through nginx and on a church LAN).
 * State lives in memory only: a restart simply ends any live session.
 */

const MAX_LISTENERS_PER_SETLIST = 200;
const MAX_LISTENERS_TOTAL = 2000;
const HEARTBEAT_MS = 20_000;
const MAX_INDEX = 1000;

/** setlistId -> { state, listeners: Set<res> } */
const sessions = new Map();
let totalListeners = 0;

function sessionFor(id) {
  let s = sessions.get(id);
  if (!s) {
    s = { state: { active: false, index: 0, section: -1, leader: null, seq: 0, listeners: 0 }, listeners: new Set() };
    sessions.set(id, s);
  }
  return s;
}

function send(res, state) {
  res.write(`data: ${JSON.stringify(state)}\n\n`);
}

function broadcast(s) {
  s.state.listeners = s.listeners.size;
  for (const res of s.listeners) send(res, s.state);
}

function forget(id, s) {
  if (!s.listeners.size && !s.state.active) sessions.delete(id);
}

const requireSetlistId = raw => requireId(raw, 'Invalid setlist ID');

/** Only public setlists can go live: followers listen without logging in. */
const findLiveSetlist = id => requireFound(Setlist.findPublicById(id), 'Setlist not found or not public');

function readInt(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new AppError(`Invalid ${name}`, 400);
  return value;
}

function createLiveRouter() {
  const router = express.Router();
  // Its own limits, so a leader tapping through sections never hits the general write limit.
  const leadLimiter = rateLimit({ limit: 240, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' } });
  const listenLimiter = rateLimit({ limit: 120, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' } });
  const limitsOn = () => !['development', 'test'].includes(process.env.NODE_ENV);

  // Following needs a signed-in member of the setlist's church (sent as an Authorization header).
  router.get('/:id/stream', (req, res, next) => (limitsOn() ? listenLimiter(req, res, next) : next()), requireAuth, (req, res) => {
    const id = requireSetlistId(req.params.id);
    if (!canOpenChurchSetlist(req.user, findLiveSetlist(id))) throw new AppError('Setlist not found or not public', 404);
    const s = sessionFor(id);
    if (s.listeners.size >= MAX_LISTENERS_PER_SETLIST || totalListeners >= MAX_LISTENERS_TOTAL) {
      forget(id, s);
      throw new AppError('Too many listeners', 503);
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tell nginx not to buffer the stream
    });
    res.flushHeaders();
    res.write('retry: 2000\n\n');

    s.listeners.add(res);
    totalListeners++;
    broadcast(s); // the newcomer gets the current state; everyone gets the new count

    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      if (s.listeners.delete(res)) totalListeners--;
      broadcast(s);
      forget(id, s);
    });
  });

  router.post('/:id', (req, res, next) => (limitsOn() ? leadLimiter(req, res, next) : next()), requireAuth, (req, res) => {
    const id = requireSetlistId(req.params.id);
    const setlist = findLiveSetlist(id);
    const churchLeader = isAdminRole(req.user.role) && req.user.church_id != null && req.user.church_id === setlist.owner_church_id;
    if (setlist.user_id !== req.user.id && !churchLeader && !isSiteOwner(req.user.role)) {
      throw new AppError('Only the setlist owner or an admin of that church can lead', 403);
    }
    const body = req.body || {};
    const s = sessionFor(id);
    if (body.active === false) {
      s.state = { ...s.state, active: false, seq: s.state.seq + 1 };
    } else {
      s.state = {
        ...s.state,
        active: true,
        index: readInt(body.index, 0, MAX_INDEX, 'index'),
        section: readInt(body.section ?? -1, -1, MAX_INDEX, 'section'),
        leader: req.user.username,
        seq: s.state.seq + 1,
      };
    }
    broadcast(s);
    forget(id, s);
    res.json(s.state);
  });

  return router;
}

/** Ends every open stream so the server can shut down promptly. */
function closeLiveStreams() {
  for (const s of sessions.values()) for (const res of s.listeners) res.end();
}

module.exports = { createLiveRouter, closeLiveStreams };

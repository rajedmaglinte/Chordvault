const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { resolveAuth } = require('./auth');

const exitPolicyRouter = (_req, _res, next) => next('router');

/*
 * Who a request counts against. A whole church (or office, or school) usually reaches the
 * server through ONE public IP address, so counting signed-in members per address would make
 * twenty phones share one allowance on a Sunday morning. Signed-in requests therefore count
 * per account; anonymous ones per address (IPv6 grouped by /56, as the library does).
 */
const ipKey = req => `ip:${ipKeyGenerator(req.ip)}`;
const accountOrIpKey = (req) => {
  const { user } = resolveAuth(req);
  return user ? `user:${user.id}` : ipKey(req);
};
/** Login attempts count per address *and* username: guessing one account's password stays slow,
 *  while many people signing in from the same church Wi-Fi do not block each other. */
const loginKey = (req) => {
  const name = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0, 100) : '';
  return `${ipKey(req)}|${name}`;
};

function createLimiter(limit, windowMs, keyGenerator = ipKey) {
  return rateLimit({
    limit,
    windowMs,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });
}

function createApiRateLimiter() {
  const router = express.Router();
  const registration = createLimiter(20, 3_600_000);
  const loginPerAccount = createLimiter(15, 900_000, loginKey);
  const loginPerAddress = createLimiter(200, 900_000);
  const write = createLimiter(50, 60_000, accountOrIpKey);
  const read = createLimiter(200, 60_000, accountOrIpKey);
  const publicRead = createLimiter(180, 60_000);
  const publicBurst = createLimiter(30, 5_000);

  router.use((_req, _res, next) => {
    const env = process.env.NODE_ENV;
    if (env === 'development' || env === 'test') return next('router');
    next();
  });
  router.post('/auth/login', loginPerAddress, loginPerAccount, exitPolicyRouter);
  router.post(['/auth/register', '/auth/redeem-invite'], registration, exitPolicyRouter);
  router.get('/songs/export', createLimiter(5, 60_000, accountOrIpKey), exitPolicyRouter);
  router.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) return write(req, res, next);
    if (resolveAuth(req).user) return read(req, res, next);
    return publicBurst(req, res, (err) => {
      if (err) return next(err);
      return publicRead(req, res, next);
    });
  });
  return router;
}

module.exports = { createApiRateLimiter };

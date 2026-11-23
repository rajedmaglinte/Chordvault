const express = require('express');
const helmet = require('helmet');
const { errorHandler } = require('./errors');
const { LIMITS } = require('./constants');

/** The request pipeline shared by the server and the route tests; `mount` adds the routes. */
function createApp(mount) {
  const app = express();
  const directives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
    fontSrc: ["'self'", "fonts.gstatic.com"],
    connectSrc: ["'self'"],
    frameSrc: ["'self'", "https://challenges.cloudflare.com"],
  };
  // Over HTTPS, keep helmet's full defaults. Over plain HTTP (a PC or hub on the church LAN,
  // opened as http://192.168.x.x:3100) "upgrade-insecure-requests" would make the browser fetch
  // the app's scripts over https:// and the page would stay blank, so leave it and HSTS out there.
  const secureHeaders = helmet({ contentSecurityPolicy: { directives } });
  const lanHeaders = helmet({
    contentSecurityPolicy: { directives: { ...directives, upgradeInsecureRequests: null } },
    strictTransportSecurity: false,
  });
  app.use((req, res, next) => (req.secure ? secureHeaders : lanHeaders)(req, res, next));
  app.set('trust proxy', 1);
  app.use(express.json({ limit: LIMITS.MAX_BODY_JSON }));
  mount(app);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };

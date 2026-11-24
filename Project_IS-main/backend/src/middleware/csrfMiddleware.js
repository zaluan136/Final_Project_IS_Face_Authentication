const crypto = require('node:crypto');
const { AppError } = require('../utils/errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const sessionToken = req.session?.csrfToken;
  const headerToken = req.get('X-CSRF-Token');

  if (!sessionToken || typeof headerToken !== 'string' || headerToken.length === 0) {
    return next(new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token.'));
  }

  const expectedBuf = Buffer.from(sessionToken, 'utf8');
  const receivedBuf = Buffer.from(headerToken, 'utf8');

  if (
    expectedBuf.length !== receivedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    return next(new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token.'));
  }

  return next();
}

module.exports = {
  ensureCsrfToken,
  csrfProtection,
};

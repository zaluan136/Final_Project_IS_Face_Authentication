const { AppError } = require('../utils/errors');

function validateLoginPayload(body) {
  if (!body || typeof body !== 'object') {
    throw new AppError(400, 'INVALID_REQUEST', 'Request body must be JSON.');
  }

  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const rememberMe = Boolean(body.rememberMe);

  if (!identifier || identifier.length > 120) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Employee ID or email is required.');
  }

  if (!password || password.length > 128) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password is required.');
  }

  return { identifier, password, rememberMe };
}

module.exports = { validateLoginPayload };

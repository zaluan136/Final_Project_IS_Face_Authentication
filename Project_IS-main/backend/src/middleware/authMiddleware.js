const { AppError } = require('../utils/errors');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.employeeId) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }
  return next();
}

module.exports = { requireAuth };

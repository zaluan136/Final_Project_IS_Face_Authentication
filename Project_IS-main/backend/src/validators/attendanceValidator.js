const { AppError } = require('../utils/errors');

function validatePaginationQuery(query) {
  const rawPage = query?.page;
  const rawLimit = query?.limit;

  const page = rawPage === undefined ? 1 : Number.parseInt(rawPage, 10);
  const limit = rawLimit === undefined ? 10 : Number.parseInt(rawLimit, 10);

  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid page parameter.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid limit parameter (1-50).');
  }

  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { validatePaginationQuery };

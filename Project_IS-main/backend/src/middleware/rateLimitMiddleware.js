const rateLimit = require('express-rate-limit');

function createLoginRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many login attempts. Please wait a few minutes and try again.',
        },
      });
    },
  });
}

module.exports = { createLoginRateLimiter };

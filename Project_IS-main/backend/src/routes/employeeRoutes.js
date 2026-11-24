const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');

function createEmployeeRoutes(employeeController) {
  const router = express.Router();

  router.get('/me', requireAuth, employeeController.getMe);

  return router;
}

module.exports = { createEmployeeRoutes };

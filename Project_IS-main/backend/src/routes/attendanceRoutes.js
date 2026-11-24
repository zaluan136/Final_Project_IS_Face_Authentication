const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');

function createAttendanceRoutes(attendanceController, uploadPhotoMiddleware) {
  const router = express.Router();

  router.use(requireAuth);

  router.post('/check-in', csrfProtection, uploadPhotoMiddleware, attendanceController.checkIn);
  router.post('/check-out', csrfProtection, uploadPhotoMiddleware, attendanceController.checkOut);
  router.get('/today', attendanceController.getToday);
  router.get('/history', attendanceController.getHistory);
  router.get('/:id/evidence/:type', attendanceController.getEvidence);

  return router;
}

module.exports = { createAttendanceRoutes };

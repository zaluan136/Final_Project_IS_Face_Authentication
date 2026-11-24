const express = require('express');
const { HCM_TIMEZONE, nowUtcIso, getAttendanceDateHCM } = require('../utils/time');

function createHealthRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'AttendSecure API',
        timestamp: nowUtcIso(),
        attendanceDate: getAttendanceDateHCM(),
        timezone: HCM_TIMEZONE,
      },
    });
  });

  return router;
}

module.exports = { createHealthRoutes };

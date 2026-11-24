const fs = require('node:fs');
const { validatePaginationQuery } = require('../validators/attendanceValidator');

function createAttendanceController(attendanceService) {
  function checkIn(req, res, next) {
    try {
      const record = attendanceService.checkIn(req.session.employeeId, req.file);
      return res.status(201).json({
        success: true,
        message: 'Check-in recorded successfully',
        data: { record },
      });
    } catch (err) {
      return next(err);
    }
  }

  function checkOut(req, res, next) {
    try {
      const record = attendanceService.checkOut(req.session.employeeId, req.file);
      return res.status(200).json({
        success: true,
        message: 'Check-out recorded successfully',
        data: { record },
      });
    } catch (err) {
      return next(err);
    }
  }

  function getToday(req, res, next) {
    try {
      const today = attendanceService.getToday(req.session.employeeId);
      return res.status(200).json({
        success: true,
        data: today,
      });
    } catch (err) {
      return next(err);
    }
  }

  function getHistory(req, res, next) {
    try {
      const pagination = validatePaginationQuery(req.query);
      const history = attendanceService.getHistory(req.session.employeeId, pagination);
      return res.status(200).json({
        success: true,
        data: history,
      });
    } catch (err) {
      return next(err);
    }
  }

  function getEvidence(req, res, next) {
    try {
      const recordId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(recordId) || recordId < 1) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Invalid attendance record ID.' },
        });
      }

      const filePath = attendanceService.getEvidenceFileForEmployee(
        req.session.employeeId,
        recordId,
        req.params.type
      );

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence photo not found.' },
        });
      }

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(filePath);
    } catch (err) {
      return next(err);
    }
  }

  return {
    checkIn,
    checkOut,
    getToday,
    getHistory,
    getEvidence,
  };
}

module.exports = { createAttendanceController };

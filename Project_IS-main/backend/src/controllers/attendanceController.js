const fs = require('node:fs');
const crypto = require('node:crypto');
const { AppError } = require('../utils/errors');
const { validatePaginationQuery } = require('../validators/attendanceValidator');
const { verifyFaceEvidence } = require('../services/antiSpoofGate');

function createAttendanceController(attendanceService) {
  function getLivenessChallenge(req, res) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const challenges = req.session.attendanceLivenessChallenges || {};
    for (const [issuedNonce, record] of Object.entries(challenges)) {
      if (now - record.createdAt > 60 * 1000) delete challenges[issuedNonce];
    }
    challenges[nonce] = {
      challengeId: 'blink-twice',
      employeeId: req.session.employeeId,
      createdAt: now,
    };
    req.session.attendanceLivenessChallenges = challenges;

    return res.status(200).json({
      success: true,
      data: { nonce, challengeId: 'blink-twice', expiresInSeconds: 60 },
    });
  }

  function consumeLivenessChallenge(req) {
    if (!attendanceService.requiresLivenessChallenge(req.session.employeeId)) return;

    const { livenessNonce, livenessChallenge } = req.body || {};
    const challenges = req.session.attendanceLivenessChallenges || {};
    const record = challenges[livenessNonce];
    if (record) delete challenges[livenessNonce];
    req.session.attendanceLivenessChallenges = challenges;

    if (
      !record ||
      record.employeeId !== req.session.employeeId ||
      record.challengeId !== livenessChallenge ||
      Date.now() - record.createdAt > 60 * 1000
    ) {
      throw new AppError(403, 'LIVENESS_REQUIRED', 'Liveness challenge is missing, expired, or already used. Capture a new live face check.');
    }
  }

  async function checkIn(req, res, next) {
    try {
      consumeLivenessChallenge(req);
      if (attendanceService.requiresLivenessChallenge(req.session.employeeId)) await verifyFaceEvidence(req.body.faceEvidence);
      let faceDescriptor = null;
      if (req.body && req.body.faceDescriptor) {
        try {
          faceDescriptor = typeof req.body.faceDescriptor === 'string'
            ? JSON.parse(req.body.faceDescriptor)
            : req.body.faceDescriptor;
        } catch {
          faceDescriptor = null;
        }
      }
      const record = attendanceService.checkIn(req.session.employeeId, req.file, faceDescriptor);
      return res.status(201).json({
        success: true,
        message: 'Check-in recorded successfully',
        data: { record },
      });
    } catch (err) {
      return next(err);
    }
  }

  async function checkOut(req, res, next) {
    try {
      consumeLivenessChallenge(req);
      if (attendanceService.requiresLivenessChallenge(req.session.employeeId)) await verifyFaceEvidence(req.body.faceEvidence);
      let faceDescriptor = null;
      if (req.body && req.body.faceDescriptor) {
        try {
          faceDescriptor = typeof req.body.faceDescriptor === 'string'
            ? JSON.parse(req.body.faceDescriptor)
            : req.body.faceDescriptor;
        } catch {
          faceDescriptor = null;
        }
      }
      const record = attendanceService.checkOut(req.session.employeeId, req.file, faceDescriptor);
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
    getLivenessChallenge,
    checkIn,
    checkOut,
    getToday,
    getHistory,
    getEvidence,
  };
}

module.exports = { createAttendanceController };

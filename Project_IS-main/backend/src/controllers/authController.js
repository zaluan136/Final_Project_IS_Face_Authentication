const crypto = require('node:crypto');
const { ensureCsrfToken } = require('../middleware/csrfMiddleware');
const { validateLoginPayload } = require('../validators/authValidator');
const { verifyFaceEvidence } = require('../services/antiSpoofGate');

// Challenge pool theo báo cáo giữa kỳ (Active Liveness Challenge - Response)
const CHALLENGE_POOL = [
  { id: 'blink', instruction: 'Hãy CHỚP MẮT tự nhiên (2 lần)' },
  { id: 'turn-left-blink', instruction: 'Hãy QUAY MẶT SANG TRÁI, nhìn thẳng lại rồi CHỚP MẮT 2 LẦN' },
  { id: 'turn-right-blink', instruction: 'Hãy QUAY MẶT SANG PHẢI, nhìn thẳng lại rồi CHỚP MẮT 2 LẦN' },
];

function createAuthController(authService, env) {
  function getCsrfToken(req, res) {
    const csrfToken = ensureCsrfToken(req);
    return res.status(200).json({
      success: true,
      data: { csrfToken },
    });
  }

  function getLivenessChallenge(req, res, purpose = 'login') {
    const nonce = crypto.randomBytes(16).toString('hex');
    const selected = CHALLENGE_POOL[crypto.randomInt(CHALLENGE_POOL.length)];

    // Keep only live challenges so a long-lived session cannot accumulate tokens.
    const now = Date.now();
    const livenessChallenges = req.session.livenessChallenges || {};
    for (const [issuedNonce, record] of Object.entries(livenessChallenges)) {
      if (now - record.createdAt > 60 * 1000) delete livenessChallenges[issuedNonce];
    }
    // Lưu nonce với thời hạn 60 giây
    livenessChallenges[nonce] = {
      challengeId: selected.id,
      purpose,
      createdAt: now,
    };
    req.session.livenessChallenges = livenessChallenges;

    return res.status(200).json({
      success: true,
      data: {
        nonce,
        challengeId: selected.id,
        instruction: selected.instruction,
        expiresInSeconds: 60,
      },
    });
  }

  function getRegistrationChallenge(req, res) { return getLivenessChallenge(req, res, 'register'); }

  async function login(req, res, next, faceVerified = false) {
    try {
      const { identifier, password, rememberMe } = validateLoginPayload(req.body);
      const employee = await authService.authenticate(identifier, password);
      const enrolledEmployee = authService.employeeRepository.findByIdentifier(identifier);
      if (enrolledEmployee?.face_descriptor && !faceVerified) {
        return res.status(403).json({ success: false, error: { code: 'FACE_REQUIRED', message: 'Tài khoản cần xác thực khuôn mặt.' } });
      }

      req.session.regenerate((regenErr) => {
        if (regenErr) {
          return next(regenErr);
        }

        req.session.employeeId = employee.id;
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');

        if (rememberMe) {
          req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
        } else {
          req.session.cookie.maxAge = env.sessionMaxAgeMs;
        }

        req.session.save((saveErr) => {
          if (saveErr) {
            return next(saveErr);
          }

          return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
              employee: {
                id: employee.id,
                employeeCode: employee.employeeCode,
                name: employee.name,
                role: employee.role,
              },
              csrfToken: req.session.csrfToken,
            },
          });
        });
      });
    } catch (err) {
      return next(err);
    }
  }

  async function register(req, res, next) {
    try {
      const { employeeCode, name, email, password, department, faceDescriptor } = req.body || {};
      if (![employeeCode, name, email, password, department].every((v) => typeof v === 'string' && v.trim()) || password.length < 8 || password.length > 128 || !Array.isArray(faceDescriptor)) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Complete all fields and scan your face.' } });
      }
      const { nonce, liveness, faceEvidence } = req.body;
      const challenges = req.session.livenessChallenges || {};
      const record = challenges[nonce];
      if (record) delete challenges[nonce];
      if (!record || record.purpose !== 'register' || record.challengeId !== liveness || Date.now() - record.createdAt > 60000) {
        return res.status(403).json({ success: false, error: { code: 'INVALID_NONCE', message: 'Thử thách đăng ký không hợp lệ hoặc đã hết hạn.' } });
      }
      await verifyFaceEvidence(faceEvidence);
      const employee = await authService.register({ employeeCode: employeeCode.trim(), name: name.trim(), email: email.trim().toLowerCase(), password, department: department.trim(), faceDescriptor });
      return res.status(201).json({ success: true, data: { employee } });
    } catch (err) { return next(err); }
  }

  async function faceLogin(req, res, next) {
    try {
      const { identifier, password, faceDescriptor, liveness, nonce } = req.body || {};

      // Validate a single-use challenge nonce; this does not verify video liveness.
      const challenges = req.session.livenessChallenges || {};
      const challengeRecord = challenges[nonce];

      if (!nonce || !challengeRecord || challengeRecord.purpose !== 'login') {
        return res.status(403).json({
          success: false,
          error: { code: 'INVALID_NONCE', message: 'Thử thách xác thực không hợp lệ hoặc đã hết hạn.' },
        });
      }

      // Xóa nonce ngay sau 1 lần sử dụng (Single-use Nonce)
      delete challenges[nonce];

      if (Date.now() - challengeRecord.createdAt > 60 * 1000) {
        return res.status(403).json({
          success: false,
          error: { code: 'CHALLENGE_EXPIRED', message: 'Thử thách đã quá hạn thời gian. Vui lòng thử lại.' },
        });
      }

      // Kiểm tra loại liveness đã phản hồi có đúng thử thách đã cấp phát không
      if (liveness !== challengeRecord.challengeId || !Array.isArray(faceDescriptor)) {
        return res.status(401).json({
          success: false,
          error: { code: 'LIVENESS_FAILED', message: 'Phản hồi không khớp với thử thách động của hệ thống.' },
        });
      }

      await authService.authenticateFace(identifier, password, faceDescriptor);
      await verifyFaceEvidence(req.body.faceEvidence);
      req.body = { identifier, password, rememberMe: Boolean(req.body.rememberMe) };
      return login(req, res, next, true);
    } catch (err) { return next(err); }
  }

  function me(req, res, next) {
    try {
      const employee = authService.getAuthenticatedProfile(req.session.employeeId);
      return res.status(200).json({
        success: true,
        data: { employee },
      });
    } catch (err) {
      return next(err);
    }
  }

  function logout(req, res, next) {
    if (!req.session) {
      return res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    }

    return req.session.destroy((err) => {
      if (err) {
        return next(err);
      }
      res.clearCookie('attendsecure.sid', {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.cookieSecure,
        path: '/',
      });
      return res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    });
  }

  return {
    getCsrfToken,
    getLivenessChallenge,
    getRegistrationChallenge,
    login,
    register,
    faceLogin,
    me,
    logout,
  };
}

module.exports = { createAuthController };

const crypto = require('node:crypto');
const { ensureCsrfToken } = require('../middleware/csrfMiddleware');
const { validateLoginPayload } = require('../validators/authValidator');

function createAuthController(authService, env) {
  function getCsrfToken(req, res) {
    const csrfToken = ensureCsrfToken(req);
    return res.status(200).json({
      success: true,
      data: { csrfToken },
    });
  }

  async function login(req, res, next) {
    try {
      const { identifier, password, rememberMe } = validateLoginPayload(req.body);
      const employee = await authService.authenticate(identifier, password);

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
      const employee = await authService.register({ employeeCode: employeeCode.trim(), name: name.trim(), email: email.trim().toLowerCase(), password, department: department.trim(), faceDescriptor });
      return res.status(201).json({ success: true, data: { employee } });
    } catch (err) { return next(err); }
  }

  async function faceLogin(req, res, next) {
    try {
      const { identifier, password, faceDescriptor, liveness } = req.body || {};
      if (liveness !== 'turn-left-right' || !Array.isArray(faceDescriptor)) return res.status(401).json({ success: false, error: { code: 'LIVENESS_FAILED', message: 'Complete the live face challenge.' } });
      const employee = await authService.authenticateFace(identifier, password, faceDescriptor);
      req.body = { identifier, password, rememberMe: Boolean(req.body.rememberMe) };
      return login(req, res, next);
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
    login,
    register,
    faceLogin,
    me,
    logout,
  };
}

module.exports = { createAuthController };

function createEmployeeController(authService) {
  function getMe(req, res, next) {
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

  return { getMe };
}

module.exports = { createEmployeeController };

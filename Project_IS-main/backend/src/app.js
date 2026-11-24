const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');

const defaultEnv = require('./config/env');
const { createDatabase, SqliteSessionStore } = require('./config/db');
const { EmployeeRepository } = require('./repositories/employeeRepository');
const { AttendanceRepository } = require('./repositories/attendanceRepository');
const { AuthService } = require('./services/authService');
const { EvidenceService } = require('./services/evidenceService');
const { AttendanceService } = require('./services/attendanceService');
const { createAuthController } = require('./controllers/authController');
const { createAttendanceController } = require('./controllers/attendanceController');
const { createEmployeeController } = require('./controllers/employeeController');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createAttendanceRoutes } = require('./routes/attendanceRoutes');
const { createEmployeeRoutes } = require('./routes/employeeRoutes');
const { createHealthRoutes } = require('./routes/healthRoutes');
const { createLoginRateLimiter } = require('./middleware/rateLimitMiddleware');
const { createPhotoUploadMiddleware } = require('./middleware/uploadMiddleware');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

function createApp(overrides = {}) {
  const env = { ...defaultEnv, ...overrides };
  const db = overrides.db || createDatabase(env.dbPath);
  const sessionStore =
    overrides.sessionStore ||
    new SqliteSessionStore(db, { ttlMs: env.sessionMaxAgeMs });

  const employeeRepo = new EmployeeRepository(db);
  const attendanceRepo = new AttendanceRepository(db);
  const authService = new AuthService(employeeRepo);
  const evidenceService = new EvidenceService(env.evidenceDir);
  const attendanceService = new AttendanceService(attendanceRepo, evidenceService);

  const authController = createAuthController(authService, env);
  const attendanceController = createAttendanceController(attendanceService);
  const employeeController = createEmployeeController(authService);

  const loginRateLimiter = createLoginRateLimiter({
    windowMs: env.loginRateLimitWindowMs,
    max: env.loginRateLimitMax,
  });
  const uploadPhotoMiddleware = createPhotoUploadMiddleware(env.maxUploadBytes);

  const app = express();
  app.disable('x-powered-by');

  if (env.isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'", 'data:', 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(express.json({ limit: '64kb' }));

  app.use(
    session({
      name: 'attendsecure.sid',
      secret: env.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.cookieSecure,
        maxAge: env.sessionMaxAgeMs,
        path: '/',
      },
    })
  );

  // API v1 routes
  app.use('/api/v1/health', createHealthRoutes());
  app.use('/api/v1/auth', createAuthRoutes(authController, loginRateLimiter));
  app.use(
    '/api/v1/attendance',
    createAttendanceRoutes(attendanceController, uploadPhotoMiddleware)
  );
  app.use('/api/v1/employees', createEmployeeRoutes(employeeController));

  // Unmatched API routes return structured JSON 404
  app.use('/api', notFoundHandler);

  // Protected page routes (enforce authentication before serving HTML)
  const protectedPages = new Map([
    ['/dashboard', 'dashboard.html'],
    ['/dashboard.html', 'dashboard.html'],
    ['/attendance', 'attendance.html'],
    ['/attendance.html', 'attendance.html'],
    ['/history', 'history.html'],
    ['/history.html', 'history.html'],
    ['/profile', 'profile.html'],
    ['/profile.html', 'profile.html'],
  ]);

  for (const [routePath, filename] of protectedPages.entries()) {
    app.get(routePath, (req, res) => {
      if (!req.session || !req.session.employeeId) {
        return res.redirect('/login');
      }
      return res.sendFile(path.join(env.frontendDir, filename));
    });
  }

  app.get('/login', (req, res) => {
    if (req.session && req.session.employeeId) {
      return res.redirect('/dashboard');
    }
    return res.sendFile(path.join(env.frontendDir, 'login.html'));
  });

  app.get('/register', (_req, res) => res.sendFile(path.join(env.frontendDir, 'register.html')));

  app.get('/', (req, res) => {
    if (req.session && req.session.employeeId) {
      return res.redirect('/dashboard');
    }
    return res.redirect('/login');
  });

  // Public frontend static assets (css, js, etc.)
  app.use(express.static(env.frontendDir, { index: false }));

  app.use((req, res) => {
    res.status(404).sendFile(path.join(env.frontendDir, 'login.html'));
  });

  app.use(errorHandler);

  return {
    app,
    db,
    sessionStore,
    close: () => {
      sessionStore.stopCleanup();
      db.close();
    },
  };
}

module.exports = { createApp };

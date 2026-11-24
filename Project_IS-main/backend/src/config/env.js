const path = require('node:path');
const dotenv = require('dotenv');

const backendRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveBackendPath(targetPath, fallbackRelative) {
  const chosen = targetPath || fallbackRelative;
  if (chosen === ':memory:') return ':memory:';
  return path.isAbsolute(chosen) ? chosen : path.resolve(backendRoot, chosen);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: parseInteger(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-this-secret-key-before-production',
  sessionMaxAgeMs: parseInteger(process.env.SESSION_MAX_AGE_MS, 8 * 60 * 60 * 1000),
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  dbPath: resolveBackendPath(process.env.DB_PATH, './database/attendsecure.db'),
  evidenceDir: resolveBackendPath(process.env.EVIDENCE_DIR, './storage/evidence'),
  maxUploadBytes: parseInteger(process.env.MAX_UPLOAD_BYTES, 2 * 1024 * 1024),
  loginRateLimitWindowMs: parseInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  loginRateLimitMax: parseInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10),
  demoSeedPassword: process.env.DEMO_SEED_PASSWORD || 'AttendSecure@2026',
  backendRoot,
  frontendDir: path.resolve(backendRoot, '..', 'frontend'),
};

module.exports = env;

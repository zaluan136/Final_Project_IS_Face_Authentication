const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcrypt');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/db');
const { nowUtcIso } = require('../src/utils/time');

// Minimal valid JPEG magic bytes + padding
const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
]);

// Minimal valid WebP magic bytes ("RIFF" + 4 bytes + "WEBP" + padding)
const VALID_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

async function createTestContext(overrides = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attendsecure-test-'));
  const dbPath = path.join(tempDir, 'test.db');
  const evidenceDir = path.join(tempDir, 'evidence');

  const db = createDatabase(dbPath);
  const passwordHash = await bcrypt.hash('TestPass@2026', 4);
  const createdAt = nowUtcIso();

  const insertEmp = db.prepare(`
    INSERT INTO employees (
      employee_code, full_name, email, password_hash, department, role, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertEmp.run(
    'EMP001',
    'Nguyen Minh Anh',
    'emp001@attendsecure.local',
    passwordHash,
    'Information Security',
    'EMPLOYEE',
    'ACTIVE',
    createdAt
  );
  insertEmp.run(
    'EMP002',
    'Tran Quoc Bao',
    'emp002@attendsecure.local',
    passwordHash,
    'Engineering',
    'EMPLOYEE',
    'ACTIVE',
    createdAt
  );

  const instance = createApp({
    nodeEnv: 'test',
    isProduction: false,
    isTest: true,
    cookieSecure: false,
    sessionSecret: 'test-session-secret',
    dbPath,
    evidenceDir,
    db,
    loginRateLimitMax: overrides.loginRateLimitMax ?? 50,
    maxUploadBytes: overrides.maxUploadBytes ?? 2 * 1024 * 1024,
    ...overrides,
  });

  const cleanup = () => {
    instance.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  return {
    ...instance,
    tempDir,
    evidenceDir,
    cleanup,
  };
}

async function loginAs(app, identifier, password = 'TestPass@2026') {
  const agent = request.agent(app);
  const csrfRes = await agent.get('/api/v1/auth/csrf-token');
  let csrfToken = csrfRes.body.data.csrfToken;

  const loginRes = await agent
    .post('/api/v1/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier, password });

  if (loginRes.status === 200 && loginRes.body?.data?.csrfToken) {
    csrfToken = loginRes.body.data.csrfToken;
  }

  return { agent, csrfToken, loginRes };
}

module.exports = {
  VALID_JPEG_BUFFER,
  VALID_WEBP_BUFFER,
  createTestContext,
  loginAs,
};

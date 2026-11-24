const fs = require('node:fs');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { VALID_JPEG_BUFFER, createTestContext, loginAs } = require('./testHelper');

describe('Security Controls', () => {
  it('rejects invalid upload content (magic-byte mismatch) and retains no file', async () => {
    const ctx = await createTestContext();
    try {
      const { agent, csrfToken } = await loginAs(ctx.app, 'EMP001');
      const fakeJpeg = Buffer.from('not-actually-an-image-payload', 'utf8');

      const res = await agent
        .post('/api/v1/attendance/check-in')
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', fakeJpeg, { filename: 'evil.jpg', contentType: 'image/jpeg' });

      assert.equal(res.status, 415);
      assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');

      const files = fs.readdirSync(ctx.evidenceDir);
      assert.equal(files.length, 0);
    } finally {
      ctx.cleanup();
    }
  });

  it('rejects oversized uploads with 413', async () => {
    const ctx = await createTestContext({ maxUploadBytes: 1024 });
    try {
      const { agent, csrfToken } = await loginAs(ctx.app, 'EMP001');
      const bigBuffer = Buffer.concat([VALID_JPEG_BUFFER, Buffer.alloc(2048, 0xaa)]);

      const res = await agent
        .post('/api/v1/attendance/check-in')
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });

      assert.equal(res.status, 413);
      assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
    } finally {
      ctx.cleanup();
    }
  });

  it('rejects malformed JSON requests with 400', async () => {
    const ctx = await createTestContext();
    try {
      const agent = request.agent(ctx.app);
      const csrfRes = await agent.get('/api/v1/auth/csrf-token');

      const res = await agent
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', csrfRes.body.data.csrfToken)
        .set('Content-Type', 'application/json')
        .send('{bad json');

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_JSON');
    } finally {
      ctx.cleanup();
    }
  });

  it('rejects state-changing requests missing or invalidating CSRF token with 403', async () => {
    const ctx = await createTestContext();
    try {
      const { agent } = await loginAs(ctx.app, 'EMP001');

      const missingCsrf = await agent
        .post('/api/v1/attendance/check-in')
        .attach('photo', VALID_JPEG_BUFFER, { filename: 'in.jpg', contentType: 'image/jpeg' });
      assert.equal(missingCsrf.status, 403);
      assert.equal(missingCsrf.body.error.code, 'CSRF_INVALID');

      const badCsrf = await agent
        .post('/api/v1/auth/logout')
        .set('X-CSRF-Token', 'invalid-token-value');
      assert.equal(badCsrf.status, 403);
      assert.equal(badCsrf.body.error.code, 'CSRF_INVALID');
    } finally {
      ctx.cleanup();
    }
  });

  it('restricts evidence photo access to the owning authenticated employee', async () => {
    const ctx = await createTestContext();
    try {
      const emp1 = await loginAs(ctx.app, 'EMP001');
      const emp2 = await loginAs(ctx.app, 'EMP002');

      const checkInRes = await emp1.agent
        .post('/api/v1/attendance/check-in')
        .set('X-CSRF-Token', emp1.csrfToken)
        .attach('photo', VALID_JPEG_BUFFER, { filename: 'in.jpg', contentType: 'image/jpeg' });
      const recordId = checkInRes.body.data.record.id;

      // Owner can access
      const ownerRes = await emp1.agent.get(`/api/v1/attendance/${recordId}/evidence/check-in`);
      assert.equal(ownerRes.status, 200);

      // Another employee cannot access
      const otherRes = await emp2.agent.get(`/api/v1/attendance/${recordId}/evidence/check-in`);
      assert.equal(otherRes.status, 404);

      // Unauthenticated user cannot access
      const unauthRes = await request(ctx.app).get(
        `/api/v1/attendance/${recordId}/evidence/check-in`
      );
      assert.equal(unauthRes.status, 401);
    } finally {
      ctx.cleanup();
    }
  });
});

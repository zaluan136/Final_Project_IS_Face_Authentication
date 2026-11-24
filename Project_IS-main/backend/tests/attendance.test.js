const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  VALID_JPEG_BUFFER,
  VALID_WEBP_BUFFER,
  createTestContext,
  loginAs,
} = require('./testHelper');

describe('Attendance API', () => {
  it('supports check-in, prevents duplicate check-in, and supports check-out', async () => {
    const ctx = await createTestContext();
    try {
      const { agent, csrfToken } = await loginAs(ctx.app, 'EMP001');

      // Check-out before check-in must fail with 409
      const earlyOut = await agent
        .post('/api/v1/attendance/check-out')
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', VALID_JPEG_BUFFER, { filename: 'out.jpg', contentType: 'image/jpeg' });
      assert.equal(earlyOut.status, 409);
      assert.equal(earlyOut.body.error.code, 'CHECK_IN_REQUIRED');

      // Valid check-in
      const checkInRes = await agent
        .post('/api/v1/attendance/check-in')
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', VALID_JPEG_BUFFER, { filename: 'in.jpg', contentType: 'image/jpeg' });
      assert.equal(checkInRes.status, 201);
      assert.equal(checkInRes.body.data.record.status, 'CHECKED_IN');
      assert.equal(checkInRes.body.data.record.hasCheckInPhoto, true);

      // Duplicate check-in must fail with 409
      const dupInRes = await agent
        .post('/api/v1/attendance/check-in')
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', VALID_JPEG_BUFFER, { filename: 'in2.jpg', contentType: 'image/jpeg' });
      assert.equal(dupInRes.status, 409);
      assert.equal(dupInRes.body.error.code, 'DUPLICATE_CHECK_IN');

      // Valid check-out with WebP photo
      const checkOutRes = await agent
        .post('/api/v1/attendance/check-out')
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', VALID_WEBP_BUFFER, { filename: 'out.webp', contentType: 'image/webp' });
      assert.equal(checkOutRes.status, 200);
      assert.equal(checkOutRes.body.data.record.status, 'CHECKED_OUT');
      assert.equal(checkOutRes.body.data.record.hasCheckOutPhoto, true);

      // Duplicate check-out must fail with 409
      const dupOutRes = await agent
        .post('/api/v1/attendance/check-out')
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', VALID_JPEG_BUFFER, { filename: 'out2.jpg', contentType: 'image/jpeg' });
      assert.equal(dupOutRes.status, 409);
      assert.equal(dupOutRes.body.error.code, 'DUPLICATE_CHECK_OUT');
    } finally {
      ctx.cleanup();
    }
  });

  it('isolates attendance history per authenticated employee', async () => {
    const ctx = await createTestContext();
    try {
      const emp1 = await loginAs(ctx.app, 'EMP001');
      const emp2 = await loginAs(ctx.app, 'EMP002');

      await emp1.agent
        .post('/api/v1/attendance/check-in')
        .set('X-CSRF-Token', emp1.csrfToken)
        .attach('photo', VALID_JPEG_BUFFER, { filename: 'in.jpg', contentType: 'image/jpeg' });

      const emp1History = await emp1.agent.get('/api/v1/attendance/history');
      assert.equal(emp1History.status, 200);
      assert.equal(emp1History.body.data.records.length, 1);

      const emp2History = await emp2.agent.get('/api/v1/attendance/history');
      assert.equal(emp2History.status, 200);
      assert.equal(emp2History.body.data.records.length, 0);
    } finally {
      ctx.cleanup();
    }
  });

  it('prevents concurrent duplicate check-in submissions', async () => {
    const ctx = await createTestContext();
    try {
      const { agent, csrfToken } = await loginAs(ctx.app, 'EMP001');

      const [resA, resB] = await Promise.all([
        agent
          .post('/api/v1/attendance/check-in')
          .set('X-CSRF-Token', csrfToken)
          .attach('photo', VALID_JPEG_BUFFER, { filename: 'a.jpg', contentType: 'image/jpeg' }),
        agent
          .post('/api/v1/attendance/check-in')
          .set('X-CSRF-Token', csrfToken)
          .attach('photo', VALID_JPEG_BUFFER, { filename: 'b.jpg', contentType: 'image/jpeg' }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      assert.deepEqual(statuses, [201, 409]);
    } finally {
      ctx.cleanup();
    }
  });
});

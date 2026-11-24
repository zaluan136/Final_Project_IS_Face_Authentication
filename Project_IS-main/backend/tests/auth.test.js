const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestContext, loginAs } = require('./testHelper');

describe('Authentication API', () => {
  it('logs in with valid employee code and establishes a session', async () => {
    const ctx = await createTestContext();
    try {
      const { agent, loginRes } = await loginAs(ctx.app, 'EMP001');
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.body.success, true);
      assert.equal(loginRes.body.data.employee.employeeCode, 'EMP001');
      assert.equal(loginRes.body.data.employee.password_hash, undefined);

      const meRes = await agent.get('/api/v1/auth/me');
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.employee.employeeCode, 'EMP001');
      assert.equal(meRes.body.data.employee.password_hash, undefined);
    } finally {
      ctx.cleanup();
    }
  });

  it('logs in with valid email address', async () => {
    const ctx = await createTestContext();
    try {
      const { loginRes } = await loginAs(ctx.app, 'emp002@attendsecure.local');
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.body.data.employee.employeeCode, 'EMP002');
    } finally {
      ctx.cleanup();
    }
  });

  it('rejects invalid password with generic 401 message', async () => {
    const ctx = await createTestContext();
    try {
      const { loginRes } = await loginAs(ctx.app, 'EMP001', 'WrongPassword!');
      assert.equal(loginRes.status, 401);
      assert.equal(loginRes.body.success, false);
      assert.equal(loginRes.body.error.code, 'INVALID_CREDENTIALS');
      assert.match(loginRes.body.error.message, /Invalid employee ID\/email or password/i);
    } finally {
      ctx.cleanup();
    }
  });

  it('rejects missing credentials with 400', async () => {
    const ctx = await createTestContext();
    try {
      const agent = request.agent(ctx.app);
      const csrfRes = await agent.get('/api/v1/auth/csrf-token');
      const res = await agent
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', csrfRes.body.data.csrfToken)
        .send({ identifier: '', password: '' });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    } finally {
      ctx.cleanup();
    }
  });

  it('blocks unauthenticated access to protected APIs and redirects protected pages', async () => {
    const ctx = await createTestContext();
    try {
      const apiRes = await request(ctx.app).get('/api/v1/auth/me');
      assert.equal(apiRes.status, 401);

      const empRes = await request(ctx.app).get('/api/v1/employees/me');
      assert.equal(empRes.status, 401);

      const todayRes = await request(ctx.app).get('/api/v1/attendance/today');
      assert.equal(todayRes.status, 401);

      const pageRes = await request(ctx.app).get('/dashboard');
      assert.equal(pageRes.status, 302);
      assert.equal(pageRes.headers.location, '/login');
    } finally {
      ctx.cleanup();
    }
  });

  it('invalidates session on logout', async () => {
    const ctx = await createTestContext();
    try {
      const { agent, csrfToken } = await loginAs(ctx.app, 'EMP001');

      const logoutRes = await agent
        .post('/api/v1/auth/logout')
        .set('X-CSRF-Token', csrfToken);
      assert.equal(logoutRes.status, 200);
      assert.equal(logoutRes.body.success, true);

      const meAfterLogout = await agent.get('/api/v1/auth/me');
      assert.equal(meAfterLogout.status, 401);
    } finally {
      ctx.cleanup();
    }
  });

  it('enforces login rate limiting with 429', async () => {
    const ctx = await createTestContext({ loginRateLimitMax: 3 });
    try {
      for (let i = 0; i < 3; i += 1) {
        const { loginRes } = await loginAs(ctx.app, 'EMP001', 'WrongPass');
        assert.equal(loginRes.status, 401);
      }

      const { loginRes: blockedRes } = await loginAs(ctx.app, 'EMP001', 'WrongPass');
      assert.equal(blockedRes.status, 429);
      assert.equal(blockedRes.body.error.code, 'TOO_MANY_REQUESTS');
    } finally {
      ctx.cleanup();
    }
  });
});

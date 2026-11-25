const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestContext } = require('./testHelper');

test('registration requires its own fresh challenge and face evidence', async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.cleanup());
  const agent = request.agent(ctx.app);
  const csrf = (await agent.get('/api/v1/auth/csrf-token')).body.data.csrfToken;
  const payload = { employeeCode: 'EMPNEW', name: 'Test', email: 'new@example.com', password: 'TestPass@2026', department: 'IT', faceDescriptor: Array(128).fill(0.01) };
  const loginChallenge = (await agent.get('/api/v1/auth/liveness-challenge')).body.data;
  let res = await agent.post('/api/v1/auth/register').set('X-CSRF-Token', csrf).send({ ...payload, nonce: loginChallenge.nonce, liveness: loginChallenge.challengeId });
  assert.equal(res.body.error.code, 'INVALID_NONCE');
  const challenge = (await agent.get('/api/v1/auth/registration-challenge')).body.data;
  res = await agent.post('/api/v1/auth/register').set('X-CSRF-Token', csrf).send({ ...payload, nonce: challenge.nonce, liveness: challenge.challengeId });
  assert.equal(res.body.error.code, 'FACE_EVIDENCE_REQUIRED');
  res = await agent.post('/api/v1/auth/register').set('X-CSRF-Token', csrf).send({ ...payload, nonce: challenge.nonce, liveness: challenge.challengeId });
  assert.equal(res.body.error.code, 'INVALID_NONCE');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM employees WHERE employee_code = ?').get('EMPNEW').n, 0);
});

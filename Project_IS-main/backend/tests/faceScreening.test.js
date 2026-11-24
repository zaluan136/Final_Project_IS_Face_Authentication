const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestContext } = require('./testHelper');
const sharp = require('sharp');
const { verifyFaceEvidence } = require('../src/services/antiSpoofGate');

test('screening rejects a repeated frame and rejects a spoof score', async () => {
  const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#888' } }).jpeg().toBuffer();
  const frame = { image: image.toString('base64'), box: { x: 10, y: 10, width: 80, height: 80 } };
  await assert.rejects(verifyFaceEvidence([frame, frame, frame], async () => ({ difference: 1 })), { code: 'DUPLICATE_FACE_FRAME' });
  await assert.rejects(verifyFaceEvidence([frame, frame, frame], async () => ({ difference: -1 })), { code: 'FACE_SPOOF_SUSPECTED' });
});

test('enrolled account cannot bypass face screening with password or missing frames', async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.cleanup());
  const descriptor = Array(128).fill(0.01);
  ctx.db.prepare('UPDATE employees SET face_descriptor = ? WHERE employee_code = ?').run(JSON.stringify(descriptor), 'EMP001');
  const agent = request.agent(ctx.app);
  const token = (await agent.get('/api/v1/auth/csrf-token')).body.data.csrfToken;
  const passwordOnly = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token)
    .send({ identifier: 'EMP001', password: 'TestPass@2026' });
  assert.equal(passwordOnly.status, 403);
  assert.equal(passwordOnly.body.error.code, 'FACE_REQUIRED');
  const challenge = (await agent.get('/api/v1/auth/liveness-challenge')).body.data;
  const missingEvidence = await agent.post('/api/v1/auth/face-login').set('X-CSRF-Token', token)
    .send({ identifier: 'EMP001', password: 'TestPass@2026', faceDescriptor: descriptor,
      liveness: challenge.challengeId, nonce: challenge.nonce });
  assert.equal(missingEvidence.status, 403);
  assert.equal(missingEvidence.body.error.code, 'FACE_EVIDENCE_REQUIRED');
});

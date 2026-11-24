const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { scoreFace } = require('../src/services/antiSpoofExperiment');

test('anti-spoof experiment rejects invalid face bounds', async () => {
  const image = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#888' } }).jpeg().toBuffer();
  await assert.rejects(scoreFace(image, { x: -1, y: 0, width: 100, height: 100 }), /Invalid face/);
  await assert.rejects(scoreFace(image, { x: 40, y: 40, width: 100, height: 100 }), /Invalid face/);
});

test('anti-spoof experiment loads model and produces finite logits', async () => {
  const image = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#888' } }).jpeg().toBuffer();
  const result = await scoreFace(image, { x: 20, y: 20, width: 80, height: 80 });
  assert.ok(Number.isFinite(result.realLogit));
  assert.ok(Number.isFinite(result.spoofLogit));
  assert.equal(result.difference, result.realLogit - result.spoofLogit);
});

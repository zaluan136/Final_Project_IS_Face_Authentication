const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../frontend/js/faceChallenge.js'), 'utf8');
const challengeSource = source.slice(source.indexOf('async function verifyDynamicChallenge('));
const box = { x: 10, y: 10, width: 100, height: 100 };
const open = { yawRatio: 1, pitchRatio: 0.5, leftEAR: 0.25, rightEAR: 0.22, box };
const shut = { ...open, leftEAR: 0.17, rightEAR: 0.16 };

async function runChallenge(frames) {
  let index = 0;
  let currentFrame;
  const messages = [];
  const context = {
    Date, Math, setTimeout,
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,dGVzdA==' }) },
    requestAnimationFrame: (callback) => callback(),
    detectFaceMetrics: async () => {
      if (index >= frames.length) throw new Error('frames exhausted');
      currentFrame = frames[index++];
      return currentFrame;
    },
    detectBlinkScores: async () => currentFrame && (currentFrame.blink || (currentFrame.leftEAR < 0.2 ? { left: 0.7, right: 0.75 } : { left: 0.1, right: 0.15 })),
    detectFaceWithDetails: async () => ({ descriptor: [0.1, 0.2], yawRatio: 1, box }),
  };
  vm.createContext(context);
  vm.runInContext(challengeSource, context);
  const status = { set textContent(value) { messages.push(value); } };
  await context.verifyDynamicChallenge({ videoWidth: 640, videoHeight: 480 }, status, { challengeId: 'blink' });
  return messages;
}

test('blink challenge counts two separate close-and-open cycles', async () => {
  const frames = [...Array(8).fill(open), open, shut, shut, open, shut, open];
  const messages = await runChallenge(frames);
  assert.ok(messages.some((message) => message.includes('1/2')));
  assert.ok(messages.some((message) => message.includes('2/2')));
});

test('blink scores count closed eyes even when EAR barely changes', async () => {
  const closedByModel = { ...open, blink: { left: 0.67, right: 0.75 } };
  const frames = [...Array(8).fill(open), open, closedByModel, open, closedByModel, open];
  const messages = await runChallenge(frames);
  assert.ok(messages.some((message) => message.includes('2/2')));
});

test('a still open or closed image cannot complete the blink challenge', async () => {
  await assert.rejects(runChallenge([...Array(8).fill(open), ...Array(12).fill(open)]), /frames exhausted/);
  await assert.rejects(runChallenge([...Array(8).fill(open), open, ...Array(12).fill(shut)]), /frames exhausted/);
});

test('losing the face resets blink progress', async () => {
  const frames = [...Array(8).fill(open), open, shut, open, null,
    ...Array(8).fill(open), open, shut, open];
  await assert.rejects(runChallenge(frames), /frames exhausted/);
});

test('nodding during a closed-open transition does not count as a blink', async () => {
  const nod = { ...shut, pitchRatio: 0.6 };
  const frames = [...Array(8).fill(open), open, nod, open, nod, open];
  await assert.rejects(runChallenge(frames), /frames exhausted/);
});

test('a nod cancels a pending blink before the eyes reopen', async () => {
  const nod = { ...shut, pitchRatio: 0.6 };
  const frames = [...Array(8).fill(open), open, shut, nod, open, shut, open];
  await assert.rejects(runChallenge(frames), /frames exhausted/);
});

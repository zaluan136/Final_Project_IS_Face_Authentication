import { detectBlinkScores, detectFaceWithDetails, detectFaceMetrics } from './face.js';

export async function verifyDynamicChallenge(video, statusElem, challenge) {
  const deadline = Date.now() + 20000;
  const id = challenge.challengeId;
  const needsTurn = id.startsWith('turn-');
  const needsBlink = id === 'blink' || id.endsWith('-blink');
  const direction = id.startsWith('turn-left') ? 1 : -1;
  let samples, baseline, descriptor, phase, turns, returns, blinks, closed, blinkReady, evidence;
  const canvas = document.createElement('canvas');
  function capture(box) {
    if (!box || !video.videoWidth || !video.videoHeight) throw new Error('Không thể chụp khung hình xác thực.');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return { image: canvas.toDataURL('image/jpeg', 0.8).split(',')[1], box: { x: box.x, y: box.y, width: box.width, height: box.height } };
  }
  function reset() {
    samples = []; baseline = null; descriptor = null; phase = 'baseline';
    turns = 0; returns = 0; blinks = 0; closed = false; blinkReady = false; evidence = [];
  }
  function show(message) { if (statusElem) statusElem.textContent = message; }
  reset();
  while (Date.now() < deadline) {
    const data = await detectFaceMetrics(video);
    if (!data) {
      reset(); show('Không thấy khuôn mặt. Vui lòng đưa mặt vào giữa khung hình.');
      await new Promise((resolve) => setTimeout(resolve, 60));
      continue;
    }
    if (phase === 'baseline') {
      const blink = needsBlink ? await detectBlinkScores(video) : null;
      if (needsBlink && !blink) { reset(); show('Không thấy khuôn mặt. Vui lòng đưa mặt vào giữa khung hình.'); continue; }
      const prev = samples[samples.length - 1];
      const valid = Number.isFinite(data.pitchRatio) && data.yawRatio >= 0.75 && data.yawRatio <= 1.35 &&
        data.leftEAR > 0.12 && data.rightEAR > 0.12 && (!needsBlink || (blink.left < 0.4 && blink.right < 0.4));
      const stable = !prev || (Math.abs(data.yawRatio - prev.yawRatio) < 0.08 &&
        Math.abs(data.pitchRatio - prev.pitchRatio) < 0.04 &&
        Math.abs(data.leftEAR - prev.leftEAR) < 0.04 && Math.abs(data.rightEAR - prev.rightEAR) < 0.04);
      if (!valid || !stable) samples = [];
      if (valid) samples.push({ ...data, blinkLeft: blink?.left, blinkRight: blink?.right });
      if (samples.length === 8) {
        const mean = (key) => samples.reduce((sum, item) => sum + item[key], 0) / samples.length;
        baseline = { yaw: mean('yawRatio'), pitch: mean('pitchRatio'), blinkLeft: needsBlink ? mean('blinkLeft') : 0, blinkRight: needsBlink ? mean('blinkRight') : 0 };
        const face = await detectFaceWithDetails(video);
        if (!face) { reset(); continue; }
        descriptor = face.descriptor;
        evidence.push(capture(face.box));
        phase = needsTurn ? 'turn' : 'blink';
      }
    } else {
      const delta = data.yawRatio - baseline.yaw;
      const centered = Math.abs(delta) < 0.16;
      if (phase === 'turn') {
        turns = direction * delta >= 0.25 ? turns + 1 : 0;
        show(id.startsWith('turn-left') ? 'Quay mặt sang trái và giữ một chút.' : 'Quay mặt sang phải và giữ một chút.');
        if (turns >= 2) phase = 'return';
      } else if (phase === 'return') {
        returns = centered ? returns + 1 : 0;
        show('Quay mặt về giữa và nhìn thẳng.');
        if (returns >= 2) phase = needsBlink ? 'blink' : 'complete';
      } else if (phase === 'blink') {
        const blink = await detectBlinkScores(video);
        if (!blink) { reset(); show('Không thấy khuôn mặt. Vui lòng đưa mặt vào giữa khung hình.'); continue; }
        const headStable = centered && Number.isFinite(data.pitchRatio) && Math.abs(data.pitchRatio - baseline.pitch) < 0.06;
        if (!headStable) { closed = false; blinkReady = false; }
        else {
          const open = blink.left < Math.max(0.35, baseline.blinkLeft + 0.12) && blink.right < Math.max(0.35, baseline.blinkRight + 0.12);
          const eyesClosed = blink.left > Math.max(0.5, baseline.blinkLeft + 0.3) && blink.right > Math.max(0.5, baseline.blinkRight + 0.3);
          if (open) {
            if (closed) { blinks++; evidence.push(capture(data.box)); }
            closed = false;
            blinkReady = true;
          } else if (blinkReady && eyesClosed) {
            closed = true;
            blinkReady = false;
          }
        }
        show(headStable ? `Chớp mắt chậm: ${blinks}/2${closed ? ' — mở mắt ra' : ' — nhắm rồi mở mắt'}` : 'Giữ đầu thẳng, rồi chớp mắt.');
        if (blinks >= 2) phase = 'complete';
      }
      if (phase === 'complete' && centered) {
        const face = await detectFaceWithDetails(video);
        if (!face) { reset(); continue; }
        if (Math.abs(face.yawRatio - baseline.yaw) >= 0.16) continue;
        const distance = Math.sqrt(face.descriptor.reduce((sum, value, index) =>
          sum + (value - descriptor[index]) ** 2, 0));
        if (distance > 0.65) throw new Error('Không xác định được cùng một khuôn mặt trong suốt thử thách. Vui lòng thử lại.');
        return { descriptor: face.descriptor, evidence };
      }
    }
    // Wait for the next video frame without adding a fixed delay after inference.
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error('Hết thời gian xác thực. Vui lòng thử lại.');
}


const { scoreFace } = require('./antiSpoofExperiment');
const { AppError } = require('../utils/errors');
const crypto = require('node:crypto');

// This is a presentation-attack screening layer, not proof of trusted camera input.
async function verifyFaceEvidence(value, scorer = scoreFace) {
  let frames = value;
  if (typeof frames === 'string') {
    try { frames = JSON.parse(frames); } catch { frames = null; }
  }
  if (!Array.isArray(frames) || frames.length !== 3) {
    throw new AppError(403, 'FACE_EVIDENCE_REQUIRED', 'Không đủ khung hình xác thực. Vui lòng thử lại.');
  }
  const hashes = new Set();
  for (const frame of frames) {
    if (!frame || typeof frame.image !== 'string' || frame.image.length > 400000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(frame.image) || !frame.box || typeof frame.box !== 'object') {
      throw new AppError(400, 'INVALID_FACE_EVIDENCE', 'Khung hình xác thực không hợp lệ.');
    }
    const image = Buffer.from(frame.image, 'base64');
    if (image.length < 100 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
      throw new AppError(400, 'INVALID_FACE_EVIDENCE', 'Khung hình xác thực không hợp lệ.');
    }
    const hash = crypto.createHash('sha256').update(image).digest('hex');
    if (hashes.has(hash)) throw new AppError(403, 'DUPLICATE_FACE_FRAME', 'Các khung hình xác thực bị trùng. Vui lòng thử lại.');
    hashes.add(hash);
    let score;
    try { score = await scorer(image, frame.box); }
    catch (error) {
      console.error('Anti-spoof inference failed:', error.message);
      throw new AppError(503, 'FACE_SCREENING_UNAVAILABLE', 'Không thể kiểm tra khuôn mặt. Vui lòng thử lại.');
    }
    if (score.difference < 0) {
      throw new AppError(403, 'FACE_SPOOF_SUSPECTED', 'Không vượt qua kiểm tra ảnh hoặc màn hình. Hãy nhìn trực tiếp vào webcam và thử lại.');
    }
  }
}

module.exports = { verifyFaceEvidence };

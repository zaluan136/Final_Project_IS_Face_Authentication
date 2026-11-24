const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { AppError } = require('../utils/errors');
const { detectAllowedImageType } = require('../utils/fileSignature');

class EvidenceService {
  constructor(evidenceDir) {
    this.evidenceRoot = path.resolve(evidenceDir);
    fs.mkdirSync(this.evidenceRoot, { recursive: true });
  }

  /**
   * Validates image magic bytes and writes the file with a safe server-generated name.
   * Never trusts client-supplied filenames.
   */
  saveValidatedPhoto(file, { employeeId, attendanceDate, eventType }) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new AppError(400, 'PHOTO_REQUIRED', 'A captured webcam photo is required.');
    }

    const detected = detectAllowedImageType(file.buffer);
    if (!detected) {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Invalid image format. Only JPEG and WebP photos are accepted.'
      );
    }

    const safeSubDir = path.join(`emp_${Number(employeeId)}`, attendanceDate);
    const targetDir = path.resolve(this.evidenceRoot, safeSubDir);
    if (!targetDir.startsWith(this.evidenceRoot + path.sep)) {
      throw new AppError(400, 'INVALID_PATH', 'Invalid storage path.');
    }

    fs.mkdirSync(targetDir, { recursive: true });

    const safeFilename = `${eventType}_${crypto.randomUUID()}.${detected.ext}`;
    const relativePath = path.join(safeSubDir, safeFilename).replace(/\\/g, '/');
    const fullPath = path.resolve(this.evidenceRoot, relativePath);

    fs.writeFileSync(fullPath, file.buffer, { flag: 'wx' });
    return relativePath;
  }

  deletePhotoQuietly(relativePath) {
    if (!relativePath) return;
    try {
      const fullPath = this.resolveSafePath(relativePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      // Best-effort cleanup for failed transactions
    }
  }

  resolveSafePath(relativePath) {
    const resolved = path.resolve(this.evidenceRoot, relativePath);
    if (!resolved.startsWith(this.evidenceRoot + path.sep)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied.');
    }
    return resolved;
  }
}

module.exports = { EvidenceService };

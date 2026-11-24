/**
 * Inspects file magic bytes to verify genuine JPEG or WebP image content.
 * Never trusts client-supplied filenames or MIME headers alone.
 */
function detectAllowedImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  // WebP: "RIFF" .... "WEBP"
  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }

  return null;
}

module.exports = { detectAllowedImageType };

const multer = require('multer');
const { AppError } = require('../utils/errors');

function createPhotoUploadMiddleware(maxUploadBytes) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 1,
      fields: 5,
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/webp') {
        cb(null, true);
      } else {
        cb(
          new AppError(
            415,
            'UNSUPPORTED_MEDIA_TYPE',
            'Only JPEG and WebP image uploads are supported.'
          )
        );
      }
    },
  });

  return (req, res, next) => {
    upload.single('photo')(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(
              413,
              'PAYLOAD_TOO_LARGE',
              `Photo exceeds the maximum allowed size of ${Math.round(maxUploadBytes / (1024 * 1024))} MB.`
            )
          );
        }
        return next(new AppError(400, 'UPLOAD_ERROR', 'Invalid multipart upload request.'));
      }
      return next(err);
    });
  };
}

module.exports = { createPhotoUploadMiddleware };

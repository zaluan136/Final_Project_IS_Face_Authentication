export class WebcamError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WebcamError';
    this.code = code;
  }
}

export class WebcamController {
  constructor(options = {}) {
    this.mediaDevices =
      options.mediaDevices !== undefined
        ? options.mediaDevices
        : typeof navigator !== 'undefined'
          ? navigator.mediaDevices
          : null;
    this.isSecureContext =
      options.isSecureContext !== undefined
        ? options.isSecureContext
        : typeof window !== 'undefined'
          ? window.isSecureContext
          : true;
    this.stream = null;
  }

  isActive() {
    if (!this.stream) return false;
    const tracks = this.stream.getTracks ? this.stream.getTracks() : [];
    return tracks.some((t) => t.readyState === 'live');
  }

  async start(videoElement) {
    if (!this.isSecureContext) {
      throw new WebcamError(
        'INSECURE_CONTEXT',
        'Webcam access requires HTTPS or localhost.'
      );
    }

    if (!this.mediaDevices || typeof this.mediaDevices.getUserMedia !== 'function') {
      throw new WebcamError(
        'UNSUPPORTED_BROWSER',
        'Your browser does not support camera access via MediaDevices API.'
      );
    }

    this.stop(videoElement);

    try {
      const stream = await this.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.stream = stream;
      if (videoElement) {
        videoElement.srcObject = stream;
        if (typeof videoElement.play === 'function') {
          await videoElement.play();
        }
      }
      return stream;
    } catch (err) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new WebcamError(
          'PERMISSION_DENIED',
          'Camera permission was denied. Please allow camera access in your browser settings and click Start Camera again.'
        );
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw new WebcamError(
          'CAMERA_NOT_FOUND',
          'No webcam device was found on this computer.'
        );
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        throw new WebcamError(
          'CAMERA_IN_USE',
          'Your webcam is currently in use by another application.'
        );
      }
      throw new WebcamError(
        'CAMERA_ERROR',
        'Unable to access the webcam. Please check your device and browser permissions.'
      );
    }
  }

  stop(videoElement) {
    if (this.stream && typeof this.stream.getTracks === 'function') {
      for (const track of this.stream.getTracks()) {
        if (typeof track.stop === 'function') {
          track.stop();
        }
      }
    }
    this.stream = null;
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  async capturePhoto(videoElement, canvasElement, options = {}) {
    if (!this.isActive()) {
      throw new WebcamError('CAMERA_NOT_ACTIVE', 'Start the camera before capturing a photo.');
    }

    const sourceWidth = videoElement?.videoWidth || 0;
    const sourceHeight = videoElement?.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) {
      throw new WebcamError(
        'CAPTURE_FAILED',
        'Camera stream is not ready yet. Please wait a moment and try again.'
      );
    }

    const maxWidth = options.maxWidth || 960;
    const scale = sourceWidth > maxWidth ? maxWidth / sourceWidth : 1;
    const targetWidth = Math.round(sourceWidth * scale);
    const targetHeight = Math.round(sourceHeight * scale);

    canvasElement.width = targetWidth;
    canvasElement.height = targetHeight;

    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
      throw new WebcamError('CAPTURE_FAILED', 'Unable to initialize capture canvas.');
    }

    ctx.drawImage(videoElement, 0, 0, targetWidth, targetHeight);

    const quality = options.quality || 0.85;
    const blob = await new Promise((resolve) => {
      canvasElement.toBlob((result) => resolve(result), 'image/jpeg', quality);
    });

    if (!blob || blob.size === 0) {
      throw new WebcamError('CAPTURE_FAILED', 'Failed to encode captured photo.');
    }

    return {
      blob,
      width: targetWidth,
      height: targetHeight,
    };
  }
}

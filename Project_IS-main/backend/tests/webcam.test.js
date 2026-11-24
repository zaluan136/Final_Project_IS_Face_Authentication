const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

async function loadWebcamModule() {
  const modulePath = path.resolve(__dirname, '..', '..', 'frontend', 'js', 'webcam.js');
  return import(pathToFileURL(modulePath).href);
}

describe('WebcamController (MediaDevices & Canvas lifecycle)', () => {
  it('starts camera with audio: false when permission is granted', async () => {
    const { WebcamController } = await loadWebcamModule();
    let capturedConstraints = null;
    let stopped = false;

    const fakeStream = {
      getTracks: () => [
        {
          readyState: 'live',
          stop: () => {
            stopped = true;
          },
        },
      ],
    };

    const controller = new WebcamController({
      isSecureContext: true,
      mediaDevices: {
        getUserMedia: async (constraints) => {
          capturedConstraints = constraints;
          return fakeStream;
        },
      },
    });

    const videoEl = { srcObject: null, play: async () => {} };
    await controller.start(videoEl);

    assert.equal(capturedConstraints.audio, false);
    assert.ok(capturedConstraints.video);
    assert.equal(videoEl.srcObject, fakeStream);
    assert.equal(controller.isActive(), true);

    controller.stop(videoEl);
    assert.equal(stopped, true);
    assert.equal(videoEl.srcObject, null);
    assert.equal(controller.isActive(), false);
  });

  it('handles permission denied without crashing', async () => {
    const { WebcamController } = await loadWebcamModule();
    const controller = new WebcamController({
      isSecureContext: true,
      mediaDevices: {
        getUserMedia: async () => {
          const err = new Error('Denied');
          err.name = 'NotAllowedError';
          throw err;
        },
      },
    });

    await assert.rejects(() => controller.start({}), (err) => {
      assert.equal(err.code, 'PERMISSION_DENIED');
      return true;
    });
  });

  it('handles unavailable camera and unsupported/insecure contexts', async () => {
    const { WebcamController } = await loadWebcamModule();

    const notFoundCtrl = new WebcamController({
      isSecureContext: true,
      mediaDevices: {
        getUserMedia: async () => {
          const err = new Error('No camera');
          err.name = 'NotFoundError';
          throw err;
        },
      },
    });
    await assert.rejects(() => notFoundCtrl.start({}), (err) => err.code === 'CAMERA_NOT_FOUND');

    const unsupportedCtrl = new WebcamController({
      isSecureContext: true,
      mediaDevices: null,
    });
    await assert.rejects(
      () => unsupportedCtrl.start({}),
      (err) => err.code === 'UNSUPPORTED_BROWSER'
    );

    const insecureCtrl = new WebcamController({
      isSecureContext: false,
      mediaDevices: { getUserMedia: async () => ({}) },
    });
    await assert.rejects(
      () => insecureCtrl.start({}),
      (err) => err.code === 'INSECURE_CONTEXT'
    );
  });

  it('captures a JPEG frame and handles capture failure when stream is inactive', async () => {
    const { WebcamController } = await loadWebcamModule();
    const controller = new WebcamController({
      isSecureContext: true,
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ readyState: 'live', stop: () => {} }],
        }),
      },
    });

    // Cannot capture before start
    await assert.rejects(
      () => controller.capturePhoto({}, {}),
      (err) => err.code === 'CAMERA_NOT_ACTIVE'
    );

    const videoEl = { srcObject: null, videoWidth: 1280, videoHeight: 720, play: async () => {} };
    await controller.start(videoEl);

    const fakeBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    const canvasEl = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb) => cb(fakeBlob),
    };

    const result = await controller.capturePhoto(videoEl, canvasEl);
    assert.equal(result.width, 960);
    assert.equal(result.height, 540);
    assert.equal(result.blob.size, 4);

    controller.stop(videoEl);
  });
});

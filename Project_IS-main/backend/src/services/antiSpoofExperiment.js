// Experimental classifier only: not an authentication decision.
const path = require('node:path');
const sharp = require('sharp');
const ort = require('onnxruntime-node');

const MODEL_PATH = path.resolve(__dirname, '../../models/face-antispoof-minifasnet.onnx');
let modelPromise;

async function scoreFace(image, box) {
  const metadata = await sharp(image, { limitInputPixels: 4000000 }).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || !metadata.width || !metadata.height) {
    throw new Error('Unsupported image');
  }
  const { x, y, width, height } = box;
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 ||
      width < 60 || height < 60 || x + width > metadata.width || y + height > metadata.height) {
    throw new Error('Invalid face bounding box');
  }
  // Match upstream: 1.5x square crop, reflected padding, RGB [0,1], CHW.
  const size = Math.floor(Math.max(width, height) * 1.5);
  const left = Math.trunc(x + width / 2 - size / 2);
  const top = Math.trunc(y + height / 2 - size / 2);
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(metadata.width, left + size), y1 = Math.min(metadata.height, top + size);
  const crop = await sharp(image).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .extend({ left: x0 - left, top: y0 - top, right: left + size - x1, bottom: top + size - y1, extendWith: 'mirror' })
    .resize(128, 128, { kernel: 'lanczos3' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const pixels = 128 * 128;
  const values = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) for (let c = 0; c < 3; c++) values[c * pixels + i] = crop[i * 3 + c] / 255;
  modelPromise ||= ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['cpu'] });
  const model = await modelPromise;
  const result = await model.run({ [model.inputNames[0]]: new ort.Tensor('float32', values, [1, 3, 128, 128]) });
  const logits = result[model.outputNames[0]].data;
  if (logits.length !== 2 || !Number.isFinite(logits[0]) || !Number.isFinite(logits[1])) throw new Error('Invalid model output');
  return { realLogit: logits[0], spoofLogit: logits[1], difference: logits[0] - logits[1] };
}

module.exports = { scoreFace };

const MODEL = '/models';
let ready;
let blinkModelPromise;

export function loadBlinkModel() {
  if (!blinkModelPromise) {
    blinkModelPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('/vendor/mediapipe/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputFaceBlendshapes: true,
        numFaces: 1,
      });
    })().catch((error) => { blinkModelPromise = null; throw error; });
  }
  return blinkModelPromise;
}

export async function detectBlinkScores(video) {
  const model = await loadBlinkModel();
  const result = model.detect(video);
  const categories = result.faceBlendshapes[0]?.categories;
  if (!categories) return null;
  const left = categories.find((item) => item.categoryName === 'eyeBlinkLeft')?.score;
  const right = categories.find((item) => item.categoryName === 'eyeBlinkRight')?.score;
  return Number.isFinite(left) && Number.isFinite(right) ? { left, right } : null;
}

export async function loadFaceModels() {
  if (!ready) {
    ready = (async () => {
      let api;
      try {
        api = await import('/vendor/face-api.esm.js');
      } catch (err) {
        console.error('Lỗi nạp face-api.esm.js:', err);
        throw new Error('Không tải được thư viện nhận diện khuôn mặt face-api.js.');
      }

      await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(MODEL),
        api.nets.faceLandmark68Net.loadFromUri(MODEL),
        api.nets.faceRecognitionNet.loadFromUri(MODEL),
      ]);

      return api;
    })();
  }
  return ready;
}

export async function detectFaceWithDetails(video) {
  const api = await loadFaceModels();
  const options = new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const results = await api.detectAllFaces(video, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (results.length > 1) {
    throw new Error('Phát hiện nhiều khuôn mặt. Chỉ để một người trước camera, không đưa ảnh/điện thoại vào khung hình.');
  }
  const result = results[0];

  if (!result) return null;

  // Tính Eye Aspect Ratio (EAR) cho 2 mắt
  // Landmark mắt trái: 36-41 (index 36..41), mắt phải: 42-47 (index 42..47)
  const landmarks = result.landmarks.positions;
  function getEAR(p1, p2, p3, p4, p5, p6) {
    const v1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
    const v2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
    const h = Math.hypot(p1.x - p4.x, p1.y - p4.y);
    return (v1 + v2) / (2.0 * (h || 1));
  }

  const leftEAR = getEAR(landmarks[36], landmarks[37], landmarks[38], landmarks[39], landmarks[40], landmarks[41]);
  const rightEAR = getEAR(landmarks[42], landmarks[43], landmarks[44], landmarks[45], landmarks[46], landmarks[47]);
  // The smaller eye ratio is more sensitive to a real blink when the two
  // eyes are detected with different landmark confidence.
  const ear = Math.min(leftEAR, rightEAR);

  // Tính góc quay đầu ngang (Yaw) dựa trên vị trí mũi (30) so với 2 bên viền mặt (0 và 16)
  const nose = landmarks[30];
  const leftEdge = landmarks[0];
  const rightEdge = landmarks[16];
  const distLeft = Math.abs(nose.x - leftEdge.x);
  const distRight = Math.abs(rightEdge.x - nose.x);
  const yawRatio = distLeft / (distRight || 1); // Bình thường nhìn thẳng ~ 0.8 - 1.25. Quay trái < 0.6, quay phải > 1.6

  return {
    descriptor: Array.from(result.descriptor),
    box: result.detection.box,
    ear,
    leftEAR,
    rightEAR,
    yawRatio,
    noseX: nose.x,
    noseY: nose.y
  };
}

export async function detectFaceMetrics(video) {
  const api = await loadFaceModels();
  const options = new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const results = await api.detectAllFaces(video, options).withFaceLandmarks();
  if (results.length > 1) {
    throw new Error('Phát hiện nhiều khuôn mặt. Chỉ để một người trước camera, không đưa ảnh/điện thoại vào khung hình.');
  }
  const result = results[0];
  if (!result) return null;

  const landmarks = result.landmarks.positions;
  function getEAR(p1, p2, p3, p4, p5, p6) {
    const verticalA = Math.hypot(p2.x - p6.x, p2.y - p6.y);
    const verticalB = Math.hypot(p3.x - p5.x, p3.y - p5.y);
    const horizontal = Math.hypot(p1.x - p4.x, p1.y - p4.y);
    return (verticalA + verticalB) / (2 * (horizontal || 1));
  }

  const leftEAR = getEAR(landmarks[36], landmarks[37], landmarks[38], landmarks[39], landmarks[40], landmarks[41]);
  const rightEAR = getEAR(landmarks[42], landmarks[43], landmarks[44], landmarks[45], landmarks[46], landmarks[47]);
  const nose = landmarks[30];
  const distLeft = Math.abs(nose.x - landmarks[0].x);
  const distRight = Math.abs(landmarks[16].x - nose.x);
  // Relative nose position along the eye-to-mouth axis changes with head pitch.
  const eyes = { x: (landmarks[36].x + landmarks[45].x) / 2, y: (landmarks[36].y + landmarks[45].y) / 2 };
  const mouth = { x: (landmarks[48].x + landmarks[54].x) / 2, y: (landmarks[48].y + landmarks[54].y) / 2 };
  const axisX = mouth.x - eyes.x;
  const axisY = mouth.y - eyes.y;
  const axisLengthSquared = axisX * axisX + axisY * axisY;
  const pitchRatio = axisLengthSquared > 0
    ? ((nose.x - eyes.x) * axisX + (nose.y - eyes.y) * axisY) / axisLengthSquared
    : NaN;

  return {
    ear: Math.min(leftEAR, rightEAR),
    box: result.detection.box,
    leftEAR,
    rightEAR,
    yawRatio: distLeft / (distRight || 1),
    pitchRatio,
  };
}

export async function captureFace(video) {
  const data = await detectFaceWithDetails(video);
  if (!data) {
    throw new Error('Không tìm thấy khuôn mặt rõ ràng. Hãy căn giữa mặt vào khung hình và đủ sáng.');
  }
  return data.descriptor;
}

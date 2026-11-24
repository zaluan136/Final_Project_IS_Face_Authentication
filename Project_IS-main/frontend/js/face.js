const MODEL = '/models';
let ready;

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

export async function captureFace(video) {
  const api = await loadFaceModels();
  // Dùng TinyFaceDetectorOptions nhẹ, mượt và tương thích tốt trên trình duyệt
  const options = new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const result = await api.detectSingleFace(video, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) {
    throw new Error('Không tìm thấy khuôn mặt rõ ràng. Hãy căn giữa mặt vào khung hình và đủ sáng.');
  }
  return Array.from(result.descriptor);
}

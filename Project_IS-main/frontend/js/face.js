const MODEL = '/models';
let ready;
export async function loadFaceModels() {
  if (!ready) ready = (async () => {
    let api;
    try { api = await import('/vendor/face-api.esm.js'); }
    catch { throw new Error('Khong tai duoc thu vien nhan dien khuon mat. Kiem tra ket noi mang va tai lai trang.'); }
    await Promise.all([
      api.nets.ssdMobilenetv1.loadFromUri(MODEL),
      api.nets.faceLandmark68Net.loadFromUri(MODEL),
      api.nets.faceRecognitionNet.loadFromUri(MODEL),
    ]);
    return api;
  })();
  return ready;
}
export async function captureFace(video) {
  const api = await loadFaceModels();
  const result = await api.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
  if (!result) throw new Error('Khong tim thay khuon mat ro rang. Hay can giua mat va thu lai.');
  return Array.from(result.descriptor);
}

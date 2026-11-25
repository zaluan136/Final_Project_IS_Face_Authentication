import { apiRequest } from './api.js';
import { loadFaceModels, loadBlinkModel } from './face.js';
import { verifyDynamicChallenge } from './faceChallenge.js';

const video = document.getElementById('registerVideo');
const status = document.getElementById('registerStatus');
const message = document.getElementById('registerMessage');
const submitBtn = document.querySelector('#registerForm button[type="submit"]');

let cameraStream = null;

// Khởi tạo camera và nạp sẵn AI model để người dùng không phải chờ lâu khi bấm gửi
(async function init() {
  try {
    status.textContent = 'Đang mở webcam...';
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = cameraStream;
    await video.play();

    status.textContent = 'Đang tải mô hình nhận diện khuôn mặt AI...';
    await Promise.all([loadFaceModels(), loadBlinkModel()]);
    status.textContent = 'Sẵn sàng: Hãy căn mặt ngay ngắn vào khung hình và bấm Quét mặt.';
  } catch (err) {
    console.error(err);
    status.textContent = 'Lỗi camera hoặc tải model: ' + (err.message || 'Kiểm tra quyền truy cập camera.');
    status.style.color = '#c0392b';
  }
})();

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  message.style.color = '';

  if (!video.videoWidth || video.paused || video.ended) {
    message.textContent = 'Webcam chưa sẵn sàng. Vui lòng kiểm tra lại camera.';
    message.style.color = '#c0392b';
    return;
  }

  submitBtn.disabled = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Đang quét khuôn mặt...';
  message.textContent = 'Đang phân tích đặc trưng khuôn mặt (128-D vector)...';

  try {
    const challenge = (await apiRequest('/api/v1/auth/registration-challenge')).data;
    const verification = await verifyDynamicChallenge(video, status, challenge);

    message.textContent = 'Đã quét xong khuôn mặt! Đang gửi thông tin tạo tài khoản...';
    const formElement = document.getElementById('registerForm');
    const formData = new FormData(formElement);
    const values = Object.fromEntries(formData.entries());

    await apiRequest('/api/v1/auth/register', {
      method: 'POST',
      body: { ...values, faceDescriptor: verification.descriptor, faceEvidence: verification.evidence, nonce: challenge.nonce, liveness: challenge.challengeId },
    });

    message.textContent = 'Đăng ký thành công! Đang chuyển hướng về trang đăng nhập...';
    message.style.color = '#27ae60';
    setTimeout(() => location.assign('/login'), 1200);
  } catch (err) {
    console.error('Lỗi đăng ký:', err);
    message.textContent = err.message || 'Đăng ký thất bại. Vui lòng thử lại.';
    message.style.color = '#c0392b';
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
});

window.addEventListener('pagehide', () => {
  cameraStream?.getTracks().forEach((track) => track.stop());
});

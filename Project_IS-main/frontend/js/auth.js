import { apiRequest, ensureCsrfToken, setCsrfToken } from './api.js';
import { loadFaceModels, detectFaceWithDetails } from './face.js';

const loginForm = document.getElementById('loginForm');
const identifierInput = document.getElementById('identifier');
const passwordInput = document.getElementById('password');
const rememberMeInput = document.getElementById('rememberMe');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const eyeIcon = document.getElementById('eyeIcon');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const loginBtnSpinner = document.getElementById('loginBtnSpinner');
const loginBtnText = document.getElementById('loginBtnText');
const loginAlert = document.getElementById('loginAlert');
const loginAlertMessage = document.getElementById('loginAlertMessage');
const identifierError = document.getElementById('identifierError');
const passwordError = document.getElementById('passwordError');
const faceVideo = document.getElementById('faceVideo');
const faceStatus = document.getElementById('faceStatus');

let cameraStream;

// Khởi tạo camera và nạp sẵn AI model
(async function init() {
  try {
    if (faceStatus) faceStatus.textContent = 'Đang mở webcam...';
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    faceVideo.srcObject = cameraStream;
    await faceVideo.play();

    if (faceStatus) faceStatus.textContent = 'Đang nạp mô hình nhận diện khuôn mặt...';
    await loadFaceModels();
    if (faceStatus) faceStatus.textContent = 'Webcam sẵn sàng. Nhập thông tin và bấm Đăng nhập.';
  } catch (err) {
    console.error(err);
    if (faceStatus) {
      faceStatus.textContent = 'Webcam bắt buộc: ' + (err.message || 'Hãy cấp quyền truy cập camera.');
      faceStatus.style.color = '#c0392b';
    }
  }
})();

function setLoading(isLoading) {
  loginSubmitBtn.disabled = isLoading;
  loginBtnSpinner.hidden = !isLoading;
  loginBtnText.textContent = isLoading ? 'Đang xác thực...' : 'Đăng nhập';
}

function showFormError(message) {
  loginAlertMessage.textContent = message;
  loginAlert.hidden = false;
}

function clearErrors() {
  loginAlert.hidden = true;
  loginAlertMessage.textContent = '';
  identifierError.textContent = '';
  passwordError.textContent = '';
}

togglePasswordBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordBtn.setAttribute('aria-pressed', String(isPassword));
  togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  if (eyeIcon) {
    eyeIcon.innerHTML = isPassword
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
});

ensureCsrfToken().catch(() => {
  // Token will be fetched on submit if initial prefetch fails
});

// Kiểm tra liveness bằng nhịp chớp mắt (EAR) hoặc quay đầu tự nhiên
async function verifyLiveness(video, statusElem) {
  const startTime = Date.now();
  const maxDurationMs = 4000; // Tối đa 4 giây
  let detectedBlink = false;
  let eyeClosedOnce = false;
  let minEAR = 1.0;
  let maxEAR = 0.0;
  let initialYaw = null;
  let maxYawDiff = 0.0;
  let lastDescriptor = null;
  let framesCount = 0;

  if (statusElem) {
    statusElem.textContent = '👀 ĐANG KIỂM TRA LIVENESS: Vui lòng CHỚP MẮT hoặc quay nhẹ đầu...';
    statusElem.style.color = '#a87545';
  }

  while (Date.now() - startTime < maxDurationMs) {
    const data = await detectFaceWithDetails(video);
    if (data) {
      framesCount++;
      lastDescriptor = data.descriptor;

      minEAR = Math.min(minEAR, data.ear);
      maxEAR = Math.max(maxEAR, data.ear);

      // Khi chớp mắt thật: EAR tụt sâu (< 0.23) rồi mở lại (> 0.28)
      if (data.ear < 0.23) {
        eyeClosedOnce = true;
      }
      if (eyeClosedOnce && data.ear > 0.27) {
        detectedBlink = true;
      }

      // Theo dõi quay đầu thật: tỉ lệ khoảng cách mũi - má thay đổi
      if (initialYaw === null) {
        initialYaw = data.yawRatio;
      } else {
        const diff = Math.abs(data.yawRatio - initialYaw);
        if (diff > maxYawDiff) maxYawDiff = diff;
      }

      // Nếu đã phát hiện chớp mắt hoặc quay đầu rõ ràng
      if (detectedBlink || maxYawDiff > 0.35) {
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  if (framesCount < 5 || !lastDescriptor) {
    throw new Error('Không phát hiện được khuôn mặt rõ ràng trong khung hình.');
  }

  // Đánh giá liveness:
  // Nếu là ảnh tĩnh/điện thoại: EAR không co giãn (maxEAR - minEAR < 0.06) và không quay đầu
  const earDiff = maxEAR - minEAR;
  const isRealPerson = detectedBlink || (earDiff >= 0.07) || (maxYawDiff >= 0.28);

  if (!isRealPerson) {
    throw new Error('⚠️ CẢNH BÁO GIẢ MẠO (SPOOFING DETECTED): Phát hiện ảnh chụp/màn hình tĩnh (không có nhịp chớp mắt hoặc cử động tự nhiên). Từ chối truy cập!');
  }

  return lastDescriptor;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();

  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;
  const rememberMe = Boolean(rememberMeInput.checked);

  let hasValidationError = false;
  if (!identifier) {
    identifierError.textContent = 'Vui lòng nhập Email hoặc Mã nhân viên.';
    hasValidationError = true;
  }
  if (!password) {
    passwordError.textContent = 'Vui lòng nhập mật khẩu.';
    hasValidationError = true;
  }
  if (hasValidationError) return;

  setLoading(true);
  try {
    if (!cameraStream) throw new Error('Không thể mở webcam. Vui lòng cấp quyền truy cập camera.');

    // Thực hiện kiểm tra tính sống chống ảnh tĩnh
    const faceDescriptor = await verifyLiveness(faceVideo, faceStatus);

    if (faceStatus) {
      faceStatus.textContent = '✅ Liveness đạt! Đang so khớp danh tính với khuôn mặt đã đăng ký...';
      faceStatus.style.color = '#27ae60';
    }

    const response = await apiRequest('/api/v1/auth/face-login', {
      method: 'POST',
      body: { identifier, password, rememberMe, faceDescriptor, liveness: 'turn-left-right' },
    });

    if (response?.data?.csrfToken) {
      setCsrfToken(response.data.csrfToken);
    }

    window.location.replace('/dashboard');
  } catch (err) {
    if (err.code === 'CSRF_INVALID') {
      setCsrfToken(null);
    }
    showFormError(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
    if (faceStatus) {
      faceStatus.textContent = err.message || 'Đăng nhập thất bại.';
      faceStatus.style.color = '#c0392b';
    }
  } finally {
    setLoading(false);
  }
});
window.addEventListener('pagehide', () => cameraStream?.getTracks().forEach((track) => track.stop()));

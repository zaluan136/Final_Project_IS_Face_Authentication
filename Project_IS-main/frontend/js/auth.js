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

/**
 * Thực hiện Active Liveness Challenge - Response theo chỉ định động từ Backend:
 * Ngăn chặn tuyệt đối Replay Attack (Video quay sẵn hoặc ảnh tĩnh giơ lên):
 * - Nếu là video quay sẵn: Video chỉ phát hành động cố định, không thể đáp ứng đúng thử thách ngẫu nhiên mà Server vừa tạo.
 * - Server cấp Session Nonce ngẫu nhiên dùng 1 lần (Single-use token).
 */
async function verifyDynamicChallenge(video, statusElem, challenge) {
  const { challengeId, instruction } = challenge;
  const startTime = Date.now();
  const maxDurationMs = 5000; // Người dùng có 5 giây để thực hiện thử thách

  let blinkCount = 0;
  let eyeClosedOnce = false;
  let turnedLeft = false;
  let turnedRight = false;
  let minEAR = 1.0;
  let maxEAR = 0.0;
  let initialYaw = null;
  let lastDescriptor = null;
  let framesCount = 0;

  if (statusElem) {
    statusElem.textContent = `🎯 THỬ THÁCH BẢO MẬT: ${instruction}`;
    statusElem.style.color = '#a87545';
  }

  while (Date.now() - startTime < maxDurationMs) {
    const data = await detectFaceWithDetails(video);
    if (data) {
      framesCount++;
      lastDescriptor = data.descriptor;

      minEAR = Math.min(minEAR, data.ear);
      maxEAR = Math.max(maxEAR, data.ear);

      // 1. Nhận diện nhịp chớp mắt sinh học
      if (data.ear < 0.22) {
        eyeClosedOnce = true;
      }
      if (eyeClosedOnce && data.ear > 0.27) {
        blinkCount++;
        eyeClosedOnce = false;
      }

      // 2. Nhận diện góc quay đầu:
      // data.yawRatio < 0.65 là quay sang trái
      // data.yawRatio > 1.55 là quay sang phải
      if (data.yawRatio < 0.65) {
        turnedLeft = true;
      }
      if (data.yawRatio > 1.55) {
        turnedRight = true;
      }

      // Kiểm tra thỏa mãn điều kiện theo từng kịch bản ngẫu nhiên
      let satisfied = false;
      if (challengeId === 'blink' && blinkCount >= 2) {
        satisfied = true;
      } else if (challengeId === 'turn-left' && turnedLeft) {
        satisfied = true;
      } else if (challengeId === 'turn-right' && turnedRight) {
        satisfied = true;
      } else if (challengeId === 'turn-left-blink' && turnedLeft && blinkCount >= 1) {
        satisfied = true;
      } else if (challengeId === 'turn-right-blink' && turnedRight && blinkCount >= 1) {
        satisfied = true;
      }

      if (satisfied) {
        return lastDescriptor;
      }
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  if (framesCount < 5 || !lastDescriptor) {
    throw new Error('Không phát hiện được khuôn mặt rõ ràng trong khung hình.');
  }

  throw new Error(`⚠️ CẢNH BÁO GIẢ MẠO / VIDEO PHÁT LẠI: Thử thách không đạt yêu cầu ("${instruction}"). Không dùng ảnh tĩnh hoặc video ghi hình sẵn!`);
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

    // 1. Giai đoạn 1 (Theo báo cáo giữa kỳ): Client yêu cầu Server cấp Session Nonce & Thử thách ngẫu nhiên
    if (faceStatus) {
      faceStatus.textContent = 'Đang khởi tạo phiên thử thách bảo mật từ máy chủ...';
      faceStatus.style.color = '#a87545';
    }
    const challengeRes = await apiRequest('/api/v1/auth/liveness-challenge', { method: 'GET' });
    const challenge = challengeRes.data;

    // 2. Giai đoạn 2: Quét luồng Video & Thẩm định tính sống thời gian thực đối chiếu với thử thách
    const verifiedDescriptor = await verifyDynamicChallenge(faceVideo, faceStatus, challenge);

    if (faceStatus) {
      faceStatus.textContent = '✅ Vượt qua thử thách sống! Đang so khớp danh tính với khuôn mặt đã đăng ký...';
      faceStatus.style.color = '#27ae60';
    }

    // 3. Giai đoạn 3 & 4: Gửi descriptor kèm nonce dùng 1 lần về Server so khớp L2
    const response = await apiRequest('/api/v1/auth/face-login', {
      method: 'POST',
      body: {
        identifier,
        password,
        rememberMe,
        faceDescriptor: verifiedDescriptor,
        liveness: challenge.challengeId,
        nonce: challenge.nonce,
      },
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

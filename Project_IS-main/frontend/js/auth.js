import { apiRequest, ensureCsrfToken, setCsrfToken } from './api.js';
import { captureFace } from './face.js';

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
try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); faceVideo.srcObject = cameraStream; await faceVideo.play(); } catch { if (faceStatus) faceStatus.textContent = 'Webcam bat buoc; hay cap quyen camera.'; }

function setLoading(isLoading) {
  loginSubmitBtn.disabled = isLoading;
  loginBtnSpinner.hidden = !isLoading;
  loginBtnText.textContent = isLoading ? 'Đang đăng nhập...' : 'Đăng nhập';
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
    if (!cameraStream) throw new Error('Khong the mo webcam. Hay cap quyen camera.');
    if (faceStatus) faceStatus.textContent = 'Quay mat sang trai, sau do sang phai...';
    const before = await captureFace(faceVideo);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const after = await captureFace(faceVideo);
    const movement = Math.sqrt(before.reduce((sum, value, index) => sum + (value - after[index]) ** 2, 0));
    if (movement < 0.08) throw new Error('Thu thach chuyen dong khong dat. Hay quay dau trai va phai truoc camera.');
    const response = await apiRequest('/api/v1/auth/face-login', {
      method: 'POST',
      body: { identifier, password, rememberMe, faceDescriptor: after, liveness: 'turn-left-right' },
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
  } finally {
    setLoading(false);
  }
});
window.addEventListener('pagehide', () => cameraStream?.getTracks().forEach((track) => track.stop()));

import {
  apiRequest,
  formatTimeHCM,
  initAuthenticatedShell,
  renderStatusBadge,
} from './api.js';
import { WebcamController } from './webcam.js';

const webcam = new WebcamController();

const videoEl = document.getElementById('webcamVideo');
const previewEl = document.getElementById('capturedPreview');
const canvasEl = document.getElementById('captureCanvas');
const cameraStageEl = document.getElementById('cameraStage');
const placeholderEl = document.getElementById('cameraPlaceholder');
const cameraStateBadge = document.getElementById('cameraStateBadge');

const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const capturePhotoBtn = document.getElementById('capturePhotoBtn');
const retakePhotoBtn = document.getElementById('retakePhotoBtn');

const checkInBtn = document.getElementById('checkInBtn');
const checkOutBtn = document.getElementById('checkOutBtn');
const checkInSpinner = document.getElementById('checkInSpinner');
const checkOutSpinner = document.getElementById('checkOutSpinner');

const todayStatusBadge = document.getElementById('todayStatusBadge');
const todayDateValue = document.getElementById('todayDateValue');
const todayCheckInValue = document.getElementById('todayCheckInValue');
const todayCheckOutValue = document.getElementById('todayCheckOutValue');

const alertBox = document.getElementById('attendanceAlert');
const alertMsg = document.getElementById('attendanceAlertMsg');

let capturedBlob = null;
let capturedPreviewUrl = null;
let todayStatus = 'NOT_CHECKED_IN';
let isSubmitting = false;

function showAlert(type, message) {
  alertBox.className = `alert alert-${type}`;
  alertMsg.textContent = message;
  alertBox.hidden = false;
}

function clearAlert() {
  alertBox.hidden = true;
  alertMsg.textContent = '';
}

function revokePreviewUrl() {
  if (capturedPreviewUrl) {
    URL.revokeObjectURL(capturedPreviewUrl);
    capturedPreviewUrl = null;
  }
}

function setCameraLabel(label) {
  if (cameraStateBadge) {
    cameraStateBadge.textContent = label;
  }
}

function updateSubmitButtons() {
  const hasPhoto = Boolean(capturedBlob);
  checkInBtn.disabled = isSubmitting || !hasPhoto || todayStatus !== 'NOT_CHECKED_IN';
  checkOutBtn.disabled = isSubmitting || !hasPhoto || todayStatus !== 'CHECKED_IN';
}

function updateCameraControls() {
  const active = webcam.isActive();
  const hasPhoto = Boolean(capturedBlob);

  if (cameraStageEl) {
    cameraStageEl.classList.toggle('is-live', active && !hasPhoto);
  }

  startCameraBtn.disabled = active || isSubmitting;
  stopCameraBtn.disabled = !active || isSubmitting;
  capturePhotoBtn.disabled = !active || hasPhoto || isSubmitting;
  retakePhotoBtn.hidden = !hasPhoto;
  retakePhotoBtn.disabled = isSubmitting;

  updateSubmitButtons();
}

async function loadTodayStatus() {
  const response = await apiRequest('/api/v1/attendance/today');
  const data = response.data;
  todayStatus = data.status;

  renderStatusBadge(todayStatusBadge, todayStatus);
  todayDateValue.textContent = data.attendanceDate || '--';
  todayCheckInValue.textContent = data.record?.checkInAt
    ? formatTimeHCM(data.record.checkInAt)
    : '--:--:--';
  todayCheckOutValue.textContent = data.record?.checkOutAt
    ? formatTimeHCM(data.record.checkOutAt)
    : '--:--:--';

  updateSubmitButtons();
}

startCameraBtn.addEventListener('click', async () => {
  clearAlert();
  revokePreviewUrl();
  capturedBlob = null;
  previewEl.hidden = true;
  setCameraLabel('Đang xin quyền camera...');

  try {
    await webcam.start(videoEl);
    placeholderEl.hidden = true;
    videoEl.hidden = false;
    setCameraLabel('Camera đang hoạt động');
  } catch (err) {
    videoEl.hidden = true;
    placeholderEl.hidden = false;
    setCameraLabel('Lỗi quyền / thiết bị');
    showAlert('error', err.message);
  } finally {
    updateCameraControls();
  }
});

stopCameraBtn.addEventListener('click', () => {
  webcam.stop(videoEl);
  videoEl.hidden = true;
  if (!capturedBlob) {
    placeholderEl.hidden = false;
  }
  setCameraLabel('Camera đã dừng');
  updateCameraControls();
});

capturePhotoBtn.addEventListener('click', async () => {
  clearAlert();
  try {
    const result = await webcam.capturePhoto(videoEl, canvasEl);
    revokePreviewUrl();
    capturedBlob = result.blob;
    capturedPreviewUrl = URL.createObjectURL(capturedBlob);
    previewEl.src = capturedPreviewUrl;
    previewEl.hidden = false;
    videoEl.hidden = true;
    placeholderEl.hidden = true;
    setCameraLabel('Đã chụp ảnh');
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    updateCameraControls();
  }
});

retakePhotoBtn.addEventListener('click', async () => {
  clearAlert();
  revokePreviewUrl();
  capturedBlob = null;
  previewEl.hidden = true;

  if (!webcam.isActive()) {
    try {
      await webcam.start(videoEl);
    } catch (err) {
      placeholderEl.hidden = false;
      setCameraLabel('Camera chưa bật');
      showAlert('error', err.message);
      updateCameraControls();
      return;
    }
  }

  videoEl.hidden = false;
  placeholderEl.hidden = true;
  setCameraLabel('Camera đang hoạt động');
  updateCameraControls();
});

async function submitAttendance(type) {
  if (!capturedBlob || isSubmitting) return;
  clearAlert();
  isSubmitting = true;

  const spinner = type === 'check-in' ? checkInSpinner : checkOutSpinner;
  spinner.hidden = false;
  updateCameraControls();

  try {
    const formData = new FormData();
    formData.append('photo', capturedBlob, `${type}.jpg`);

    const endpoint =
      type === 'check-in'
        ? '/api/v1/attendance/check-in'
        : '/api/v1/attendance/check-out';

    const response = await apiRequest(endpoint, {
      method: 'POST',
      body: formData,
    });

    showAlert('success', response.message || 'Ghi nhận chấm công thành công.');
    revokePreviewUrl();
    capturedBlob = null;
    previewEl.hidden = true;
    webcam.stop(videoEl);
    videoEl.hidden = true;
    placeholderEl.hidden = false;
    setCameraLabel('Camera chưa bật');

    await loadTodayStatus();
  } catch (err) {
    showAlert('error', err.message || 'Gửi dữ liệu chấm công thất bại.');
  } finally {
    isSubmitting = false;
    spinner.hidden = true;
    updateCameraControls();
  }
}

checkInBtn.addEventListener('click', () => submitAttendance('check-in'));
checkOutBtn.addEventListener('click', () => submitAttendance('check-out'));

window.addEventListener('pagehide', () => {
  webcam.stop(videoEl);
  revokePreviewUrl();
});

(async () => {
  const employee = await initAuthenticatedShell();
  if (!employee) return;
  try {
    await loadTodayStatus();
  } catch (err) {
    showAlert('error', err.message || 'Không thể tải trạng thái hôm nay.');
  }
  updateCameraControls();
})();

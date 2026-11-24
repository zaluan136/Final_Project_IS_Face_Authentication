import {
  apiRequest,
  formatTimeHCM,
  initAuthenticatedShell,
  renderStatusBadge,
} from './api.js';
import { WebcamController } from './webcam.js';
import { loadFaceModels, detectFaceWithDetails } from './face.js';

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
let capturedDescriptor = null;
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
    setCameraLabel('Đang kiểm tra tính sống (Liveness)...');
    showAlert('info', '👀 Vui lòng CHỚP MẮT hoặc CỬ ĐỘNG NHẸ ĐẦU trước camera để kiểm tra người thật...');
    await loadFaceModels();

    // Thẩm định tính sống Liveness trong 3.5 giây trước khi cho phép chụp chấm công
    const startTime = Date.now();
    let detectedBlink = false;
    let eyeClosedOnce = false;
    let minEAR = 1.0;
    let maxEAR = 0.0;
    let initialYaw = null;
    let maxYawDiff = 0.0;
    let finalFaceData = null;
    let framesCount = 0;

    while (Date.now() - startTime < 3500) {
      const faceData = await detectFaceWithDetails(videoEl);
      if (faceData) {
        framesCount++;
        finalFaceData = faceData;

        minEAR = Math.min(minEAR, faceData.ear);
        maxEAR = Math.max(maxEAR, faceData.ear);

        if (faceData.ear < 0.24) eyeClosedOnce = true;
        if (eyeClosedOnce && faceData.ear > 0.26) detectedBlink = true;

        if (initialYaw === null) initialYaw = faceData.yawRatio;
        else {
          const diff = Math.abs(faceData.yawRatio - initialYaw);
          if (diff > maxYawDiff) maxYawDiff = diff;
        }

        if (detectedBlink || maxYawDiff > 0.25) break;
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    if (framesCount < 5 || !finalFaceData) {
      throw new Error('Không phát hiện được khuôn mặt rõ ràng trong khung hình. Vui lòng căn giữa mặt và đủ ánh sáng.');
    }

    // Kiểm tra chống ảnh tĩnh 2D / màn hình điện thoại tĩnh giơ lên
    const earDiff = maxEAR - minEAR;
    const isRealPerson = detectedBlink || (earDiff >= 0.06) || (maxYawDiff >= 0.25);
    if (!isRealPerson) {
      throw new Error('⚠️ CẢNH BÁO GIẢ MẠO: Phát hiện ảnh in/màn hình tĩnh (không có cử động hoặc chớp mắt). Từ chối chấm công!');
    }

    capturedDescriptor = finalFaceData.descriptor;

    const result = await webcam.capturePhoto(videoEl, canvasEl);
    revokePreviewUrl();
    capturedBlob = result.blob;
    capturedPreviewUrl = URL.createObjectURL(capturedBlob);
    previewEl.src = capturedPreviewUrl;
    previewEl.hidden = false;
    videoEl.hidden = true;
    placeholderEl.hidden = true;
    setCameraLabel('Đã xác thực người thật');
    showAlert('success', '✅ Đã xác thực thực thể sống & khuôn mặt! Bấm Chấm công vào/ra để hoàn tất.');
  } catch (err) {
    showAlert('error', err.message);
    setCameraLabel('Chụp ảnh thất bại');
  } finally {
    updateCameraControls();
  }
});

retakePhotoBtn.addEventListener('click', async () => {
  clearAlert();
  revokePreviewUrl();
  capturedBlob = null;
  capturedDescriptor = null;
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
    if (capturedDescriptor) {
      formData.append('faceDescriptor', JSON.stringify(capturedDescriptor));
    }

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
    capturedDescriptor = null;
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

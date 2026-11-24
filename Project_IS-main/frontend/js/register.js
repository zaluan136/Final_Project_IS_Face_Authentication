import { apiRequest } from './api.js';
import { captureFace } from './face.js';
const video = document.getElementById('registerVideo');
const status = document.getElementById('registerStatus');
try { video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); await video.play(); status.textContent = 'Can giua mat trong khung hinh.'; } catch { status.textContent = 'Khong mo duoc webcam. Hay cap quyen camera.'; }
document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const message = document.getElementById('registerMessage'); message.textContent = 'Dang quet va dang ky...';
  try { const faceDescriptor = await captureFace(video); const values = Object.fromEntries(new FormData(event.currentTarget)); await apiRequest('/api/v1/auth/register', { method: 'POST', body: { ...values, faceDescriptor } }); message.textContent = 'Dang ky thanh cong. Chuyen den dang nhap...'; setTimeout(() => location.assign('/login'), 900); }
  catch (err) { message.textContent = err.message; }
});
window.addEventListener('pagehide', () => video.srcObject?.getTracks().forEach((track) => track.stop()));

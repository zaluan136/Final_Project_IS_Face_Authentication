import {
  apiRequest,
  formatDateVietnamese,
  formatTimeHCM,
  initAuthenticatedShell,
  renderStatusBadge,
} from './api.js';

const alertBox = document.getElementById('dashboardAlert');
const alertMsg = document.getElementById('dashboardAlertMsg');
const welcomeNameEl = document.getElementById('welcomeName');
const todayStatusBadge = document.getElementById('todayStatusBadge');
const todayStatusDot = document.getElementById('todayStatusDot');
const todayDateText = document.getElementById('todayDateText');
const todayCheckIn = document.getElementById('todayCheckIn');
const todayCheckOut = document.getElementById('todayCheckOut');

const monthlyStatsTitle = document.getElementById('monthlyStatsTitle');
const statTotalDays = document.getElementById('statTotalDays');
const statCheckedIn = document.getElementById('statCheckedIn');
const statIncomplete = document.getElementById('statIncomplete');
const statRate = document.getElementById('statRate');

function updateMonthlyStats(records, referenceDateStr) {
  const monthPrefix = referenceDateStr ? referenceDateStr.slice(0, 7) : '';
  if (monthPrefix && monthlyStatsTitle) {
    const [year, month] = monthPrefix.split('-');
    monthlyStatsTitle.textContent = `Thống kê chấm công tháng ${month}/${year}`;
  }

  const monthRecords = (records || []).filter((r) =>
    monthPrefix ? String(r.attendanceDate || '').startsWith(monthPrefix) : true
  );

  const totalDays = monthRecords.length;
  const completedDays = monthRecords.filter((r) => r.status === 'CHECKED_OUT').length;
  const checkedInDays = monthRecords.filter((r) => Boolean(r.checkInAt)).length;
  const incompleteDays = Math.max(0, checkedInDays - completedDays);
  const rate = totalDays > 0 ? `${Math.round((completedDays / totalDays) * 1000) / 10}%` : '0%';

  if (statTotalDays) statTotalDays.textContent = String(totalDays);
  if (statCheckedIn) statCheckedIn.textContent = String(checkedInDays);
  if (statIncomplete) statIncomplete.textContent = String(incompleteDays);
  if (statRate) statRate.textContent = rate;
}

(async () => {
  const employee = await initAuthenticatedShell();
  if (!employee) return;

  if (welcomeNameEl && employee.name) {
    welcomeNameEl.textContent = employee.name;
  }

  try {
    const [todayRes, historyRes] = await Promise.all([
      apiRequest('/api/v1/attendance/today'),
      apiRequest('/api/v1/attendance/history?page=1&limit=31'),
    ]);

    const today = todayRes.data;
    renderStatusBadge(todayStatusBadge, today.status);
    if (todayStatusDot) {
      todayStatusDot.className = 'status-dot';
      todayStatusDot.classList.add(
        today.status === 'CHECKED_OUT' ? 'is-success' : 'is-warning'
      );
    }

    todayDateText.textContent = formatDateVietnamese(today.attendanceDate, 'banner');
    todayCheckIn.textContent = formatTimeHCM(today.record?.checkInAt);
    todayCheckOut.textContent = formatTimeHCM(today.record?.checkOutAt);

    updateMonthlyStats(historyRes.data.records, today.attendanceDate);
  } catch (err) {
    alertMsg.textContent = err.message || 'Không thể tải dữ liệu bảng điều khiển.';
    alertBox.hidden = false;
  }
})();

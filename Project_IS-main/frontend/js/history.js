import {
  apiRequest,
  formatDateVietnamese,
  formatTimeHCM,
  formatWorkingDuration,
  initAuthenticatedShell,
  renderStatusBadge,
} from './api.js';

const historyAlert = document.getElementById('historyAlert');
const historyAlertMsg = document.getElementById('historyAlertMsg');
const historyTableWrap = document.getElementById('historyTableWrap');
const paginationBar = document.getElementById('paginationBar');
const paginationInfo = document.getElementById('paginationInfo');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const historyMonthFilter = document.getElementById('historyMonthFilter');

let currentPage = 1;
const pageSize = 10;
let loadedRecords = [];
let loadedPagination = null;

function populateMonthOptions(records) {
  if (!historyMonthFilter) return;
  const previous = historyMonthFilter.value || 'ALL';
  const months = Array.from(
    new Set(
      (records || [])
        .map((r) => String(r.attendanceDate || '').slice(0, 7))
        .filter((m) => /^\d{4}-\d{2}$/.test(m))
    )
  );

  historyMonthFilter.innerHTML = '<option value="ALL">Tất cả các tháng</option>';
  for (const m of months) {
    const [year, month] = m.split('-');
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `Tháng ${month}/${year}`;
    historyMonthFilter.appendChild(opt);
  }
  if (months.includes(previous)) {
    historyMonthFilter.value = previous;
  }
}

function renderHistory(records, pagination) {
  if (!records || records.length === 0) {
    historyTableWrap.innerHTML =
      '<div class="empty-state">Chưa có dữ liệu chấm công phù hợp.</div>';
    paginationBar.hidden = true;
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Ngày</th>
      <th>Giờ vào</th>
      <th>Giờ ra</th>
      <th>Thời gian làm việc</th>
      <th>Trạng thái</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const rec of records) {
    const tr = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.textContent = formatDateVietnamese(rec.attendanceDate, 'table');

    const inTd = document.createElement('td');
    inTd.textContent = formatTimeHCM(rec.checkInAt, false);

    const outTd = document.createElement('td');
    outTd.textContent = formatTimeHCM(rec.checkOutAt, false);

    const durationTd = document.createElement('td');
    durationTd.textContent = formatWorkingDuration(rec.checkInAt, rec.checkOutAt);

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    renderStatusBadge(badge, rec.status);
    statusTd.appendChild(badge);

    tr.append(dateTd, inTd, outTd, durationTd, statusTd);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  historyTableWrap.innerHTML = '';
  historyTableWrap.appendChild(table);

  paginationInfo.textContent = `Trang ${pagination.page} / ${pagination.totalPages} (${pagination.total} bản ghi)`;
  prevPageBtn.disabled = pagination.page <= 1;
  nextPageBtn.disabled = pagination.page >= pagination.totalPages;
  paginationBar.hidden = false;
}

function applyMonthFilter() {
  if (!loadedPagination) return;
  const selectedMonth = historyMonthFilter?.value || 'ALL';
  const filtered =
    selectedMonth === 'ALL'
      ? loadedRecords
      : loadedRecords.filter((r) => String(r.attendanceDate || '').startsWith(selectedMonth));
  renderHistory(filtered, loadedPagination);
}

async function loadPage(page) {
  historyAlert.hidden = true;
  historyTableWrap.innerHTML = `
    <div class="skeleton-stack">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>
  `;
  try {
    const res = await apiRequest(`/api/v1/attendance/history?page=${page}&limit=${pageSize}`);
    currentPage = res.data.pagination.page;
    loadedRecords = res.data.records || [];
    loadedPagination = res.data.pagination;
    populateMonthOptions(loadedRecords);
    applyMonthFilter();
  } catch (err) {
    historyTableWrap.innerHTML = '<div class="empty-state">Không thể tải dữ liệu.</div>';
    historyAlertMsg.textContent = err.message || 'Không thể tải lịch sử chấm công.';
    historyAlert.hidden = false;
  }
}

if (historyMonthFilter) {
  historyMonthFilter.addEventListener('change', applyMonthFilter);
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) loadPage(currentPage - 1);
});

nextPageBtn.addEventListener('click', () => {
  loadPage(currentPage + 1);
});

(async () => {
  const employee = await initAuthenticatedShell();
  if (!employee) return;
  await loadPage(1);
})();

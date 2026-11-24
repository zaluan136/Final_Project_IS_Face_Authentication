const HCM_TIMEZONE = 'Asia/Ho_Chi_Minh';

let cachedCsrfToken = null;

export function setCsrfToken(token) {
  cachedCsrfToken = token || null;
}

export async function ensureCsrfToken() {
  if (cachedCsrfToken) return cachedCsrfToken;
  const response = await fetch('/api/v1/auth/csrf-token', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json();
  if (!response.ok || !payload?.data?.csrfToken) {
    throw new Error('Không thể khởi tạo mã bảo mật CSRF.');
  }
  cachedCsrfToken = payload.data.csrfToken;
  return cachedCsrfToken;
}

export async function apiRequest(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const token = await ensureCsrfToken();
    headers.set('X-CSRF-Token', token);
  }

  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    credentials: 'same-origin',
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = new Error(
      payload?.error?.message || `Yêu cầu thất bại (mã lỗi ${response.status})`
    );
    err.status = response.status;
    err.code = payload?.error?.code || 'REQUEST_FAILED';
    throw err;
  }

  return payload;
}

export function formatTimeHCM(isoString, includeSeconds = true) {
  if (!isoString) return includeSeconds ? '--:--:--' : '–';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return includeSeconds ? '--:--:--' : '–';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HCM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date);
}

export function formatClockHCM(date = new Date()) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HCM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateVietnamese(yyyyMmDd, style = 'table') {
  if (!yyyyMmDd) return '--';
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('vi-VN', {
    timeZone: HCM_TIMEZONE,
    weekday: 'long',
  }).format(date);
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const capWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  if (style === 'banner') {
    return `${capWeekday}, ${dd}/${mm}/${y}`;
  }
  return `${dd}/${mm}/${y} (${capWeekday})`;
}

export function formatWorkingDuration(checkInIso, checkOutIso) {
  if (!checkInIso || !checkOutIso) return '–';
  const start = new Date(checkInIso).getTime();
  const end = new Date(checkOutIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '–';
  const totalMinutes = Math.floor((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} giờ ${String(minutes).padStart(2, '0')} phút`;
}

export function getInitials(name) {
  if (!name) return '--';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function renderStatusBadge(element, status) {
  if (!element) return;
  element.className = 'badge';
  if (status === 'CHECKED_OUT') {
    element.classList.add('badge-success');
    element.textContent = 'Đủ công';
  } else if (status === 'CHECKED_IN') {
    element.classList.add('badge-warning');
    element.textContent = 'Đã check-in';
  } else {
    element.classList.add('badge-warning');
    element.textContent = 'Chưa chấm công';
  }
}

export async function initAuthenticatedShell() {
  const clockEl = document.getElementById('liveClock');
  if (clockEl) {
    clockEl.textContent = formatClockHCM();
    setInterval(() => {
      clockEl.textContent = formatClockHCM();
    }, 1000);
  }

  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('visible');
  }

  if (menuToggleBtn && sidebar) {
    menuToggleBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      if (sidebarBackdrop) {
        sidebarBackdrop.classList.toggle('visible', isOpen);
      }
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileSidebar();
    }
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      try {
        await apiRequest('/api/v1/auth/logout', { method: 'POST' });
      } catch {
        // Redirect to login regardless
      } finally {
        setCsrfToken(null);
        window.location.replace('/login');
      }
    });
  }

  try {
    const result = await apiRequest('/api/v1/auth/me');
    const employee = result?.data?.employee;
    if (!employee) {
      window.location.replace('/login');
      return null;
    }

    const avatarEl = document.getElementById('userAvatar');
    const nameEl = document.getElementById('userName');
    const codeEl = document.getElementById('userCode');

    if (avatarEl) avatarEl.textContent = getInitials(employee.name);
    if (nameEl) nameEl.textContent = employee.name;
    if (codeEl) codeEl.textContent = employee.employeeCode;

    return employee;
  } catch (err) {
    if (err.status === 401) {
      window.location.replace('/login');
      return null;
    }
    throw err;
  }
}

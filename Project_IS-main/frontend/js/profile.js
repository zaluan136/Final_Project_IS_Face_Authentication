import { apiRequest, initAuthenticatedShell } from './api.js';

const profileAlert = document.getElementById('profileAlert');
const profileAlertMsg = document.getElementById('profileAlertMsg');

(async () => {
  const employee = await initAuthenticatedShell();
  if (!employee) return;

  try {
    const res = await apiRequest('/api/v1/employees/me');
    const emp = res.data.employee;

    document.getElementById('profileName').textContent = emp.name;
    document.getElementById('profileCode').textContent = emp.employeeCode;
    document.getElementById('profileEmail').textContent = emp.email;
    document.getElementById('profileDepartment').textContent = emp.department;
    document.getElementById('profileRole').textContent = emp.role;
    document.getElementById('profileStatus').textContent = emp.status;
  } catch (err) {
    profileAlertMsg.textContent = err.message || 'Không thể tải thông tin nhân viên.';
    profileAlert.hidden = false;
  }
})();

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { AppError } = require('../utils/errors');

function isValidFaceDescriptor(value) {
  return Array.isArray(value) && value.length === 128 &&
    value.every((item) => Number.isFinite(item) && item >= -1 && item <= 1) &&
    value.some((item) => item !== 0);
}

function validateStrongPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
}

// Precomputed dummy hash to keep timing consistent when user is not found
const DUMMY_BCRYPT_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKxGhu5u1rQ2Q3Q4Q5Q6Q7Q8Q9Q0QaQbQcQdO';

function toPublicEmployee(employeeRow) {
  return {
    id: employeeRow.id,
    employeeCode: employeeRow.employee_code,
    name: employeeRow.full_name,
    email: employeeRow.email,
    department: employeeRow.department,
    role: employeeRow.role,
    status: employeeRow.status,
    createdAt: employeeRow.created_at,
  };
}

class AuthService {
  constructor(employeeRepository) {
    this.employeeRepository = employeeRepository;
  }

  async authenticate(identifier, password) {
    const employee = this.employeeRepository.findByIdentifier(identifier);
    const hashToCheck = employee ? employee.password_hash : DUMMY_BCRYPT_HASH;
    const isMatch = await bcrypt.compare(password, hashToCheck);

    if (!employee || !isMatch) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid employee ID/email or password.');
    }

    if (employee.status !== 'ACTIVE') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account is currently inactive. Please contact support.');
    }

    return toPublicEmployee(employee);
  }

  async register({ employeeCode, name, email, password, department, faceDescriptor }) {
    if (this.employeeRepository.findByIdentifier(employeeCode) || this.employeeRepository.findByIdentifier(email)) {
      throw new AppError(409, 'ACCOUNT_EXISTS', 'Employee ID or email is already registered.');
    }
    if (!validateStrongPassword(password)) {
      throw new AppError(400, 'WEAK_PASSWORD', 'Password must be 8-128 characters and include upper case, lower case, a number, and a special character.');
    }
    if (!isValidFaceDescriptor(faceDescriptor)) {
      throw new AppError(400, 'INVALID_FACE', 'A valid face scan is required.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const employee = this.employeeRepository.create({ employeeCode, name, email, passwordHash, department, faceDescriptor, createdAt: new Date().toISOString() });
    return toPublicEmployee(employee);
  }

  async authenticateFace(identifier, password, descriptor) {
    const employee = this.employeeRepository.findByIdentifier(identifier);
    const hash = employee ? employee.password_hash : DUMMY_BCRYPT_HASH;
    const passwordOk = await bcrypt.compare(password, hash);
    if (!employee || !passwordOk) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid employee ID/email or password.');
    let enrolled;
    try {
      enrolled = typeof employee.face_descriptor === 'string'
        ? JSON.parse(employee.face_descriptor || 'null')
        : employee.face_descriptor;
    } catch {
      enrolled = null;
    }
    if (!isValidFaceDescriptor(enrolled) || !isValidFaceDescriptor(descriptor)) {
      throw new AppError(401, 'FACE_NOT_ENROLLED', 'Tài khoản chưa có dữ liệu khuôn mặt hoặc khuôn mặt không hợp lệ.');
    }
    const distance = Math.sqrt(enrolled.reduce((sum, value, index) => sum + (value - descriptor[index]) ** 2, 0));
    // Ngưỡng so khớp Euclidean distance (thông thường từ 0.50 - 0.55 cho model 128-D)
    if (distance > 0.55) {
      throw new AppError(401, 'FACE_MISMATCH', `Khuôn mặt không khớp với tài khoản đã đăng ký (Khoảng cách: ${distance.toFixed(3)}).`);
    }
    return toPublicEmployee(employee);
  }

  getAuthenticatedProfile(employeeId) {
    const employee = this.employeeRepository.findPublicById(employeeId);
    if (!employee || employee.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }
    return toPublicEmployee(employee);
  }
}

module.exports = { AuthService, toPublicEmployee };

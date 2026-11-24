const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { AppError } = require('../utils/errors');

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
    if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128 || faceDescriptor.some((v) => !Number.isFinite(v))) {
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
    try { enrolled = JSON.parse(employee.face_descriptor || 'null'); } catch { enrolled = null; }
    if (!enrolled || !Array.isArray(descriptor) || descriptor.length !== 128) throw new AppError(401, 'FACE_NOT_ENROLLED', 'Face verification is required.');
    const distance = Math.sqrt(enrolled.reduce((sum, value, index) => sum + (value - descriptor[index]) ** 2, 0));
    if (distance > 0.48) throw new AppError(401, 'FACE_MISMATCH', 'Face verification failed.');
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

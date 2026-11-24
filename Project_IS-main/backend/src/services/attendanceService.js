const { AppError } = require('../utils/errors');
const { getAttendanceDateHCM, nowUtcIso } = require('../utils/time');

function formatAttendanceRecord(row) {
  if (!row) return null;
  let status = 'NOT_CHECKED_IN';
  if (row.check_in_at && row.check_out_at) {
    status = 'CHECKED_OUT';
  } else if (row.check_in_at) {
    status = 'CHECKED_IN';
  }

  return {
    id: row.id,
    attendanceDate: row.attendance_date,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    hasCheckInPhoto: Boolean(row.check_in_photo_path),
    hasCheckOutPhoto: Boolean(row.check_out_photo_path),
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class AttendanceService {
  constructor(attendanceRepository, evidenceService, authService = null) {
    this.attendanceRepository = attendanceRepository;
    this.evidenceService = evidenceService;
    this.authService = authService;
  }

  requiresLivenessChallenge(employeeId) {
    if (!this.authService) return false;
    const employee = this.authService.employeeRepository.findById(employeeId);
    return Boolean(employee?.face_descriptor);
  }

  verifyEmployeeFace(employeeId, faceDescriptor) {
    if (!this.authService) return;
    const employee = this.authService.employeeRepository.findById(employeeId);
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Không tìm thấy nhân viên.');
    let enrolled;
    try {
      enrolled = typeof employee.face_descriptor === 'string'
        ? JSON.parse(employee.face_descriptor || 'null')
        : employee.face_descriptor;
    } catch {
      enrolled = null;
    }
    // Nếu có gửi faceDescriptor hoặc tài khoản đã đăng ký khuôn mặt
    if (faceDescriptor || enrolled) {
      const isValidDescriptor = (value) =>
        Array.isArray(value) && value.length === 128 &&
        value.every((item) => Number.isFinite(item) && item >= -1 && item <= 1) &&
        value.some((item) => item !== 0);
      if (!isValidDescriptor(faceDescriptor)) {
        throw new AppError(400, 'INVALID_FACE_SCAN', 'Cần quét khuôn mặt hợp lệ để chấm công.');
      }
      if (!isValidDescriptor(enrolled)) {
        throw new AppError(400, 'FACE_NOT_ENROLLED', 'Tài khoản chưa có dữ liệu khuôn mặt mẫu.');
      }
      const distance = Math.sqrt(enrolled.reduce((sum, value, index) => sum + (value - faceDescriptor[index]) ** 2, 0));
      if (distance > 0.55) {
        throw new AppError(401, 'FACE_MISMATCH', `Khuôn mặt chấm công không khớp với nhân viên hiện tại (Khoảng cách: ${distance.toFixed(3)}). Chống chấm công hộ!`);
      }
    }
  }

  checkIn(employeeId, file, faceDescriptor = null) {
    this.verifyEmployeeFace(employeeId, faceDescriptor);
    const now = new Date();
    const attendanceDate = getAttendanceDateHCM(now);
    const timestampIso = nowUtcIso();

    // Fast-path check before writing photo to disk
    const existing = this.attendanceRepository.findByEmployeeAndDate(employeeId, attendanceDate);
    if (existing) {
      throw new AppError(409, 'DUPLICATE_CHECK_IN', 'You have already checked in for today.');
    }

    const photoPath = this.evidenceService.saveValidatedPhoto(file, {
      employeeId,
      attendanceDate,
      eventType: 'checkin',
    });

    try {
      const record = this.attendanceRepository.createCheckIn({
        employeeId,
        attendanceDate,
        timestampIso,
        photoPath,
      });
      return formatAttendanceRecord(record);
    } catch (err) {
      this.evidenceService.deletePhotoQuietly(photoPath);
      throw err;
    }
  }

  checkOut(employeeId, file, faceDescriptor = null) {
    this.verifyEmployeeFace(employeeId, faceDescriptor);
    const now = new Date();
    const attendanceDate = getAttendanceDateHCM(now);
    const timestampIso = nowUtcIso();

    const existing = this.attendanceRepository.findByEmployeeAndDate(employeeId, attendanceDate);
    if (!existing) {
      throw new AppError(
        409,
        'CHECK_IN_REQUIRED',
        'You must check in before checking out for today.'
      );
    }
    if (existing.check_out_at) {
      throw new AppError(
        409,
        'DUPLICATE_CHECK_OUT',
        'You have already checked out for today.'
      );
    }

    const photoPath = this.evidenceService.saveValidatedPhoto(file, {
      employeeId,
      attendanceDate,
      eventType: 'checkout',
    });

    try {
      const record = this.attendanceRepository.recordCheckOut({
        employeeId,
        attendanceDate,
        timestampIso,
        photoPath,
      });
      return formatAttendanceRecord(record);
    } catch (err) {
      this.evidenceService.deletePhotoQuietly(photoPath);
      throw err;
    }
  }

  getToday(employeeId) {
    const attendanceDate = getAttendanceDateHCM(new Date());
    const record = this.attendanceRepository.findByEmployeeAndDate(employeeId, attendanceDate);
    return {
      attendanceDate,
      status: record
        ? record.check_out_at
          ? 'CHECKED_OUT'
          : 'CHECKED_IN'
        : 'NOT_CHECKED_IN',
      record: formatAttendanceRecord(record),
    };
  }

  getHistory(employeeId, pagination) {
    const { total, items } = this.attendanceRepository.listByEmployee(employeeId, pagination);
    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    return {
      records: items.map(formatAttendanceRecord),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
      },
    };
  }

  getEvidenceFileForEmployee(employeeId, recordId, type) {
    if (type !== 'check-in' && type !== 'check-out') {
      throw new AppError(400, 'INVALID_EVIDENCE_TYPE', 'Invalid evidence type.');
    }

    const record = this.attendanceRepository.findByIdForEmployee(recordId, employeeId);
    if (!record) {
      throw new AppError(404, 'RECORD_NOT_FOUND', 'Attendance record not found.');
    }

    const relativePath =
      type === 'check-in' ? record.check_in_photo_path : record.check_out_photo_path;
    if (!relativePath) {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidence photo not found.');
    }

    return this.evidenceService.resolveSafePath(relativePath);
  }
}

module.exports = { AttendanceService, formatAttendanceRecord };

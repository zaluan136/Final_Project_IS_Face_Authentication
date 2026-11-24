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
  constructor(attendanceRepository, evidenceService) {
    this.attendanceRepository = attendanceRepository;
    this.evidenceService = evidenceService;
  }

  checkIn(employeeId, file) {
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

  checkOut(employeeId, file) {
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

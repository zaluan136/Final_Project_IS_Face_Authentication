const { AppError } = require('../utils/errors');

/**
 * Data-access repository for attendance_records.
 * Uses atomic SQLite transactions to prevent concurrent duplicate submissions.
 */
class AttendanceRepository {
  constructor(db) {
    this.db = db;
    this.findByEmployeeAndDateStmt = db.prepare(
      `SELECT id, employee_id, attendance_date, check_in_at, check_out_at,
              check_in_photo_path, check_out_photo_path, created_at, updated_at
       FROM attendance_records
       WHERE employee_id = ? AND attendance_date = ?
       LIMIT 1`
    );
    this.findByIdForEmployeeStmt = db.prepare(
      `SELECT id, employee_id, attendance_date, check_in_at, check_out_at,
              check_in_photo_path, check_out_photo_path, created_at, updated_at
       FROM attendance_records
       WHERE id = ? AND employee_id = ?
       LIMIT 1`
    );
    this.insertCheckInStmt = db.prepare(
      `INSERT INTO attendance_records (
         employee_id, attendance_date, check_in_at, check_in_photo_path, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`
    );
    this.updateCheckOutStmt = db.prepare(
      `UPDATE attendance_records
       SET check_out_at = ?, check_out_photo_path = ?, updated_at = ?
       WHERE id = ? AND employee_id = ? AND check_out_at IS NULL`
    );
    this.countByEmployeeStmt = db.prepare(
      `SELECT COUNT(*) AS total FROM attendance_records WHERE employee_id = ?`
    );
    this.listByEmployeeStmt = db.prepare(
      `SELECT id, employee_id, attendance_date, check_in_at, check_out_at,
              check_in_photo_path, check_out_photo_path, created_at, updated_at
       FROM attendance_records
       WHERE employee_id = ?
       ORDER BY attendance_date DESC, id DESC
       LIMIT ? OFFSET ?`
    );
  }

  findByEmployeeAndDate(employeeId, attendanceDate) {
    return this.findByEmployeeAndDateStmt.get(employeeId, attendanceDate) || null;
  }

  findByIdForEmployee(recordId, employeeId) {
    return this.findByIdForEmployeeStmt.get(recordId, employeeId) || null;
  }

  createCheckIn({ employeeId, attendanceDate, timestampIso, photoPath }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.findByEmployeeAndDateStmt.get(employeeId, attendanceDate);
      if (existing) {
        throw new AppError(409, 'DUPLICATE_CHECK_IN', 'You have already checked in for today.');
      }

      const result = this.insertCheckInStmt.run(
        employeeId,
        attendanceDate,
        timestampIso,
        photoPath,
        timestampIso,
        timestampIso
      );

      this.db.exec('COMMIT');
      return this.findByIdForEmployeeStmt.get(Number(result.lastInsertRowid), employeeId);
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error if transaction already closed
      }
      if (err instanceof AppError) throw err;
      if (String(err.message || '').includes('UNIQUE constraint failed')) {
        throw new AppError(409, 'DUPLICATE_CHECK_IN', 'You have already checked in for today.');
      }
      throw err;
    }
  }

  recordCheckOut({ employeeId, attendanceDate, timestampIso, photoPath }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.findByEmployeeAndDateStmt.get(employeeId, attendanceDate);
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

      const result = this.updateCheckOutStmt.run(
        timestampIso,
        photoPath,
        timestampIso,
        existing.id,
        employeeId
      );

      if (result.changes === 0) {
        throw new AppError(
          409,
          'DUPLICATE_CHECK_OUT',
          'You have already checked out for today.'
        );
      }

      this.db.exec('COMMIT');
      return this.findByIdForEmployeeStmt.get(existing.id, employeeId);
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error if transaction already closed
      }
      if (err instanceof AppError) throw err;
      throw err;
    }
  }

  listByEmployee(employeeId, { limit, offset }) {
    const totalRow = this.countByEmployeeStmt.get(employeeId);
    const items = this.listByEmployeeStmt.all(employeeId, limit, offset);
    return {
      total: Number(totalRow?.total || 0),
      items,
    };
  }
}

module.exports = { AttendanceRepository };

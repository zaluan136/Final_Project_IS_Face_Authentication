/**
 * Data-access repository for employees.
 * Abstracts SQLite queries so the database engine (e.g. MySQL) can be swapped later.
 */
class EmployeeRepository {
  constructor(db) {
    this.db = db;
    this.findByIdentifierStmt = db.prepare(
      `SELECT id, employee_code, full_name, email, password_hash, face_descriptor, department, role, status, created_at
       FROM employees
       WHERE LOWER(employee_code) = LOWER(?) OR LOWER(email) = LOWER(?)
       LIMIT 1`
    );
    this.findByIdStmt = db.prepare(
      `SELECT id, employee_code, full_name, email, face_descriptor, department, role, status, created_at
       FROM employees
       WHERE id = ?
       LIMIT 1`
    );
    this.createStmt = db.prepare(`INSERT INTO employees (employee_code, full_name, email, password_hash, face_descriptor, department, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'EMPLOYEE', 'ACTIVE', ?)`);
  }

  findById(id) {
    return this.findByIdStmt.get(id) || null;
  }

  findByIdentifier(identifier) {
    return this.findByIdentifierStmt.get(identifier, identifier) || null;
  }

  findPublicById(id) {
    return this.findByIdStmt.get(id) || null;
  }

  create(employee) {
    const result = this.createStmt.run(employee.employeeCode, employee.name, employee.email, employee.passwordHash, JSON.stringify(employee.faceDescriptor), employee.department, employee.createdAt);
    return this.findByIdStmt.get(Number(result.lastInsertRowid));
  }
}

module.exports = { EmployeeRepository };

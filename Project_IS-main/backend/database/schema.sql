-- AttendSecure SQLite Schema
-- Timestamps are stored as UTC ISO-8601 strings.
-- attendance_date is stored as YYYY-MM-DD in Asia/Ho_Chi_Minh timezone.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    face_descriptor TEXT,
    department TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('EMPLOYEE', 'SUPERVISOR')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);

CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    check_in_at TEXT NOT NULL,
    check_out_at TEXT DEFAULT NULL,
    check_in_photo_path TEXT NOT NULL,
    check_out_photo_path TEXT DEFAULT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE (employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_employee_date
    ON attendance_records(employee_id, attendance_date DESC);

CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

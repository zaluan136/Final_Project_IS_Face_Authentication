const bcrypt = require('bcrypt');
const env = require('../src/config/env');
const { createDatabase } = require('../src/config/db');
const { nowUtcIso } = require('../src/utils/time');

const BCRYPT_ROUNDS = 12;

async function seedDemoEmployees() {
  if (env.isProduction) {
    console.error('Refusing to run development seed script in production mode.');
    process.exit(1);
  }

  const db = createDatabase(env.dbPath);
  const passwordHash = await bcrypt.hash(env.demoSeedPassword, BCRYPT_ROUNDS);
  const createdAt = nowUtcIso();

  const demoEmployees = [
    {
      employeeCode: 'EMP001',
      fullName: 'Nguyen Minh Anh',
      email: 'minhanh.nguyen@attendsecure.local',
      department: 'Information Security',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
    {
      employeeCode: 'EMP002',
      fullName: 'Tran Quoc Bao',
      email: 'quocbao.tran@attendsecure.local',
      department: 'Software Engineering',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
  ];

  const upsertStmt = db.prepare(`
    INSERT INTO employees (
      employee_code, full_name, email, password_hash, department, role, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_code) DO UPDATE SET
      full_name = excluded.full_name,
      email = excluded.email,
      password_hash = excluded.password_hash,
      department = excluded.department,
      role = excluded.role,
      status = excluded.status
  `);

  for (const emp of demoEmployees) {
    upsertStmt.run(
      emp.employeeCode,
      emp.fullName,
      emp.email,
      passwordHash,
      emp.department,
      emp.role,
      emp.status,
      createdAt
    );
  }

  db.close();
  console.log(`Seeded ${demoEmployees.length} development demo employee(s) into ${env.dbPath}`);
}

seedDemoEmployees().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

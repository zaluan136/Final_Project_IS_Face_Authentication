const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const session = require('express-session');

const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql');

function createDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA busy_timeout = 5000;');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
  const employeeColumns = db.prepare('PRAGMA table_info(employees)').all();
  if (!employeeColumns.some((column) => column.name === 'face_descriptor')) {
    db.exec('ALTER TABLE employees ADD COLUMN face_descriptor TEXT');
  }

  return db;
}

/**
 * Persistent SQLite session store for express-session.
 * Avoids in-memory session storage while keeping zero native add-on dependencies.
 */
class SqliteSessionStore extends session.Store {
  constructor(db, options = {}) {
    super();
    this.db = db;
    this.ttlMs = options.ttlMs || 8 * 60 * 60 * 1000;
    this.cleanupIntervalMs = options.cleanupIntervalMs || 15 * 60 * 1000;

    this.getStmt = this.db.prepare(
      'SELECT sess, expires_at FROM sessions WHERE sid = ?'
    );
    this.setStmt = this.db.prepare(
      `INSERT INTO sessions (sid, sess, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at`
    );
    this.destroyStmt = this.db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = this.db.prepare(
      'UPDATE sessions SET expires_at = ? WHERE sid = ?'
    );
    this.pruneStmt = this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

    this.timer = setInterval(() => {
      try {
        this.pruneStmt.run(Date.now());
      } catch {
        // Ignore periodic cleanup errors if DB is closing
      }
    }, this.cleanupIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  get(sid, callback) {
    try {
      const row = this.getStmt.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.destroyStmt.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sess, callback) {
    try {
      const maxAge = sess?.cookie?.maxAge;
      const expiresAt = Date.now() + (typeof maxAge === 'number' ? maxAge : this.ttlMs);
      this.setStmt.run(sid, JSON.stringify(sess), expiresAt);
      return callback?.(null);
    } catch (err) {
      return callback?.(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.destroyStmt.run(sid);
      return callback?.(null);
    } catch (err) {
      return callback?.(err);
    }
  }

  touch(sid, sess, callback) {
    try {
      const maxAge = sess?.cookie?.maxAge;
      const expiresAt = Date.now() + (typeof maxAge === 'number' ? maxAge : this.ttlMs);
      this.touchStmt.run(expiresAt, sid);
      return callback?.(null);
    } catch (err) {
      return callback?.(err);
    }
  }

  stopCleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = {
  createDatabase,
  SqliteSessionStore,
};

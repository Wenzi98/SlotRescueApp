'use strict';

const session = require('express-session');
const db = require('./database');

class SQLiteSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.defaultTtl = options.ttl || 8 * 60 * 60 * 1000;
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);
    `);
    this.readSession = db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?');
    this.writeSession = db.prepare(`
      INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
    `);
    this.updateExpiry = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.deleteSession = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.deleteExpired = db.prepare('DELETE FROM sessions WHERE expires <= ?');
  }

  getExpiry(sessionData) {
    const cookieExpiry = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + this.defaultTtl;
    return Number.isFinite(cookieExpiry) ? cookieExpiry : Date.now() + this.defaultTtl;
  }

  get(sessionId, callback) {
    try {
      const row = this.readSession.get(sessionId);
      if (!row || row.expires <= Date.now()) {
        if (row) this.deleteSession.run(sessionId);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sessionId, sessionData, callback = () => {}) {
    try {
      const expires = this.getExpiry(sessionData);
      this.deleteExpired.run(Date.now());
      this.writeSession.run(sessionId, JSON.stringify(sessionData), expires);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sessionId, sessionData, callback = () => {}) {
    try {
      this.updateExpiry.run(this.getExpiry(sessionData), sessionId);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sessionId, callback = () => {}) {
    try {
      this.deleteSession.run(sessionId);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  clear(callback = () => {}) {
    try {
      db.prepare('DELETE FROM sessions').run();
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  length(callback) {
    try {
      const result = db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires > ?').get(Date.now());
      return callback(null, result.count);
    } catch (error) {
      return callback(error);
    }
  }
}

module.exports = SQLiteSessionStore;

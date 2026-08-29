'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'docker_monitor',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           'Z',
});

// ── Schema ────────────────────────────────────────────────────────
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id           INT          PRIMARY KEY AUTO_INCREMENT,
    username     VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role         ENUM('admin','guest') NOT NULL DEFAULT 'admin',
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS container_visibility (
    container_id   VARCHAR(255) PRIMARY KEY,
    container_name VARCHAR(255) NOT NULL,
    guest_visible      TINYINT(1) DEFAULT 0,
    guest_logs_visible TINYINT(1) DEFAULT 0,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key_name   VARCHAR(255) PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];

// ── Init & Seed ───────────────────────────────────────────────────
async function init() {
  const conn = await pool.getConnection();
  try {
    for (const sql of SCHEMA) {
      await conn.execute(sql);
    }

    // Seed admin account if not exists
    const [rows] = await conn.execute('SELECT id FROM users WHERE username = ?', ['admin']);
    if (rows.length === 0) {
      const hash = await bcrypt.hash('password', 12);
      await conn.execute(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        ['admin', hash, 'admin']
      );
      console.log('[DB] Seeded admin user (admin/password)');
    }

    // Seed default guest password if not set
    const [gs] = await conn.execute("SELECT value FROM app_settings WHERE key_name = 'guest_password_hash'");
    if (gs.length === 0) {
      const gHash = await bcrypt.hash('guest123', 12);
      await conn.execute(
        "INSERT INTO app_settings (key_name, value) VALUES ('guest_password_hash', ?) ON DUPLICATE KEY UPDATE value = ?",
        [gHash, gHash]
      );
      console.log('[DB] Seeded guest password (guest123) — change in Settings');
    }

    console.log('[DB] Schema ready');
  } finally {
    conn.release();
  }
}

// ── User queries ──────────────────────────────────────────────────
async function getUserByUsername(username) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0] || null;
}

// ── Guest password ────────────────────────────────────────────────
async function getGuestPasswordHash() {
  const [rows] = await pool.execute("SELECT value FROM app_settings WHERE key_name = 'guest_password_hash'");
  return rows[0]?.value || null;
}

async function setGuestPasswordHash(hash) {
  await pool.execute(
    "INSERT INTO app_settings (key_name, value) VALUES ('guest_password_hash', ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP",
    [hash, hash]
  );
}

// ── Visibility queries ────────────────────────────────────────────
async function getVisibilityMap() {
  const [rows] = await pool.execute('SELECT * FROM container_visibility');
  const map = {};
  for (const row of rows) {
    map[row.container_id] = {
      guestVisible:     !!row.guest_visible,
      guestLogsVisible: !!row.guest_logs_visible,
      containerName:    row.container_name,
    };
  }
  return map;
}

async function upsertVisibility(containerId, containerName, guestVisible, guestLogsVisible) {
  await pool.execute(
    `INSERT INTO container_visibility (container_id, container_name, guest_visible, guest_logs_visible)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       container_name     = VALUES(container_name),
       guest_visible      = VALUES(guest_visible),
       guest_logs_visible = VALUES(guest_logs_visible),
       updated_at         = CURRENT_TIMESTAMP`,
    [containerId, containerName, guestVisible ? 1 : 0, guestLogsVisible ? 1 : 0]
  );
}

async function getVisibilityForContainer(containerId) {
  const [rows] = await pool.execute(
    'SELECT * FROM container_visibility WHERE container_id = ?',
    [containerId]
  );
  if (!rows[0]) return { guestVisible: false, guestLogsVisible: false };
  return {
    guestVisible:     !!rows[0].guest_visible,
    guestLogsVisible: !!rows[0].guest_logs_visible,
  };
}

// ── App setting ───────────────────────────────────────────────────
async function getAppSetting(key) {
  const [rows] = await pool.execute('SELECT value FROM app_settings WHERE key_name = ?', [key]);
  return rows[0]?.value ?? null;
}

async function setAppSetting(key, value) {
  await pool.execute(
    'INSERT INTO app_settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP',
    [key, value, value]
  );
}

module.exports = {
  pool,
  init,
  getUserByUsername,
  getGuestPasswordHash,
  setGuestPasswordHash,
  getVisibilityMap,
  upsertVisibility,
  getVisibilityForContainer,
  getAppSetting,
  setAppSetting,
};

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'foodshare',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDB() {
  try {
    // Attempt connection
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected on host:', process.env.DB_HOST || 'localhost');
    connection.release();

    /* ── USERS ── */
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id           VARCHAR(36) PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      email        VARCHAR(255) UNIQUE NOT NULL,
      password     VARCHAR(255) NOT NULL,
      role         ENUM('admin','ngo','food_bank','restaurant','volunteer','recipient') NOT NULL,
      organization VARCHAR(255),
      phone        VARCHAR(50),
      address      TEXT,
      city         VARCHAR(100),
      verified     TINYINT DEFAULT 0,
      active       TINYINT DEFAULT 1,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    /* ── FOOD DONATIONS ── */
    await pool.query(`CREATE TABLE IF NOT EXISTS food_donations (
      id             VARCHAR(36) PRIMARY KEY,
      donor_id       VARCHAR(36) NOT NULL,
      food_name      VARCHAR(255) NOT NULL,
      category       VARCHAR(100) NOT NULL DEFAULT 'other',
      quantity       FLOAT NOT NULL,
      unit           VARCHAR(50) NOT NULL,
      expiry_date    VARCHAR(100),
      description    TEXT,
      pickup_address TEXT,
      status         ENUM('available','scheduled','collected','distributed','expired') DEFAULT 'available',
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(donor_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    /* ── BENEFICIARIES ── */
    await pool.query(`CREATE TABLE IF NOT EXISTS beneficiaries (
      id            VARCHAR(36) PRIMARY KEY,
      name          VARCHAR(255) NOT NULL,
      contact       VARCHAR(100),
      address       TEXT NOT NULL,
      city          VARCHAR(100),
      family_size   INT DEFAULT 1,
      needs         TEXT,
      registered_by VARCHAR(36),
      active        TINYINT DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(registered_by) REFERENCES users(id) ON DELETE SET NULL
    )`);

    /* ── DISTRIBUTION EVENTS ── */
    await pool.query(`CREATE TABLE IF NOT EXISTS distribution_events (
      id                VARCHAR(36) PRIMARY KEY,
      title             VARCHAR(255) NOT NULL,
      donation_id       VARCHAR(36),
      organizer_id      VARCHAR(36) NOT NULL,
      volunteer_id      VARCHAR(36),
      beneficiary_id    VARCHAR(36),
      scheduled_date    VARCHAR(50) NOT NULL,
      scheduled_time    VARCHAR(50),
      pickup_location   TEXT,
      delivery_location TEXT,
      status            ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending',
      notes             TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(donation_id)    REFERENCES food_donations(id) ON DELETE SET NULL,
      FOREIGN KEY(organizer_id)   REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(volunteer_id)   REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(beneficiary_id) REFERENCES beneficiaries(id) ON DELETE SET NULL
    )`);

    /* ── ACTIVITY LOG ── */
    await pool.query(`CREATE TABLE IF NOT EXISTS activity_log (
      id         VARCHAR(36) PRIMARY KEY,
      user_id    VARCHAR(36),
      action     VARCHAR(255) NOT NULL,
      details    TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    /* ── SEED: Admin ── */
    await pool.query(
      `INSERT IGNORE INTO users (id,name,email,password,role,verified,active)
       VALUES (?,?,?,?,?,1,1)`,
      ['admin-001', 'System Admin', 'admin@foodshare.org',
       bcrypt.hashSync('Admin@123', 10), 'admin']
    );

    /* ── SEED: Demo Restaurant ── */
    await pool.query(
      `INSERT IGNORE INTO users (id,name,email,password,role,organization,city,verified,active)
       VALUES (?,?,?,?,?,?,?,1,1)`,
      ['demo-restaurant-001', 'Green Kitchen', 'demo@restaurant.com',
       bcrypt.hashSync('Demo@123', 10), 'restaurant', 'Green Kitchen Restaurant', 'Chennai']
    );

    /* ── SEED: Demo NGO ── */
    await pool.query(
      `INSERT IGNORE INTO users (id,name,email,password,role,organization,city,verified,active)
       VALUES (?,?,?,?,?,?,?,1,1)`,
      ['demo-ngo-001', 'Hope Foundation', 'demo@ngo.com',
       bcrypt.hashSync('Demo@123', 10), 'ngo', 'Hope Foundation NGO', 'Chennai']
    );

    /* ── SEED: Demo Recipient ── */
    await pool.query(
      `INSERT IGNORE INTO users (id,name,email,password,role,city,verified,active)
       VALUES (?,?,?,?,?,?,1,1)`,
      ['demo-recipient-001', 'Ravi Kumar', 'recipient@demo.com',
       bcrypt.hashSync('Demo@123', 10), 'recipient', 'Chennai']
    );

    console.log('✅ Database ready');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}

// Automatically create tables on start
initDB();

module.exports = pool;

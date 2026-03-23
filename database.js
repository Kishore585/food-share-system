const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'foodshare.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB connection error:', err);
  else console.log('✅ Connected to SQLite database');
});

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','ngo','food_bank','restaurant','volunteer')),
    organization TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    verified INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS food_donations (
    id TEXT PRIMARY KEY,
    donor_id TEXT NOT NULL,
    food_name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    expiry_date TEXT,
    description TEXT,
    pickup_address TEXT,
    status TEXT DEFAULT 'available' CHECK(status IN ('available','scheduled','collected','distributed','expired')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(donor_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS beneficiaries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    address TEXT NOT NULL,
    city TEXT,
    family_size INTEGER DEFAULT 1,
    needs TEXT,
    registered_by TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(registered_by) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS distribution_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    donation_id TEXT,
    organizer_id TEXT NOT NULL,
    volunteer_id TEXT,
    beneficiary_id TEXT,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT,
    pickup_location TEXT,
    delivery_location TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(donation_id) REFERENCES food_donations(id),
    FOREIGN KEY(organizer_id) REFERENCES users(id),
    FOREIGN KEY(volunteer_id) REFERENCES users(id),
    FOREIGN KEY(beneficiary_id) REFERENCES beneficiaries(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed admin user
  const adminId = 'admin-001';
  const adminPass = bcrypt.hashSync('Admin@123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, name, email, password, role, verified, active)
    VALUES (?, 'System Admin', 'admin@foodshare.org', ?, 'admin', 1, 1)`,
    [adminId, adminPass]);

  console.log('✅ Database tables initialized');
  console.log('🔑 Admin login: admin@foodshare.org / Admin@123');
});

module.exports = db;

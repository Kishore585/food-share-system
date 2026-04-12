const mysql  = require('mysql2');
const bcrypt = require('bcryptjs');

/* ── Connection Pool ── */
let pool;

if (process.env.MYSQL_URL) {
  /* Railway provides a full connection URL */
  pool = mysql.createPool({
    uri:                process.env.MYSQL_URL,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    multipleStatements: true
  });
} else {
  /* Local / manual config */
  pool = mysql.createPool({
    host:              process.env.MYSQLHOST   || process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQLPORT   || process.env.DB_PORT)    || 3306,
    user:              process.env.MYSQLUSER   || process.env.DB_USER     || 'root',
    password:          process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database:          process.env.MYSQLDATABASE || process.env.DB_NAME   || 'foodshare',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    multipleStatements: true
  });
}

const db = pool.promise();

/* ── Helper: run SQL ignoring "already exists" errors ── */
const safeExec = async (sql) => {
  try { await db.execute(sql); }
  catch (e) { if (!e.message.includes('already exists')) throw e; }
};

/* ── Initialise schema + seed data ── */
async function initDB() {
  try {
    /* ── USERS ── */
    await safeExec(`CREATE TABLE IF NOT EXISTS users (
      id           VARCHAR(36)  PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      email        VARCHAR(255) NOT NULL UNIQUE,
      password     VARCHAR(255) NOT NULL,
      role         ENUM('admin','ngo','food_bank','restaurant','volunteer','recipient') NOT NULL,
      organization VARCHAR(255),
      phone        VARCHAR(50),
      address      TEXT,
      city         VARCHAR(100),
      verified     TINYINT(1)   DEFAULT 0,
      active       TINYINT(1)   DEFAULT 1,
      created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    /* ── FOOD DONATIONS ── */
    await safeExec(`CREATE TABLE IF NOT EXISTS food_donations (
      id             VARCHAR(36)  PRIMARY KEY,
      donor_id       VARCHAR(36)  NOT NULL,
      food_name      VARCHAR(255) NOT NULL,
      category       VARCHAR(100) NOT NULL DEFAULT 'other',
      quantity       DECIMAL(10,2) NOT NULL,
      unit           VARCHAR(50)  NOT NULL,
      expiry_date    VARCHAR(50),
      description    TEXT,
      pickup_address TEXT,
      status         ENUM('available','scheduled','collected','distributed','expired')
                     DEFAULT 'available',
      created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (donor_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    /* ── BENEFICIARIES ── */
    await safeExec(`CREATE TABLE IF NOT EXISTS beneficiaries (
      id            VARCHAR(36)  PRIMARY KEY,
      name          VARCHAR(255) NOT NULL,
      contact       VARCHAR(100),
      address       TEXT         NOT NULL,
      city          VARCHAR(100),
      family_size   INT          DEFAULT 1,
      needs         TEXT,
      registered_by VARCHAR(36),
      active        TINYINT(1)   DEFAULT 1,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (registered_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    /* ── DISTRIBUTION EVENTS ── */
    await safeExec(`CREATE TABLE IF NOT EXISTS distribution_events (
      id                VARCHAR(36)  PRIMARY KEY,
      title             VARCHAR(255) NOT NULL,
      donation_id       VARCHAR(36),
      organizer_id      VARCHAR(36)  NOT NULL,
      volunteer_id      VARCHAR(36),
      beneficiary_id    VARCHAR(36),
      scheduled_date    VARCHAR(50)  NOT NULL,
      scheduled_time    VARCHAR(50),
      pickup_location   TEXT,
      delivery_location TEXT,
      status            ENUM('pending','in_progress','completed','cancelled')
                        DEFAULT 'pending',
      notes             TEXT,
      created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (donation_id)    REFERENCES food_donations(id),
      FOREIGN KEY (organizer_id)   REFERENCES users(id),
      FOREIGN KEY (volunteer_id)   REFERENCES users(id),
      FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    /* ── ACTIVITY LOG ── */
    await safeExec(`CREATE TABLE IF NOT EXISTS activity_log (
      id         VARCHAR(36) PRIMARY KEY,
      user_id    VARCHAR(36),
      action     VARCHAR(100) NOT NULL,
      details    TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    /* ── SEED: Admin ── */
    await db.execute(
      `INSERT IGNORE INTO users (id,name,email,password,role,verified,active)
       VALUES (?,?,?,?,?,1,1)`,
      ['admin-001', 'System Admin', 'admin@foodshare.org',
       bcrypt.hashSync('Admin@123', 10), 'admin']
    );
    console.log('✅ Admin seeded  →  admin@foodshare.org / Admin@123');

    /* ── SEED: Demo Restaurant ── */
    await db.execute(
      `INSERT IGNORE INTO users (id,name,email,password,role,organization,city,verified,active)
       VALUES (?,?,?,?,?,?,?,1,1)`,
      ['demo-restaurant-001', 'Green Kitchen', 'demo@restaurant.com',
       bcrypt.hashSync('Demo@123', 10), 'restaurant', 'Green Kitchen Restaurant', 'Chennai']
    );

    /* ── SEED: Demo NGO ── */
    await db.execute(
      `INSERT IGNORE INTO users (id,name,email,password,role,organization,city,verified,active)
       VALUES (?,?,?,?,?,?,?,1,1)`,
      ['demo-ngo-001', 'Hope Foundation', 'demo@ngo.com',
       bcrypt.hashSync('Demo@123', 10), 'ngo', 'Hope Foundation NGO', 'Chennai']
    );

    /* ── SEED: Demo Recipient ── */
    await db.execute(
      `INSERT IGNORE INTO users (id,name,email,password,role,city,verified,active)
       VALUES (?,?,?,?,?,?,1,1)`,
      ['demo-recipient-001', 'Ravi Kumar', 'recipient@demo.com',
       bcrypt.hashSync('Demo@123', 10), 'recipient', 'Chennai']
    );
    console.log('✅ Recipient seeded  →  recipient@demo.com / Demo@123');

    console.log('✅ MySQL database ready');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
    process.exit(1);
  }
}

module.exports = { db, initDB };

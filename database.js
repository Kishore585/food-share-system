const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Create a connection pool to PostgreSQL using the DATABASE_URL
// If not provided, it falls back to a local database (if running)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/foodshare',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // Required for some cloud providers like Railway
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to query the database
const query = (text, params) => pool.query(text, params);

const initializeDB = async () => {
  try {
    console.log('🔄 Initializing PostgreSQL database tables...');

    await query(`
      CREATE TABLE IF NOT EXISTS users (
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS food_donations (
        id TEXT PRIMARY KEY,
        donor_id TEXT NOT NULL REFERENCES users(id),
        food_name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        expiry_date TEXT,
        description TEXT,
        pickup_address TEXT,
        status TEXT DEFAULT 'available' CHECK(status IN ('available','scheduled','collected','distributed','expired')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS beneficiaries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT,
        address TEXT NOT NULL,
        city TEXT,
        family_size INTEGER DEFAULT 1,
        needs TEXT,
        registered_by TEXT REFERENCES users(id),
        active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS distribution_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        donation_id TEXT REFERENCES food_donations(id),
        organizer_id TEXT NOT NULL REFERENCES users(id),
        volunteer_id TEXT REFERENCES users(id),
        beneficiary_id TEXT REFERENCES beneficiaries(id),
        scheduled_date TEXT NOT NULL,
        scheduled_time TEXT,
        pickup_location TEXT,
        delivery_location TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed admin user
    const adminId = 'admin-001';
    const adminPass = bcrypt.hashSync('Admin@123', 10);
    
    // Check if admin exists first
    const res = await query('SELECT email FROM users WHERE email = $1', ['admin@foodshare.org']);
    if (res.rows.length === 0) {
      await query(`
        INSERT INTO users (id, name, email, password, role, verified, active)
        VALUES ($1, 'System Admin', 'admin@foodshare.org', $2, 'admin', 1, 1)
      `, [adminId, adminPass]);
    }

    console.log('✅ Database tables initialized (PostgreSQL)');
    console.log('🔑 Admin login: admin@foodshare.org / Admin@123');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
};

// Start initialization
initializeDB();

module.exports = {
  query,
  pool
};

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./database');
const { auth, adminOnly } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'foodshare_secret_2024';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── AUTH ROUTES ──────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, organization, phone, address, city } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'Missing required fields' });
    const validRoles = ['ngo','food_bank','restaurant','volunteer'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    
    // Check if email already exists
    const existing = await db.query('SELECT email FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

    await db.query(`INSERT INTO users (id,name,email,password,role,organization,phone,address,city) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, name, email, hash, role, organization||null, phone||null, address||null, city||null]
    );
    
    await db.query(`INSERT INTO activity_log (id,user_id,action,details) VALUES ($1,$2,$3,$4)`,
      [uuidv4(), id, 'REGISTER', `New ${role} registered`]
    );
    
    res.json({ message: 'Registration successful! Please wait for admin verification.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query(`SELECT * FROM users WHERE email=$1 AND active=1`, [email]);
    const user = result.rows[0];
    
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.verified && user.role !== 'admin')
      return res.status(403).json({ error: 'Account pending verification by admin' });
      
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    await db.query(`INSERT INTO activity_log (id,user_id,action) VALUES ($1,$2,$3)`, [uuidv4(), user.id, 'LOGIN']);
    
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await db.query(`SELECT id,name,email,role,organization,phone,address,city,verified,created_at FROM users WHERE id=$1`, [req.user.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DONATIONS ────────────────────────────────────────────
app.get('/api/donations', auth, async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'admin') {
      query = `SELECT d.*, u.name as donor_name, u.organization FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id ORDER BY d.created_at DESC`;
      params = [];
    } else if (['volunteer', 'ngo', 'food_bank'].includes(req.user.role)) {
      query = `SELECT d.*, u.name as donor_name, u.organization FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id WHERE d.status='available' ORDER BY d.created_at DESC`;
      params = [];
    } else {
      query = `SELECT d.*, u.name as donor_name FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id WHERE d.donor_id=$1 ORDER BY d.created_at DESC`;
      params = [req.user.id];
    }
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/donations', auth, async (req, res) => {
  try {
    const { food_name, category, quantity, unit, expiry_date, description, pickup_address } = req.body;
    if (!food_name || !quantity || !unit) return res.status(400).json({ error: 'Missing required fields' });
    
    const id = uuidv4();
    await db.query(`INSERT INTO food_donations (id,donor_id,food_name,category,quantity,unit,expiry_date,description,pickup_address)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, req.user.id, food_name, category||'other', quantity, unit, expiry_date||null, description||null, pickup_address||null]
    );
    
    await db.query(`INSERT INTO activity_log (id,user_id,action,details) VALUES ($1,$2,$3,$4)`,
      [uuidv4(), req.user.id, 'DONATION_ADDED', `${food_name} (${quantity} ${unit})`]
    );
    
    res.json({ message: 'Donation logged successfully', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/donations/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.query(`UPDATE food_donations SET status=$1 WHERE id=$2`, [status, req.params.id]);
    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BENEFICIARIES ────────────────────────────────────────
app.get('/api/beneficiaries', auth, async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM beneficiaries WHERE active=1 ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/beneficiaries', auth, async (req, res) => {
  try {
    const { name, contact, address, city, family_size, needs } = req.body;
    if (!name || !address) return res.status(400).json({ error: 'Name and address required' });
    
    const id = uuidv4();
    await db.query(`INSERT INTO beneficiaries (id,name,contact,address,city,family_size,needs,registered_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, name, contact||null, address, city||null, family_size||1, needs||null, req.user.id]
    );
    
    res.json({ message: 'Beneficiary registered', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DISTRIBUTION EVENTS ──────────────────────────────────
app.get('/api/events', auth, async (req, res) => {
  try {
    const result = await db.query(`SELECT e.*, u1.name as organizer_name, u2.name as volunteer_name, b.name as beneficiary_name,
      fd.food_name FROM distribution_events e
      LEFT JOIN users u1 ON e.organizer_id=u1.id
      LEFT JOIN users u2 ON e.volunteer_id=u2.id
      LEFT JOIN beneficiaries b ON e.beneficiary_id=b.id
      LEFT JOIN food_donations fd ON e.donation_id=fd.id
      ORDER BY e.scheduled_date DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', auth, async (req, res) => {
  try {
    const { title, donation_id, volunteer_id, beneficiary_id, scheduled_date, scheduled_time, pickup_location, delivery_location, notes } = req.body;
    if (!title || !scheduled_date) return res.status(400).json({ error: 'Title and date required' });
    
    const id = uuidv4();
    await db.query(`INSERT INTO distribution_events (id,title,donation_id,organizer_id,volunteer_id,beneficiary_id,scheduled_date,scheduled_time,pickup_location,delivery_location,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, title, donation_id||null, req.user.id, volunteer_id||null, beneficiary_id||null, scheduled_date, scheduled_time||null, pickup_location||null, delivery_location||null, notes||null]
    );
    
    if (donation_id) {
      await db.query(`UPDATE food_donations SET status='scheduled' WHERE id=$1`, [donation_id]);
    }
    
    await db.query(`INSERT INTO activity_log (id,user_id,action,details) VALUES ($1,$2,$3,$4)`,
      [uuidv4(), req.user.id, 'EVENT_CREATED', title]
    );
    
    res.json({ message: 'Event scheduled', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/events/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.query(`UPDATE distribution_events SET status=$1 WHERE id=$2`, [status, req.params.id]);
    
    if (status === 'completed') {
      const result = await db.query(`SELECT donation_id FROM distribution_events WHERE id=$1`, [req.params.id]);
      if (result.rows.length > 0 && result.rows[0].donation_id) {
        await db.query(`UPDATE food_donations SET status='distributed' WHERE id=$1`, [result.rows[0].donation_id]);
      }
    }
    
    res.json({ message: 'Event status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const result = await db.query(`SELECT id,name,email,role,organization,phone,city,verified,active,created_at FROM users ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/verify', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`UPDATE users SET verified=1 WHERE id=$1`, [req.params.id]);
    res.json({ message: 'User verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`UPDATE users SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=$1`, [req.params.id]);
    res.json({ message: 'User status toggled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    const stats = {};
    const r1 = await db.query(`SELECT COUNT(*) as total FROM users WHERE role!='admin'`);
    stats.total_users = parseInt(r1.rows[0].total) || 0;
    
    const r2 = await db.query(`SELECT COUNT(*) as total FROM users WHERE verified=0 AND role!='admin'`);
    stats.pending_users = parseInt(r2.rows[0].total) || 0;
    
    const r3 = await db.query(`SELECT COUNT(*) as total FROM food_donations`);
    stats.total_donations = parseInt(r3.rows[0].total) || 0;
    
    const r4 = await db.query(`SELECT COUNT(*) as total FROM beneficiaries`);
    stats.total_beneficiaries = parseInt(r4.rows[0].total) || 0;
    
    const r5 = await db.query(`SELECT COUNT(*) as total FROM distribution_events WHERE status='completed'`);
    stats.completed_events = parseInt(r5.rows[0].total) || 0;
    
    const r6 = await db.query(`SELECT COUNT(*) as total FROM distribution_events WHERE status='pending'`);
    stats.pending_events = parseInt(r6.rows[0].total) || 0;
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/activity', auth, adminOnly, async (req, res) => {
  try {
    const result = await db.query(`SELECT l.*, u.name as user_name FROM activity_log l LEFT JOIN users u ON l.user_id=u.id ORDER BY l.created_at DESC LIMIT 50`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD STATS (for all users) ─────────────────────
app.get('/api/stats', auth, async (req, res) => {
  try {
    const r1 = await db.query(`SELECT COUNT(*) as c FROM food_donations WHERE status='available'`);
    const r2 = await db.query(`SELECT COUNT(*) as c FROM distribution_events WHERE status='pending'`);
    const r3 = await db.query(`SELECT COUNT(*) as c FROM beneficiaries WHERE active=1`);
    const r4 = await db.query(`SELECT COUNT(*) as c FROM distribution_events WHERE status='completed'`);
    
    res.json({
      available_donations: parseInt(r1.rows[0].c) || 0,
      pending_deliveries: parseInt(r2.rows[0].c) || 0,
      beneficiaries: parseInt(r3.rows[0].c) || 0,
      completed_deliveries: parseInt(r4.rows[0].c) || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 FoodShare server running on http://localhost:${PORT}`);
  console.log(`📊 Admin: admin@foodshare.org / Admin@123\n`);
});

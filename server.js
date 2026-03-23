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
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role, organization, phone, address, city } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Missing required fields' });
  const validRoles = ['ngo','food_bank','restaurant','volunteer'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.run(`INSERT INTO users (id,name,email,password,role,organization,phone,address,city) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, name, email, hash, role, organization||null, phone||null, address||null, city||null],
    function(err) {
      if (err) return res.status(400).json({ error: 'Email already registered' });
      db.run(`INSERT INTO activity_log (id,user_id,action,details) VALUES (?,?,?,?)`,
        [uuidv4(), id, 'REGISTER', `New ${role} registered`]);
      res.json({ message: 'Registration successful! Please wait for admin verification.' });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email=? AND active=1`, [email], (err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.verified && user.role !== 'admin')
      return res.status(403).json({ error: 'Account pending verification by admin' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    db.run(`INSERT INTO activity_log (id,user_id,action) VALUES (?,?,?)`, [uuidv4(), user.id, 'LOGIN']);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization } });
  });
});

app.get('/api/auth/me', auth, (req, res) => {
  db.get(`SELECT id,name,email,role,organization,phone,address,city,verified,created_at FROM users WHERE id=?`, [req.user.id], (err, user) => {
    res.json(user);
  });
});

// ─── DONATIONS ────────────────────────────────────────────
app.get('/api/donations', auth, (req, res) => {
  const query = req.user.role === 'admin'
    ? `SELECT d.*, u.name as donor_name, u.organization FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id ORDER BY d.created_at DESC`
    : req.user.role === 'volunteer' || req.user.role === 'ngo' || req.user.role === 'food_bank'
    ? `SELECT d.*, u.name as donor_name, u.organization FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id WHERE d.status='available' ORDER BY d.created_at DESC`
    : `SELECT d.*, u.name as donor_name FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id WHERE d.donor_id=? ORDER BY d.created_at DESC`;

  const params = (req.user.role === 'restaurant') ? [req.user.id] : [];
  db.all(query, params, (err, rows) => res.json(rows || []));
});

app.post('/api/donations', auth, (req, res) => {
  const { food_name, category, quantity, unit, expiry_date, description, pickup_address } = req.body;
  if (!food_name || !quantity || !unit) return res.status(400).json({ error: 'Missing required fields' });
  const id = uuidv4();
  db.run(`INSERT INTO food_donations (id,donor_id,food_name,category,quantity,unit,expiry_date,description,pickup_address)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, req.user.id, food_name, category||'other', quantity, unit, expiry_date||null, description||null, pickup_address||null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run(`INSERT INTO activity_log (id,user_id,action,details) VALUES (?,?,?,?)`,
        [uuidv4(), req.user.id, 'DONATION_ADDED', `${food_name} (${quantity} ${unit})`]);
      res.json({ message: 'Donation logged successfully', id });
    }
  );
});

app.patch('/api/donations/:id/status', auth, (req, res) => {
  const { status } = req.body;
  db.run(`UPDATE food_donations SET status=? WHERE id=?`, [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Status updated' });
  });
});

// ─── BENEFICIARIES ────────────────────────────────────────
app.get('/api/beneficiaries', auth, (req, res) => {
  db.all(`SELECT * FROM beneficiaries WHERE active=1 ORDER BY created_at DESC`, [], (err, rows) => res.json(rows || []));
});

app.post('/api/beneficiaries', auth, (req, res) => {
  const { name, contact, address, city, family_size, needs } = req.body;
  if (!name || !address) return res.status(400).json({ error: 'Name and address required' });
  const id = uuidv4();
  db.run(`INSERT INTO beneficiaries (id,name,contact,address,city,family_size,needs,registered_by) VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, contact||null, address, city||null, family_size||1, needs||null, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Beneficiary registered', id });
    }
  );
});

// ─── DISTRIBUTION EVENTS ──────────────────────────────────
app.get('/api/events', auth, (req, res) => {
  db.all(`SELECT e.*, u1.name as organizer_name, u2.name as volunteer_name, b.name as beneficiary_name,
    fd.food_name FROM distribution_events e
    LEFT JOIN users u1 ON e.organizer_id=u1.id
    LEFT JOIN users u2 ON e.volunteer_id=u2.id
    LEFT JOIN beneficiaries b ON e.beneficiary_id=b.id
    LEFT JOIN food_donations fd ON e.donation_id=fd.id
    ORDER BY e.scheduled_date DESC`, [], (err, rows) => res.json(rows || []));
});

app.post('/api/events', auth, (req, res) => {
  const { title, donation_id, volunteer_id, beneficiary_id, scheduled_date, scheduled_time, pickup_location, delivery_location, notes } = req.body;
  if (!title || !scheduled_date) return res.status(400).json({ error: 'Title and date required' });
  const id = uuidv4();
  db.run(`INSERT INTO distribution_events (id,title,donation_id,organizer_id,volunteer_id,beneficiary_id,scheduled_date,scheduled_time,pickup_location,delivery_location,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, title, donation_id||null, req.user.id, volunteer_id||null, beneficiary_id||null, scheduled_date, scheduled_time||null, pickup_location||null, delivery_location||null, notes||null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (donation_id) db.run(`UPDATE food_donations SET status='scheduled' WHERE id=?`, [donation_id]);
      db.run(`INSERT INTO activity_log (id,user_id,action,details) VALUES (?,?,?,?)`,
        [uuidv4(), req.user.id, 'EVENT_CREATED', title]);
      res.json({ message: 'Event scheduled', id });
    }
  );
});

app.patch('/api/events/:id/status', auth, (req, res) => {
  const { status } = req.body;
  db.run(`UPDATE distribution_events SET status=? WHERE id=?`, [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (status === 'completed') {
      db.get(`SELECT donation_id FROM distribution_events WHERE id=?`, [req.params.id], (e, row) => {
        if (row?.donation_id) db.run(`UPDATE food_donations SET status='distributed' WHERE id=?`, [row.donation_id]);
      });
    }
    res.json({ message: 'Event status updated' });
  });
});

// ─── ADMIN ROUTES ─────────────────────────────────────────
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  db.all(`SELECT id,name,email,role,organization,phone,city,verified,active,created_at FROM users ORDER BY created_at DESC`, [], (err, rows) => res.json(rows || []));
});

app.patch('/api/admin/users/:id/verify', auth, adminOnly, (req, res) => {
  db.run(`UPDATE users SET verified=1 WHERE id=?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User verified' });
  });
});

app.patch('/api/admin/users/:id/toggle', auth, adminOnly, (req, res) => {
  db.run(`UPDATE users SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User status toggled' });
  });
});

app.get('/api/admin/stats', auth, adminOnly, (req, res) => {
  const stats = {};
  db.get(`SELECT COUNT(*) as total FROM users WHERE role!='admin'`, [], (e, r) => { stats.total_users = r?.total || 0; });
  db.get(`SELECT COUNT(*) as total FROM users WHERE verified=0 AND role!='admin'`, [], (e, r) => { stats.pending_users = r?.total || 0; });
  db.get(`SELECT COUNT(*) as total FROM food_donations`, [], (e, r) => { stats.total_donations = r?.total || 0; });
  db.get(`SELECT COUNT(*) as total FROM beneficiaries`, [], (e, r) => { stats.total_beneficiaries = r?.total || 0; });
  db.get(`SELECT COUNT(*) as total FROM distribution_events WHERE status='completed'`, [], (e, r) => { stats.completed_events = r?.total || 0; });
  db.get(`SELECT COUNT(*) as total FROM distribution_events WHERE status='pending'`, [], (e, r) => {
    stats.pending_events = r?.total || 0;
    setTimeout(() => res.json(stats), 200);
  });
});

app.get('/api/admin/activity', auth, adminOnly, (req, res) => {
  db.all(`SELECT l.*, u.name as user_name FROM activity_log l LEFT JOIN users u ON l.user_id=u.id ORDER BY l.created_at DESC LIMIT 50`, [], (err, rows) => res.json(rows || []));
});

// ─── DASHBOARD STATS (for all users) ─────────────────────
app.get('/api/stats', auth, (req, res) => {
  db.get(`SELECT COUNT(*) as c FROM food_donations WHERE status='available'`, [], (e, r1) => {
    db.get(`SELECT COUNT(*) as c FROM distribution_events WHERE status='pending'`, [], (e2, r2) => {
      db.get(`SELECT COUNT(*) as c FROM beneficiaries WHERE active=1`, [], (e3, r3) => {
        db.get(`SELECT COUNT(*) as c FROM distribution_events WHERE status='completed'`, [], (e4, r4) => {
          res.json({ available_donations: r1?.c||0, pending_deliveries: r2?.c||0, beneficiaries: r3?.c||0, completed_deliveries: r4?.c||0 });
        });
      });
    });
  });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 FoodShare server running on http://localhost:${PORT}`);
  console.log(`📊 Admin: admin@foodshare.org / Admin@123\n`);
});

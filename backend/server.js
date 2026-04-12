require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');

const { db, initDB } = require('./database');
const { auth, adminOnly, notRecipient, JWT_SECRET } = require('./middleware');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend/public')));

/* ── Promisified DB helpers (MySQL via mysql2/promise) ── */
const dbRun = async (sql, p=[]) => {
  const [result] = await db.execute(sql, p);
  return result;
};
const dbGet = async (sql, p=[]) => {
  const [rows] = await db.execute(sql, p);
  return rows[0] || null;
};
const dbAll = async (sql, p=[]) => {
  const [rows] = await db.execute(sql, p);
  return rows || [];
};
const log = (uid, action, details=null) =>
  dbRun(`INSERT INTO activity_log(id,user_id,action,details) VALUES(?,?,?,?)`,
        [uuidv4(), uid, action, details]).catch(()=>{});

/* ══════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════ */

/* POST /api/auth/register  – all roles including recipient */
app.post('/api/auth/register', async (req,res) => {
  try {
    const { name, email, password, role, organization, phone, address, city } = req.body;
    if (!name||!email||!password||!role)
      return res.status(400).json({ error: 'Name, email, password and role are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const valid = ['ngo','food_bank','restaurant','volunteer','recipient'];
    if (!valid.includes(role))
      return res.status(400).json({ error: 'Invalid role' });

    const id   = uuidv4();
    const hash = bcrypt.hashSync(password, 10);

    /* Recipients are auto-verified; others need admin approval */
    const autoVerify = role === 'recipient' ? 1 : 0;

    await dbRun(
      `INSERT INTO users(id,name,email,password,role,organization,phone,address,city,verified)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [id, name.trim(), email.toLowerCase().trim(), hash, role,
       organization||null, phone||null, address||null, city||null, autoVerify]
    );
    await log(id, 'REGISTER', `New ${role}: ${name}`);

    const msg = autoVerify
      ? 'Registration successful! You can now log in.'
      : 'Registration successful! Your account is pending admin verification.';
    res.json({ success: true, message: msg });
  } catch(e) {
    if (e.message?.includes('Duplicate'))
      return res.status(400).json({ error: 'This email is already registered' });
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/* POST /api/auth/login */
app.post('/api/auth/login', async (req,res) => {
  try {
    const { email, password } = req.body;
    if (!email||!password)
      return res.status(400).json({ error: 'Email and password are required' });

    const user = await dbGet(`SELECT * FROM users WHERE email=? AND active=1`,
                             [email.toLowerCase().trim()]);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.verified && user.role !== 'admin')
      return res.status(403).json({ error: 'Your account is pending admin verification.' });

    const token = jwt.sign(
      { id:user.id, email:user.email, role:user.role, name:user.name },
      JWT_SECRET, { expiresIn:'7d' }
    );
    await log(user.id, 'LOGIN');
    res.json({
      token,
      user: { id:user.id, name:user.name, email:user.email,
              role:user.role, organization:user.organization, city:user.city }
    });
  } catch(e) { res.status(500).json({ error: 'Login failed.' }); }
});

/* GET /api/auth/me */
app.get('/api/auth/me', auth, async (req,res) => {
  try {
    const u = await dbGet(
      `SELECT id,name,email,role,organization,phone,address,city,verified,created_at
       FROM users WHERE id=?`, [req.user.id]);
    res.json(u);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════
   PUBLIC STATS (landing page)
══════════════════════════════════════════════ */
app.get('/api/stats', async (req,res) => {
  try {
    const [a,b,c,d] = await Promise.all([
      dbGet(`SELECT COUNT(*) AS c FROM food_donations WHERE status='available'`),
      dbGet(`SELECT COUNT(*) AS c FROM distribution_events WHERE status='pending'`),
      dbGet(`SELECT COUNT(*) AS c FROM beneficiaries WHERE active=1`),
      dbGet(`SELECT COUNT(*) AS c FROM distribution_events WHERE status='completed'`)
    ]);
    res.json({ available_donations:a?.c||0, pending_deliveries:b?.c||0,
               beneficiaries:c?.c||0, completed_deliveries:d?.c||0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════
   DONATIONS
══════════════════════════════════════════════ */

/* GET – all roles can read; recipients see only available */
app.get('/api/donations', auth, async (req,res) => {
  try {
    let rows;
    if (req.user.role === 'recipient') {
      /* Recipients see available donations with donor info */
      rows = await dbAll(
        `SELECT d.id, d.food_name, d.category, d.quantity, d.unit,
                d.expiry_date, d.description, d.pickup_address, d.status, d.created_at,
                u.name as donor_name, u.organization
         FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id
         WHERE d.status='available'
         ORDER BY d.created_at DESC`
      );
    } else if (req.user.role === 'restaurant') {
      rows = await dbAll(
        `SELECT d.*, u.name as donor_name, u.organization
         FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id
         WHERE d.donor_id=? ORDER BY d.created_at DESC`, [req.user.id]
      );
    } else {
      rows = await dbAll(
        `SELECT d.*, u.name as donor_name, u.organization
         FROM food_donations d LEFT JOIN users u ON d.donor_id=u.id
         ORDER BY d.created_at DESC`
      );
    }
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* POST – only donors / admin */
app.post('/api/donations', auth, notRecipient, async (req,res) => {
  try {
    const { food_name, category, quantity, unit, expiry_date, description, pickup_address } = req.body;
    if (!food_name||!quantity||!unit)
      return res.status(400).json({ error: 'Food name, quantity and unit are required' });
    const id = uuidv4();
    await dbRun(
      `INSERT INTO food_donations(id,donor_id,food_name,category,quantity,unit,expiry_date,description,pickup_address)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, food_name.trim(), category||'other', parseFloat(quantity),
       unit, expiry_date||null, description||null, pickup_address||null]
    );
    await log(req.user.id, 'DONATION_ADDED', `${food_name} – ${quantity} ${unit}`);
    res.json({ success:true, message:'Donation logged!', id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/donations/:id/status', auth, notRecipient, async (req,res) => {
  try {
    const { status } = req.body;
    const ok = ['available','scheduled','collected','distributed','expired'];
    if (!ok.includes(status)) return res.status(400).json({ error:'Invalid status' });
    await dbRun(`UPDATE food_donations SET status=? WHERE id=?`, [status, req.params.id]);
    await log(req.user.id, 'DONATION_STATUS', `${req.params.id} → ${status}`);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/donations/:id', auth, notRecipient, async (req,res) => {
  try {
    await dbRun(`DELETE FROM food_donations WHERE id=? AND (donor_id=? OR ?='admin')`,
      [req.params.id, req.user.id, req.user.role]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════
   BENEFICIARIES
══════════════════════════════════════════════ */
app.get('/api/beneficiaries', auth, async (req,res) => {
  try {
    /* Recipients cannot see beneficiary PII */
    if (req.user.role === 'recipient')
      return res.status(403).json({ error: 'Access denied' });
    const rows = await dbAll(
      `SELECT b.*, u.name as registered_by_name
       FROM beneficiaries b LEFT JOIN users u ON b.registered_by=u.id
       WHERE b.active=1 ORDER BY b.created_at DESC`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/beneficiaries', auth, notRecipient, async (req,res) => {
  try {
    const { name, contact, address, city, family_size, needs } = req.body;
    if (!name||!address) return res.status(400).json({ error:'Name and address required' });
    const id = uuidv4();
    await dbRun(
      `INSERT INTO beneficiaries(id,name,contact,address,city,family_size,needs,registered_by)
       VALUES(?,?,?,?,?,?,?,?)`,
      [id, name.trim(), contact||null, address.trim(), city||null,
       parseInt(family_size)||1, needs||null, req.user.id]
    );
    await log(req.user.id, 'BENEFICIARY_ADDED', name);
    res.json({ success:true, message:'Beneficiary registered!', id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/beneficiaries/:id', auth, notRecipient, async (req,res) => {
  try {
    await dbRun(`UPDATE beneficiaries SET active=0 WHERE id=?`, [req.params.id]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════
   DISTRIBUTION EVENTS
   Recipients can view upcoming/available events
══════════════════════════════════════════════ */
app.get('/api/events', auth, async (req,res) => {
  try {
    let sql, params=[];
    if (req.user.role === 'recipient') {
      /* Show only pending/in-progress events with public info */
      sql = `SELECT e.id, e.title, e.scheduled_date, e.scheduled_time,
                    e.delivery_location, e.notes, e.status,
                    fd.food_name, fd.quantity as food_qty, fd.unit as food_unit, fd.category,
                    u1.organization as organizer_org
             FROM distribution_events e
             LEFT JOIN users u1 ON e.organizer_id=u1.id
             LEFT JOIN food_donations fd ON e.donation_id=fd.id
             WHERE e.status IN ('pending','in_progress')
             ORDER BY e.scheduled_date ASC`;
    } else {
      sql = `SELECT e.*,
                    u1.name as organizer_name, u1.organization as organizer_org,
                    u2.name as volunteer_name,
                    b.name  as beneficiary_name,
                    fd.food_name, fd.quantity as food_qty, fd.unit as food_unit
             FROM distribution_events e
             LEFT JOIN users u1 ON e.organizer_id=u1.id
             LEFT JOIN users u2 ON e.volunteer_id=u2.id
             LEFT JOIN beneficiaries b ON e.beneficiary_id=b.id
             LEFT JOIN food_donations fd ON e.donation_id=fd.id
             ORDER BY e.scheduled_date DESC`;
    }
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/events', auth, notRecipient, async (req,res) => {
  try {
    const { title, donation_id, volunteer_id, beneficiary_id,
            scheduled_date, scheduled_time, pickup_location, delivery_location, notes } = req.body;
    if (!title||!scheduled_date)
      return res.status(400).json({ error:'Title and date required' });
    const id = uuidv4();
    await dbRun(
      `INSERT INTO distribution_events
        (id,title,donation_id,organizer_id,volunteer_id,beneficiary_id,
         scheduled_date,scheduled_time,pickup_location,delivery_location,notes)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [id, title.trim(), donation_id||null, req.user.id, volunteer_id||null,
       beneficiary_id||null, scheduled_date, scheduled_time||null,
       pickup_location||null, delivery_location||null, notes||null]
    );
    if (donation_id)
      await dbRun(`UPDATE food_donations SET status='scheduled' WHERE id=?`, [donation_id]);
    await log(req.user.id, 'EVENT_CREATED', `${title} on ${scheduled_date}`);
    res.json({ success:true, message:'Event scheduled!', id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/events/:id/status', auth, notRecipient, async (req,res) => {
  try {
    const { status } = req.body;
    const ok = ['pending','in_progress','completed','cancelled'];
    if (!ok.includes(status)) return res.status(400).json({ error:'Invalid status' });
    await dbRun(`UPDATE distribution_events SET status=? WHERE id=?`, [status, req.params.id]);
    if (status==='completed') {
      const ev = await dbGet(`SELECT donation_id FROM distribution_events WHERE id=?`, [req.params.id]);
      if (ev?.donation_id)
        await dbRun(`UPDATE food_donations SET status='distributed' WHERE id=?`, [ev.donation_id]);
    }
    await log(req.user.id, 'EVENT_STATUS', `${req.params.id} → ${status}`);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════
   VOLUNTEERS LIST (for event scheduling)
══════════════════════════════════════════════ */
app.get('/api/volunteers', auth, notRecipient, async (req,res) => {
  try {
    const rows = await dbAll(
      `SELECT id,name,organization,city FROM users
       WHERE role='volunteer' AND active=1 AND verified=1`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════════════ */
app.get('/api/admin/stats', auth, adminOnly, async (req,res) => {
  try {
    const [users,pending,donations,bene,done,pendEv,vols,recip] = await Promise.all([
      dbGet(`SELECT COUNT(*) AS c FROM users WHERE role!='admin'`),
      dbGet(`SELECT COUNT(*) AS c FROM users WHERE verified=0 AND role!='admin' AND active=1`),
      dbGet(`SELECT COUNT(*) AS c FROM food_donations`),
      dbGet(`SELECT COUNT(*) AS c FROM beneficiaries WHERE active=1`),
      dbGet(`SELECT COUNT(*) AS c FROM distribution_events WHERE status='completed'`),
      dbGet(`SELECT COUNT(*) AS c FROM distribution_events WHERE status='pending'`),
      dbGet(`SELECT COUNT(*) AS c FROM users WHERE role='volunteer' AND active=1`),
      dbGet(`SELECT COUNT(*) AS c FROM users WHERE role='recipient' AND active=1`)
    ]);
    res.json({
      total_users:         users?.c||0,
      pending_verification:pending?.c||0,
      total_donations:     donations?.c||0,
      total_beneficiaries: bene?.c||0,
      completed_events:    done?.c||0,
      pending_events:      pendEv?.c||0,
      total_volunteers:    vols?.c||0,
      total_recipients:    recip?.c||0
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', auth, adminOnly, async (req,res) => {
  try {
    const rows = await dbAll(
      `SELECT id,name,email,role,organization,phone,city,address,verified,active,created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/users/:id/verify', auth, adminOnly, async (req,res) => {
  try {
    await dbRun(`UPDATE users SET verified=1 WHERE id=?`, [req.params.id]);
    const u = await dbGet(`SELECT name,email FROM users WHERE id=?`, [req.params.id]);
    await log(req.user.id, 'USER_VERIFIED', `${u?.name} (${u?.email})`);
    res.json({ success:true, message:'User verified' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/users/:id/toggle', auth, adminOnly, async (req,res) => {
  try {
    await dbRun(
      `UPDATE users SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=? AND role!='admin'`,
      [req.params.id]);
    const u = await dbGet(`SELECT name,active FROM users WHERE id=?`, [req.params.id]);
    await log(req.user.id, 'USER_TOGGLED', `${u?.name} → ${u?.active?'active':'inactive'}`);
    res.json({ success:true, message:`User ${u?.active?'activated':'deactivated'}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/activity', auth, adminOnly, async (req,res) => {
  try {
    const rows = await dbAll(
      `SELECT l.*, u.name as user_name, u.role as user_role
       FROM activity_log l LEFT JOIN users u ON l.user_id=u.id
       ORDER BY l.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ── Catch-all → SPA ── */
app.get('*', (req,res) =>
  res.sendFile(path.join(__dirname,'../frontend/public/index.html')));

/* ── Start server only after DB is initialised ── */
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log(`║  🌿 FoodShare  →  http://localhost:${PORT} ║`);
    console.log('╠═══════════════════════════════════════╣');
    console.log('║  admin@foodshare.org  /  Admin@123    ║');
    console.log('║  demo@restaurant.com  /  Demo@123     ║');
    console.log('║  recipient@demo.com   /  Demo@123     ║');
    console.log('╚═══════════════════════════════════════╝\n');
  });
}).catch(err => {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
});

# 🌿 FoodShare v2 — Sustainable Community Food Distribution System

Full-stack web app connecting **restaurants, NGOs, food banks, volunteers**, and now **recipients** who can browse available food and events.

---

## 🔑 Login Credentials

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| **Admin** | admin@foodshare.org | Admin@123 | Full control |
| **Restaurant (Demo)** | demo@restaurant.com | Demo@123 | Log donations |
| **NGO (Demo)** | demo@ngo.com | Demo@123 | Schedule events |
| **Recipient (Demo)** | recipient@demo.com | Demo@123 | Browse food instantly |

> **Recipients are auto-approved** — no admin verification needed.  
> All other roles (NGO, Restaurant, Food Bank, Volunteer) need admin approval.

---

## 📁 Project Structure

```
foodshare/
├── backend/
│   ├── server.js        ← Express API (all 25+ routes)
│   ├── database.js      ← SQLite tables + seed data
│   ├── middleware.js     ← JWT auth, admin guard, recipient guard
│   └── package.json     ← Node dependencies
│
├── frontend/
│   └── public/
│       └── index.html   ← Complete SPA (no framework needed)
│
├── package.json         ← Root scripts
├── .env                 ← Environment config
├── .gitignore
└── README.md
```

---

## 🚀 Deploy & Get a Public URL

### ── Option 1: Railway (FREE · Recommended · ~3 min) ──

```bash
# Step 1: Push to GitHub
git init
git add .
git commit -m "FoodShare v2 initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/foodshare.git
git push -u origin main
```

1. Go to **https://railway.app** → Sign in with GitHub
2. **New Project** → **Deploy from GitHub repo** → select your repo
3. Railway auto-detects Node.js
4. Set **Start Command**: `cd backend && npm install && node server.js`
5. Add environment variable: `JWT_SECRET` = any random string
6. Click **Generate Domain** → your public HTTPS URL is live ✅

### ── Option 2: Render (FREE tier) ──

1. **https://render.com** → New Web Service → Connect GitHub
2. **Build Command**: `cd backend && npm install`
3. **Start Command**: `node backend/server.js`
4. Add env vars: `JWT_SECRET`, `NODE_ENV=production`
5. Deploy → get a `.onrender.com` URL ✅

### ── Option 3: Local / LAN Testing ──

```bash
# Open terminal in the foodshare folder
cd backend
npm install
node server.js

# Desktop: http://localhost:3001
# Mobile on same WiFi: http://YOUR_LAN_IP:3001
# (Find LAN IP: ipconfig on Windows, ifconfig on Mac/Linux)
```

---

## ✨ Feature Summary

### Role-Based Access

| Feature | Admin | Restaurant | NGO | Food Bank | Volunteer | **Recipient** |
|---------|-------|-----------|-----|-----------|-----------|--------------|
| View available food | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View upcoming events | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Log donations | ✅ | ✅ | — | — | — | ❌ |
| Schedule events | ✅ | — | ✅ | ✅ | — | ❌ |
| Manage beneficiaries | ✅ | — | ✅ | ✅ | — | ❌ |
| Admin panel | ✅ | — | — | — | — | — |
| Auto-approved | ✅ | — | — | — | — | ✅ |

### Recipient Portal
- **Instant sign-up** — no waiting for admin approval
- **Food cards** with freshness indicators (green/yellow/red)
- **Category icons**, donor info, pickup address, expiry date
- **Distribution events** with date, location, food details
- Separate login button on landing page ("I Need Food")

### Donor / Org Dashboard
- Log surplus food with category, quantity, expiry
- Schedule distribution events with volunteer assignment
- Register and track beneficiaries
- Live stats panel

### Admin Panel
- Verify / deactivate any user
- See all users by role (including recipient count)
- Monitor all donations, events, beneficiaries
- Full activity log (last 100 actions)

---

## 🗄️ Database (SQLite — zero setup)

Tables auto-created on first run:
- `users` — all roles including recipient
- `food_donations` — surplus food listings
- `beneficiaries` — registered families
- `distribution_events` — scheduled pickups/deliveries
- `activity_log` — audit trail

---

## 🔐 Security

- Passwords hashed with bcrypt (cost 10)
- JWT tokens, 7-day expiry
- Role-based middleware — recipients blocked from write operations
- Admin cannot be deactivated via UI
- Change `JWT_SECRET` before going live!

---

## 📱 Device Support

Works on: iPhone · Android · iPad · Tablet · Desktop  
No app download needed — runs in any browser.

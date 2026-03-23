# 🌿 FoodShare — Sustainable Community Food Distribution System

A complete full-stack web application connecting **NGOs, Food Banks, Restaurants & Volunteers** to eliminate food waste and distribute surplus food to those in need.

---

## 🔑 Default Admin Login
| Field    | Value                  |
|----------|------------------------|
| Email    | admin@foodshare.org    |
| Password | Admin@123              |

---

## 📁 Project Structure
```
foodshare/
├── backend/
│   ├── server.js        ← Express REST API (all routes)
│   ├── database.js      ← SQLite schema + seeding
│   └── middleware.js    ← JWT auth + role guard
├── frontend/
│   └── public/
│       └── index.html   ← Full SPA (no build step needed)
├── package.json         ← Node dependencies
├── Procfile             ← For Railway/Heroku
├── .env                 ← Environment config
├── deploy.sh            ← Local deploy script
└── README.md
```

---

## 🚀 DEPLOYMENT GUIDE

### ✅ Option 1: Railway (FREE — Easiest, 3 minutes)

1. **Create GitHub repo**
   - Go to https://github.com/new
   - Create a new repo called `foodshare`
   - Upload all files from this folder

2. **Deploy on Railway**
   - Go to https://railway.app
   - Sign in with GitHub
   - Click **"New Project"** → **"Deploy from GitHub repo"**
   - Select your `foodshare` repo
   - Railway auto-detects Node.js

3. **Add Environment Variable**
   - In Railway dashboard → **Variables** tab
   - Add: `JWT_SECRET` = `any_long_random_string_here`

4. **Get your public URL**
   - Go to **Settings** → **Networking** → **Generate Domain**
   - Your app is live at: `https://foodshare-xxxx.railway.app`
   - ✅ Works on all phones & devices!

---

### ✅ Option 2: Render (FREE tier)

1. Push code to GitHub (same as above)
2. Go to https://render.com → **New Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add env var: `JWT_SECRET=your_secret`
6. Click **Deploy** → get your `https://foodshare.onrender.com` URL

---

### ✅ Option 3: Local / LAN (for your team network)

```bash
# 1. Install Node.js from https://nodejs.org (LTS version)

# 2. Open terminal in the foodshare folder

# 3. Run the deploy script
bash deploy.sh

# OR manually:
npm install
npm start

# App runs at:
# → Your computer:  http://localhost:3001
# → Your phone/LAN: http://YOUR_PC_IP:3001
#   (Find your IP: ipconfig on Windows / ifconfig on Mac/Linux)
```

---

## 👥 User Roles & Permissions

| Role        | Can Do                                              |
|-------------|-----------------------------------------------------|
| **Admin**   | Verify users, view all data, manage everything      |
| **Restaurant** | Log food donations, view own donations           |
| **NGO**     | View donations, schedule events, add beneficiaries  |
| **Food Bank** | View donations, manage distribution events        |
| **Volunteer** | View assigned events, update delivery status      |

---

## 🗄️ Database Tables

| Table               | Description                          |
|---------------------|--------------------------------------|
| `users`             | All registered users                 |
| `food_donations`    | Surplus food logged by donors        |
| `beneficiaries`     | Families/individuals receiving help  |
| `distribution_events` | Scheduled pickups & deliveries    |
| `activity_log`      | Audit trail of all actions           |

---

## 🌐 API Endpoints

```
POST   /api/auth/register          Register new user
POST   /api/auth/login             Login
GET    /api/auth/me                Get current user

GET    /api/donations              List donations
POST   /api/donations              Create donation
PATCH  /api/donations/:id/status   Update status

GET    /api/beneficiaries          List beneficiaries
POST   /api/beneficiaries          Register beneficiary

GET    /api/events                 List distribution events
POST   /api/events                 Create event
PATCH  /api/events/:id/status      Update event status

GET    /api/stats                  Dashboard statistics

GET    /api/admin/users            All users (admin)
PATCH  /api/admin/users/:id/verify Verify user (admin)
PATCH  /api/admin/users/:id/toggle Toggle active (admin)
GET    /api/admin/stats            System stats (admin)
GET    /api/admin/activity         Activity log (admin)
```

---

## 🔐 Security Notes
- **Change JWT_SECRET** in `.env` before going live
- Passwords are hashed using bcrypt (salt rounds: 10)
- All routes (except login/register) require JWT token
- Admin routes have additional role check

---

## 📱 Mobile Access
The app is fully responsive and works on:
- Android phones & tablets
- iPhones & iPads
- All modern browsers (Chrome, Safari, Firefox)

---

Built with ❤️ | Node.js + Express + SQLite + Vanilla JS

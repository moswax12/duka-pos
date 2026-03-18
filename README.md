# 🏪 Duka POS — Kenya Retail System
**Node.js + Express · Supabase (PostgreSQL) · Render.com**

Full-stack Point of Sale for Kenyan shops. M-Pesa · Cash · Card · KRA 16% VAT · Real-time inventory · Sales reports.

---

## 🗂️ Project Structure

```
duka-pos/
├── backend/
│   ├── server.js          ← Express app entry point
│   ├── db.js              ← PostgreSQL pool (pg)
│   ├── migrate.js         ← Creates tables + seeds data
│   ├── package.json
│   ├── .env.example
│   ├── middleware/
│   │   └── auth.js        ← JWT verification
│   └── routes/
│       ├── auth.js        ← Login / me
│       ├── products.js    ← Products CRUD
│       ├── categories.js  ← Categories
│       ├── transactions.js ← Atomic sale + stock deduction
│       └── reports.js     ← Summary, daily, low-stock
├── frontend/
│   └── public/
│       └── index.html     ← Full POS UI (login + sales + reports)
├── render.yaml            ← Render deployment config
├── Procfile
└── README.md
```

---

## 🚀 DEPLOY IN 4 STEPS

### STEP 1 — Create a Supabase database (free)

1. Go to **https://supabase.com** → click **"Start your project"**
2. Sign up / log in with GitHub
3. Click **"New project"**
   - Organization: your name
   - Project name: `duka-pos`
   - Database password: choose a strong password (save it!)
   - Region: **West EU (Ireland)** — closest to Kenya
4. Wait ~2 minutes for the project to spin up
5. Go to **Project Settings** (gear icon) → **Database**
6. Scroll to **"Connection string"** → select **"URI"** tab
7. Copy the string — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
   Replace `[YOUR-PASSWORD]` with your actual password.
   **Save this string — you need it in Step 3.**

---

### STEP 2 — Push code to GitHub

```bash
# From inside the duka-pos folder:
git init
git add .
git commit -m "Duka POS — initial commit"
git branch -M main

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/duka-pos.git
git push -u origin main
```

---

### STEP 3 — Deploy to Render (free)

1. Go to **https://render.com** → Sign up / log in with GitHub
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect a repository"** → select your `duka-pos` repo
4. Fill in the settings:
   | Field | Value |
   |-------|-------|
   | Name | `duka-pos` |
   | Region | Frankfurt (EU Central) |
   | Environment | `Node` |
   | Build Command | `cd backend && npm install` |
   | Start Command | `node backend/server.js` |
5. Scroll to **"Environment Variables"** → Add these:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | ← paste your Supabase URI from Step 1 |
   | `JWT_SECRET` | ← any random string (e.g. click "Generate") |
   | `NODE_ENV` | `production` |

6. Click **"Create Web Service"**
7. Wait ~3 minutes for the first deploy to finish ☕

---

### STEP 4 — Run the database migration

Once Render shows **"Live"**, run the migration once to create tables and seed data:

```bash
# Option A: From your local machine (with DATABASE_URL set in .env)
cd backend
cp .env.example .env
# Edit .env — paste your DATABASE_URL and a JWT_SECRET
npm install
node migrate.js

# Option B: Use Render Shell (no local setup needed)
# → Render Dashboard → your service → "Shell" tab → run:
node backend/migrate.js
```

✅ That's it! Your POS is live at: `https://duka-pos.onrender.com`

---

## 🔑 Default Logins

| Username | Password     | Role    | Access |
|----------|-------------|---------|--------|
| `admin`  | `admin1234` | Admin   | Everything |
| `jane`   | `cashier123`| Cashier | Sales only |

> ⚠️ **Change these passwords immediately after first login** (use the Supabase dashboard → Table Editor → users table).

---

## 💻 Local Development

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/duka-pos.git
cd duka-pos/backend

# 2. Install dependencies
npm install

# 3. Configure .env
cp .env.example .env
# Edit .env — add DATABASE_URL from Supabase and a JWT_SECRET

# 4. Seed database
node migrate.js

# 5. Start dev server (auto-reloads on changes)
npm run dev

# App runs at http://localhost:3000
```

---

## 📡 API Reference

All endpoints (except `/api/auth/login` and `/api/health`) require:
```
Authorization: Bearer <token>
```

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | — | Login, returns JWT |
| `GET`  | `/api/auth/me` | ✓ | Current user |
| `GET`  | `/api/products` | ✓ | List products (`?search=&category=`) |
| `GET`  | `/api/products/barcode/:code` | ✓ | Scan barcode |
| `POST` | `/api/products` | Admin | Add product |
| `PUT`  | `/api/products/:id` | Admin | Update product |
| `DELETE`| `/api/products/:id` | Admin | Soft-delete product |
| `GET`  | `/api/categories` | ✓ | List categories |
| `POST` | `/api/transactions` | ✓ | Complete a sale (atomic) |
| `GET`  | `/api/transactions` | ✓ | List transactions (`?date=&payment=`) |
| `GET`  | `/api/transactions/:id` | ✓ | Single transaction + items |
| `GET`  | `/api/reports/summary` | ✓ | Today's KPIs (`?date=YYYY-MM-DD`) |
| `GET`  | `/api/reports/low-stock` | ✓ | Products below reorder level |
| `GET`  | `/api/reports/daily` | Admin | Revenue by day (`?days=7`) |
| `GET`  | `/api/health` | — | Health check |

---

## 🌍 Timezone
All date queries use `Africa/Nairobi` (EAT, UTC+3) automatically.

---

## 🔒 Security Checklist Before Go-Live
- [ ] Change `admin` and `jane` passwords
- [ ] Set a strong `JWT_SECRET` (32+ random chars)
- [ ] Set `CORS_ORIGIN` to your actual domain instead of `*`
- [ ] Enable Supabase Row Level Security (RLS) if exposing the DB directly
- [ ] Render provides free HTTPS automatically ✅

---

Built with ❤️ for Kenyan retailers.

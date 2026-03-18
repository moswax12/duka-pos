// migrate.js — Creates Supabase/PostgreSQL tables and seeds initial data
// Run once: node migrate.js
require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');

async function migrate() {
  console.log('🔌 Connecting to Supabase PostgreSQL...');

  // ── TABLES ───────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      username   TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'cashier',
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categories (
      id   SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      barcode          TEXT UNIQUE,
      category_id      INTEGER REFERENCES categories(id),
      price            NUMERIC(12,2) NOT NULL,
      cost_price       NUMERIC(12,2) DEFAULT 0,
      stock            INTEGER NOT NULL DEFAULT 0,
      low_stock_alert  INTEGER DEFAULT 5,
      emoji            TEXT DEFAULT '📦',
      active           BOOLEAN NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id           TEXT PRIMARY KEY,
      cashier_id   INTEGER REFERENCES users(id),
      customer     TEXT DEFAULT 'Walk-in Customer',
      subtotal     NUMERIC(12,2) NOT NULL,
      discount_pct NUMERIC(5,2) DEFAULT 0,
      vat          NUMERIC(12,2) NOT NULL,
      total        NUMERIC(12,2) NOT NULL,
      payment      TEXT NOT NULL,
      mpesa_ref    TEXT,
      notes        TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id             SERIAL PRIMARY KEY,
      transaction_id TEXT REFERENCES transactions(id),
      product_id     INTEGER REFERENCES products(id),
      product_name   TEXT NOT NULL,
      qty            INTEGER NOT NULL,
      unit_price     NUMERIC(12,2) NOT NULL,
      total_price    NUMERIC(12,2) NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_txn_date    ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_txn_cashier ON transactions(cashier_id);
    CREATE INDEX IF NOT EXISTS idx_items_txn   ON transaction_items(transaction_id);
  `);
  console.log('✓ Tables ready');

  // ── SEED USERS ───────────────────────────────────────────────────────────
  const adminExists = await pool.queryOne('SELECT 1 FROM users WHERE username=$1', ['admin']);
  if (!adminExists) {
    const adminHash   = bcrypt.hashSync('admin1234', 10);
    const cashierHash = bcrypt.hashSync('cashier123', 10);
    await pool.query(
      'INSERT INTO users (name,username,password,role) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
      ['Admin','admin',adminHash,'admin','Jane Wanjiku','jane',cashierHash,'cashier']
    );
    console.log('✓ Default users created  (admin/admin1234 | jane/cashier123)');
  }

  // ── SEED CATEGORIES ──────────────────────────────────────────────────────
  const cats = ['Cereals','Detergents','Dairy','Cooking','Bakery','Beverages','Spices','Hygiene','Airtime'];
  for (const c of cats) {
    await pool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [c]);
  }
  console.log('✓ Categories ready');

  // ── SEED PRODUCTS ────────────────────────────────────────────────────────
  const count = await pool.queryOne('SELECT COUNT(*) AS c FROM products');
  if (parseInt(count.c) === 0) {
    const getCatId = async (name) => {
      const r = await pool.queryOne('SELECT id FROM categories WHERE name=$1', [name]);
      return r?.id;
    };
    const products = [
      { name:'Unga Jogoo 2kg',        barcode:'6001000001', cat:'Cereals',    price:180,  cost:130, stock:50,  emoji:'🌾' },
      { name:'Omo Washing Powder 1kg', barcode:'6001000002', cat:'Detergents', price:220,  cost:160, stock:30,  emoji:'🧴' },
      { name:'Brookside Milk 500ml',   barcode:'6001000003', cat:'Dairy',      price:65,   cost:45,  stock:80,  emoji:'🥛' },
      { name:'Elianto Cooking Oil 2L', barcode:'6001000004', cat:'Cooking',    price:580,  cost:420, stock:25,  emoji:'🫙' },
      { name:'Bread Sunbaker 400g',    barcode:'6001000005', cat:'Bakery',     price:60,   cost:40,  stock:20,  emoji:'🍞' },
      { name:'Sugar 1kg',              barcode:'6001000006', cat:'Cereals',    price:140,  cost:100, stock:100, emoji:'🍚' },
      { name:'Nescafé Classic 100g',   barcode:'6001000007', cat:'Beverages',  price:380,  cost:280, stock:15,  emoji:'☕' },
      { name:'Royco Mchuzi Mix 75g',   barcode:'6001000008', cat:'Spices',     price:35,   cost:22,  stock:60,  emoji:'🌶️' },
      { name:'Colgate Toothpaste 75ml',barcode:'6001000009', cat:'Hygiene',    price:120,  cost:85,  stock:40,  emoji:'🪥' },
      { name:'Always Pads 8s',         barcode:'6001000010', cat:'Hygiene',    price:90,   cost:60,  stock:35,  emoji:'🌸' },
      { name:'Coca-Cola 500ml',        barcode:'6001000011', cat:'Beverages',  price:80,   cost:55,  stock:0,   emoji:'🥤' },
      { name:'Blue Band 250g',         barcode:'6001000012', cat:'Dairy',      price:110,  cost:80,  stock:5,   emoji:'🧈' },
      { name:'Indomie Instant 70g',    barcode:'6001000013', cat:'Cereals',    price:25,   cost:15,  stock:200, emoji:'🍜' },
      { name:'Ketepa Pride Tea 50s',   barcode:'6001000014', cat:'Beverages',  price:150,  cost:105, stock:45,  emoji:'🍵' },
      { name:'Ariel Detergent 500g',   barcode:'6001000015', cat:'Detergents', price:195,  cost:140, stock:22,  emoji:'🫧' },
      { name:'Chicken Eggs tray 30',   barcode:'6001000016', cat:'Dairy',      price:520,  cost:380, stock:12,  emoji:'🥚' },
      { name:'Safaricom Airtime 50',   barcode:'6001000017', cat:'Airtime',    price:50,   cost:50,  stock:999, emoji:'📱' },
      { name:'Safaricom Airtime 100',  barcode:'6001000018', cat:'Airtime',    price:100,  cost:100, stock:999, emoji:'📱' },
      { name:'Tomato Paste 70g',       barcode:'6001000019', cat:'Spices',     price:45,   cost:30,  stock:55,  emoji:'🍅' },
      { name:'Kabras Sugar 2kg',       barcode:'6001000020', cat:'Cereals',    price:270,  cost:200, stock:70,  emoji:'🍚' },
    ];
    for (const p of products) {
      const catId = await getCatId(p.cat);
      await pool.query(
        `INSERT INTO products (name,barcode,category_id,price,cost_price,stock,emoji)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.name, p.barcode, catId, p.price, p.cost, p.stock, p.emoji]
      );
    }
    console.log(`✓ ${products.length} products seeded`);
  } else {
    console.log('✓ Products already exist, skipping seed');
  }

  console.log('\n✅ Migration complete! Database is ready.');
  await pool.end();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});

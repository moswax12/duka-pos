// db.js — PostgreSQL connection pool (Supabase)
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

// Helper: run a query and return all rows
pool.query_ = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows;
};

// Helper: run a query and return first row only
pool.queryOne = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
};

module.exports = pool;

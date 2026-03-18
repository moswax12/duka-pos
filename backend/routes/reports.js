// routes/reports.js
const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// GET /api/reports/summary?date=YYYY-MM-DD
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const totals = await db.queryOne(
      `SELECT
         COUNT(*)::int AS transactions,
         COALESCE(SUM(total),0)::float       AS revenue,
         COALESCE(SUM(vat),0)::float         AS vat_collected,
         COALESCE(SUM(CASE WHEN payment='mpesa' THEN total ELSE 0 END),0)::float AS mpesa,
         COALESCE(SUM(CASE WHEN payment='cash'  THEN total ELSE 0 END),0)::float AS cash,
         COALESCE(SUM(CASE WHEN payment='card'  THEN total ELSE 0 END),0)::float AS card
       FROM transactions
       WHERE DATE(created_at AT TIME ZONE 'Africa/Nairobi') = $1`,
      [date]
    );

    const itemsRow = await db.queryOne(
      `SELECT COALESCE(SUM(ti.qty),0)::int AS units
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE DATE(t.created_at AT TIME ZONE 'Africa/Nairobi') = $1`,
      [date]
    );

    const topProducts = await db.query_(
      `SELECT ti.product_name,
              SUM(ti.qty)::int        AS qty_sold,
              SUM(ti.total_price)::float AS revenue
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE DATE(t.created_at AT TIME ZONE 'Africa/Nairobi') = $1
       GROUP BY ti.product_name
       ORDER BY qty_sold DESC
       LIMIT 5`,
      [date]
    );

    res.json({ date, ...totals, units_sold: itemsRow.units, top_products: topProducts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reports/low-stock
router.get('/low-stock', authMiddleware, async (req, res) => {
  try {
    const rows = await db.query_(
      `SELECT p.*, c.name AS category
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.active=true AND p.stock != 999 AND p.stock <= p.low_stock_alert
       ORDER BY p.stock ASC`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reports/daily?days=7  (admin only)
router.get('/daily', authMiddleware, adminOnly, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const rows = await db.query_(
      `SELECT DATE(created_at AT TIME ZONE 'Africa/Nairobi') AS date,
              COUNT(*)::int        AS transactions,
              SUM(total)::float    AS revenue
       FROM transactions
       WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY DATE(created_at AT TIME ZONE 'Africa/Nairobi')
       ORDER BY date DESC`,
      [days]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

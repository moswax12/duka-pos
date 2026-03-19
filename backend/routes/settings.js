const router = require('express').Router();
const db = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

async function ensureTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const defaults = [
    ['shop_name','Duka Retail Shop'],['shop_address','Nairobi, Kenya'],
    ['shop_phone','+254 700 000 000'],['shop_pin','A123456789B'],
    ['vat_rate','16'],['currency','KSh'],
    ['receipt_footer','Thank you for shopping with us!'],['low_stock_default','5']
  ];
  for (const [key, value] of defaults) {
    await db.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [key, value]);
  }
}
ensureTable().catch(console.error);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const rows = await db.query_('SELECT key, value FROM settings ORDER BY key');
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await db.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [key, String(value)]);
    }
    res.json({ updated: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

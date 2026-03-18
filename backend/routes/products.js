// routes/products.js
const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// GET /api/products
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, search } = req.query;
    const params = [];
    let conditions = ['p.active = true'];

    if (category && category !== 'All') {
      params.push(category);
      conditions.push(`c.name = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`p.name ILIKE $${params.length}`);
    }

    const sql = `
      SELECT p.*, c.name AS category
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.name
    `;
    const rows = await db.query_(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/products/barcode/:code
router.get('/barcode/:code', authMiddleware, async (req, res) => {
  try {
    const p = await db.queryOne(
      `SELECT p.*, c.name AS category FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.barcode=$1 AND p.active=true`,
      [req.params.code]
    );
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.json(p);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/products/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const p = await db.queryOne(
      `SELECT p.*, c.name AS category FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id=$1`,
      [req.params.id]
    );
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.json(p);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/products
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, barcode, category_id, price, cost_price, stock, low_stock_alert, emoji } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'name and price required' });
    const p = await db.queryOne(
      `INSERT INTO products (name,barcode,category_id,price,cost_price,stock,low_stock_alert,emoji)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, barcode||null, category_id||null, price, cost_price||0, stock||0, low_stock_alert||5, emoji||'📦']
    );
    res.status(201).json(p);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/products/:id
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, barcode, category_id, price, cost_price, stock, low_stock_alert, emoji, active } = req.body;
    await db.query(
      `UPDATE products SET
         name=COALESCE($1,name), barcode=COALESCE($2,barcode),
         category_id=COALESCE($3,category_id), price=COALESCE($4,price),
         cost_price=COALESCE($5,cost_price), stock=COALESCE($6,stock),
         low_stock_alert=COALESCE($7,low_stock_alert), emoji=COALESCE($8,emoji),
         active=COALESCE($9,active), updated_at=NOW()
       WHERE id=$10`,
      [name,barcode,category_id,price,cost_price,stock,low_stock_alert,emoji,active,req.params.id]
    );
    res.json({ updated: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/products/:id (soft delete)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await db.query('UPDATE products SET active=false WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

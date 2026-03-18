// routes/transactions.js
const router   = require('express').Router();
const db       = require('../db');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');

// POST /api/transactions — complete a sale (atomic)
router.post('/', authMiddleware, async (req, res) => {
  const { customer, items, discount_pct, payment, mpesa_ref, notes } = req.body;

  if (!items || !items.length)
    return res.status(400).json({ error: 'Cart is empty' });
  if (!['mpesa','cash','card'].includes(payment))
    return res.status(400).json({ error: 'Invalid payment method' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Fetch & lock product rows
    const ids = items.map(i => i.product_id);
    const { rows: productRows } = await client.query(
      `SELECT * FROM products WHERE id = ANY($1::int[]) FOR UPDATE`,
      [ids]
    );
    const productMap = Object.fromEntries(productRows.map(p => [p.id, p]));

    // Validate stock
    for (const item of items) {
      const prod = productMap[item.product_id];
      if (!prod) throw new Error(`Product ${item.product_id} not found`);
      if (prod.stock !== 999 && prod.stock < item.qty)
        throw new Error(`Insufficient stock for "${prod.name}" (have ${prod.stock}, need ${item.qty})`);
    }

    // Calculate totals
    const subtotal = items.reduce((s, i) => s + Number(productMap[i.product_id].price) * i.qty, 0);
    const disc     = Math.min(parseFloat(discount_pct) || 0, 100);
    const after    = subtotal * (1 - disc / 100);
    const vat      = after * 0.16;
    const total    = after + vat;
    const txnId    = uuidv4();

    // Insert transaction header
    await client.query(
      `INSERT INTO transactions (id,cashier_id,customer,subtotal,discount_pct,vat,total,payment,mpesa_ref,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [txnId, req.user.id, customer||'Walk-in Customer', subtotal, disc, vat, total, payment, mpesa_ref||null, notes||null]
    );

    // Insert line items & deduct stock
    for (const item of items) {
      const prod = productMap[item.product_id];
      await client.query(
        `INSERT INTO transaction_items (transaction_id,product_id,product_name,qty,unit_price,total_price)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [txnId, prod.id, prod.name, item.qty, prod.price, Number(prod.price) * item.qty]
      );
      if (prod.stock !== 999) {
        await client.query(
          `UPDATE products SET stock=stock-$1, updated_at=NOW() WHERE id=$2`,
          [item.qty, prod.id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: txnId, subtotal, discount_pct: disc, vat, total, payment, created_at: new Date() });

  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/transactions
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date, payment, limit = 100, offset = 0 } = req.query;
    const params = [];
    let conditions = ['1=1'];

    if (date) {
      params.push(date);
      conditions.push(`DATE(t.created_at AT TIME ZONE 'Africa/Nairobi') = $${params.length}`);
    }
    if (payment) {
      params.push(payment);
      conditions.push(`t.payment = $${params.length}`);
    }
    params.push(Number(limit), Number(offset));

    const rows = await db.query_(
      `SELECT t.*, u.name AS cashier_name
       FROM transactions t
       LEFT JOIN users u ON t.cashier_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Attach items
    for (const t of rows) {
      t.items = await db.query_(
        'SELECT * FROM transaction_items WHERE transaction_id=$1', [t.id]
      );
    }
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/transactions/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const txn = await db.queryOne(
      `SELECT t.*, u.name AS cashier_name FROM transactions t
       LEFT JOIN users u ON t.cashier_id = u.id WHERE t.id=$1`,
      [req.params.id]
    );
    if (!txn) return res.status(404).json({ error: 'Not found' });
    txn.items = await db.query_(
      'SELECT * FROM transaction_items WHERE transaction_id=$1', [txn.id]
    );
    res.json(txn);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

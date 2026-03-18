// routes/categories.js
const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const rows = await db.query_('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await db.queryOne(
      'INSERT INTO categories (name) VALUES ($1) RETURNING *', [name]
    );
    res.status(201).json(r);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

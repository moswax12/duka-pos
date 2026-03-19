const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await db.query_('SELECT id, name, username, role, active, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, username, password, role = 'cashier' } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username and password are required' });
    const exists = await db.queryOne('SELECT 1 FROM users WHERE username=$1', [username]);
    if (exists) return res.status(409).json({ error: 'Username already taken' });
    const hash = bcrypt.hashSync(password, 10);
    const user = await db.queryOne('INSERT INTO users (name,username,password,role) VALUES ($1,$2,$3,$4) RETURNING id,name,username,role,active', [name, username, hash, role]);
    res.status(201).json(user);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, password, role } = req.body;
    let passwordHash = null;
    if (password) passwordHash = bcrypt.hashSync(password, 10);
    await db.query('UPDATE users SET name=COALESCE($1,name), password=COALESCE($2,password), role=COALESCE($3,role) WHERE id=$4', [name||null, passwordHash, role||null, req.params.id]);
    res.json({ updated: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/toggle', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot deactivate your own account' });
    const user = await db.queryOne('SELECT active FROM users WHERE id=$1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await db.query('UPDATE users SET active=$1 WHERE id=$2', [!user.active, req.params.id]);
    res.json({ active: !user.active });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

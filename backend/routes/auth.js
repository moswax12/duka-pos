// routes/auth.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'duka-pos-secret-change-me';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const user = await db.queryOne(
      'SELECT * FROM users WHERE username=$1 AND active=true', [username]
    );
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.queryOne(
      'SELECT id, name, username, role FROM users WHERE id=$1', [req.user.id]
    );
    res.json(user);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

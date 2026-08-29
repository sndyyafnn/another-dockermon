'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { setAuthCookie, clearAuthCookie } = require('../auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Check admin
    const user = await db.getUserByUsername(username.toLowerCase());
    if (user && await bcrypt.compare(password, user.password_hash)) {
      setAuthCookie(res, { userId: user.id, username: user.username, role: user.role });
      return res.json({ ok: true, role: user.role, username: user.username });
    }

    // Check guest (username can be anything; password must match shared hash)
    if (username.toLowerCase() === 'guest') {
      const gHash = await db.getGuestPasswordHash();
      if (gHash && await bcrypt.compare(password, gHash)) {
        setAuthCookie(res, { userId: 0, username: 'guest', role: 'guest' });
        return res.json({ ok: true, role: 'guest', username: 'guest' });
      }
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = req.cookies?.noc_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { verifyToken } = require('../auth');
    const payload = verifyToken(token);
    res.json({ username: payload.username, role: payload.role });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;

'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev-secret-change-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';
const COOKIE_NAME = 'noc_token';

// ── Token helpers ─────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function setAuthCookie(res, payload) {
  const token = signToken(payload);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   24 * 60 * 60 * 1000, // 24h ms
  });
  return token;
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict' });
}

// ── Middleware ────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin only' });
  }
  next();
}

function requireGuest(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'guest')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = {
  signToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAdmin,
  requireGuest,
  COOKIE_NAME,
};

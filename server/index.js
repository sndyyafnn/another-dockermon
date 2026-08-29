'use strict';
require('dotenv').config();

const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
const db           = require('./db');
const sse          = require('./sse');
const docker       = require('./docker');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/guest', require('./routes/guest'));

// ── Static files ──────────────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// ── SPA fallback ──────────────────────────────────────────────────
app.get('*', (req, res) => {
  // Login page
  if (req.path === '/login') {
    return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Express]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Startup ───────────────────────────────────────────────────────
async function start() {
  try {
    // Init database (create tables, seed)
    await db.init();

    // Verify Docker socket
    try {
      await docker.ping();
      console.log('[Docker] Connected to Docker daemon');
    } catch (err) {
      console.warn('[Docker] Warning: Could not connect to Docker daemon:', err.message);
      console.warn('[Docker] Monitoring features will be unavailable until Docker is accessible');
    }

    // Start SSE polling loop
    sse.startPolling();

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`[NOC Monitor] Running at http://localhost:${PORT}`);
      console.log(`[NOC Monitor] Admin login: admin / password`);
    });
  } catch (err) {
    console.error('[Startup] Fatal error:', err);
    process.exit(1);
  }
}

start();

// ── Graceful shutdown ─────────────────────────────────────────────
process.on('SIGTERM', () => { sse.stopPolling(); process.exit(0); });
process.on('SIGINT',  () => { sse.stopPolling(); process.exit(0); });

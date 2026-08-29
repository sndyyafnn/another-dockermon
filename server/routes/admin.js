'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const docker = require('../docker');
const sse    = require('../sse');
const { requireAuth, requireAdmin } = require('../auth');

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// ── SSE Stream ────────────────────────────────────────────────────
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Keep-alive ping
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 20000);

  const cleanup = sse.connectAdmin(res);
  req.on('close', () => { clearInterval(ping); cleanup(); });
});

// ── Host info ─────────────────────────────────────────────────────
router.get('/host', async (req, res) => {
  try {
    const host = sse.getLatestHost() || await docker.getHostInfo();
    res.json(host);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Containers list ───────────────────────────────────────────────
router.get('/containers', async (req, res) => {
  try {
    let containers = sse.getLatestContainers();
    if (!containers.length) containers = await docker.getContainers();
    const result = containers.map(c => ({
      ...c,
      stats: sse.getLatestStats(c.id),
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Container detail ──────────────────────────────────────────────
router.get('/containers/:id', async (req, res) => {
  try {
    const info  = await docker.inspectContainer(req.params.id);
    const stats = sse.getLatestStats(req.params.id);
    res.json({ info, stats });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ── Container history ─────────────────────────────────────────────
router.get('/containers/:id/history', (req, res) => {
  const points = parseInt(req.query.points) || 60;
  res.json(sse.getSlicedHistory(req.params.id, points));
});

// ── Container logs (SSE stream) ───────────────────────────────────
router.get('/containers/:id/logs', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const stream = docker.streamContainerLogs(
    req.params.id,
    line => {
      try { res.write(`data: ${JSON.stringify(line)}\n\n`); } catch {}
    },
    () => {
      try { res.write('event: end\ndata: {}\n\n'); res.end(); } catch {}
    }
  );

  req.on('close', () => stream.destroy());
});

// ── Container logs (snapshot) ─────────────────────────────────────
router.get('/containers/:id/logs/snapshot', async (req, res) => {
  try {
    const tail = parseInt(req.query.tail) || 200;
    const logs = await docker.getContainerLogs(req.params.id, tail);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Container control actions ──────────────────────────────────────
router.post('/containers/:id/action', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    switch (action) {
      case 'start':   await docker.startContainer(id); break;
      case 'stop':    await docker.stopContainer(id); break;
      case 'restart': await docker.restartContainer(id); break;
      case 'pause':   await docker.pauseContainer(id); break;
      case 'unpause': await docker.unpauseContainer(id); break;
      default:
        return res.status(400).json({ error: 'Invalid action. Supported: start, stop, restart, pause, unpause' });
    }
    res.json({ ok: true, action, containerId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Guest visibility ──────────────────────────────────────────────
router.get('/visibility', async (req, res) => {
  try {
    const map        = await db.getVisibilityMap();
    const containers = sse.getLatestContainers().length
      ? sse.getLatestContainers()
      : await docker.getContainers();

    const result = containers.map(c => ({
      id:               c.id,
      shortId:          c.shortId,
      name:             c.name,
      image:            c.image,
      state:            c.state,
      guestVisible:     map[c.id]?.guestVisible     ?? false,
      guestLogsVisible: map[c.id]?.guestLogsVisible ?? false,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/visibility/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { guestVisible, guestLogsVisible, containerName } = req.body;
    await db.upsertVisibility(
      id,
      containerName || id,
      !!guestVisible,
      !!guestLogsVisible
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Settings: guest password ──────────────────────────────────────
router.put('/settings/guest-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(password, 12);
    await db.setGuestPasswordHash(hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

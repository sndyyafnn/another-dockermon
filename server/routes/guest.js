'use strict';
const router = require('express').Router();
const db     = require('../db');
const docker = require('../docker');
const sse    = require('../sse');
const { requireAuth, requireGuest } = require('../auth');

// All guest routes require auth (admin or guest role)
router.use(requireAuth, requireGuest);

// ── SSE Stream (filtered for guest) ──────────────────────────────
router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 20000);

  const cleanup = await sse.connectGuest(res);
  req.on('close', () => { clearInterval(ping); cleanup(); });
});

// ── Host info (limited) ───────────────────────────────────────────
router.get('/host', async (req, res) => {
  try {
    const host = sse.getLatestHost() || await docker.getHostInfo();
    res.json({
      cpuCount:          host.cpuCount,
      memTotal:          host.memTotal,
      memUsed:           host.memUsed,
      memPercent:        host.memPercent,
      uptime:            host.uptime,
      containersRunning: host.containersRunning,
      containersStopped: host.containersStopped,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Containers (only visible ones) ───────────────────────────────
router.get('/containers', async (req, res) => {
  try {
    const visMap = await db.getVisibilityMap();
    let containers = sse.getLatestContainers();
    if (!containers.length) containers = await docker.getContainers();

    const result = containers
      .filter(c => visMap[c.id]?.guestVisible)
      .map(c => ({
        id:      c.id,
        shortId: c.shortId,
        name:    c.name,
        image:   c.image,
        status:  c.status,
        state:   c.state,
        created: c.created,
        stats:   (() => {
          const s = sse.getLatestStats(c.id);
          if (!s) return null;
          return { cpu: s.cpu, mem: s.mem, net: s.net, pids: s.pids };
        })(),
      }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Container detail (only if guest-visible) ──────────────────────
router.get('/containers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const vis = await db.getVisibilityForContainer(id);
    if (!vis.guestVisible) return res.status(403).json({ error: 'Access denied' });

    const stats = sse.getLatestStats(id);
    // Return limited info — no env vars, no mounts, no network config
    res.json({
      id,
      stats: stats ? { cpu: stats.cpu, mem: stats.mem, net: stats.net, pids: stats.pids } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Container history (only if guest-visible) ─────────────────────
router.get('/containers/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const vis = await db.getVisibilityForContainer(id);
    if (!vis.guestVisible) return res.status(403).json({ error: 'Access denied' });

    const points = parseInt(req.query.points) || 60;
    res.json(sse.getSlicedHistory(id, points));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Container logs (only if guest-logs-visible) ───────────────────
router.get('/containers/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const vis = await db.getVisibilityForContainer(id);
    if (!vis.guestLogsVisible) return res.status(403).json({ error: 'Log access denied' });

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const stream = docker.streamContainerLogs(
      id,
      line => {
        try { res.write(`data: ${JSON.stringify(line)}\n\n`); } catch {}
      },
      () => {
        try { res.write('event: end\ndata: {}\n\n'); res.end(); } catch {}
      }
    );

    req.on('close', () => stream.destroy());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Logs snapshot (only if guest-logs-visible) ────────────────────
router.get('/containers/:id/logs/snapshot', async (req, res) => {
  try {
    const { id } = req.params;
    const vis = await db.getVisibilityForContainer(id);
    if (!vis.guestLogsVisible) return res.status(403).json({ error: 'Log access denied' });

    const tail = parseInt(req.query.tail) || 100;
    const logs = await docker.getContainerLogs(id, tail);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

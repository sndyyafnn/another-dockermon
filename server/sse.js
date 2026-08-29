'use strict';
const { v4: uuidv4 } = require('uuid');
const docker = require('./docker');
const db     = require('./db');

// ── History ring buffer ────────────────────────────────────────────
const HISTORY_MAX  = 180; // ~3 min at 1s, ~1hr at 20s
const POLL_INTERVAL_MS = 3000; // poll every 3 seconds

const history = new Map(); // containerId -> { cpu[], mem[], netRx[], netTx[], ts[] }
let   latestStats = new Map(); // containerId -> latest stats object
let   latestContainers = [];   // latest container list
let   latestHost = null;

function ensureHistory(id) {
  if (!history.has(id)) {
    history.set(id, { cpu: [], mem: [], netRx: [], netTx: [], ts: [] });
  }
}

function pushHistory(id, point) {
  ensureHistory(id);
  const h = history.get(id);
  h.cpu.push(point.cpu ?? 0);
  h.mem.push(point.mem?.percent ?? 0);
  h.netRx.push(point.net?.rx ?? 0);
  h.netTx.push(point.net?.tx ?? 0);
  h.ts.push(point.ts ?? Date.now());
  // Trim to max size
  if (h.cpu.length > HISTORY_MAX) {
    h.cpu.shift(); h.mem.shift(); h.netRx.shift(); h.netTx.shift(); h.ts.shift();
  }
}

function getHistory(id) {
  return history.get(id) || { cpu: [], mem: [], netRx: [], netTx: [], ts: [] };
}

function getSlicedHistory(id, points) {
  const h = getHistory(id);
  const n = Math.min(points, h.ts.length);
  return {
    cpu:   h.cpu.slice(-n),
    mem:   h.mem.slice(-n),
    netRx: h.netRx.slice(-n),
    netTx: h.netTx.slice(-n),
    ts:    h.ts.slice(-n),
  };
}

// ── SSE client registry ────────────────────────────────────────────
const adminClients = new Map(); // id -> res
const guestClients = new Map(); // id -> res

function addClient(role, res) {
  const id = uuidv4();
  if (role === 'admin') adminClients.set(id, res);
  else                  guestClients.set(id, res);
  return id;
}

function removeClient(role, id) {
  if (role === 'admin') adminClients.delete(id);
  else                  guestClients.delete(id);
}

function sendEvent(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch { /* client disconnected */ }
}

function broadcastAdmin(event, data) {
  for (const res of adminClients.values()) sendEvent(res, event, data);
}

async function broadcastGuest(event, data, visibilityMap) {
  if (guestClients.size === 0) return;
  // Filter containers for guests
  let filtered = data;
  if (event === 'containers' && Array.isArray(data)) {
    filtered = data
      .filter(c => visibilityMap[c.id]?.guestVisible)
      .map(c => sanitizeForGuest(c));
  }
  if (event === 'stats' && data?.id) {
    if (!visibilityMap[data.id]?.guestVisible) return;
    filtered = sanitizeStatsForGuest(data);
  }
  if (event === 'host') {
    filtered = sanitizeHostForGuest(data);
  }
  for (const res of guestClients.values()) sendEvent(res, event, filtered);
}

// ── Guest data sanitizers ─────────────────────────────────────────
function sanitizeForGuest(c) {
  return {
    id:      c.id,
    shortId: c.shortId,
    name:    c.name,
    image:   c.image,
    status:  c.status,
    state:   c.state,
    created: c.created,
  };
}

function sanitizeStatsForGuest(s) {
  return {
    id:  s.id,
    cpu: s.cpu,
    mem: s.mem,
    net: s.net,
    pids: s.pids,
    ts:  s.ts,
  };
}

function sanitizeHostForGuest(h) {
  if (!h) return null;
  return {
    cpuCount:          h.cpuCount,
    memTotal:          h.memTotal,
    memUsed:           h.memUsed,
    memPercent:        h.memPercent,
    uptime:            h.uptime,
    containersRunning: h.containersRunning,
    containersStopped: h.containersStopped,
  };
}

// ── Main polling loop ─────────────────────────────────────────────
let pollTimer = null;

async function poll() {
  try {
    // Fetch container list
    const containers = await docker.getContainers();
    latestContainers = containers;

    // Fetch stats for each running container
    const statsArr = [];
    await Promise.all(
      containers
        .filter(c => c.state === 'running')
        .map(async c => {
          try {
            const s = await docker.getContainerStats(c.id);
            const prev = latestStats.get(c.id);
            const now = Date.now();
            
            // Calculate real-time throughput (bytes per second)
            let rxSec = 0, txSec = 0;
            if (prev && prev.ts && now > prev.ts) {
              const timeDeltaSec = (now - prev.ts) / 1000;
              const prevRx = prev.net?.rxTotal !== undefined ? prev.net.rxTotal : (prev.net?.rx || 0);
              const prevTx = prev.net?.txTotal !== undefined ? prev.net.txTotal : (prev.net?.tx || 0);
              const rxDelta = Math.max(0, (s.net?.rx || 0) - prevRx);
              const txDelta = Math.max(0, (s.net?.tx || 0) - prevTx);
              rxSec = Math.round(rxDelta / timeDeltaSec);
              txSec = Math.round(txDelta / timeDeltaSec);
            }

            const point = {
              ...s,
              net: {
                rx: rxSec,          // Real-time speed (B/s)
                tx: txSec,          // Real-time speed (B/s)
                rxTotal: s.net?.rx, // Cumulative total (bytes)
                txTotal: s.net?.tx, // Cumulative total (bytes)
              },
              id: c.id,
              name: c.name,
              ts: now,
            };

            latestStats.set(c.id, point);
            pushHistory(c.id, point);
            statsArr.push(point);
          } catch { /* container may have stopped */ }
        })
    );

    // Fetch host info
    latestHost = await docker.getHostInfo();

    // Broadcast to admins
    if (adminClients.size > 0) {
      const enriched = containers.map(c => ({
        ...c,
        stats: latestStats.get(c.id) || null,
      }));
      broadcastAdmin('containers', enriched);
      broadcastAdmin('host', latestHost);
      for (const s of statsArr) broadcastAdmin('stats', s);
    }

    // Broadcast to guests
    if (guestClients.size > 0) {
      const visMap = await db.getVisibilityMap();
      const guestContainers = containers
        .filter(c => visMap[c.id]?.guestVisible)
        .map(c => ({
          ...sanitizeForGuest(c),
          stats: latestStats.get(c.id)
            ? sanitizeStatsForGuest({ ...latestStats.get(c.id), id: c.id })
            : null,
        }));
      for (const res of guestClients.values()) {
        sendEvent(res, 'containers', guestContainers);
        sendEvent(res, 'host', sanitizeHostForGuest(latestHost));
      }
    }
  } catch (err) {
    console.error('[SSE] Poll error:', err.message);
  }
}

function startPolling() {
  poll(); // immediate first run
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
}

// ── Public API ────────────────────────────────────────────────────
function connectAdmin(res) {
  const id = addClient('admin', res);
  // Send current snapshot immediately
  if (latestContainers.length > 0) {
    const enriched = latestContainers.map(c => ({
      ...c, stats: latestStats.get(c.id) || null,
    }));
    sendEvent(res, 'containers', enriched);
  }
  if (latestHost) sendEvent(res, 'host', latestHost);
  return () => removeClient('admin', id);
}

async function connectGuest(res) {
  const id = addClient('guest', res);
  const visMap = await db.getVisibilityMap();
  // Send current snapshot immediately
  if (latestContainers.length > 0) {
    const guestContainers = latestContainers
      .filter(c => visMap[c.id]?.guestVisible)
      .map(c => ({
        ...sanitizeForGuest(c),
        stats: latestStats.get(c.id)
          ? sanitizeStatsForGuest({ ...latestStats.get(c.id), id: c.id })
          : null,
      }));
    sendEvent(res, 'containers', guestContainers);
  }
  if (latestHost) sendEvent(res, 'host', sanitizeHostForGuest(latestHost));
  return () => removeClient('guest', id);
}

module.exports = {
  startPolling,
  stopPolling,
  connectAdmin,
  connectGuest,
  getHistory,
  getSlicedHistory,
  getLatestContainers: () => latestContainers,
  getLatestStats: (id) => latestStats.get(id) || null,
  getLatestHost: () => latestHost,
};

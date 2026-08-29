'use strict';
const Dockerode = require('dockerode');
const os = require('os');

const docker = new Dockerode({
  socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
});

// ── CPU % calculation from raw Docker stats ────────────────────────
function calcCpuPercent(stats) {
  const cur    = stats.cpu_stats;
  const prev   = stats.precpu_stats;
  if (!cur || !prev) return 0;

  const cpuDelta    = (cur.cpu_usage?.total_usage  || 0) - (prev.cpu_usage?.total_usage  || 0);
  const systemDelta = (cur.system_cpu_usage || 0)        - (prev.system_cpu_usage || 0);
  const numCPUs     = cur.online_cpus || (cur.cpu_usage?.percpu_usage?.length ?? 1);

  if (systemDelta <= 0 || cpuDelta < 0) return 0;
  return Math.min(100, (cpuDelta / systemDelta) * numCPUs * 100);
}

// ── Memory helpers ────────────────────────────────────────────────
function calcMemUsage(stats) {
  const mem = stats.memory_stats;
  if (!mem) return { used: 0, limit: 0, percent: 0 };
  // Docker subtracts cache from usage
  const cache = mem.stats?.cache || mem.stats?.inactive_file || 0;
  const used  = Math.max(0, (mem.usage || 0) - cache);
  const limit = mem.limit || 1;
  return { used, limit, percent: Math.min(100, (used / limit) * 100) };
}

// ── Network I/O ───────────────────────────────────────────────────
function calcNetIO(stats) {
  const nets = stats.networks;
  if (!nets) return { rx: 0, tx: 0 };
  let rx = 0, tx = 0;
  for (const iface of Object.values(nets)) {
    rx += iface.rx_bytes || 0;
    tx += iface.tx_bytes || 0;
  }
  return { rx, tx };
}

// ── Block I/O ─────────────────────────────────────────────────────
function calcBlockIO(stats) {
  const blk = stats.blkio_stats?.io_service_bytes_recursive || [];
  let read = 0, write = 0;
  for (const entry of blk) {
    if (entry.op === 'Read' || entry.op === 'read')   read  += entry.value || 0;
    if (entry.op === 'Write' || entry.op === 'write') write += entry.value || 0;
  }
  return { read, write };
}

// ── Container list ────────────────────────────────────────────────
async function getContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.map(c => ({
    id:      c.Id,
    shortId: c.Id.slice(0, 12),
    name:    (c.Names[0] || '').replace(/^\//, ''),
    image:   c.Image,
    status:  c.Status,
    state:   c.State,
    created: c.Created,
    ports:   c.Ports,
    labels:  c.Labels,
  }));
}

// ── Single container stats (one-shot) ─────────────────────────────
async function getContainerStats(id) {
  const container = docker.getContainer(id);
  const stats = await container.stats({ stream: false });
  const cpu  = calcCpuPercent(stats);
  const mem  = calcMemUsage(stats);
  const net  = calcNetIO(stats);
  const blk  = calcBlockIO(stats);
  const pids = stats.pids_stats?.current || 0;
  return { cpu, mem, net, blk, pids };
}

// ── Stream stats (calls callback every ~1s) ───────────────────────
function streamContainerStats(id, onData, onEnd) {
  const container = docker.getContainer(id);
  let destroyed = false;
  let streamRef = null;

  container.stats({ stream: true }, (err, stream) => {
    if (err || destroyed) { onEnd?.(); return; }
    streamRef = stream;
    stream.on('data', chunk => {
      try {
        const raw  = JSON.parse(chunk.toString());
        const cpu  = calcCpuPercent(raw);
        const mem  = calcMemUsage(raw);
        const net  = calcNetIO(raw);
        const blk  = calcBlockIO(raw);
        const pids = raw.pids_stats?.current || 0;
        onData({ cpu, mem, net, blk, pids, ts: Date.now() });
      } catch { /* ignore parse errors */ }
    });
    stream.on('end',   () => { if (!destroyed) onEnd?.(); });
    stream.on('error', () => { if (!destroyed) onEnd?.(); });
  });

  return {
    destroy() {
      destroyed = true;
      try { streamRef?.destroy(); } catch {}
    },
  };
}

// ── Container inspect (full details) ─────────────────────────────
async function inspectContainer(id) {
  const container = docker.getContainer(id);
  return container.inspect();
}

// ── Container logs (last N lines) ─────────────────────────────────
async function getContainerLogs(id, tail = 200) {
  const container = docker.getContainer(id);
  const logBuffer = await container.logs({
    stdout: true,
    stderr: true,
    timestamps: true,
    tail,
  });
  return parseDockerLogs(logBuffer);
}

// ── Stream container logs ─────────────────────────────────────────
function streamContainerLogs(id, onLine, onEnd) {
  const container = docker.getContainer(id);
  let streamRef = null;
  let destroyed = false;
  let buffer    = '';

  container.logs({ stdout: true, stderr: true, timestamps: true, follow: true, tail: 50 }, (err, stream) => {
    if (err || destroyed) { onEnd?.(); return; }
    streamRef = stream;

    // Docker log stream has an 8-byte header per frame
    stream.on('data', chunk => {
      buffer += chunk.toString('utf8', chunk.length > 8 ? 8 : 0);
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.trim()) {
          const parsed = parseLogLine(line);
          if (parsed) onLine(parsed);
        }
      }
    });
    stream.on('end',   () => { if (!destroyed) onEnd?.(); });
    stream.on('error', () => { if (!destroyed) onEnd?.(); });
  });

  return {
    destroy() {
      destroyed = true;
      try { streamRef?.destroy(); } catch {}
    },
  };
}

// ── Log parsing ───────────────────────────────────────────────────
function parseDockerLogs(rawBuffer) {
  // Docker multiplexed stream: 8-byte header + payload
  const lines = [];
  let offset = 0;
  while (offset < rawBuffer.length) {
    if (rawBuffer.length < offset + 8) break;
    const size = rawBuffer.readUInt32BE(offset + 4);
    offset += 8;
    if (size === 0) continue;
    const text = rawBuffer.slice(offset, offset + size).toString('utf8');
    offset += size;
    for (const line of text.split('\n')) {
      if (line.trim()) {
        const parsed = parseLogLine(line);
        if (parsed) lines.push(parsed);
      }
    }
  }
  return lines;
}

function parseLogLine(line) {
  // Docker log line format: <RFC3339 timestamp> <message>
  // e.g. "2024-01-01T12:00:00.000000000Z Some log message"
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)/);
  let timestamp, message;
  if (tsMatch) {
    timestamp = tsMatch[1];
    message   = tsMatch[2];
  } else {
    timestamp = new Date().toISOString();
    message   = line;
  }
  const level = detectLevel(message);
  return { timestamp, level, message: message.trim() };
}

function detectLevel(msg) {
  const m = msg.toLowerCase();
  if (/\berr(or)?\b|fatal|critical|exception|traceback/.test(m)) return 'ERROR';
  if (/\bwarn(ing)?\b/.test(m)) return 'WARN';
  if (/\bdebug\b/.test(m))      return 'DEBUG';
  return 'INFO';
}

// ── Host system info ──────────────────────────────────────────────
async function getHostInfo() {
  const info = await docker.info();
  const cpus  = os.cpus();
  const total = os.totalmem();
  const free  = os.freemem();

  return {
    hostname:          info.Name,
    dockerVersion:     info.ServerVersion,
    os:                `${info.OperatingSystem} (${info.KernelVersion})`,
    arch:              info.Architecture,
    cpuCount:          info.NCPU,
    cpuModel:          cpus[0]?.model || 'Unknown',
    memTotal:          total,
    memFree:           free,
    memUsed:           total - free,
    memPercent:        Math.round(((total - free) / total) * 100),
    uptime:            os.uptime(),
    containersTotal:   info.Containers,
    containersRunning: info.ContainersRunning,
    containersPaused:  info.ContainersPaused,
    containersStopped: info.ContainersStopped,
    images:            info.Images,
    storageDriver:     info.Driver,
  };
}

// ── Container actions ─────────────────────────────────────────────
async function startContainer(id) {
  const container = docker.getContainer(id);
  return container.start();
}

async function stopContainer(id) {
  const container = docker.getContainer(id);
  return container.stop();
}

async function restartContainer(id) {
  const container = docker.getContainer(id);
  return container.restart();
}

async function pauseContainer(id) {
  const container = docker.getContainer(id);
  return container.pause();
}

async function unpauseContainer(id) {
  const container = docker.getContainer(id);
  return container.unpause();
}

module.exports = {
  getContainers,
  getContainerStats,
  streamContainerStats,
  inspectContainer,
  getContainerLogs,
  streamContainerLogs,
  getHostInfo,
  ping,
  startContainer,
  stopContainer,
  restartContainer,
  pauseContainer,
  unpauseContainer,
};

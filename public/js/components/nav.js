/**
 * nav.js — Navigation, topbar clock, host status bar, Docker status
 */
import { state } from '../state.js';
import { api }   from '../api.js';

let clockTimer = null;

// ── Format helpers ────────────────────────────────────────────────
export function fmtBytes(bytes) {
  if (bytes == null) return '--';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

export function fmtSpeed(bytesPerSec) {
  if (bytesPerSec == null) return '--';
  if (bytesPerSec >= 1e9) return (bytesPerSec / 1e9).toFixed(1) + ' GB/s';
  if (bytesPerSec >= 1e6) return (bytesPerSec / 1e6).toFixed(1) + ' MB/s';
  if (bytesPerSec >= 1e3) return (bytesPerSec / 1e3).toFixed(1) + ' KB/s';
  return bytesPerSec + ' B/s';
}

export function fmtPct(v) {
  if (v == null) return '--';
  return v.toFixed(1) + '%';
}

export function fmtUptime(seconds) {
  if (!seconds) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0)  return `${d}d ${h}h`;
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtAge(created) {
  if (!created) return '--';
  const diff = Math.floor((Date.now() / 1000) - created);
  return fmtUptime(diff);
}

export function pctClass(v) {
  if (v >= 90) return 'error';
  if (v >= 75) return 'warn';
  return '';
}

export function stateClass(state) {
  const map = {
    running: 'running', exited: 'stopped', stopped: 'stopped',
    paused: 'paused', restarting: 'restarting', dead: 'error',
  };
  return map[state] || '';
}

// ── Clock ─────────────────────────────────────────────────────────
export function initClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;

  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  tick();
  clockTimer = setInterval(tick, 1000);
}

// ── User display ──────────────────────────────────────────────────
export function initUserDisplay(user) {
  const nameEl  = document.getElementById('user-name-display');
  const roleEl  = document.getElementById('user-role-badge');
  if (nameEl) nameEl.textContent = user.username.toUpperCase();
  if (roleEl) {
    roleEl.textContent = user.role.toUpperCase();
    if (user.role === 'guest') roleEl.classList.add('guest');
  }

  // Show/hide admin-only nav items
  const isAdmin = user.role === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
}

// ── Host status bar (topbar center) ──────────────────────────────
function renderHostStatusBar(host) {
  const el = document.getElementById('host-status-bar');
  if (!el) return;
  el.innerHTML = '';
}

// ── Docker status indicator ───────────────────────────────────────
export function setDockerStatus(ok) {
  const dot  = document.getElementById('docker-dot');
  const text = document.getElementById('docker-status-text');
  if (!dot || !text) return;
  dot.className  = `status-dot ${ok ? 'ok pulse' : 'error'}`;
  text.textContent = ok ? 'DOCKER OK' : 'DOCKER ERR';
}

// ── Mobile nav toggle ─────────────────────────────────────────────
export function initNavToggle() {
  const btn     = document.getElementById('nav-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!sidebar.contains(e.target) && !btn.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// ── Init all nav functionality ────────────────────────────────────
export function initNav(user) {
  initClock();
  initUserDisplay(user);
  initNavToggle();
  setDockerStatus(true);

  // Subscribe to host updates
  state.subscribe('host', host => {
    if (host) renderHostStatusBar(host);
  });
}

export function destroyNav() {
  if (clockTimer) clearInterval(clockTimer);
}

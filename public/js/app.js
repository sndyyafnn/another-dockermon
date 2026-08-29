/**
 * app.js — Application entry point
 * Handles: auth check → SSE → routing → nav
 */
import { api, createSSEClient } from './api.js';
import { state }                from './state.js';
import { registerPage, initRouter, handleRoute, navigate } from './router.js';
import { initNav, setDockerStatus, destroyNav } from './components/nav.js';

// ── Page imports ──────────────────────────────────────────────────
import { mountOverview }         from './pages/overview.js';
import { mountContainers }       from './pages/containers.js';
import { mountContainerDetail }  from './pages/container-detail.js';
import { mountLogs }             from './pages/logs.js';
import { mountSettings }         from './pages/settings.js';
import { mountGuestDashboard }   from './pages/guest-dashboard.js';

// ── Loading progress ──────────────────────────────────────────────
function setLoading(pct, text) {
  const bar  = document.getElementById('loading-bar-fill');
  const msg  = document.getElementById('loading-text');
  const screen = document.getElementById('loading-screen');
  if (bar) bar.style.width = pct + '%';
  if (msg) msg.textContent = text;
  if (pct >= 100 && screen) {
    setTimeout(() => screen.remove(), 300);
  }
}

// ── SSE connection ─────────────────────────────────────────────────
let sseClient = null;

function connectSSE(role) {
  const url = role === 'admin' ? '/api/admin/stream' : '/api/guest/stream';
  sseClient = createSSEClient(url, {
    onConnect:    () => {
      state.set('sseStatus', 'connected');
      setDockerStatus(true);
    },
    onDisconnect: () => {
      state.set('sseStatus', 'disconnected');
      setDockerStatus(false);
    },
    onContainers: (data) => {
      if (Array.isArray(data)) state.setContainers(data);
    },
    onHost: (data) => {
      if (data) state.set('host', data);
    },
    onStats: (data) => {
      if (data?.id) state.updateContainer({ id: data.id, stats: data });
    },
  });
}

// ── Register pages ────────────────────────────────────────────────
function registerPages(role) {
  if (role === 'admin') {
    registerPage('overview',          mountOverview);
    registerPage('containers',        mountContainers);
    registerPage('container-detail',  mountContainerDetail);
    registerPage('logs',              mountLogs);
    registerPage('settings',          mountSettings);
  } else {
    // Guest gets simplified routing
    registerPage('overview',          mountGuestDashboard);
    registerPage('containers',        mountGuestDashboard);
    registerPage('container-detail',  mountContainerDetail);
    registerPage('logs',              (c) => {
      c.innerHTML = `<div class="empty-state" style="padding:60px">
        <div class="empty-state-icon"><i class="ph ph-lock"></i></div>
        <div class="empty-state-title">RESTRICTED</div>
        <div class="empty-state-sub">Log access is managed per-container by the administrator.</div>
      </div>`;
    });
    registerPage('settings',          (c) => {
      c.innerHTML = `<div class="empty-state" style="padding:60px">
        <div class="empty-state-icon"><i class="ph ph-lock"></i></div>
        <div class="empty-state-title">ADMIN ONLY</div>
      </div>`;
    });
  }
}

// ── Boot sequence ─────────────────────────────────────────────────
async function boot() {
  setLoading(10, 'AUTHENTICATING...');

  let user;
  try {
    user = await api.me();
  } catch {
    window.location.href = '/login';
    return;
  }

  if (!user?.role) {
    window.location.href = '/login';
    return;
  }

  state.set('user', user);
  setLoading(30, 'CONNECTING TO DOCKER...');

  // Init nav
  initNav(user);

  setLoading(50, 'ESTABLISHING DATA STREAM...');

  // Connect SSE
  connectSSE(user.role);

  setLoading(70, 'LOADING MONITOR...');

  // Register pages based on role
  registerPages(user.role);

  // Set up router
  initRouter();

  setLoading(90, 'STARTING...');

  // Handle initial route
  // Default: admin → #overview, guest → #overview (guest dashboard)
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#overview';
  }

  await handleRoute();

  setLoading(100, 'READY');

  // ── Logout ──────────────────────────────────────────────────────
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    sseClient?.destroy();
    await api.logout();
    window.location.href = '/login';
  });

  // ── Nav link clicks ─────────────────────────────────────────────
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      // Close mobile sidebar on navigate
      document.getElementById('sidebar')?.classList.remove('open');
    });
  });

  // ── Guest: hide containers and logs nav links ────────────────────
  if (user.role === 'guest') {
    const containersNav = document.getElementById('nav-containers');
    if (containersNav) containersNav.closest('li').style.display = 'none';
    const logsNav = document.getElementById('nav-logs');
    if (logsNav) logsNav.closest('li').style.display = 'none';
  }
}

// ── Start ─────────────────────────────────────────────────────────
boot().catch(err => {
  console.error('[Boot] Fatal error:', err);
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.querySelector('.loading-text').textContent = 'BOOT ERROR: ' + err.message;
    screen.querySelector('.loading-text').style.color = 'var(--status-error)';
  }
});

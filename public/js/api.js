/**
 * api.js — Fetch wrapper + SSE client factory
 */

// ── Fetch wrapper ─────────────────────────────────────────────────
export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'same-origin',
  });

  if (res.status === 401) {
    // Session expired — redirect to login
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  me:     () => apiFetch('/api/auth/me'),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),

  // Admin
  admin: {
    host:       () => apiFetch('/api/admin/host'),
    containers: () => apiFetch('/api/admin/containers'),
    container:  (id) => apiFetch(`/api/admin/containers/${id}`),
    history:    (id, points = 60) => apiFetch(`/api/admin/containers/${id}/history?points=${points}`),
    logsSnap:   (id, tail = 200) => apiFetch(`/api/admin/containers/${id}/logs/snapshot?tail=${tail}`),
    visibility: () => apiFetch('/api/admin/visibility'),
    setVisibility: (id, body) => apiFetch(`/api/admin/visibility/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    setGuestPassword: (password) => apiFetch('/api/admin/settings/guest-password', { method: 'PUT', body: JSON.stringify({ password }) }),
  },

  // Guest
  guest: {
    host:       () => apiFetch('/api/guest/host'),
    containers: () => apiFetch('/api/guest/containers'),
    container:  (id) => apiFetch(`/api/guest/containers/${id}`),
    history:    (id, points = 60) => apiFetch(`/api/guest/containers/${id}/history?points=${points}`),
    logsSnap:   (id, tail = 100) => apiFetch(`/api/guest/containers/${id}/logs/snapshot?tail=${tail}`),
  },
};

// ── SSE client ────────────────────────────────────────────────────
export function createSSEClient(url, handlers = {}) {
  let es = null;
  let reconnectTimer = null;
  let destroyed = false;

  function connect() {
    if (destroyed) return;
    es = new EventSource(url, { withCredentials: true });

    es.addEventListener('open', () => {
      handlers.onConnect?.();
    });

    es.addEventListener('error', () => {
      es.close();
      if (!destroyed) {
        handlers.onDisconnect?.();
        reconnectTimer = setTimeout(connect, 3000);
      }
    });

    // Handle named events
    const events = ['containers', 'host', 'stats', 'end'];
    for (const evt of events) {
      es.addEventListener(evt, e => {
        try {
          const data = JSON.parse(e.data);
          handlers[`on${evt.charAt(0).toUpperCase() + evt.slice(1)}`]?.(data);
        } catch {}
      });
    }

    // Handle default message event (log lines)
    es.addEventListener('message', e => {
      try {
        const data = JSON.parse(e.data);
        handlers.onMessage?.(data);
      } catch {}
    });
  }

  connect();

  return {
    destroy() {
      destroyed = true;
      clearTimeout(reconnectTimer);
      es?.close();
    },
  };
}

// ── Log SSE helper ────────────────────────────────────────────────
export function streamLogs(role, containerId, onLine, onEnd) {
  const url = `/api/${role}/containers/${containerId}/logs`;
  const es = new EventSource(url, { withCredentials: true });

  es.addEventListener('message', e => {
    try { onLine(JSON.parse(e.data)); } catch {}
  });

  es.addEventListener('end', () => {
    es.close();
    onEnd?.();
  });

  es.addEventListener('error', () => {
    es.close();
    onEnd?.();
  });

  return { destroy: () => es.close() };
}

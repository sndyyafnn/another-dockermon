/**
 * guest-dashboard.js — Adaptive guest dashboard
 * Layout adapts based on number of visible containers:
 *   0: System status + no containers message
 *   1: Hero focus view
 *   2-4: Two-column grid with charts
 *   5-9: Three-column compact grid
 *   10+: Dense table view
 */
import { state }  from '../state.js';
import { api }    from '../api.js';
import { navigate } from '../router.js';
import { createOverviewChart, createSparkline } from '../charts.js';
import { fmtBytes, fmtPct, fmtUptime, pctClass, stateClass } from '../components/nav.js';

export async function mountGuestDashboard(container) {
  container.innerHTML = `
    <!-- Host metrics - always visible for guests -->
    <div id="gd-host-banner" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));background:var(--bg-surface);border-bottom:1px solid var(--border-normal)">
      ${skeleton(5)}
    </div>

    <!-- System status line -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-sm) var(--space-lg);background:var(--bg-raised);border-bottom:1px solid var(--border-dim)">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="status-dot ok pulse"></span>
        <span class="mono text-xs" style="letter-spacing:.2em;color:var(--status-ok)">SYSTEM OPERATIONAL</span>
      </div>
      <div class="mono text-xs dim" id="gd-last-update">AWAITING DATA...</div>
    </div>

    <!-- Adaptive container area -->
    <div id="gd-content" style="flex:1;overflow:auto">
      <div class="empty-state">
        <div class="empty-state-icon"><i class="ph ph-cube"></i></div>
        <div class="empty-state-title">CONNECTING TO MONITOR...</div>
      </div>
    </div>
  `;

  // ── Track chart instances to destroy on re-render ─────────────
  let chartInstances = [];
  let lastContainerCount = -1;
  const cleanups = [];

  // ── Subscribe to containers ─────────────────────────────────────
  const unsubContainers = state.subscribe('containers', containers => {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    const updateEl = document.getElementById('gd-last-update');
    if (updateEl) updateEl.textContent = `UPDATED ${now}`;

    const count = (containers || []).length;

    // Only re-render layout if count tier changes
    const tier = getTier(count);
    const lastTier = getTier(lastContainerCount);
    lastContainerCount = count;

    if (tier !== lastTier) {
      renderLayout(containers, tier);
    } else {
      updateValues(containers);
    }
  });
  cleanups.push(unsubContainers);

  // ── Subscribe to host ───────────────────────────────────────────
  const unsubHost = state.subscribe('host', host => {
    if (host) renderHostBanner(host);
  });
  cleanups.push(unsubHost);

  // ── Tier detection ──────────────────────────────────────────────
  function getTier(count) {
    if (count <= 0) return 'empty';
    if (count === 1) return 'single';
    if (count <= 4)  return 'few';
    if (count <= 9)  return 'medium';
    return 'dense';
  }

  // ── Full layout render ──────────────────────────────────────────
  function renderLayout(containers, tier) {
    // Destroy existing charts
    chartInstances.forEach(c => c?.destroy());
    chartInstances = [];

    const content = document.getElementById('gd-content');
    if (!content) return;

    if (!containers || containers.length === 0) {
      content.innerHTML = `
        <div class="empty-state" style="padding:60px">
          <div class="empty-state-icon"><i class="ph ph-cube"></i></div>
          <div class="empty-state-title">NO CONTAINERS ASSIGNED</div>
          <div class="empty-state-sub">The administrator has not exposed any containers for guest monitoring.</div>
        </div>
      `;
      return;
    }

    switch (tier) {
      case 'single':  renderSingle(content, containers[0]);  break;
      case 'few':     renderFew(content, containers);        break;
      case 'medium':  renderMedium(content, containers);     break;
      case 'dense':   renderDense(content, containers);      break;
    }
  }

  // ── Value-only update (same tier, containers not re-rendered) ───
  function updateValues(containers) {
    containers.forEach(c => {
      const s = c.stats;
      if (!s) return;

      // Update stat displays
      setInner(`gd-cpu-${c.id}`, fmtPct(s.cpu), pctClass(s.cpu));
      setInner(`gd-mem-${c.id}`, fmtPct(s.mem?.percent), pctClass(s.mem?.percent));
      setInner(`gd-rx-${c.id}`,  fmtBytes(s.net?.rx));
      setInner(`gd-tx-${c.id}`,  fmtBytes(s.net?.tx));
    });
  }

  // ── SINGLE container layout ─────────────────────────────────────
  function renderSingle(el, c) {
    el.innerHTML = `
      <div style="padding:var(--space-lg);display:grid;grid-template-columns:1fr 1.2fr;gap:var(--space-lg);height:100%">
        <div style="display:flex;flex-direction:column;gap:var(--space-lg)">
          <!-- Hero header -->
          <div style="border:1px solid var(--border-normal);padding:var(--space-lg);background:var(--bg-surface)">
            <div style="display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-md)">
              <span class="status-dot ${stateClass(c.state)} pulse"></span>
              <span class="mono" style="font-size:1.3rem;font-weight:700;color:var(--text-bright)">${c.name}</span>
              <span class="status-badge ${stateClass(c.state)}">${c.state}</span>
            </div>
            <div class="mono dim text-xs">${c.image}</div>
          </div>

          <!-- Big metrics -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border-dim)">
            <div class="detail-stat">
              <div class="detail-stat-label">CPU USAGE</div>
              <div class="detail-stat-value" id="gd-cpu-${c.id}">--</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-label">MEMORY</div>
              <div class="detail-stat-value" id="gd-mem-${c.id}" style="color:var(--status-warn);text-shadow:var(--glow-warn)">--</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-label">NET RX</div>
              <div class="detail-stat-value" id="gd-rx-${c.id}" style="font-size:1rem">--</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-label">NET TX</div>
              <div class="detail-stat-value" id="gd-tx-${c.id}" style="font-size:1rem">--</div>
            </div>
          </div>
        </div>

        <!-- Chart -->
        <div style="display:flex;flex-direction:column;gap:var(--space-md)">
          <div class="panel" style="flex:1">
            <div class="chart-header">
              <span class="chart-title">CPU + MEMORY USAGE</span>
            </div>
            <div class="chart-container" style="height:220px;padding:var(--space-sm)">
              <canvas id="gd-chart-${c.id}"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    // Init chart
    const canvas = document.getElementById(`gd-chart-${c.id}`);
    if (canvas) {
      loadHistory(c.id).then(h => {
        const chart = createOverviewChart(canvas, h);
        chartInstances.push(chart);
      });
    }
  }

  // ── FEW containers (2-4) ────────────────────────────────────────
  function renderFew(el, containers) {
    el.innerHTML = `<div class="guest-layout-few">${containers.map(c => guestCardHtml(c, true)).join('')}</div>`;
    containers.forEach(c => {
      loadHistory(c.id).then(h => {
        const canvas = document.getElementById(`gd-spark-${c.id}`);
        if (canvas) {
          const chart = createSparkline(canvas, h.cpu, '#39ff14');
          chartInstances.push(chart);
        }
      });
    });
  }

  // ── MEDIUM containers (5-9) ─────────────────────────────────────
  function renderMedium(el, containers) {
    el.innerHTML = `<div class="guest-layout-medium">${containers.map(c => guestCardHtml(c, true)).join('')}</div>`;
    containers.forEach(c => {
      loadHistory(c.id).then(h => {
        const canvas = document.getElementById(`gd-spark-${c.id}`);
        if (canvas) {
          const chart = createSparkline(canvas, h.cpu, '#39ff14');
          chartInstances.push(chart);
        }
      });
    });
  }

  // ── DENSE containers (10+) ──────────────────────────────────────
  function renderDense(el, containers) {
    el.innerHTML = `
      <div class="guest-layout-dense">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">CONTAINER MONITOR (${containers.length})</span></div>
          <div style="overflow:auto">
            <table class="container-table">
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>STATE</th>
                  <th>CPU</th>
                  <th>MEMORY</th>
                  <th>NET RX/TX</th>
                </tr>
              </thead>
              <tbody>
                ${containers.map(c => {
                  const s = c.stats;
                  return `
                    <tr data-id="${c.id}">
                      <td class="col-name">${c.name}</td>
                      <td><span class="status-badge ${stateClass(c.state)}">${c.state}</span></td>
                      <td class="col-metric" id="gd-cpu-${c.id}">${s ? fmtPct(s.cpu) : '--'}</td>
                      <td class="col-metric" id="gd-mem-${c.id}">${s ? fmtPct(s.mem?.percent) : '--'}</td>
                      <td class="mono dim text-xs" id="gd-rx-${c.id}">${s ? fmtBytes(s.net?.rx) + ' / ' + fmtBytes(s.net?.tx) : '--'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ── Guest card HTML ─────────────────────────────────────────────
  function guestCardHtml(c, showSpark) {
    const s = c.stats;
    return `
      <div class="guest-card">
        <div class="guest-card-header">
          <span class="guest-card-name">${c.name}</span>
          <span class="status-badge ${stateClass(c.state)}">${c.state}</span>
        </div>
        <div class="guest-card-body">
          <div class="guest-card-metric">
            <div class="guest-card-metric-label">CPU</div>
            <div class="guest-card-metric-value" id="gd-cpu-${c.id}">${s ? fmtPct(s.cpu) : '--'}</div>
          </div>
          <div class="guest-card-metric">
            <div class="guest-card-metric-label">MEM</div>
            <div class="guest-card-metric-value" style="color:var(--status-warn)" id="gd-mem-${c.id}">${s ? fmtPct(s.mem?.percent) : '--'}</div>
          </div>
          <div class="guest-card-metric">
            <div class="guest-card-metric-label">NET RX</div>
            <div class="guest-card-metric-value" style="font-size:.85rem" id="gd-rx-${c.id}">${s ? fmtBytes(s.net?.rx) : '--'}</div>
          </div>
          <div class="guest-card-metric">
            <div class="guest-card-metric-label">NET TX</div>
            <div class="guest-card-metric-value" style="font-size:.85rem" id="gd-tx-${c.id}">${s ? fmtBytes(s.net?.tx) : '--'}</div>
          </div>
        </div>
        ${showSpark ? `
        <div style="padding:0 var(--space-md) var(--space-sm)">
          <div class="sparkline-wrap">
            <canvas id="gd-spark-${c.id}" height="50"></canvas>
          </div>
        </div>` : ''}
        <div style="border-top:1px solid var(--border-dim);padding:var(--space-xs) var(--space-md)">
          <div class="mono dim text-xs">${c.image}</div>
        </div>
      </div>
    `;
  }

  // ── Render host banner ──────────────────────────────────────────
  function renderHostBanner(host) {
    const el = document.getElementById('gd-host-banner');
    if (!el) return;
    const memCls = pctClass(host.memPercent || 0);
    el.innerHTML = `
      <div class="host-banner-item"><div class="host-banner-label">MEMORY</div><div class="host-banner-value ${memCls}">${fmtPct(host.memPercent)}</div><div class="host-banner-sub">${fmtBytes(host.memUsed)} / ${fmtBytes(host.memTotal)}</div></div>
      <div class="host-banner-item"><div class="host-banner-label">UPTIME</div><div class="host-banner-value">${fmtUptime(host.uptime)}</div></div>
      <div class="host-banner-item"><div class="host-banner-label">RUNNING</div><div class="host-banner-value">${host.containersRunning ?? '--'}</div></div>
      <div class="host-banner-item"><div class="host-banner-label">STOPPED</div><div class="host-banner-value" style="color:var(--status-idle)">${host.containersStopped ?? '--'}</div></div>
      <div class="host-banner-item"><div class="host-banner-label">CPU CORES</div><div class="host-banner-value">${host.cpuCount ?? '--'}</div></div>
    `;
  }

  // ── Helpers ─────────────────────────────────────────────────────
  function setInner(id, val, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (cls !== undefined) el.className = `guest-card-metric-value ${cls || ''}`;
  }

  async function loadHistory(id) {
    try {
      return await api.guest.history(id, 60);
    } catch {
      return { ts: [], cpu: [], mem: [], netRx: [], netTx: [] };
    }
  }

  function skeleton(count) {
    return Array.from({ length: count }, (_, i) => `
      <div class="host-banner-item">
        <div class="host-banner-label">--</div>
        <div class="host-banner-value" style="color:var(--text-ghost)">--</div>
      </div>
    `).join('');
  }

  return () => {
    cleanups.forEach(fn => fn?.());
    chartInstances.forEach(c => c?.destroy());
  };
}

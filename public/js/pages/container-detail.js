/**
 * container-detail.js — Container detail view (admin + guest)
 */
import { state }  from '../state.js';
import { api }    from '../api.js';
import { streamLogs } from '../api.js';
import { createCpuChart, createMemChart, createNetChart, updateChart, updateDualChart, sliceHistory, TIME_RANGES } from '../charts.js';
import { createLogViewer } from '../components/log-viewer.js';
import { fmtBytes, fmtPct, fmtUptime, fmtAge, pctClass, stateClass } from '../components/nav.js';

export async function mountContainerDetail(container, { id }) {
  if (!id) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">NO CONTAINER SELECTED</div></div>`;
    return;
  }

  const role = state.get('user')?.role || 'admin';

  container.innerHTML = `
    <div class="container-detail-header" id="cd-header">
      <div class="container-detail-name" id="cd-name">
        <span class="status-dot idle" id="cd-dot"></span>
        <span id="cd-name-text">Loading...</span>
      </div>
      <div class="container-detail-meta" id="cd-meta">
        <span><span class="dim">ID:</span> <span id="cd-id" class="mono">${id.slice(0,12)}</span></span>
        <span><span class="dim">IMAGE:</span> <span id="cd-image" class="mono">--</span></span>
        <span><span class="dim">AGE:</span> <span id="cd-age">--</span></span>
        <span><span class="dim">RESTARTS:</span> <span id="cd-restarts">--</span></span>
      </div>
    </div>

    <!-- Live stats row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;background:var(--border-dim)">
      ${statBlock('CPU', 'cd-cpu', '%')}
      ${statBlock('MEMORY', 'cd-mem', '%')}
      ${statBlock('MEM USED', 'cd-mem-used', '')}
      ${statBlock('NET RX', 'cd-rx', '')}
      ${statBlock('NET TX', 'cd-tx', '')}
      ${statBlock('BLK READ', 'cd-blk-r', '')}
      ${statBlock('BLK WRITE', 'cd-blk-w', '')}
      ${statBlock('PIDS', 'cd-pids', '')}
    </div>

    <!-- Charts + logs -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);padding:var(--space-md);flex:1;min-height:0">

      <!-- Charts column -->
      <div style="display:flex;flex-direction:column;gap:var(--space-md);min-height:0">

        <!-- Time range selector -->
        <div style="display:flex;align-items:center;justify-content:flex-end">
          <div class="time-range-selector" id="cd-time-range">
            ${TIME_RANGES.map((r, i) => `
              <button class="time-range-btn ${i === 0 ? 'active' : ''}" data-seconds="${r.seconds}">${r.label}</button>
            `).join('')}
          </div>
        </div>

        <div class="panel">
          <div class="chart-header">
            <span class="chart-title">CPU USAGE</span>
            <span class="chart-current-value" id="cd-cpu-chart-val">--%</span>
          </div>
          <div class="chart-container" style="height:130px;padding:var(--space-sm)">
            <canvas id="cd-cpu-chart"></canvas>
          </div>
        </div>

        <div class="panel">
          <div class="chart-header">
            <span class="chart-title">MEMORY USAGE</span>
            <span class="chart-current-value" style="color:var(--status-warn);text-shadow:var(--glow-warn)" id="cd-mem-chart-val">--%</span>
          </div>
          <div class="chart-container" style="height:130px;padding:var(--space-sm)">
            <canvas id="cd-mem-chart"></canvas>
          </div>
        </div>

        <div class="panel">
          <div class="chart-header">
            <span class="chart-title">NETWORK I/O</span>
          </div>
          <div class="chart-container" style="height:130px;padding:var(--space-sm)">
            <canvas id="cd-net-chart"></canvas>
          </div>
        </div>
      </div>

      <!-- Logs column -->
      <div style="display:flex;flex-direction:column;gap:var(--space-sm);height:100%;max-height:100%;overflow:hidden">
        <div class="section-header" style="margin-bottom:0">
          <span class="section-title">// CONTAINER LOGS</span>
          <span class="mono dim text-xs" id="cd-log-status">CONNECTING...</span>
        </div>
        <div id="cd-log-viewer" style="flex:1;min-height:0;overflow:hidden"></div>
      </div>
    </div>
  `;

  // ── Init charts ───────────────────────────────────────────────
  let cpuChart = null, memChart = null, netChart = null;
  let history  = { ts: [], cpu: [], mem: [], netRx: [], netTx: [] };
  let activeSeconds = TIME_RANGES[0].seconds;
  let logStream = null;
  const cleanups = [];

  const cpuCanvas = document.getElementById('cd-cpu-chart');
  const memCanvas = document.getElementById('cd-mem-chart');
  const netCanvas = document.getElementById('cd-net-chart');

  if (cpuCanvas) cpuChart = createCpuChart(cpuCanvas, history);
  if (memCanvas) memChart = createMemChart(memCanvas, history);
  if (netCanvas) netChart = createNetChart(netCanvas, history);

  // ── Init log viewer ───────────────────────────────────────────
  const logViewer = createLogViewer('cd-log-viewer', { maxLines: 300 });

  // ── Fetch history ─────────────────────────────────────────────
  try {
    const h = await api[role].history(id, 180);
    if (h && h.ts) history = h;
    redrawCharts();
  } catch { /* no history yet */ }

  // ── Load initial logs ─────────────────────────────────────────
  try {
    const logs = await api[role].logsSnap(id);
    if (logs?.length) {
      logViewer?.addLines(logs);
      document.getElementById('cd-log-status').textContent = `${logs.length} LINES`;
    }
  } catch (err) {
    logViewer?.setStatus(`LOGS UNAVAILABLE: ${err.message}`);
    document.getElementById('cd-log-status').textContent = 'UNAVAILABLE';
  }

  // ── Stream live logs ──────────────────────────────────────────
  try {
    logStream = streamLogs(role, id,
      line => {
        logViewer?.addLine(line);
        document.getElementById('cd-log-status').textContent = 'LIVE';
      },
      () => {
        document.getElementById('cd-log-status').textContent = 'STREAM ENDED';
      }
    );
  } catch { /* guest may not have log access */ }

  // ── Subscribe to live container stats ─────────────────────────
  const unsubContainers = state.subscribe('containers', containers => {
    const c = containers.find(x => x.id === id);
    if (!c) return;
    updateHeader(c);
    if (c.stats) {
      updateStats(c.stats);
      history.ts.push(c.stats.ts || Date.now());
      history.cpu.push(c.stats.cpu ?? 0);
      history.mem.push(c.stats.mem?.percent ?? 0);
      history.netRx.push(c.stats.net?.rx ?? 0);
      history.netTx.push(c.stats.net?.tx ?? 0);
      if (history.ts.length > 3600) { // trim
        ['ts','cpu','mem','netRx','netTx'].forEach(k => history[k].shift());
      }
      redrawCharts();
    }
  });
  cleanups.push(unsubContainers);

  // ── Time range selector ───────────────────────────────────────
  document.getElementById('cd-time-range')?.querySelectorAll('.time-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSeconds = parseInt(btn.dataset.seconds);
      document.querySelectorAll('.time-range-btn').forEach(b => b.classList.toggle('active', b === btn));
      redrawCharts();
    });
  });

  // ── Helpers ───────────────────────────────────────────────────
  function updateHeader(c) {
    const dot = document.getElementById('cd-dot');
    if (dot) dot.className = `status-dot ${stateClass(c.state)} pulse`;
    setText('cd-name-text', c.name);
    setText('cd-image', c.image);
    setText('cd-age', fmtAge(c.created));
  }

  function updateStats(s) {
    setValue('cd-cpu',    s.cpu?.toFixed(1) ?? '--', '%', pctClass(s.cpu));
    setValue('cd-mem',    s.mem?.percent?.toFixed(1) ?? '--', '%', pctClass(s.mem?.percent));
    setValue('cd-mem-used', fmtBytes(s.mem?.used), '');
    setValue('cd-rx',   fmtBytes(s.net?.rx), '');
    setValue('cd-tx',   fmtBytes(s.net?.tx), '');
    setValue('cd-blk-r', fmtBytes(s.blk?.read), '');
    setValue('cd-blk-w', fmtBytes(s.blk?.write), '');
    setValue('cd-pids',  s.pids ?? '--', '');

    setText('cd-cpu-chart-val', fmtPct(s.cpu));
    setText('cd-mem-chart-val', fmtPct(s.mem?.percent));
  }

  function redrawCharts() {
    const sliced = sliceHistory(history, activeSeconds);
    if (cpuChart) {
      const data = sliced.ts.map((t, i) => ({ x: t, y: sliced.cpu[i] }));
      cpuChart.data.datasets[0].data = data;
      cpuChart.update('none');
    }
    if (memChart) {
      const data = sliced.ts.map((t, i) => ({ x: t, y: sliced.mem[i] }));
      memChart.data.datasets[0].data = data;
      memChart.update('none');
    }
    if (netChart) {
      netChart.data.datasets[0].data = sliced.ts.map((t, i) => ({ x: t, y: sliced.netRx[i] / 1024 }));
      netChart.data.datasets[1].data = sliced.ts.map((t, i) => ({ x: t, y: sliced.netTx[i] / 1024 }));
      netChart.update('none');
    }
  }

  function setValue(id, val, suffix, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val + (suffix || '');
    if (cls !== undefined) {
      el.className = `detail-stat-value ${cls || ''}`;
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '--';
  }

  // ── Load initial container info ───────────────────────────────
  const existing = state.get('containers').find(c => c.id === id);
  if (existing) updateHeader(existing);

  return () => {
    cleanups.forEach(fn => fn?.());
    logStream?.destroy();
    cpuChart?.destroy();
    memChart?.destroy();
    netChart?.destroy();
  };
}

function statBlock(label, id, suffix) {
  return `
    <div class="detail-stat">
      <div class="detail-stat-label">${label}</div>
      <div class="detail-stat-value" id="${id}">--${suffix}</div>
    </div>
  `;
}

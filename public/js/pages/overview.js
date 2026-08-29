/**
 * overview.js — Admin overview page
 */
import { state }  from '../state.js';
import { api }    from '../api.js';
import { navigate } from '../router.js';
import { createCpuChart, createMemChart, createOverviewChart, createDoughnutChart, createSparkline } from '../charts.js';
import { fmtBytes, fmtPct, fmtUptime, fmtAge, pctClass, stateClass } from '../components/nav.js';

export async function mountOverview(container) {
  container.innerHTML = `
    <!-- Host Metrics Banner -->
    <div class="host-banner" id="ov-host-banner">
      ${hostBannerSkeleton()}
    </div>

    <!-- Page content -->
    <div class="overview-grid" style="flex:1;min-height:0">
      <!-- Left: containers table + chart -->
      <div class="overview-main">
        <!-- Container summary row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border-dim)">
          ${summaryBlock('RUNNING',   'ov-cnt-running',  'ok')}
          ${summaryBlock('STOPPED',   'ov-cnt-stopped',  'idle')}
          ${summaryBlock('RESTARTING','ov-cnt-restart',  'warn')}
          ${summaryBlock('IMAGES',    'ov-cnt-images',   '')}
        </div>

        <!-- Containers table panel -->
        <div class="panel" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
          <div class="panel-header">
            <span class="panel-title">
              <span class="status-dot ok pulse"></span>
              CONTAINERS LIST
            </span>
            <div class="filter-bar" style="border:none;padding:0;background:transparent">
              <button class="filter-chip active" data-filter="all">ALL</button>
              <button class="filter-chip" data-filter="running">RUNNING</button>
              <button class="filter-chip" data-filter="stopped">STOPPED</button>
              <input class="filter-search" id="ov-search" placeholder="search...">
            </div>
          </div>
          <div style="overflow:auto;flex:1">
            <table class="container-table" id="ov-table">
              <thead>
                <tr>
                  <th class="sortable-th" data-sort="name" style="cursor:pointer;user-select:none">NAME <span class="sort-icon">▲</span></th>
                  <th class="sortable-th" data-sort="state" style="cursor:pointer;user-select:none">STATUS <span class="sort-icon"></span></th>
                  <th class="sortable-th" data-sort="cpu" style="cursor:pointer;user-select:none">CPU <span class="sort-icon"></span></th>
                  <th class="sortable-th" data-sort="mem" style="cursor:pointer;user-select:none">MEM <span class="sort-icon"></span></th>
                  <th class="sortable-th" data-sort="net" style="cursor:pointer;user-select:none">NET RX/TX <span class="sort-icon"></span></th>
                  <th class="sortable-th" data-sort="pids" style="cursor:pointer;user-select:none">PIDS <span class="sort-icon"></span></th>
                  <th class="sortable-th" data-sort="age" style="cursor:pointer;user-select:none">AGE <span class="sort-icon"></span></th>
                </tr>
              </thead>
              <tbody id="ov-tbody">
                <tr><td colspan="7" class="log-empty">LOADING CONTAINERS...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Right: system info + donut charts -->
      <div class="overview-side">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">HOST SYSTEM</span></div>
          <div class="panel-body" id="ov-host-detail" style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-normal)">
            <div class="mono dim">CONNECTING...</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">MEMORY ALLOCATION</span>
            <span class="mono text-xs" id="ov-mem-pct" style="color:var(--green-normal)">--%</span>
          </div>
          <div class="panel-body" style="padding:var(--space-sm);height:140px">
            <canvas id="ov-mem-pie-chart"></canvas>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">CONTAINER STATUS RATIO</span>
          </div>
          <div class="panel-body" style="padding:var(--space-sm);height:140px">
            <canvas id="ov-status-pie-chart"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── State ───────────────────────────────────────────────────────
  let filter = 'all';
  let search = '';
  let sortField = 'cpu';
  let sortDir = 'desc'; // default sort highest CPU first
  let memPieChart = null;
  let statusPieChart = null;
  const cleanups = [];

  // ── Init Donut Charts ───────────────────────────────────────────
  const memPieCanvas = document.getElementById('ov-mem-pie-chart');
  if (memPieCanvas) {
    memPieChart = createDoughnutChart(
      memPieCanvas,
      ['Used', 'Free'],
      [0, 100],
      ['#39ff14', '#182a18']
    );
  }

  const statusPieCanvas = document.getElementById('ov-status-pie-chart');
  if (statusPieCanvas) {
    statusPieChart = createDoughnutChart(
      statusPieCanvas,
      ['Running', 'Stopped', 'Other'],
      [0, 0, 0],
      ['#1acc55', '#4a5f4a', '#d4a827']
    );
  }

  // ── Subscribe to containers ─────────────────────────────────────
  const unsubContainers = state.subscribe('containers', containers => {
    renderTable(containers);
    renderSummary(containers);
    updateStatusPieChart(containers);
  });
  cleanups.push(unsubContainers);

  // ── Subscribe to host ───────────────────────────────────────────
  const unsubHost = state.subscribe('host', host => {
    if (!host) return;
    renderHostBanner(host);
    renderHostDetail(host);
    updateMemPieChart(host);
  });
  cleanups.push(unsubHost);

  // ── Filter chips ────────────────────────────────────────────────
  container.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      container.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
      renderTable(state.get('containers'));
    });
  });

  const searchInput = document.getElementById('ov-search');
  searchInput?.addEventListener('input', () => {
    search = searchInput.value.toLowerCase();
    renderTable(state.get('containers'));
  });

  // ── Sort header clicks ──────────────────────────────────────────
  container.querySelectorAll('.sortable-th').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortField = field;
        sortDir = (field === 'name' || field === 'state') ? 'asc' : 'desc';
      }
      updateSortHeaders();
      renderTable(state.get('containers'));
    });
  });

  function updateSortHeaders() {
    container.querySelectorAll('.sortable-th').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      if (th.dataset.sort === sortField) {
        icon.textContent = sortDir === 'asc' ? '▲' : '▼';
        th.style.color = 'var(--green-bright)';
      } else {
        icon.textContent = '';
        th.style.color = 'var(--text-dim)';
      }
    });
  }

  updateSortHeaders();

  // ── Render functions ────────────────────────────────────────────
  function renderTable(containers) {
    const tbody = document.getElementById('ov-tbody');
    if (!tbody) return;

    let filtered = containers || [];
    if (filter !== 'all') filtered = filtered.filter(c => c.state === filter);
    if (search) filtered = filtered.filter(c => c.name.toLowerCase().includes(search) || c.image.toLowerCase().includes(search));

    // Sort containers
    filtered = [...filtered].sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'name':
          valA = a.name.toLowerCase(); valB = b.name.toLowerCase();
          break;
        case 'state':
          valA = a.state; valB = b.state;
          break;
        case 'cpu':
          valA = a.stats?.cpu ?? -1; valB = b.stats?.cpu ?? -1;
          break;
        case 'mem':
          valA = a.stats?.mem?.percent ?? -1; valB = b.stats?.mem?.percent ?? -1;
          break;
        case 'net':
          valA = (a.stats?.net?.rx || 0) + (a.stats?.net?.tx || 0);
          valB = (b.stats?.net?.rx || 0) + (b.stats?.net?.tx || 0);
          break;
        case 'pids':
          valA = a.stats?.pids ?? -1; valB = b.stats?.pids ?? -1;
          break;
        case 'age':
          valA = a.created ?? 0; valB = b.created ?? 0;
          break;
        default:
          valA = a.name; valB = b.name;
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="log-empty">NO CONTAINERS MATCH FILTER</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const s      = c.stats;
      const cpu    = s?.cpu?.toFixed(1) ?? '--';
      const mem    = s?.mem?.percent?.toFixed(1) ?? '--';
      const netRx  = fmtBytes(s?.net?.rx);
      const netTx  = fmtBytes(s?.net?.tx);
      const pids   = s?.pids ?? '--';
      const cpuCls = s ? pctClass(s.cpu) : '';
      const memCls = s ? pctClass(s.mem?.percent) : '';
      const sCls   = stateClass(c.state);

      return `
        <tr data-id="${c.id}">
          <td class="col-name">
            ${c.name}
            <span class="short-id">${c.shortId}</span>
          </td>
          <td><span class="status-badge ${sCls}">${c.state}</span></td>
          <td class="col-metric ${cpuCls}">${cpu}%</td>
          <td class="col-metric ${memCls}">${mem}%</td>
          <td class="col-metric mono dim text-xs">${netRx} / ${netTx}</td>
          <td class="col-metric mono dim">${pids}</td>
          <td class="col-metric mono dim">${fmtAge(c.created)}</td>
        </tr>
      `;
    }).join('');

    // Click to navigate to detail
    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => navigate('container-detail', { id: row.dataset.id }));
    });
  }

  function renderSummary(containers) {
    const running   = containers.filter(c => c.state === 'running').length;
    const stopped   = containers.filter(c => c.state === 'exited' || c.state === 'stopped').length;
    const restarting = containers.filter(c => c.state === 'restarting').length;

    setText('ov-cnt-running', running);
    setText('ov-cnt-stopped', stopped);
    setText('ov-cnt-restart', restarting);
  }

  function renderHostBanner(host) {
    const el = document.getElementById('ov-host-banner');
    if (!el) return;
    const memCls = pctClass(host.memPercent || 0);
    el.innerHTML = `
      <div class="host-banner-item"><div class="host-banner-label">HOSTNAME</div><div class="host-banner-value small" style="font-size:.85rem">${host.hostname || '--'}</div></div>
      <div class="host-banner-item"><div class="host-banner-label">MEMORY</div><div class="host-banner-value ${memCls}">${fmtPct(host.memPercent)}</div><div class="host-banner-sub">${fmtBytes(host.memUsed)} / ${fmtBytes(host.memTotal)}</div></div>
      <div class="host-banner-item"><div class="host-banner-label">UPTIME</div><div class="host-banner-value">${fmtUptime(host.uptime)}</div></div>
      <div class="host-banner-item"><div class="host-banner-label">CONTAINERS</div><div class="host-banner-value">${host.containersTotal ?? '--'}</div><div class="host-banner-sub">${host.containersRunning ?? 0} RUNNING</div></div>
      <div class="host-banner-item"><div class="host-banner-label">CPU CORES</div><div class="host-banner-value">${host.cpuCount ?? '--'}</div></div>
    `;
  }

  function renderHostDetail(host) {
    const el = document.getElementById('ov-host-detail');
    if (!el) return;
    const rows = [
      ['HOSTNAME',   host.hostname],
      ['OS',         host.os],
      ['ARCH',       host.arch],
      ['CPU CORES',  host.cpuCount],
      ['MEM TOTAL',  fmtBytes(host.memTotal)],
      ['MEM USED',   fmtBytes(host.memUsed)],
      ['UPTIME',     fmtUptime(host.uptime)],
      ['STORAGE DRV', host.storageDriver],
    ];
    el.innerHTML = rows.map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-dim)">
        <span style="color:var(--text-dim);letter-spacing:.15em;font-size:.65rem">${k}</span>
        <span style="color:var(--text-bright);font-size:.75rem">${v || '--'}</span>
      </div>
    `).join('');

    setText('ov-cnt-images', host.images ?? '--');
  }

  function updateMemPieChart(host) {
    if (!memPieChart) return;
    const usedGB = (host.memUsed / (1024 * 1024 * 1024)).toFixed(1);
    const freeGB = (host.memFree / (1024 * 1024 * 1024)).toFixed(1);
    memPieChart.data.datasets[0].data = [parseFloat(usedGB), parseFloat(freeGB)];
    memPieChart.update('none');

    const pctEl = document.getElementById('ov-mem-pct');
    if (pctEl) pctEl.textContent = fmtPct(host.memPercent);
  }

  function updateStatusPieChart(containers) {
    if (!statusPieChart || !containers) return;
    const running = containers.filter(c => c.state === 'running').length;
    const stopped = containers.filter(c => c.state === 'exited' || c.state === 'stopped').length;
    const other   = containers.length - running - stopped;

    statusPieChart.data.datasets[0].data = [running, stopped, Math.max(0, other)];
    statusPieChart.update('none');
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  return () => {
    cleanups.forEach(fn => fn?.());
    memPieChart?.destroy();
    statusPieChart?.destroy();
  };
}

function hostBannerSkeleton() {
  return ['HOSTNAME','MEMORY','UPTIME','CONTAINERS','CPU CORES'].map(label => `
    <div class="host-banner-item">
      <div class="host-banner-label">${label}</div>
      <div class="host-banner-value" style="color:var(--text-ghost)">--</div>
    </div>
  `).join('');
}

function summaryBlock(label, id, colorClass) {
  const colors = { ok: 'var(--status-ok)', idle: 'var(--status-idle)', warn: 'var(--status-warn)', '': 'var(--green-normal)' };
  return `
    <div style="background:var(--bg-surface);padding:var(--space-md)">
      <div class="metric-label">${label}</div>
      <div class="metric-value" id="${id}" style="font-size:2rem;color:${colors[colorClass] || 'var(--green-bright)'}">--</div>
    </div>
  `;
}

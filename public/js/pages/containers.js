/**
 * containers.js — Full container list page (admin)
 */
import { state }    from '../state.js';
import { navigate } from '../router.js';
import { fmtBytes, fmtPct, fmtAge, pctClass, stateClass } from '../components/nav.js';

export async function mountContainers(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><span class="page-title-accent">◈</span> CONTAINERS</div>
        <div class="page-subtitle" id="con-count">Loading...</div>
      </div>
    </div>

    <div class="filter-bar">
      <button class="filter-chip active" data-filter="all">ALL</button>
      <button class="filter-chip" data-filter="running">RUNNING</button>
      <button class="filter-chip" data-filter="exited">STOPPED</button>
      <button class="filter-chip" data-filter="paused">PAUSED</button>
      <input class="filter-search" id="con-search" placeholder="name or image...">
    </div>

    <div style="overflow:auto;flex:1">
      <table class="container-table" style="font-size:.8rem">
        <thead>
          <tr>
            <th style="width:200px">NAME</th>
            <th>IMAGE</th>
            <th>STATUS</th>
            <th>CPU</th>
            <th>MEM USAGE</th>
            <th>NET RX</th>
            <th>NET TX</th>
            <th>BLOCK R</th>
            <th>PIDS</th>
            <th>AGE</th>
          </tr>
        </thead>
        <tbody id="con-tbody">
          <tr><td colspan="10" class="log-empty">LOADING...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  let filter = 'all';
  let search = '';

  const unsubContainers = state.subscribe('containers', containers => {
    render(containers);
  });

  container.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      container.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
      render(state.get('containers'));
    });
  });

  document.getElementById('con-search')?.addEventListener('input', e => {
    search = e.target.value.toLowerCase();
    render(state.get('containers'));
  });

  function render(containers) {
    const tbody   = document.getElementById('con-tbody');
    const countEl = document.getElementById('con-count');
    if (!tbody) return;

    let filtered = containers || [];
    if (filter !== 'all') filtered = filtered.filter(c => c.state === filter || c.status.toLowerCase().includes(filter));
    if (search) filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.image.toLowerCase().includes(search) ||
      c.shortId.includes(search)
    );

    if (countEl) countEl.textContent = `${filtered.length} of ${(containers||[]).length} containers`;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="log-empty">NO CONTAINERS MATCH</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const s     = c.stats;
      const cpu   = s?.cpu?.toFixed(1) ?? '--';
      const memPct= s?.mem?.percent?.toFixed(1) ?? '--';
      const memUsed=s ? fmtBytes(s.mem.used) : '--';
      const rx    = s ? fmtBytes(s.net.rx) : '--';
      const tx    = s ? fmtBytes(s.net.tx) : '--';
      const blkR  = s ? fmtBytes(s.blk?.read) : '--';
      const pids  = s?.pids ?? '--';
      const sCls  = stateClass(c.state);
      const cCls  = s ? pctClass(s.cpu) : '';
      const mCls  = s ? pctClass(s.mem?.percent) : '';

      return `
        <tr data-id="${c.id}" title="Click for detail">
          <td class="col-name">
            <div>${c.name}</div>
            <div style="font-size:.6rem;color:var(--text-ghost)">${c.shortId}</div>
          </td>
          <td class="mono dim text-xs truncate" style="max-width:200px">${c.image}</td>
          <td><span class="status-badge ${sCls}">${c.state}</span></td>
          <td class="col-metric ${cCls}">${cpu}%</td>
          <td class="col-metric ${mCls}">${memPct}% <span class="dim">(${memUsed})</span></td>
          <td class="col-metric mono dim">${rx}</td>
          <td class="col-metric mono dim">${tx}</td>
          <td class="col-metric mono dim">${blkR}</td>
          <td class="col-metric">${pids}</td>
          <td class="col-metric mono dim">${fmtAge(c.created)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => navigate('container-detail', { id: row.dataset.id }));
    });
  }

  return () => unsubContainers?.();
}

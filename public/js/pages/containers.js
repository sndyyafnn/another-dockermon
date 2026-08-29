/**
 * containers.js — Full container list page (admin)
 */
import { state }    from '../state.js';
import { api }      from '../api.js';
import { navigate } from '../router.js';
import { showAlert } from '../components/modal.js';
import { fmtBytes, fmtPct, fmtAge, pctClass, stateClass } from '../components/nav.js';

export async function mountContainers(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><span class="page-title-accent">◈</span> CONTAINERS CONTROL</div>
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
            <th style="width:180px">NAME</th>
            <th>IMAGE</th>
            <th>STATUS</th>
            <th>CPU</th>
            <th>MEM USAGE</th>
            <th>NET RX/TX</th>
            <th>AGE</th>
            <th style="text-align:right;padding-right:16px">ACTIONS</th>
          </tr>
        </thead>
        <tbody id="con-tbody">
          <tr><td colspan="8" class="log-empty">LOADING...</td></tr>
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
      tbody.innerHTML = `<tr><td colspan="8" class="log-empty">NO CONTAINERS MATCH</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const s     = c.stats;
      const cpu   = s?.cpu?.toFixed(1) ?? '--';
      const memPct= s?.mem?.percent?.toFixed(1) ?? '--';
      const memUsed=s ? fmtBytes(s.mem.used) : '--';
      const rx    = s ? fmtBytes(s.net.rx) : '--';
      const tx    = s ? fmtBytes(s.net.tx) : '--';
      const sCls  = stateClass(c.state);
      const cCls  = s ? pctClass(s.cpu) : '';
      const mCls  = s ? pctClass(s.mem?.percent) : '';

      const isRunning = c.state === 'running';
      const isPaused  = c.state === 'paused';
      const isStopped = c.state === 'exited' || c.state === 'stopped';

      return `
        <tr data-id="${c.id}">
          <td class="col-name" style="cursor:pointer" title="Click for details">
            <div>${c.name}</div>
            <div style="font-size:.6rem;color:var(--text-ghost)">${c.shortId}</div>
          </td>
          <td class="mono dim text-xs truncate" style="max-width:180px">${c.image}</td>
          <td><span class="status-badge ${sCls}">${c.state}</span></td>
          <td class="col-metric ${cCls}">${cpu}%</td>
          <td class="col-metric ${mCls}">${memPct}% <span class="dim">(${memUsed})</span></td>
          <td class="col-metric mono dim">${rx} / ${tx}</td>
          <td class="col-metric mono dim">${fmtAge(c.created)}</td>
          <td style="text-align:right;padding-right:12px" onclick="event.stopPropagation()">
            <div style="display:inline-flex;gap:4px">
              ${isStopped ? `<button class="btn btn-sm btn-primary action-btn" data-id="${c.id}" data-action="start" title="Start Container"><i class="ph ph-play"></i> START</button>` : ''}
              ${isRunning ? `<button class="btn btn-sm btn-danger action-btn" data-id="${c.id}" data-action="stop" title="Stop Container"><i class="ph ph-stop"></i> STOP</button>` : ''}
              ${isRunning ? `<button class="btn btn-sm action-btn" data-id="${c.id}" data-action="restart" title="Restart Container"><i class="ph ph-arrow-counter-clockwise"></i> RESTART</button>` : ''}
              ${isRunning ? `<button class="btn btn-sm action-btn" data-id="${c.id}" data-action="pause" title="Pause Container"><i class="ph ph-pause"></i> PAUSE</button>` : ''}
              ${isPaused  ? `<button class="btn btn-sm btn-primary action-btn" data-id="${c.id}" data-action="unpause" title="Unpause Container"><i class="ph ph-play-pause"></i> UNPAUSE</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Click row for detail
    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', e => {
        if (!e.target.closest('.action-btn')) {
          navigate('container-detail', { id: row.dataset.id });
        }
      });
    });

    // Handle container action buttons
    tbody.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const { id, action } = btn.dataset;
        btn.disabled = true;
        btn.textContent = '...';

        try {
          await api.admin.containerAction(id, action);
          showAlert(`Container ${action} initiated successfully`, 'ok');
        } catch (err) {
          showAlert(`Failed to ${action} container: ${err.message}`, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  return () => unsubContainers?.();
}

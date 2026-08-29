/**
 * logs.js — Log viewer page (admin)
 */
import { state }  from '../state.js';
import { api }    from '../api.js';
import { streamLogs } from '../api.js';
import { createLogViewer } from '../components/log-viewer.js';

export async function mountLogs(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><span class="page-title-accent">◈</span> LOG MONITOR</div>
        <div class="page-subtitle">Real-time container log streaming</div>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-md)">
        <div class="field-group" style="margin:0">
          <select class="field-select" id="log-container-select">
            <option value="">-- SELECT CONTAINER --</option>
          </select>
        </div>
        <div class="mono text-xs dim" id="log-stream-status">IDLE</div>
      </div>
    </div>

    <div style="flex:1;display:flex;flex-direction:column;padding:var(--space-md);min-height:0;gap:var(--space-md)">
      <div id="log-viewer-wrap" style="flex:1;min-height:0;overflow:hidden">
        <div class="log-viewer" style="height:100%">
          <div class="log-body log-empty">SELECT A CONTAINER TO BEGIN LOG STREAMING</div>
        </div>
      </div>
    </div>
  `;

  let currentStream = null;
  let selectedId = null;
  const select = document.getElementById('log-container-select');

  // ── Populate container selector ─────────────────────────────────
  function populateSelect(containers) {
    const current = select?.value;
    if (!select) return;
    const opts = containers.map(c => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}>${c.name} (${c.state})</option>`);
    select.innerHTML = `<option value="">-- SELECT CONTAINER --</option>` + opts.join('');
  }

  const unsubContainers = state.subscribe('containers', containers => {
    populateSelect(containers || []);
  });

  // ── On container select ─────────────────────────────────────────
  select?.addEventListener('change', () => {
    const id = select.value;
    if (!id) return;
    startLogStream(id);
  });

  function startLogStream(id) {
    if (id === selectedId) return;
    selectedId = id;

    // Destroy old stream
    currentStream?.destroy();
    currentStream = null;

    const logViewer = createLogViewer('log-viewer-wrap', { maxLines: 500 });
    const statusEl  = document.getElementById('log-stream-status');

    // Load snapshot first
    api.admin.logsSnap(id, 200).then(logs => {
      if (logs?.length) logViewer.addLines(logs);
    }).catch(() => {});

    // Then start live stream
    logViewer.setStatus('CONNECTING TO LOG STREAM...');
    if (statusEl) statusEl.textContent = 'STREAMING';

    currentStream = streamLogs('admin', id,
      line => logViewer.addLine(line),
      () => {
        if (statusEl) statusEl.textContent = 'STREAM ENDED';
        logViewer.setStatus('STREAM ENDED — CONTAINER MAY HAVE STOPPED');
      }
    );
  }

  return () => {
    unsubContainers?.();
    currentStream?.destroy();
  };
}

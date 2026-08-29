/**
 * log-viewer.js — Terminal log viewer component
 */

export function createLogViewer(containerId, options = {}) {
  let   maxLinesLimit = options.maxLines || 25;
  const levels        = { INFO: true, WARN: true, ERROR: true, DEBUG: true };
  let   lines         = [];

  const root = document.getElementById(containerId);
  if (!root) return null;

  root.innerHTML = `
    <div class="log-viewer">
      <div class="log-toolbar">
        <span class="mono dim text-xs" style="letter-spacing:.15em;margin-right:4px;">TAIL:</span>
        <select class="field-select" id="${containerId}-limit" style="width:70px;padding:2px 6px;font-size:0.65rem;height:24px;margin-right:8px">
          <option value="10">10</option>
          <option value="25" selected>25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
        <span class="mono dim text-xs" style="letter-spacing:.15em;margin-right:4px;">FILTER:</span>
        <button class="log-filter-btn active info"  data-level="INFO">INFO</button>
        <button class="log-filter-btn active warn"  data-level="WARN">WARN</button>
        <button class="log-filter-btn active error" data-level="ERROR">ERROR</button>
        <button class="log-filter-btn active debug" data-level="DEBUG">DEBUG</button>
        <button class="btn btn-sm" id="${containerId}-clear" style="margin-left:auto">CLEAR</button>
      </div>
      <div class="log-body" id="${containerId}-body">
        <div class="log-empty">AWAITING LOG DATA...</div>
      </div>
    </div>
  `;

  const body     = root.querySelector(`#${containerId}-body`);
  const limitSelect = root.querySelector(`#${containerId}-limit`);
  const clearBtn  = root.querySelector(`#${containerId}-clear`);

  limitSelect?.addEventListener('change', e => {
    maxLinesLimit = parseInt(e.target.value) || 25;
    rerender();
  });

  // Filter buttons
  root.querySelectorAll('.log-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lvl = btn.dataset.level;
      levels[lvl] = !levels[lvl];
      btn.classList.toggle('active', levels[lvl]);
      rerender();
    });
  });

  // Auto-scroll toggle
  scrollBtn?.addEventListener('click', () => {
    autoScroll = !autoScroll;
    scrollBtn.classList.toggle('on', autoScroll);
    scrollBtn.innerHTML = `<i class="ph ph-arrow-line-down"></i> AUTO`;
  });

  // Clear
  clearBtn?.addEventListener('click', () => {
    lines = [];
    body.innerHTML = '<div class="log-empty">LOG CLEARED</div>';
  });

  function renderLine(line) {
    const ts  = new Date(line.timestamp).toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const div = document.createElement('div');
    div.className = `log-line ${line.level || 'INFO'}`;
    div.innerHTML = `
      <span class="log-ts">${ts}</span>
      <span class="log-level ${line.level || 'INFO'}">${(line.level || 'INFO').padEnd(5)}</span>
      <span class="log-msg">${escapeHtml(line.message || '')}</span>
    `;
    return div;
  }

  function rerender() {
    const visible = lines.filter(l => levels[l.level] !== false).slice(-maxLinesLimit);
    if (visible.length === 0) {
      body.innerHTML = '<div class="log-empty">NO MATCHING LOG ENTRIES</div>';
      return;
    }
    // Rebuild DOM efficiently — newest line at the top
    const frag = document.createDocumentFragment();
    [...visible].reverse().forEach(line => frag.appendChild(renderLine(line)));
    body.innerHTML = '';
    body.appendChild(frag);
    body.scrollTop = 0;
  }

  function addLine(line) {
    if (!line || !line.message) return;
    const empty = body.querySelector('.log-empty');
    if (empty) empty.remove();

    lines.push(line);
    if (lines.length > 500) lines.shift();

    rerender();
  }

  function addLines(lineArr) {
    if (!lineArr || !lineArr.length) return;
    lines = lineArr;
    rerender();
  }

  function setStatus(msg) {
    if (lines.length === 0) {
      body.innerHTML = `<div class="log-empty">${msg}</div>`;
    }
  }

  return { addLine, addLines, setStatus };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

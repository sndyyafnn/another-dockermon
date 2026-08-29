/**
 * log-viewer.js — Terminal log viewer component
 */

export function createLogViewer(containerId, options = {}) {
  const MAX_LINES    = options.maxLines    || 500;
  const levels       = { INFO: true, WARN: true, ERROR: true, DEBUG: true };
  let   autoScroll   = true;
  let   lines        = [];

  const root = document.getElementById(containerId);
  if (!root) return null;

  root.innerHTML = `
    <div class="log-viewer">
      <div class="log-toolbar">
        <span class="mono dim text-xs" style="letter-spacing:.15em;margin-right:4px;">FILTER:</span>
        <button class="log-filter-btn active info"  data-level="INFO">INFO</button>
        <button class="log-filter-btn active warn"  data-level="WARN">WARN</button>
        <button class="log-filter-btn active error" data-level="ERROR">ERROR</button>
        <button class="log-filter-btn active debug" data-level="DEBUG">DEBUG</button>
        <button class="log-autoscroll-btn on" id="${containerId}-scroll">
          <i class="ph ph-arrow-line-down"></i> AUTO
        </button>
        <button class="btn btn-sm" id="${containerId}-clear" style="margin-left:8px">CLEAR</button>
      </div>
      <div class="log-body" id="${containerId}-body">
        <div class="log-empty">AWAITING LOG DATA...</div>
      </div>
    </div>
  `;

  const body   = root.querySelector(`#${containerId}-body`);
  const scrollBtn = root.querySelector(`#${containerId}-scroll`);
  const clearBtn  = root.querySelector(`#${containerId}-clear`);

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

  // Stop auto-scroll on manual scroll up
  body.addEventListener('scroll', () => {
    const threshold = 30;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < threshold;
    if (!atBottom && autoScroll) {
      autoScroll = false;
      scrollBtn?.classList.remove('on');
    }
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
    const visible = lines.filter(l => levels[l.level] !== false);
    if (visible.length === 0) {
      body.innerHTML = '<div class="log-empty">NO MATCHING LOG ENTRIES</div>';
      return;
    }
    // Rebuild DOM efficiently
    const frag = document.createDocumentFragment();
    visible.forEach(line => frag.appendChild(renderLine(line)));
    body.innerHTML = '';
    body.appendChild(frag);
    if (autoScroll) body.scrollTop = body.scrollHeight;
  }

  function addLine(line) {
    if (!line || !line.message) return;
    // Remove empty state
    const empty = body.querySelector('.log-empty');
    if (empty) empty.remove();

    lines.push(line);
    if (lines.length > MAX_LINES) lines.shift();

    if (!levels[line.level]) return; // filtered out

    const el = renderLine(line);
    body.appendChild(el);

    if (autoScroll) {
      requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    }
  }

  function addLines(lineArr) {
    if (!lineArr || !lineArr.length) return;
    body.innerHTML = '';
    lines = lineArr.slice(-MAX_LINES);
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

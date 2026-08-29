/**
 * settings.js — Admin settings: guest visibility + guest password
 */
import { api }    from '../api.js';
import { state }  from '../state.js';
import { showAlert } from '../components/modal.js';

export async function mountSettings(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><span class="page-title-accent">◈</span> SETTINGS</div>
        <div class="page-subtitle">Guest access configuration</div>
      </div>
    </div>

    <div class="page-body">

      <!-- Guest Password -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">GUEST PASSWORD</span>
        </div>
        <div class="panel-body" style="max-width:500px">
          <p class="mono dim text-xs" style="margin-bottom:var(--space-md);line-height:1.8">
            The shared password guests use to authenticate.<br>
            Login: username = <span style="color:var(--green-normal)">guest</span>, password = configured below.
          </p>
          <div class="field-group">
            <label class="field-label">NEW GUEST PASSWORD</label>
            <div style="display:flex;gap:var(--space-sm)">
              <input class="field-input" id="guest-pw-input" type="password" placeholder="minimum 6 characters" autocomplete="new-password">
              <button class="btn btn-primary" id="guest-pw-save">SAVE</button>
            </div>
            <div class="mono dim text-xs" style="margin-top:6px" id="guest-pw-msg"></div>
          </div>
        </div>
      </div>

      <!-- Container Visibility -->
      <div class="panel" style="flex:1">
        <div class="panel-header">
          <span class="panel-title">GUEST CONTAINER VISIBILITY</span>
          <button class="btn btn-primary btn-sm" id="save-visibility">SAVE CHANGES</button>
        </div>
        <div style="overflow:auto">
          <table class="visibility-table" id="vis-table">
            <thead>
              <tr>
                <th>CONTAINER</th>
                <th>IMAGE</th>
                <th>STATE</th>
                <th style="text-align:center">GUEST VISIBLE</th>
                <th style="text-align:center">GUEST LOGS</th>
              </tr>
            </thead>
            <tbody id="vis-tbody">
              <tr><td colspan="5" class="log-empty">LOADING...</td></tr>
            </tbody>
          </table>
        </div>
        <div class="mono dim text-xs" style="padding:var(--space-sm) var(--space-md);border-top:1px solid var(--border-dim)">
          * Guest Logs requires Guest Visible to be enabled first.
        </div>
      </div>

    </div>
  `;

  // ── Visibility state ────────────────────────────────────────────
  const visibilityState = new Map(); // id -> { guestVisible, guestLogsVisible, name }
  let visData = [];

  async function loadVisibility() {
    try {
      visData = await api.admin.visibility();
      renderVisTable(visData);
    } catch (err) {
      document.getElementById('vis-tbody').innerHTML =
        `<tr><td colspan="5" class="log-empty">ERROR: ${err.message}</td></tr>`;
    }
  }

  function renderVisTable(items) {
    const tbody = document.getElementById('vis-tbody');
    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="log-empty">NO CONTAINERS FOUND — START DOCKER CONTAINERS FIRST</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(c => {
      visibilityState.set(c.id, {
        guestVisible:     !!c.guestVisible,
        guestLogsVisible: !!c.guestLogsVisible,
        name:             c.name,
      });

      const stateColor = c.state === 'running' ? 'var(--status-ok)' :
                         c.state === 'exited'  ? 'var(--status-idle)' : 'var(--status-warn)';

      return `
        <tr data-id="${c.id}">
          <td class="col-name">
            <div class="mono">${c.name}</div>
            <div class="mono dim text-xs">${c.shortId}</div>
          </td>
          <td class="mono dim text-xs truncate" style="max-width:200px">${c.image}</td>
          <td><span class="mono text-xs" style="color:${stateColor};letter-spacing:.1em">${c.state.toUpperCase()}</span></td>
          <td style="text-align:center">
            <label class="toggle">
              <input type="checkbox" class="vis-toggle" data-id="${c.id}" data-field="guestVisible"
                ${c.guestVisible ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </td>
          <td style="text-align:center">
            <label class="toggle">
              <input type="checkbox" class="logs-toggle" data-id="${c.id}" data-field="guestLogsVisible"
                ${c.guestLogsVisible ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </td>
        </tr>
      `;
    }).join('');

    // Track changes
    tbody.querySelectorAll('.vis-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const { id } = cb.dataset;
        const st = visibilityState.get(id);
        if (st) st.guestVisible = cb.checked;
        // If guest visible is turned off, also disable logs
        if (!cb.checked) {
          const logsCb = tbody.querySelector(`.logs-toggle[data-id="${id}"]`);
          if (logsCb) { logsCb.checked = false; const ls = visibilityState.get(id); if (ls) ls.guestLogsVisible = false; }
        }
      });
    });

    tbody.querySelectorAll('.logs-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const { id } = cb.dataset;
        const st = visibilityState.get(id);
        if (st) st.guestLogsVisible = cb.checked;
        // Auto-enable guest visible if logs are enabled
        if (cb.checked) {
          const visCb = tbody.querySelector(`.vis-toggle[data-id="${id}"]`);
          if (visCb && !visCb.checked) { visCb.checked = true; const vs = visibilityState.get(id); if (vs) vs.guestVisible = true; }
        }
      });
    });
  }

  // ── Save visibility ─────────────────────────────────────────────
  document.getElementById('save-visibility')?.addEventListener('click', async () => {
    const btn = document.getElementById('save-visibility');
    btn.textContent = 'SAVING...';
    btn.disabled = true;

    try {
      const saves = [];
      for (const [id, st] of visibilityState.entries()) {
        saves.push(api.admin.setVisibility(id, {
          guestVisible:     st.guestVisible,
          guestLogsVisible: st.guestLogsVisible,
          containerName:    st.name,
        }));
      }
      await Promise.all(saves);
      showAlert('Visibility settings saved', 'ok');
      await loadVisibility();
    } catch (err) {
      showAlert(`Save failed: ${err.message}`, 'error');
    } finally {
      btn.textContent = 'SAVE CHANGES';
      btn.disabled = false;
    }
  });

  // ── Guest password ─────────────────────────────────────────────
  document.getElementById('guest-pw-save')?.addEventListener('click', async () => {
    const input = document.getElementById('guest-pw-input');
    const msgEl = document.getElementById('guest-pw-msg');
    const pw = input?.value || '';

    if (pw.length < 6) {
      if (msgEl) { msgEl.textContent = 'PASSWORD MUST BE AT LEAST 6 CHARACTERS'; msgEl.style.color = 'var(--status-error)'; }
      return;
    }

    try {
      await api.admin.setGuestPassword(pw);
      if (msgEl) { msgEl.textContent = 'PASSWORD UPDATED SUCCESSFULLY'; msgEl.style.color = 'var(--status-ok)'; }
      input.value = '';
    } catch (err) {
      if (msgEl) { msgEl.textContent = `ERROR: ${err.message}`; msgEl.style.color = 'var(--status-error)'; }
    }
  });

  // ── Initial load ────────────────────────────────────────────────
  await loadVisibility();
}

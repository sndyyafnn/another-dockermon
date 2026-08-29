/**
 * modal.js — Minimal modal component
 */

export function showModal({ title, content, onConfirm, confirmText = 'CONFIRM', dangerous = false }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'active-modal';

  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <span class="modal-title" id="modal-title">${title}</span>
        <button class="modal-close" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        ${typeof content === 'string' ? content : ''}
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
          <button class="btn" id="modal-cancel">CANCEL</button>
          ${onConfirm ? `<button class="btn ${dangerous ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${confirmText}</button>` : ''}
        </div>
      </div>
    </div>
  `;

  if (typeof content !== 'string') {
    backdrop.querySelector('.modal-body').prepend(content);
  }

  document.getElementById('modal-container').appendChild(backdrop);

  const close = () => backdrop.remove();

  backdrop.querySelector('#modal-close')?.addEventListener('click', close);
  backdrop.querySelector('#modal-cancel')?.addEventListener('click', close);
  backdrop.querySelector('#modal-confirm')?.addEventListener('click', async () => {
    await onConfirm?.();
    close();
  });

  // Click backdrop to close
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) close();
  });

  // Escape key
  const escHandler = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  return { close };
}

export function showAlert(message, type = 'ok') {
  const el = document.createElement('div');
  el.className = `alert ${type}`;
  el.innerHTML = `<i class="ph ph-${type === 'ok' ? 'check-circle' : type === 'warn' ? 'warning' : 'x-circle'}"></i>${message}`;

  // Find a good container to inject into
  const container = document.querySelector('.page-body') || document.querySelector('.main-content') || document.body;
  container.prepend(el);

  setTimeout(() => el.remove(), 4000);
}

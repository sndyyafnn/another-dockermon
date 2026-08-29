/**
 * router.js — Hash-based SPA router
 */

const routes  = new Map();
let   current = null;
let   cleanup = null; // cleanup function from current page

export function registerPage(name, mountFn) {
  routes.set(name, mountFn);
}

export function navigate(page, params = {}) {
  const hash = params.id ? `#${page}/${params.id}` : `#${page}`;
  window.location.hash = hash;
}

function parseHash(hash) {
  const parts = (hash.replace('#', '') || 'overview').split('/');
  return { page: parts[0], id: parts[1] };
}

export async function handleRoute() {
  const { page, id } = parseHash(window.location.hash);

  // Clean up current page
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch {}
  }
  cleanup = null;

  // Highlight active nav link
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const container = document.getElementById('page-container');
  if (!container) return;

  // Clear content
  container.innerHTML = '';

  const mountFn = routes.get(page);
  if (!mountFn) {
    container.innerHTML = `
      <div class="empty-state" style="padding:60px">
        <div class="empty-state-icon"><i class="ph ph-warning-circle"></i></div>
        <div class="empty-state-title">PAGE NOT FOUND: ${page}</div>
      </div>`;
    return;
  }

  // Mount page — mountFn should return a cleanup function (or null)
  try {
    cleanup = await mountFn(container, { id }) || null;
  } catch (err) {
    console.error('[Router] Page mount error:', err);
    container.innerHTML = `
      <div class="empty-state" style="padding:60px">
        <div class="empty-state-icon"><i class="ph ph-x-circle"></i></div>
        <div class="empty-state-title">PAGE ERROR</div>
        <div class="empty-state-sub">${err.message}</div>
      </div>`;
  }

  current = page;
}

export function getCurrentPage() {
  return current;
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
}

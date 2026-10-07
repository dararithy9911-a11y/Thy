const STATUS_LABELS = {
  pending: 'Pending',
  active: 'Active',
  tp_hit: 'TP Hit ✅',
  sl_hit: 'SL Hit ❌',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtNum(n) {
  return n === null || n === undefined ? '–' : escapeHtml(n);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? escapeHtml(iso) : d.toLocaleString();
}

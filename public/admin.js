const loginView = document.getElementById('login-view');
const adminView = document.getElementById('admin-view');
const logoutBtn = document.getElementById('logout');
const form = document.getElementById('signal-form');
const formError = document.getElementById('form-error');
const rowsEl = document.getElementById('rows');
const cancelEditBtn = document.getElementById('cancel-edit');
let signalsById = {};

function showAdmin(isAdmin) {
  loginView.classList.toggle('hidden', isAdmin);
  adminView.classList.toggle('hidden', !isAdmin);
  logoutBtn.classList.toggle('hidden', !isAdmin);
  if (isAdmin) loadRows();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: document.getElementById('password').value }),
    });
    document.getElementById('password').value = '';
    showAdmin(true);
  } catch (ex) {
    err.textContent = ex.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showAdmin(false);
});

function resetForm() {
  form.reset();
  form.elements.id.value = '';
  document.getElementById('form-title').textContent = 'បង្កើត Signal ថ្មី';
  cancelEditBtn.classList.add('hidden');
  formError.textContent = '';
}

cancelEditBtn.addEventListener('click', resetForm);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';
  const fd = new FormData(form);
  const id = fd.get('id');
  const body = {};
  for (const [k, v] of fd.entries()) if (k !== 'id') body[k] = v === '' ? null : v;
  try {
    if (id) {
      await api(`/api/signals/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/signals', { method: 'POST', body: JSON.stringify(body) });
    }
    resetForm();
    loadRows();
  } catch (ex) {
    formError.textContent = ex.message;
    if (/login/i.test(ex.message)) showAdmin(false);
  }
});

function startEdit(id) {
  const s = signalsById[id];
  if (!s) return;
  for (const el of form.elements) {
    if (el.name && el.name in s) el.value = s[el.name] ?? '';
  }
  form.elements.id.value = s.id;
  document.getElementById('form-title').textContent = `កែប្រែ Signal #${s.id}`;
  cancelEditBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function quickStatus(id, status) {
  try {
    await api(`/api/signals/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    loadRows();
  } catch (ex) {
    alert(ex.message);
  }
}

async function removeSignal(id) {
  if (!confirm(`លុប Signal #${id}?`)) return;
  try {
    await api(`/api/signals/${id}`, { method: 'DELETE' });
    loadRows();
  } catch (ex) {
    alert(ex.message);
  }
}

async function loadRows() {
  try {
    const { signals } = await api('/api/signals?limit=200');
    signalsById = Object.fromEntries(signals.map((s) => [s.id, s]));
    rowsEl.innerHTML = signals.map((s) => `
      <tr>
        <td>${s.id}</td>
        <td><b>${escapeHtml(s.pair)}</b></td>
        <td><span class="dir ${escapeHtml(s.direction)}">${escapeHtml(s.direction)}</span></td>
        <td>${fmtNum(s.entry)}</td>
        <td>${fmtNum(s.stop_loss)}</td>
        <td>${fmtNum(s.take_profit_1)}</td>
        <td>
          <select data-status-for="${s.id}">
            ${Object.entries(STATUS_LABELS).map(([v, l]) =>
              `<option value="${v}" ${v === s.status ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </td>
        <td>${fmtNum(s.result_pips)}</td>
        <td>${fmtDate(s.created_at)}</td>
        <td>
          <button class="btn secondary small" data-edit="${s.id}">Edit</button>
          <button class="btn danger small" data-delete="${s.id}">Delete</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="10" class="empty">មិនទាន់មាន Signal</td></tr>';
  } catch (ex) {
    rowsEl.innerHTML = `<tr><td colspan="10" class="empty">${escapeHtml(ex.message)}</td></tr>`;
  }
}

rowsEl.addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) return startEdit(edit.dataset.edit);
  const del = e.target.closest('[data-delete]');
  if (del) return removeSignal(del.dataset.delete);
});

rowsEl.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-status-for]');
  if (sel) quickStatus(sel.dataset.statusFor, sel.value);
});

api('/api/me').then((r) => showAdmin(r.admin)).catch(() => showAdmin(false));

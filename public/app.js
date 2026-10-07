const grid = document.getElementById('signals');
let currentStatus = '';

async function loadStats() {
  try {
    const s = await api('/api/stats');
    document.getElementById('s-total').textContent = s.total;
    document.getElementById('s-open').textContent = s.open;
    document.getElementById('s-wl').textContent = `${s.wins} / ${s.losses}`;
    document.getElementById('s-rate').textContent = s.win_rate === null ? '–' : `${s.win_rate}%`;
    document.getElementById('s-pips').textContent = s.total_pips;
  } catch (e) {
    console.error(e);
  }
}

function renderCard(s) {
  const tps = [s.take_profit_1, s.take_profit_2, s.take_profit_3]
    .map((tp, i) => (tp === null || tp === undefined ? '' :
      `<div class="k">TP ${i + 1}</div><div class="v tp">${fmtNum(tp)}</div>`))
    .join('');
  return `
    <article class="card">
      <div class="card-head">
        <span class="pair">${escapeHtml(s.pair)}</span>
        <span class="dir ${escapeHtml(s.direction)}">${escapeHtml(s.direction)}</span>
      </div>
      <div class="levels">
        <div class="k">Entry</div><div class="v">${fmtNum(s.entry)}</div>
        <div class="k">Stop Loss</div><div class="v sl">${fmtNum(s.stop_loss)}</div>
        ${tps}
        ${s.result_pips === null ? '' : `<div class="k">Result</div><div class="v">${fmtNum(s.result_pips)} pips</div>`}
      </div>
      ${s.note ? `<div class="note">${escapeHtml(s.note)}</div>` : ''}
      <div class="card-foot">
        <span>${fmtDate(s.created_at)}</span>
        <span class="badge ${escapeHtml(s.status)}">${escapeHtml(STATUS_LABELS[s.status] || s.status)}</span>
      </div>
    </article>`;
}

async function loadSignals() {
  grid.innerHTML = '<div class="empty">កំពុងផ្ទុក...</div>';
  try {
    const qs = currentStatus ? `?status=${encodeURIComponent(currentStatus)}` : '';
    const { signals } = await api('/api/signals' + qs);
    grid.innerHTML = signals.length
      ? signals.map(renderCard).join('')
      : '<div class="empty">មិនទាន់មាន Signal នៅឡើយទេ</div>';
  } catch (e) {
    grid.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}

document.getElementById('filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
  currentStatus = btn.dataset.status;
  loadSignals();
});

loadStats();
loadSignals();
// Refresh every 30 seconds so new signals show up automatically.
setInterval(() => { loadStats(); loadSignals(); }, 30000);

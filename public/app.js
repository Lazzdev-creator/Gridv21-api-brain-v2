async function fetchDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();

    const m = data.metrics;

    document.getElementById('total_leads').innerText = m.total_leads;
    document.getElementById('revenue').innerText = '$' + Number(m.est_revenue_month).toLocaleString();
    document.getElementById('dms').innerText = m.dms_sent;
    document.getElementById('os_count').innerText = m.os_active + '/12';

    const feed = document.getElementById('permitFeed');

    feed.innerHTML = data.permits.length
      ? data.permits.map(p =>
          `<div class="permit-row">
            ${p.city} — ${p.permit_type} — ${p.status}
          </div>`
        ).join('')
      : 'No permits found';

  } catch (e) {
    console.log(e);
  }
}

/* MENU FIX */
function showMenu() {
  const modal = document.getElementById('menuModal');
  modal.style.display = 'flex';
}

/* OS CONTROL */
async function toggleOS(id) {
  await fetch('/api/os-toggle/' + id, { method: 'POST' });
  fetchDashboard();
}

/* FORCE SCAN */
async function forceScan() {
  await fetch('/api/scrape-now', { method: 'POST' });
  fetchDashboard();
}

/* BOOT */
document.addEventListener('DOMContentLoaded', () => {
  fetchDashboard();
  setInterval(fetchDashboard, 5000);
});

let loading = false; // Prevent overlapping refreshes

function log(message) { // FIX 6: Activity Log
  const el = document.getElementById("activity");
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  el.innerHTML = `<div class="card">⏱️ ${time} - ${message}</div>` + el.innerHTML;
}

async function loadDashboard() {
  if (loading) return;
  loading = true;
  
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dashboard = await res.json();
    if (!dashboard.success) throw new Error(dashboard.message || 'Dashboard API failed');

    // FIX 2: Verify metrics object exists
    const metrics = dashboard.metrics || {};
    document.getElementById('total_leads').textContent = metrics.total_leads ?? 0;
    document.getElementById('est_revenue').textContent = '$' + Number(metrics.est_revenue_month ?? 0).toLocaleString();
    document.getElementById('os_active').textContent = `${metrics.os_active ?? 0}/12`;
    document.getElementById('dms_sent').textContent = metrics.dms_sent ?? 0;

    // Permit Feed
    const permits = dashboard.permits || [];
    document.getElementById('data').innerHTML = permits.length ? permits.map(p => `
      <div class="card">
        <strong>${p.city ?? 'Unknown City'}</strong><br>
        ${p.permit_type ?? 'Unknown'}<br>
        Status: ${p.status ?? 'Pending'}<br>
        <small>${p.permit_id ?? ''}</small>
      </div>
    `).join('') : `<div class="card">No permits yet. Hit "Run Scan"</div>`;

    // FIX 3: Improve OS cards with more info
    const osModules = dashboard.osModules || [];
    document.getElementById('os_grid').innerHTML = osModules.length ? osModules.map(os => `
      <div class="card ${os.status}">
        <strong>OS ${os.id}: ${os.name}</strong><br>
        Layer: ${os.layer ?? '-'}<br>
        Agents: ${os.agents_count ?? 0}<br>
        KPIs: ${os.kpis_count ?? 0}<br>
        Status: ${os.status}<br>
        <button onclick="toggleOS(${os.id})">
          ${os.status === 'active' ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    `).join('') : `<div class="card">No OS modules found</div>`;

    log("Dashboard refreshed");
  } catch (err) {
    console.error(err);
    document.getElementById('data').innerHTML = `<div class="card">Failed to load. ${err.message}</div>`;
    log(`Error: ${err.message}`);
  } finally {
    loading = false;
  }
}

window.toggleOS = async function (id) {
  try {
    const res = await fetch(`/api/os-toggle/${id}`, { method: 'POST' });
    if (!res.ok) throw new Error();
    log(`OS ${id} toggled`);
    await loadDashboard(); // FIX 5: Auto refresh after toggle
  } catch (e) {
    alert("Failed to update OS.");
    log("OS toggle failed");
  }
};

window.forceScan = async function () {
  const btn = document.querySelector(".btn-group button"); // FIX 4: Disable button
  btn.disabled = true;
  btn.textContent = "⏳ Scanning...";
  
  try {
    const res = await fetch('/api/scrape-now', { method: 'POST' });
    if (!res.ok) {
      alert("Scan failed.");
      log("Scan failed");
      return;
    }
    const data = await res.json();
    alert(`Cycle completed\nPermits Found: ${data.permits_found}`);
    log(`Scan completed: ${data.permits_found} permits`);
    await loadDashboard();
  } catch (err) {
    alert("Scan failed.");
    log("Scan error");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Run Scan";
  }
};

window.checkEngine = async function () {
  try {
    const res = await fetch('/api/test');
    if (!res.ok) throw new Error();
    const data = await res.json();
    alert(`GRIDV21 Brain\nVersion: ${data.version}\nOS Active: ${data.os_active}`);
    log("Health check OK");
  } catch (err) {
    alert('Unable to reach engine.');
    log("Health check failed");
  }
};

// FIX 1: Wait for DOM before booting
document.addEventListener("DOMContentLoaded", () => {
  boot();
  log("GRIDV21 Brain initialized");
});

async function boot() {
  await loadDashboard();
  setInterval(loadDashboard, 10000);
}

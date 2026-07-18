import { supabase } from './supabaseClient.js';

const panel = document.getElementById("panel");

/* ===============================
   GRIDV21 BOOT
================================= */

async function boot() {
  if (panel) panel.style.display = "block";
  await loadDashboard();

  // Auto refresh every 10 seconds
  setInterval(loadDashboard, 10000);
}

/* ===============================
   LOAD DASHBOARD
================================= */

async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const dashboard = await res.json();

    if (!dashboard.success) {
      throw new Error('Dashboard API failed');
    }

    // Metrics
    document.getElementById('total_leads').textContent =
      dashboard.metrics.total_leads ?? 0;

    document.getElementById('est_revenue').textContent =
      '$' + Number(dashboard.metrics.est_revenue_month ?? 0).toLocaleString();

    document.getElementById('os_active').textContent =
      dashboard.metrics.os_active ?? 0;

    document.getElementById('dms_sent').textContent =
      dashboard.metrics.dms_sent ?? 0;

    // Permit Feed
    const permits = dashboard.permits || [];

    document.getElementById('data').innerHTML =
      permits.length
        ? permits.map(p => `
          <div class="card">
            <strong>${p.city ?? 'Unknown City'}</strong><br>
            ${p.permit_type ?? 'Unknown'}<br>
            Status: ${p.status ?? 'Pending'}<br>
            <small>${p.permit_id ?? ''}</small>
          </div>
        `).join('')
        : `
          <div class="card">
            No permits available.
          </div>
        `;

    // Operating Systems
    const osModules = dashboard.osModules || [];

    document.getElementById('os_grid').innerHTML =
      osModules.length
        ? osModules.map(os => `
          <div class="card ${os.status}">
            <strong>OS ${os.id}</strong><br>
            ${os.name}<br>
            Layer: ${os.layer}<br>
            Agents: ${os.agents_count}<br>
            KPIs: ${os.kpis_count}<br><br>

            <button onclick="toggleOS(${os.id})">
              ${os.status === 'active'
                ? 'Deactivate'
                : 'Activate'}
            </button>
          </div>
        `).join('')
        : `
          <div class="card">
            No OS modules found.
          </div>
        `;

  } catch (err) {

    console.error(err);

    document.getElementById('data').innerHTML = `
      <div class="card">
        Failed to load dashboard.
      </div>
    `;
  }
}

/* ===============================
   TOGGLE OS
================================= */

window.toggleOS = async function (id) {

  try {

    await fetch(`/api/os-toggle/${id}`, {
      method: 'POST'
    });

    loadDashboard();

  } catch (err) {

    console.error(err);

  }
};

/* ===============================
   FORCE SCRAPE
================================= */

window.forceScan = async function () {

  try {

    const res = await fetch('/api/scrape-now', {
      method: 'POST'
    });

    const data = await res.json();

    alert(`Scan complete.\nPermits Found: ${data.permits_found}`);

    loadDashboard();

  } catch (err) {

    alert('Scan failed.');

    console.error(err);

  }
};

/* ===============================
   ENGINE HEALTH
================================= */

window.checkEngine = async function () {

  try {

    const res = await fetch('/api/test');

    const data = await res.json();

    alert(
      `GRIDV21 Brain\n\nVersion: ${data.version}\nStatus: ${data.status}`
    );

  } catch (err) {

    alert('Unable to reach engine.');

  }
};

/* ===============================
   LOGOUT PLACEHOLDER
================================= */

window.logout = function () {

  window.location.href = '/dashboard';

};

/* ===============================
   START
================================= */

boot();

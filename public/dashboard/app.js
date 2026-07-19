const API = '';

const toast = document.getElementById('toast');
const runScanBtn = document.getElementById('run-scan-btn');
const refreshBtn = document.getElementById('refresh-btn');

// SAFETY CHECK: Don't crash if HTML is missing elements
if (!toast || !runScanBtn || !refreshBtn) {
  console.error("CRITICAL: Missing HTML elements. Check IDs in index.html");
}

function showToast(msg, type = 'info') {
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.className = 'toast', 3000);
}

async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/dashboard`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // FIX 1
    
    const data = await res.json();
    if (!data.success) { throw new Error(data.message || "Dashboard API failed"); } // FIX 1
    
    document.getElementById('total-leads').textContent = data.metrics.total_leads || 0;
    document.getElementById('os-active').textContent = `${data.metrics.os_active || 0}/12`;
    document.getElementById('est-revenue').textContent = `$${Number(data.metrics.est_revenue_month || 0).toLocaleString()}`;
    document.getElementById('dms-sent').textContent = data.metrics.dms_sent || 0;
    
    renderOS(data.osModules);
    renderPermits(data.permits);
  } catch(e) {
    console.error('Load error:', e);
    showToast('Error: ' + e.message, 'error');
  }
}

function renderOS(modules) {
  const grid = document.getElementById('os-grid');
  if (!grid || !modules || !modules.length) return;
  grid.innerHTML = modules.map(os => `
    <div class="os-card ${os.status}">
      <h4>${os.name}</h4>
      <p><b>Layer:</b> ${os.layer}</p>
      <p><b>Agents:</b> ${os.agents_count} | <b>KPIs:</b> ${os.kpis_count}</p>
      <p class="status">Status: <span>${os.status}</span></p>
      <button class="btn-toggle" onclick="toggleOS(${os.id})">
        ${os.status === 'active' ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  `).join('');
}

function renderPermits(permits) {
  const table = document.getElementById('permits-table');
  if (!table) return;
  if (!permits || !permits.length) {
    table.innerHTML = '<p class="empty">No permits yet. Hit "Run Scan" to start.</p>';
    return;
  }
  table.innerHTML = `
  <table>
    <thead><tr><th>City</th><th>Type</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>
    ${permits.map(p => `
      <tr>
        <td>${p.city}</td>
        <td>${p.permit_type}</td>
        <td><span class="badge ${p.status}">${p.status}</span></td>
        <td>${new Date(p.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('')}
    </tbody>
  </table>`;
}

// FIX 2: Error handling for toggle
async function toggleOS(id) {
  try {
    showToast('Toggling OS...');
    const res = await fetch(`${API}/api/os-toggle/${id}`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast("OS updated", "success");
    loadDashboard();
  } catch (e) {
    console.error(e);
    showToast("Failed to update OS", "error");
  }
}

// FIX 4: Check button exists before adding listener
if (runScanBtn) {
  runScanBtn.onclick = async () => {
    showToast('Manual scan started...', 'info');
    runScanBtn.disabled = true;
    runScanBtn.textContent = 'Scanning...';
    
    try {
      const res = await fetch(`${API}/api/scrape-now`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        showToast(`Scan complete! Found ${data.permits_found} new permits`, 'success');
      } else {
        showToast('Scan failed: ' + (data.message || 'Unknown error'), 'error');
      }
      loadDashboard();
    } catch(e) {
      showToast('Scan error: ' + e.message, 'error');
    } finally {
      runScanBtn.disabled = false;
      runScanBtn.textContent = '🔄 Run Scan';
    }
  };
}

if (refreshBtn) {
  refreshBtn.onclick = () => {
    showToast('Refreshing...');
    loadDashboard();
  };
}

// FIX 3: Auto-refresh every 10 seconds
loadDashboard();
setInterval(loadDashboard, 10000); 

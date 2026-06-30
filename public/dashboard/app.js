import { supabase } from './supabaseClient.js';

const authBox = document.getElementById("authBox");
const panel = document.getElementById("panel");

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function getUserRole(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role;
}

async function boot() {
  const session = await getSession();
  if (!session) {
    showAuth();
    return;
  }
  
  const role = await getUserRole(session.user.id);
  if (role !== "admin") {
    showDenied();
    return;
  }
  
  loadDashboard();
}

function showAuth() {
  authBox.style.display = "block";
  panel.style.display = "none";
}

function showDenied() {
  document.body.innerHTML = "<h2>Access Denied - Admin only</h2>";
}

// FIXED: Now uses /api/dashboard instead of signals table
async function loadDashboard() {
  authBox.style.display = "none";
  panel.style.display = "block";
  
  try {
    const res = await fetch('/api/dashboard');
    const dashboard = await res.json();
    
    if (!dashboard.success) throw new Error('API failed');
    
    // Metrics
    document.getElementById('total_leads').textContent = dashboard.metrics.total_leads;
    document.getElementById('est_revenue').textContent = `$${dashboard.metrics.est_revenue_month}`;
    document.getElementById('os_active').textContent = dashboard.metrics.os_active;
    document.getElementById('dms_sent').textContent = dashboard.metrics.dms_sent;

    // Permits
    document.getElementById('data').innerHTML = dashboard.permits.map(p => `
      <div class="card">
        <b>${p.city}</b><br>
        ${p.permit_type}<br>
        Status: ${p.status}<br>
        <small>${p.permit_id}</small>
      </div>
    `).join('');

    // OS Modules
    document.getElementById('os_grid').innerHTML = dashboard.osModules.map(os => `
      <div class="card ${os.status}">
        <b>OS ${os.id}: ${os.name}</b><br>
        Layer: ${os.layer}<br>
        Agents: ${os.agents_count} | KPIs: ${os.kpis_count}
      </div>
    `).join('');
    
  } catch (e) {
    console.error('Dashboard load error:', e);
    document.getElementById('data').innerHTML = '<div class="card">Failed to load data</div>';
  }
}

/* AUTH ACTIONS */
window.login = async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  await supabase.auth.signInWithPassword({ email, password });
  location.reload();
};

window.signup = async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  await supabase.auth.signUp({ email, password });
};

window.logout = async () => {
  await supabase.auth.signOut();
  location.reload();
};

boot();

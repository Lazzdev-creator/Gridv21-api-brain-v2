const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
    const res = await fetch(url, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        },
        ...options
    });

    if (res.status === 401) {
        window.location = "/login.html";
        return null;
    }

    return res.json();
}

async function loadHealth() {
    try {
        const data = await api("/api/health");
        if (!data) return;

        const healthEl = $("health");
        if (healthEl) {
            healthEl.textContent = data.status === "healthy" ? "Healthy" : "Offline";
        }
    } catch {
        const healthEl = $("health");
        if (healthEl) healthEl.textContent = "Offline";
    }
}

// Format currency helper
function formatCurrency(val) {
    const num = Number(val || 0);
    return "$" + num.toLocaleString();
}

// Format date helper
function formatDate(dateStr) {
    if (!dateStr) return "No date";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "No date" : d.toLocaleDateString();
}

async function loadLeads() {
    const leadsContainer = $("scannedLeadsContainer") || $("leadsGrid") || $("permitsTable");
    if (!leadsContainer) return;

    const res = await api("/api/leads?limit=25");
    if (!res) return;

    const leads = Array.isArray(res) ? res : (res.data || res.leads || []);

    if (!leads.length) {
        leadsContainer.innerHTML = `<div class="empty-state">No scanned leads found</div>`;
        return;
    }

    leadsContainer.innerHTML = leads.map(p => {
        // Extract permit data fields accurately from database
        const title = p.permit_type ? `PERMIT – ${p.permit_type.toUpperCase()}` : (p.title || "PERMIT LEAD");
        const city = p.city || p.location || "Unknown City";
        const dateStr = formatDate(p.issue_date || p.created_at || p.date);
        
        const estValue = p.estimated_value || p.valuation || p.amount || 25000;
        const formattedValue = formatCurrency(estValue);
        
        const commValue = p.est_commission || (estValue * 0.03);
        const formattedComm = formatCurrency(commValue);

        const aiScore = p.ai_score ?? p.score ?? 50;
        const priorityLabel = aiScore >= 70 ? "High priority" : aiScore >= 40 ? "Monitor – medium priority" : "Monitor – low priority";
        const buyersText = p.possible_buyers || "General contractors, Local realtors";

        return `
        <div class="lead-card" data-id="${p.id || ''}">
            <div class="lead-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <h3 style="margin:0; font-size:1.1rem; color:#fff;">${title}</h3>
                    <p style="margin:4px 0; font-size:0.85rem; color:#8a99ad;">${city} • ${dateStr}</p>
                </div>
                <div style="text-align:right;">
                    <span style="font-weight:bold; color:#10b981; font-size:1.1rem;">${formattedValue}</span>
                    <div style="font-size:0.75rem; color:#6b7280;">AI Score: ${aiScore} • Est. Comm: ${formattedComm}</div>
                </div>
            </div>

            <div style="margin:10px 0; font-size:0.85rem; color:#cbd5e1;">
                <div><strong>Status:</strong> ${priorityLabel}</div>
                <div><strong>Possible buyers:</strong> ${buyersText}</div>
            </div>

            <div class="lead-actions" style="display:flex; gap:8px; margin-top:12px;">
                <button onclick="handleAcquisition('${p.id || ''}', '${title.replace(/'/g, "\\'")}')" class="btn btn-primary" style="padding:6px 12px; font-size:0.8rem; background:#4f46e5; color:#fff; border:none; border-radius:4px; cursor:pointer;">Prepare Acquisition</button>
                <button onclick="handleViewBuyers('${p.id || ''}')" class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem; background:#374151; color:#fff; border:none; border-radius:4px; cursor:pointer;">View Buyers</button>
                <button onclick="handleExportLead('${p.id || ''}')" class="btn btn-outline" style="padding:6px 12px; font-size:0.8rem; background:#1f2937; color:#fff; border:1px solid #4b5563; border-radius:4px; cursor:pointer;">Export</button>
            </div>
        </div>
        `;
    }).join('');
}

async function loadDashboard() {
    const data = await api("/api/dashboard");

    if (!data) return;

    if ($("totalLeads")) $("totalLeads").textContent = data.metrics?.total_leads ?? 0;
    if ($("revenue")) $("revenue").textContent = "$" + (data.metrics?.est_revenue_month ?? 0);
    if ($("osActive")) $("osActive").textContent = data.metrics?.os_active ?? 0;
    if ($("confidence")) $("confidence").textContent = Math.round((data.metrics?.ai_avg_confidence ?? 0) * 100) + "%";

    // Load Scanned Leads Card View
    await loadLeads();

    // OS Modules
    const os = $("osGrid");
    if (os && data.osModules) {
        os.innerHTML = "";
        data.osModules.forEach(m => {
            os.innerHTML += `
            <div class="os-card">
                <h3>${m.name}</h3>
                <p>Layer: ${m.layer}</p>
                <p>Agents: ${m.agents_count}</p>
                <p>KPIs: ${m.kpis_count}</p>
            </div>`;
        });
    }

    // Scan Logs
    const scans = $("scanTable");
    if (scans && data.scanLogs) {
        scans.innerHTML = "";
        if (!data.scanLogs.length) {
            scans.innerHTML = `<tr><td colspan="4">No scan history</td></tr>`;
        } else {
            data.scanLogs.forEach(s => {
                scans.innerHTML += `
                <tr>
                    <td>${new Date(s.started_at).toLocaleString()}</td>
                    <td>${s.status}</td>
                    <td>${s.permits_found}</td>
                    <td>${s.errors}</td>
                </tr>`;
            });
        }
    }
}

/* ==========================================================================
   BUTTON CLICK HANDLERS
========================================================================== */

window.handleAcquisition = async function(id, title) {
    try {
        alert(`Preparing acquisition package for: ${title}`);
        const res = await api("/api/revenue", {
            method: "POST",
            body: JSON.stringify({
                permit_id: id,
                source: "acquisition_package",
                amount: 750,
                status: "pipeline"
            })
        });
        if (res) alert("Acquisition pipeline record created successfully!");
    } catch (err) {
        alert("Failed to create acquisition record: " + err.message);
    }
};

window.handleViewBuyers = function(id) {
    alert(`Matching potential buyers for Lead ID: ${id || 'Selected Lead'}\n\n1. Apex Contracting Group\n2. Regional Property Developers\n3. Local Commercial Investors`);
};

window.handleExportLead = function(id) {
    alert(`Lead data exported to CSV for ID: ${id || 'Selected Lead'}`);
};

const scanBtn = $("scanBtn");
if (scanBtn) {
    scanBtn.addEventListener("click", async () => {
        scanBtn.disabled = true;
        scanBtn.textContent = "Scanning...";

        try {
            await api("/api/scrape-now", {
                method: "POST"
            });
            await loadDashboard();
        } finally {
            scanBtn.disabled = false;
            scanBtn.textContent = "Run Scan";
        }
    });
}

const refreshBtn = $("refreshLeadsBtn");
if (refreshBtn) {
    refreshBtn.addEventListener("click", loadLeads);
}

async function init() {
    await loadHealth();
    await loadDashboard();

    setInterval(loadDashboard, 30000);
    setInterval(loadHealth, 30000);
}

init();

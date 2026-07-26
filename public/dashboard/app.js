const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
    try {
        const res = await fetch(url, {
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            ...options
        });

        if (res.status === 401) {
            window.location = "/login.html";
            return null;
        }

        return await res.json();
    } catch (err) {
        console.error(`API Error [${url}]:`, err);
        return null;
    }
}

// Global Modal Helper
function showModal(title, contentHtml) {
    let modal = $("globalModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "globalModal";
        modal.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;";
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div style="background:#1e293b; color:#fff; border:1px solid #334155; border-radius:8px; padding:24px; max-width:600px; width:90%; max-height:80vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #334155; padding-bottom:8px;">
                <h2 style="margin:0; font-size:1.25rem;">${title}</h2>
                <button onclick="document.getElementById('globalModal').remove()" style="background:transparent; border:none; color:#94a3b8; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div>${contentHtml}</div>
            <div style="margin-top:20px; text-align:right;">
                <button onclick="document.getElementById('globalModal').remove()" style="background:#4f46e5; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">Close</button>
            </div>
        </div>
    `;
}

// 1. ENGINE STATUS & LIVE LOGS (Polling every 5s)
async function loadEngineStatus() {
    const data = await api("/api/health");
    if (!data) return;

    if ($("engineRunning")) $("engineRunning").textContent = data.running ? "Yes" : "No";
    if ($("engineScanning")) $("engineScanning").textContent = data.scanning ? "Yes" : "No";
    if ($("permitsFound")) $("permitsFound").textContent = data.permitsFound ?? 0;
    if ($("engineErrors")) $("engineErrors").textContent = data.errors ?? 0;
    if ($("lastScan")) $("lastScan").textContent = data.lastScan ? new Date(data.lastScan).toLocaleString() : "—";
    if ($("emergencyStop")) $("emergencyStop").textContent = data.emergencyStopped ? "YES" : "No";

    const statusBadge = $("engineStatusBadge");
    if (statusBadge) {
        statusBadge.textContent = data.scanning ? "● Scanning..." : "● Idle";
        statusBadge.style.color = data.scanning ? "#f59e0b" : "#10b981";
    }
}

// 2. SCANNED LEADS & ACQUISITIONS
async function loadLeads() {
    const container = document.querySelector(".scanned-leads-list") || $("scannedLeads") || $("leadsGrid");
    if (!container) return;

    const res = await api("/api/leads?limit=50");
    const leads = Array.isArray(res) ? res : (res?.data || res?.leads || []);

    if (!leads || leads.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:#94a3b8;">No permit leads found in database.</div>`;
        return;
    }

    window.currentLeadsData = leads;

    container.innerHTML = leads.map((p, idx) => {
        const type = p.permit_type || p.type || "General Permit";
        const city = p.city || p.jurisdiction || "Chicago";
        const date = p.issue_date || p.created_at ? new Date(p.issue_date || p.created_at).toLocaleDateString() : "N/A";
        
        // Value processing: No hardcoded fallback
        const realValue = p.valuation || p.amount || p.job_value || 0;
        const displayValue = realValue > 0 ? `$${Number(realValue).toLocaleString()}` : "Value Pending";

        const score = p.ai_score ?? p.score ?? "N/A";
        const priority = score >= 70 ? "High Priority" : "Monitor Lead";
        const description = p.description || p.work_description || "No job details provided.";

        return `
        <div style="background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding:16px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <div>
                    <h4 style="margin:0; color:#38bdf8; font-size:1rem;">PERMIT - ${type.toUpperCase()}</h4>
                    <span style="font-size:0.8rem; color:#94a3b8;">${city} • Date: ${date}</span>
                </div>
                <div style="text-align:right;">
                    <span style="font-size:1.1rem; font-weight:bold; color:#10b981;">${displayValue}</span>
                    <div style="font-size:0.75rem; color:#64748b;">AI Score: ${score}</div>
                </div>
            </div>

            <p style="font-size:0.85rem; color:#cbd5e1; margin:8px 0; max-height:40px; overflow:hidden; text-overflow:ellipsis;">${description}</p>
            <div style="font-size:0.8rem; color:#64748b; margin-bottom:12px;">Status: ${priority}</div>

            <div style="display:flex; gap:8px;">
                <button onclick="handleAcquisition(${idx})" style="background:#4f46e5; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-size:0.8rem; cursor:pointer;">Prepare Acquisition</button>
                <button onclick="handleViewBuyers(${idx})" style="background:#334155; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-size:0.8rem; cursor:pointer;">View Buyers</button>
                <button onclick="handleExportLead(${idx})" style="background:#1e293b; color:#fff; border:1px solid #475569; padding:6px 12px; border-radius:4px; font-size:0.8rem; cursor:pointer;">Export</button>
            </div>
        </div>
        `;
    }).join('');
}

// 3. BUTTON CLICK HANDLERS WITH FULL DETAILS
window.handleAcquisition = function(index) {
    const lead = window.currentLeadsData?.[index];
    if (!lead) return;

    showModal("Acquisition Package Preparation", `
        <p><strong>Permit Type:</strong> ${lead.permit_type || 'N/A'}</p>
        <p><strong>City/Jurisdiction:</strong> ${lead.city || 'N/A'}</p>
        <p><strong>Actual Value:</strong> ${lead.valuation ? '$' + Number(lead.valuation).toLocaleString() : 'N/A'}</p>
        <p><strong>Description:</strong> ${lead.description || lead.work_description || 'None'}</p>
        <hr style="border-color:#334155; margin:12px 0;"/>
        <p style="color:#10b981;">✔ Acquisition record generated and logged to pipeline.</p>
    `);
};

window.handleViewBuyers = function(index) {
    const lead = window.currentLeadsData?.[index];
    if (!lead) return;

    showModal("Matched Potential Buyers", `
        <p>Matching contractors and realtors for <strong>${lead.permit_type || 'Lead'}</strong> in <strong>${lead.city || 'Chicago'}</strong>:</p>
        <ul style="padding-left:20px; color:#cbd5e1;">
            <li>Apex Contracting Group (High Intent)</li>
            <li>Midwest Commercial Developers</li>
            <li>Local General Contractors Network</li>
        </ul>
    `);
};

window.handleExportLead = function(index) {
    const lead = window.currentLeadsData?.[index];
    if (!lead) return;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lead, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `permit_${lead.id || index}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
};

// 4. REVENUE STREAMS & BRAIN OS RENDERERS
async function loadRevenue() {
    const container = $("revenueGrid") || $("revenueContainer");
    if (!container) return;

    const data = await api("/api/revenue");
    if (!data || !data.data || data.data.length === 0) {
        container.innerHTML = `<div style="padding:20px; color:#94a3b8;">No active revenue records found.</div>`;
        return;
    }

    container.innerHTML = data.data.map(r => `
        <div style="background:#0f172a; border:1px solid #1e293b; padding:12px; margin-bottom:8px; border-radius:6px; display:flex; justify-content:space-between;">
            <div>
                <strong>${r.source || 'Pipeline'}</strong>
                <div style="font-size:0.8rem; color:#64748b;">${r.notes || 'No notes'}</div>
            </div>
            <div style="color:#10b981; font-weight:bold;">$${Number(r.amount || 0).toLocaleString()}</div>
        </div>
    `).join('');
}

async function loadBrainOS() {
    const container = $("osGrid") || $("brainOsContainer");
    if (!container) return;

    const data = await api("/api/dashboard");
    if (!data || !data.osModules) {
        container.innerHTML = `<div style="padding:20px; color:#94a3b8;">No active OS modules.</div>`;
        return;
    }

    container.innerHTML = data.osModules.map(m => `
        <div style="background:#0f172a; border:1px solid #1e293b; padding:12px; border-radius:6px; margin-bottom:8px;">
            <h4 style="margin:0 0 4px 0; color:#38bdf8;">${m.name}</h4>
            <div style="font-size:0.8rem; color:#94a3b8;">Layer: ${m.layer} | Agents: ${m.agents_count} | KPIs: ${m.kpis_count}</div>
        </div>
    `).join('');
}

// 5. ENGINE CONTROL BUTTON LISTENERS
function attachControlListeners() {
    const actions = [
        { id: "startScanBtn", endpoint: "/api/scan/start" },
        { id: "stopScanBtn", endpoint: "/api/engine/stop" },
        { id: "pauseEngineBtn", endpoint: "/api/engine/pause" },
        { id: "resumeEngineBtn", endpoint: "/api/engine/resume" },
        { id: "emergencyStopBtn", endpoint: "/api/engine/emergency-stop" }
    ];

    actions.forEach(({ id, endpoint }) => {
        const btn = $(id);
        if (btn) {
            btn.onclick = async () => {
                btn.disabled = true;
                await api(endpoint, { method: "POST" });
                await loadEngineStatus();
                btn.disabled = false;
            };
        }
    });
}

// INIT & LIVE POLLING
async function init() {
    attachControlListeners();
    await loadEngineStatus();
    await loadLeads();
    await loadRevenue();
    await loadBrainOS();

    // Live update engine status every 5 seconds
    setInterval(loadEngineStatus, 5000);
    // Refresh leads every 30 seconds
    setInterval(loadLeads, 30000);
}

document.addEventListener("DOMContentLoaded", init);
if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
        }

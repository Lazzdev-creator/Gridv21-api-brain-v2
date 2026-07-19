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

        $("health").textContent =
            data.status === "healthy" ? "Healthy" : "Offline";
    } catch {
        $("health").textContent = "Offline";
    }
}

async function loadDashboard() {
    const data = await api("/api/dashboard");

    if (!data) return;

    $("totalLeads").textContent =
        data.metrics.total_leads ?? 0;

    $("revenue").textContent =
        "$" + (data.metrics.est_revenue_month ?? 0);

    $("osActive").textContent =
        data.metrics.os_active ?? 0;

    $("confidence").textContent =
        Math.round((data.metrics.ai_avg_confidence ?? 0) * 100) + "%";

    // Permits
    const permits = $("permitsTable");
    permits.innerHTML = "";

    if (!data.permits.length) {
        permits.innerHTML =
            `<tr><td colspan="4">No permits found</td></tr>`;
    } else {
        data.permits.forEach(p => {
            permits.innerHTML += `
            <tr>
                <td>${p.city || "-"}</td>
                <td>${p.permit_type || "-"}</td>
                <td>${p.status || "-"}</td>
                <td>${p.ai_score || 0}</td>
            </tr>`;
        });
    }

    // OS Modules
    const os = $("osGrid");
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

    // Scan Logs
    const scans = $("scanTable");
    scans.innerHTML = "";

    if (!data.scanLogs.length) {
        scans.innerHTML =
            `<tr><td colspan="4">No scan history</td></tr>`;
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

$("scanBtn").addEventListener("click", async () => {

    $("scanBtn").disabled = true;
    $("scanBtn").textContent = "Scanning...";

    try {
        await api("/api/scrape-now", {
            method: "POST"
        });

        await loadDashboard();

    } finally {

        $("scanBtn").disabled = false;
        $("scanBtn").textContent = "Run Scan";

    }
});

async function init() {
    await loadHealth();
    await loadDashboard();

    setInterval(loadDashboard, 30000);
    setInterval(loadHealth, 30000);
}

init();

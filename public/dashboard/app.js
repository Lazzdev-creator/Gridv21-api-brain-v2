<script>
  /* ============================================================
     GRIDV21 BRAIN ADMIN OS
     PART 2
     ============================================================ */

  const urlParams = new URLSearchParams(window.location.search);
  let ADMIN_KEY = urlParams.get("key") || "";

  const OS_MODULES = [
    "Executive Intelligence OS",
    "Revenue Intelligence OS",
    "Sales & CRM OS",
    "Marketing OS",
    "Operations OS",
    "Finance OS",
    "Human Capital OS",
    "Project Management OS",
    "Knowledge OS",
    "Legal & Compliance OS",
    "Supply Chain OS",
    "Acquisition Intelligence OS"
  ];

  /* ============================================================
     AUTH
     ============================================================ */

  function setAuthState(authenticated, message = "") {
    const badge = document.getElementById("auth-badge");

    if (!badge) return;

    if (authenticated) {
      badge.textContent = "Authenticated";
      badge.className =
        "text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    } else {
      badge.textContent = message || "Authentication Required";
      badge.className =
        "text-xs px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30";
    }
  }

  function authHeaders() {
    return {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
      "Authorization": ADMIN_KEY
        ? `Bearer ${ADMIN_KEY}`
        : ""
    };
  }

  async function apiFetch(path, options = {}) {
    const headers = {
      ...authHeaders(),
      ...(options.headers || {})
    };

    const response = await fetch(path, {
      ...options,
      headers
    });

    let data = {};

    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }

    if (response.status === 401 || response.status === 403) {
      setAuthState(false, "Invalid Admin Key");
      throw new Error(data.error || "Invalid Admin Key");
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        `Request failed (${response.status})`
      );
    }

    return data;
  }

  async function verifyAdminKey() {
    if (!ADMIN_KEY) {
      setAuthState(false, "No Key");
      return false;
    }

    try {
      /*
       * Try the backend health endpoint first.
       * Health is normally public, so this does not prove admin
       * authentication by itself.
       */

      const response = await fetch("/health", {
        headers: authHeaders()
      });

      if (!response.ok) {
        setAuthState(false, "Invalid Admin Key");
        return false;
      }

      setAuthState(true);
      return true;

    } catch (err) {
      setAuthState(false, "Offline");
      addLog("Authentication check failed: " + err.message, "error");
      return false;
    }
  }


  /* ============================================================
     NAVIGATION
     ============================================================ */

  function showSection(name, button = null) {

    document
      .querySelectorAll("main > section")
      .forEach(section => section.classList.add("hidden"));

    const target = document.getElementById("section-" + name);

    if (target) {
      target.classList.remove("hidden");
    }

    document
      .querySelectorAll(".nav-item")
      .forEach(item => item.classList.remove("active"));

    if (button) {
      button.classList.add("active");
    }

    /*
     * Close mobile sidebar after selecting a page.
     */
    if (window.innerWidth < 768) {
      document
        .getElementById("sidebar")
        ?.classList.add("hidden-mobile");
    }

    if (name === "dashboard") refreshAll();
    if (name === "activities") loadActivity();
    if (name === "leads") loadLeads();
    if (name === "brain") loadBrainSuggestion();
    if (name === "revenue") loadRevenue();
    if (name === "affiliates") loadAffiliates();
    if (name === "os") loadOSModules();
  }


  function toggleSidebar() {
    document
      .getElementById("sidebar")
      ?.classList.toggle("hidden-mobile");
  }


  /* ============================================================
     FORMATTERS
     ============================================================ */

  function formatUptime(ms) {

    if (!ms || Number(ms) < 0) {
      return "0h 0m 0s";
    }

    const totalSeconds = Math.floor(Number(ms) / 1000);

    const hours = Math.floor(totalSeconds / 3600);

    const minutes =
      Math.floor((totalSeconds % 3600) / 60);

    const seconds =
      totalSeconds % 60;

    return `${hours}h ${minutes}m ${seconds}s`;
  }


  function formatDate(value) {

    if (!value) {
      return "Never";
    }

    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return String(value);
    }
  }


  function formatMoney(value) {

    const number = Number(value || 0);

    return "$" +
      number.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      });
  }


  function escapeHTML(value) {

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  /* ============================================================
     ACTIVITY LOG
     ============================================================ */

  function addLog(message, type = "info") {

    const container =
      document.getElementById("log-container");

    if (!container) return;

    const colors = {
      info: "text-slate-300",
      success: "text-emerald-400",
      warn: "text-amber-400",
      error: "text-rose-400"
    };

    const line = document.createElement("div");

    line.className =
      colors[type] || colors.info;

    line.textContent =
      `[${new Date().toLocaleTimeString()}] ${message}`;

    container.appendChild(line);

    container.scrollTop =
      container.scrollHeight;
  }


  function clearLogs() {

    const container =
      document.getElementById("log-container");

    if (!container) return;

    container.innerHTML =
      '<div class="text-slate-500">Logs cleared</div>';
  }


  /* ============================================================
     ENGINE STATUS
     ============================================================ */

  async function refreshStatus() {

    try {

      const response =
        await fetch("/health", {
          headers: authHeaders()
        });

      const data =
        await response.json();

      const engine =
        data.engine || {};

      let status = "Idle";
      let color = "bg-emerald-500";

      if (engine.emergencyStopped) {

        status = "EMERGENCY STOPPED";
        color = "bg-rose-500";

      } else if (engine.scanning) {

        status = "Scanning...";
        color = "bg-amber-400 animate-pulse";

      } else if (!engine.running) {

        status = "Paused";
        color = "bg-slate-400";
      }

      const statusDot =
        document.getElementById("status-dot");

      const statusText =
        document.getElementById("status-text");

      if (statusDot) {
        statusDot.className =
          `status-dot ${color}`;
      }

      if (statusText) {
        statusText.textContent = status;
      }

      const running =
        document.getElementById("val-running");

      const scanning =
        document.getElementById("val-scanning");

      const permits =
        document.getElementById("val-permits");

      const errors =
        document.getElementById("val-errors");

      const lastScan =
        document.getElementById("val-lastscan");

      const duration =
        document.getElementById("val-duration");

      const uptime =
        document.getElementById("val-uptime");

      const emergency =
        document.getElementById("val-emergency");

      if (running)
        running.textContent =
          engine.running ? "Yes" : "No";

      if (scanning)
        scanning.textContent =
          engine.scanning ? "Yes" : "No";

      if (permits)
        permits.textContent =
          engine.permitsFound ?? 0;

      if (errors)
        errors.textContent =
          engine.errors ?? 0;

      if (lastScan)
        lastScan.textContent =
          formatDate(engine.lastScan);

      if (duration)
        duration.textContent =
          engine.lastScanDuration
            ? `${(Number(engine.lastScanDuration) / 1000).toFixed(1)}s`
            : "—";

      if (uptime)
        uptime.textContent =
          formatUptime(data.uptime || 0);

      if (emergency)
        emergency.textContent =
          engine.emergencyStopped
            ? "YES"
            : "No";

    } catch (error) {

      addLog(
        "Health error: " + error.message,
        "error"
      );
    }
  }


  /* ============================================================
     ENGINE ACTIONS
     ============================================================ */

  async function action(endpoint) {

    if (!ADMIN_KEY) {

      alert(
        "Admin key missing.\n\n" +
        "Open the dashboard with:\n" +
        "?key=YOUR_ADMIN_KEY"
      );

      return;
    }

    const resultEl =
      document.getElementById("action-result");

    if (resultEl) {

      resultEl.classList.remove("hidden");

      resultEl.textContent =
        "Sending command...";

      resultEl.className =
        "mt-4 text-sm text-amber-400";
    }

    addLog(
      `Command → ${endpoint}`,
      "info"
    );

    try {

      const data =
        await apiFetch(`/api/${endpoint}`, {
          method: "POST"
        });

      if (resultEl) {

        resultEl.textContent =
          "Success: " +
          JSON.stringify(data);

        resultEl.className =
          "mt-4 text-sm text-emerald-400";
      }

      addLog(
        `Success: ${endpoint}`,
        "success"
      );

      setTimeout(
        refreshStatus,
        500
      );

    } catch (error) {

      if (resultEl) {

        resultEl.textContent =
          "Error: " +
          error.message;

        resultEl.className =
          "mt-4 text-sm text-rose-400";
      }

      addLog(
        `Error: ${error.message}`,
        "error"
      );
    }
  }


  /* ============================================================
     ACTIVITY DATA
     ============================================================ */

  async function loadActivity() {

    const container =
      document.getElementById("log-container");

    if (!container) return;

    container.innerHTML =
      '<div class="text-slate-500">Loading activity...</div>';

    try {

      /*
       * Supports the common endpoint names used by
       * GRIDV21 backend versions.
       */

      let data;

      try {

        data =
          await apiFetch("/api/audit-logs");

      } catch (_) {

        data =
          await apiFetch("/api/system-events");
      }

      const rows =
        data.logs ||
        data.events ||
        data.data ||
        [];

      container.innerHTML = "";

      if (!rows.length) {

        container.innerHTML =
          '<div class="text-slate-500">No activity recorded.</div>';

        return;
      }

      rows.forEach(row => {

        const level =
          String(
            row.level ||
            row.severity ||
            "info"
          ).toLowerCase();

        const message =
          row.message ||
          row.event_type ||
          row.title ||
          "System event";

        addLog(
          message,
          level === "error"
            ? "error"
            : level === "warn"
              ? "warn"
              : "info"
        );
      });

    } catch (error) {

      container.innerHTML =
        `<div class="text-rose-400">Unable to load activity: ${escapeHTML(error.message)}</div>`;
    }
  }


  /* ============================================================
     LEADS / PERMITS
     ============================================================ */

  async function loadLeads() {

    const container =
      document.getElementById("leads-container");

    if (!container) return;

    container.innerHTML =
      '<div class="text-slate-500 text-sm">Loading leads...</div>';

    try {

      let data;

      try {

        data =
          await apiFetch("/api/leads");

      } catch (_) {

        data =
          await apiFetch("/api/permits");
      }

      const rows =
        data.leads ||
        data.permits ||
        data.data ||
        [];

      if (!rows.length) {

        container.innerHTML =
          '<div class="text-slate-500 text-sm">No leads or permits found.</div>';

        return;
      }

      container.innerHTML = "";

      rows.forEach(item => {

        const card =
          document.createElement("div");

        card.className =
          "bg-slate-800/60 border border-slate-700 rounded-xl p-4";

        const city =
          item.city ||
          item.region ||
          "Unknown";

        const type =
          item.trade_type ||
          item.permit_type ||
          "Unknown";

        const status =
          item.status ||
          "New";

        const value =
          item.value_estimate ??
          item.estimated_value ??
          0;

        const score =
          item.ai_score ??
          "—";

        card.innerHTML = `
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-semibold">
                ${escapeHTML(type)}
              </p>

              <p class="text-xs text-slate-400 mt-1">
                ${escapeHTML(city)}
              </p>
            </div>

            <span class="text-xs px-2 py-1 rounded-full
              bg-emerald-500/10 text-emerald-400">
              ${escapeHTML(status)}
            </span>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">

            <div>
              <p class="text-[10px] text-slate-500">
                Estimated Value
              </p>

              <p class="text-sm font-semibold">
                ${formatMoney(value)}
              </p>
            </div>

            <div>
              <p class="text-[10px] text-slate-500">
                AI Score
              </p>

              <p class="text-sm font-semibold text-brand-400">
                ${escapeHTML(score)}
              </p>
            </div>

            <div>
              <p class="text-[10px] text-slate-500">
                Permit ID
              </p>

              <p class="text-sm font-semibold">
                ${escapeHTML(
                  item.permit_id ||
                  item.external_id ||
                  item.id ||
                  "—"
                )}
              </p>
            </div>

            <div>
              <p class="text-[10px] text-slate-500">
                Created
              </p>

              <p class="text-sm">
                ${formatDate(item.created_at)}
              </p>
            </div>

          </div>
        `;

        container.appendChild(card);
      });

    } catch (error) {

      container.innerHTML =
        `<div class="text-rose-400 text-sm">
          Lead loading error:
          ${escapeHTML(error.message)}
        </div>`;
    }
  }


  /* ============================================================
     BRAIN RECOMMENDATION
     ============================================================ */

  async function loadBrainSuggestion() {

    const element =
      document.getElementById("brain-suggestion");

    if (!element) return;

    element.textContent =
      "Analyzing recent activity...";

    try {

      let data;

      try {

        data =
          await apiFetch("/api/forecast");

      } catch (_) {

        data = {};
      }

      const suggestion =
        data.suggestion ||
        data.recommendation ||
        data.message ||
        "GRIDV21 Brain is monitoring the operating environment.";

      element.textContent =
        suggestion;

    } catch (error) {

      element.textContent =
        "Brain recommendation unavailable.";
    }
  }


  function authorizeAction() {

    addLog(
      "Brain recommendation authorized by administrator.",
      "success"
    );

    alert(
      "Recommendation authorized."
    );
  }


  function dismissSuggestion() {

    const element =
      document.getElementById("brain-suggestion");

    if (element) {

      element.textContent =
        "Recommendation dismissed.";
    }

    addLog(
      "Brain recommendation dismissed.",
      "warn"
    );
  }


  /* ============================================================
     REVENUE
     ============================================================ */

  async function loadRevenue() {

    try {

      const data =
        await apiFetch("/api/dashboard");

      const revenue =
        data.revenue ||
        data.revenue_log ||
        {};

      const total =
        revenue.total ||
        revenue.total_revenue ||
        data.est_revenue_month ||
        0;

      const cards =
        document.querySelectorAll(
          "#section-revenue .text-2xl"
        );

      if (cards[0])
        cards[0].textContent =
          formatMoney(
            data.pipeline ||
            data.total_pipeline ||
            0
          );

      if (cards[1])
        cards[1].textContent =
          formatMoney(
            data.closed_revenue ||
            revenue.closed ||
            total
          );

      if (cards[2])
        cards[2].textContent =
          formatMoney(
            data.average_deal ||
            0
          );

    } catch (error) {

      addLog(
        "Revenue load: " + error.message,
        "warn"
      );
    }
  }


  /* ============================================================
     AFFILIATE DATA
     ============================================================ */

  async function loadAffiliates() {

    try {

      let data;

      try {

        data =
          await apiFetch("/api/affiliate-tracking");

      } catch (_) {

        data =
          await apiFetch("/api/affiliates");
      }

      const rows =
        data.affiliates ||
        data.data ||
        [];

      const clicks =
        rows.reduce(
          (sum, row) =>
            sum + Number(row.clicks || 0),
          0
        );

      const conversions =
        rows.reduce(
          (sum, row) =>
            sum + Number(row.conversions || 0),
          0
        );

      const cards =
        document.querySelectorAll(
          "#section-affiliates .text-2xl"
        );

      if (cards[0])
        cards[0].textContent =
          rows.length;

      if (cards[1])
        cards[1].textContent =
          clicks;

      if (cards[2])
        cards[2].textContent =
          conversions;

    } catch (error) {

      addLog(
        "Affiliate load: " + error.message,
        "warn"
      );
    }
  }


  /* ============================================================
     12 CANONICAL GRIDV21 OS MODULES
     ============================================================ */

  function renderOSModules(modules = []) {

    const container =
      document.getElementById("os-modules-container");

    if (!container) return;

    const source =
      modules.length
        ? modules
        : OS_MODULES.map(
            name => ({
              name,
              status: "active",
              enabled: true
            })
          );

    container.innerHTML = "";

    source.forEach((module, index) => {

      const canonicalName =
        module.name ||
        OS_MODULES[index] ||
        `OS Module ${index + 1}`;

      const enabled =
        module.enabled !== false &&
        module.status !== "disabled";

      const card =
        document.createElement("div");

      card.className =
        "bg-slate-800/60 border border-slat

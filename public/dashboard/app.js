(() => {
  "use strict";

  const VERSION = "6.3.7";

  const API = {
    health: "/api/health",
    authVerify: "/api/auth/verify",
    dashboard: "/api/dashboard",
    osModules: "/api/os-modules",
    permits: "/api/permits",
    scrapeNow: "/api/scrape-now",
    scanStatus: "/api/scan-status",
    scanStop: "/api/brain/scan-stop",
    brainPause: "/api/brain/pause",
    brainResume: "/api/brain/resume",
    emergencyStop: "/api/brain/emergency-stop",
    osToggle: id => `/api/os-toggle/${encodeURIComponent(id)}`,
    forecast: "/api/forecast",
    integrations: "/api/integrations",
    auditLogs: "/api/system-events",
    systemEvents: "/api/system-events"
  };

  const state = {
    adminKey: "",
    authenticated: false,
    connected: false,
    dashboard: null,
    osModules: [],
    permits: [],
    leads: [],
    integrations: [],
    auditLogs: [],
    systemEvents: [],
    refreshTimer: null,
    requestInFlight: false,
    mobileSidebarOpen: false
  };

  const OS_MODULES = [
    {
      id: 1,
      name: "Executive Intelligence",
      description: "Strategy and executive decision intelligence.",
      layer: "Strategy",
      kpis_count: 12,
      agents_count: 4
    },
    {
      id: 2,
      name: "Revenue Intelligence",
      description: "Revenue performance, forecasting and monetisation.",
      layer: "Finance",
      kpis_count: 14,
      agents_count: 5
    },
    {
      id: 3,
      name: "Sales & CRM",
      description: "Sales pipeline, prospects and customer relationship intelligence.",
      layer: "Sales",
      kpis_count: 16,
      agents_count: 6
    },
    {
      id: 4,
      name: "Marketing",
      description: "Growth, campaigns, audiences and acquisition intelligence.",
      layer: "Growth",
      kpis_count: 15,
      agents_count: 5
    },
    {
      id: 5,
      name: "Operations",
      description: "Operational performance and process intelligence.",
      layer: "Operations",
      kpis_count: 14,
      agents_count: 5
    },
    {
      id: 6,
      name: "Finance",
      description: "Accounting, cash flow and financial intelligence.",
      layer: "Accounting",
      kpis_count: 13,
      agents_count: 4
    },
    {
      id: 7,
      name: "Human Capital",
      description: "People, workforce and organisational intelligence.",
      layer: "People",
      kpis_count: 11,
      agents_count: 4
    },
    {
      id: 8,
      name: "Project Management",
      description: "Projects, delivery, milestones and resource intelligence.",
      layer: "Projects",
      kpis_count: 13,
      agents_count: 4
    },
    {
      id: 9,
      name: "Knowledge Intelligence",
      description: "Enterprise knowledge and institutional intelligence.",
      layer: "Knowledge",
      kpis_count: 10,
      agents_count: 3
    },
    {
      id: 10,
      name: "Legal & Compliance",
      description: "Risk, regulatory and compliance intelligence.",
      layer: "Compliance",
      kpis_count: 12,
      agents_count: 4
    },
    {
      id: 11,
      name: "Supply Chain",
      description: "Suppliers, logistics and procurement intelligence.",
      layer: "Supply",
      kpis_count: 13,
      agents_count: 4
    },
    {
      id: 12,
      name: "Acquisition Intelligence",
      description: "Lead discovery, permit intelligence and acquisition.",
      layer: "Lead Generation",
      kpis_count: 18,
      agents_count: 7
    },
    {
      id: 13,
      name: "Customer Success",
      description: "Customer health, retention and expansion intelligence.",
      layer: "Customer",
      kpis_count: 12,
      agents_count: 4
    },
    {
      id: 14,
      name: "IT & Security",
      description: "Technology, infrastructure and security intelligence.",
      layer: "Technology",
      kpis_count: 15,
      agents_count: 5
    },
    {
      id: 15,
      name: "Analytics & BI",
      description: "Enterprise analytics, reporting and business intelligence.",
      layer: "Analytics",
      kpis_count: 20,
      agents_count: 6
    }
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function text(id, value) {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.textContent =
      value === undefined ||
      value === null ||
      value === ""
        ? "—"
        : String(value);
  }

  function html(id, value) {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.innerHTML = value ?? "";
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeArray(value) {
    if (Array.isArray(value)) {
      return value;
    }

    return [];
  }

  function safeObject(value) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value;
    }

    return {};
  }

  function safeNumber(value, fallback = 0) {
    const numberValue = Number(value);

    return Number.isFinite(numberValue)
      ? numberValue
      : fallback;
  }

  function dateTime(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString(
      "en-GB",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );
  }

  function money(value) {
    const numberValue =
      safeNumber(value, 0);

    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2
      }
    ).format(numberValue);
  }

  function number(value) {
    return new Intl.NumberFormat(
      "en-GB"
    ).format(
      safeNumber(value, 0)
    );
  }

  function bool(value) {
    return value
      ? "YES"
      : "NO";
  }

  function formatDuration(value) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return "—";
    }

    const seconds =
      safeNumber(value, NaN);

    if (!Number.isFinite(seconds)) {
      return String(value);
    }

    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }

    const minutes =
      Math.floor(seconds / 60);

    const remainingSeconds =
      Math.round(seconds % 60);

    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    const hours =
      Math.floor(minutes / 60);

    const remainingMinutes =
      minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  }

  function formatUptime(value) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return "—";
    }

    const seconds =
      safeNumber(value, NaN);

    if (!Number.isFinite(seconds)) {
      return String(value);
    }

    const days =
      Math.floor(seconds / 86400);

    const hours =
      Math.floor(
        (seconds % 86400) / 3600
      );

    const minutes =
      Math.floor(
        (seconds % 3600) / 60
      );

    if (days > 0) {
      return `${days}d ${hours}h`;
    }

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
  }

  function showToast(
    message,
    type = "info"
  ) {
    const toast =
      byId("toast");

    if (!toast) {
      return;
    }

    toast.textContent =
      String(message ?? "");

    toast.className =
      `toast toast-${type}`;

    toast.classList.add("show");

    clearTimeout(
      showToast.timer
    );

    showToast.timer =
      setTimeout(
        () => {
          toast.classList.remove(
            "show"
          );
        },
        3500
      );
  }

  function setGlobalStatus(
    connected,
    message
  ) {
    state.connected =
      Boolean(connected);

    const badge =
      byId("global-status");

    const textElement =
      byId("global-status-text");

    const dot =
      byId("global-status-dot");

    if (textElement) {
      textElement.textContent =
        message ||
        (
          connected
            ? "Connected"
            : "Disconnected"
        );
    }

    if (badge) {
      badge.classList.toggle(
        "badge-success",
        connected
      );

      badge.classList.toggle(
        "badge-muted",
        !connected
      );
    }

    if (dot) {
      dot.classList.toggle(
        "status-online",
        connected
      );
    }
  }

  class APIError extends Error {
    constructor(
      message,
      status = 0,
      payload = null
    ) {
      super(message);

      this.name =
        "APIError";

      this.status =
        status;

      this.payload =
        payload;
    }
  }

  async function verifySession() {
    try {
      const response =
        await fetch(
          "/api/auth/me",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
              "Accept":
                "application/json"
            }
          }
        );

      const payload =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        payload.authenticated !== true
      ) {
        state.authenticated = false;

        setGlobalStatus(
          false,
          "Login required"
        );

        window.location.replace(
          "/login.html"
        );

        return false;
      }

      state.authenticated = true;

      setGlobalStatus(
        true,
        "Authenticated"
      );

      setAuthUI(true);

      return true;

    } catch (error) {
      console.error(
        "[GRIDV21 SESSION]",
        error
      );

      state.authenticated = false;

      setGlobalStatus(
        false,
        "Authentication error"
      );

      window.location.replace(
        "/login.html"
      );

      return false;
    }
  }

  function handleAuthFailure(
    error
  ) {
    if (
      error instanceof APIError &&
      error.status === 401
    ) {
      state.authenticated =
        false;

      setGlobalStatus(
        false,
        "Authentication required"
      );

      showToast(
        "GRIDV21 rejected the admin key.",
        "error"
      );

      return true;
    }

    return false;
  }

  window.GRIDV21 = {
    VERSION,
    API,
    state,
    apiFetch,
    verifyAdminKey,
    saveAdminKey,
    clearAdminKey,
    showToast
  };      );
    },
    3500
  );
}

/* ========================================================================
 * GLOBAL STATUS
 * ====================================================================== */

function setGlobalStatus(
  connected,
  message
) {
  state.connected =
    Boolean(connected);

  const badge =
    byId("global-status");

  const textElement =
    byId("global-status-text");

  const dot =
    byId("global-status-dot");

  if (textElement) {
    textElement.textContent =
      message ||
      (
        connected
          ? "Connected"
          : "Disconnected"
      );
  }

  if (badge) {
    badge.classList.toggle(
      "badge-success",
      connected
    );

    badge.classList.toggle(
      "badge-muted",
      !connected
    );
  }

  if (dot) {
    dot.classList.toggle(
      "status-online",
      connected
    );
  }
}

/* ========================================================================
 * API ERROR
 * ====================================================================== */

class APIError extends Error {
  constructor(
    message,
    status = 0,
    payload = null
  ) {
    super(message);

    this.name =
      "APIError";

    this.status =
      status;

    this.payload =
      payload;
  }
}

/* ============================================================
 * SESSION AUTHENTICATION
 * ============================================================ */

async function verifySession() {

  try {

    const response =
      await fetch(
        "/api/auth/me",
        {
          method: "GET",

          credentials: "include",

          cache: "no-store",

          headers: {
            "Accept":
              "application/json"
          }
        }
      );

    const payload =
      await response
        .json()
        .catch(() => ({}));

    if (
      !response.ok ||
      payload.authenticated !== true
    ) {

      state.authenticated = false;

      setGlobalStatus(
        false,
        "Login required"
      );

      window.location.replace(
        "/login.html"
      );

      return false;
    }

    state.authenticated = true;

    setGlobalStatus(
      true,
      "Authenticated"
    );

    setAuthUI(true);

    return true;

  } catch (error) {

    console.error(
      "[GRIDV21 SESSION]",
      error
    );

    state.authenticated = false;

    setGlobalStatus(
      false,
      "Authentication error"
    );

    window.location.replace(
      "/login.html"
    );

    return false;
  }
}

/* ========================================================================
 * AUTH FAILURE HANDLER
 * ====================================================================== */

function handleAuthFailure(
  error
) {
  if (
    error instanceof APIError &&
    error.status === 401
  ) {
    state.authenticated =
      false;

    setGlobalStatus(
      false,
      "Authentication required"
    );

    showToast(
      "GRIDV21 rejected the admin key.",
      "error"
    );

    return true;
  }

  return false;
}

/* ========================================================================
 * EXPOSE CORE FUNCTIONS
 * ====================================================================== */

window.GRIDV21 = {
  VERSION,
  API,
  state,

  apiFetch,
  verifyAdminKey,
  saveAdminKey,
  clearAdminKey,

  showToast
};

/* ==========================================================================
 * GRIDV21 BRAIN ENTERPRISE — DASHBOARD APP
 * VERSION: 6.3.7
 *
 * PART 2 / 4
 * - Dashboard API loading
 * - OS module loading
 * - Permit / lead loading
 * - Runtime telemetry
 * - Metrics rendering
 * - AI recommendation rendering
 * - OS overview rendering
 * ========================================================================== */


/* ========================================================================
 * NORMALISE DASHBOARD RESPONSE
 * ====================================================================== */

function normaliseDashboard(payload) {
  const data =
    safeObject(payload);

  /*
   * The backend may return the dashboard directly,
   * or wrap it inside { data: ... }.
   */

  const source =
    safeObject(
      data.data || data.dashboard || data
    );

  return {
    engine:
      safeObject(
        source.engine ||
        source.runtime ||
        source.telemetry
      ),

    metrics:
      safeObject(
        source.metrics
      ),

    revenue:
      safeObject(
        source.revenue
      ),

    leads:
      safeArray(
        source.leads ||
        source.topLeads
      ),

    permits:
      safeArray(
        source.permits
      ),

    osModules:
      safeArray(
        source.osModules ||
        source.modules ||
        source.os
      ),

    activity:
      safeArray(
        source.activity ||
        source.events ||
        source.latestEvents
      ),

    recommendation:
      source.recommendation ||
      source.aiRecommendation ||
      source.brainSignal ||
      null
  };
}

/* ========================================================================
 * LOAD DASHBOARD
 * ====================================================================== */

async function loadDashboard() {
  if (!state.authenticated) {
    setAuthUI(false);
    return;
  }

  try {
    const payload = await apiFetch(API.dashboard);
    const dashboard = normaliseDashboard(payload);

    // Optional secondary calls — fail soft so the main dashboard still renders
    let status = null;
    let osData = {};
    let permitData = {};

    try {
      status = await apiFetch(API.scanStatus);
    } catch (e) {
      console.warn("[GRIDV21] scanStatus unavailable:", e.message);
    }

    try {
      osData = await apiFetch(API.osModules);
    } catch (e) {
      console.warn("[GRIDV21] osModules unavailable:", e.message);
    }

    try {
      permitData = await apiFetch(API.permits);
    } catch (e) {
      console.warn("[GRIDV21] permits unavailable:", e.message);
    }

    state.dashboard = dashboard;
    state.status = status;
    state.osModules = osData.osModules || osData.data || osData.modules || [];
    state.permits = permitData.permits || permitData.data || [];

    if (dashboard.leads && dashboard.leads.length) {
      state.leads = dashboard.leads;
    }

    if (dashboard.permits && dashboard.permits.length) {
      state.permits = dashboard.permits;
    }

    if (dashboard.osModules && dashboard.osModules.length) {
      state.osModules = dashboard.osModules;
    }

    renderDashboard(dashboard);

    if (typeof renderPermitsTable === "function") {
      renderPermitsTable(state.permits);
    }

    if (typeof renderTopLeads === "function") {
      renderTopLeads(state.leads);
    }

    return dashboard;

  } catch (error) {

    handleAuthFailure(error);

    console.error(
      "[GRIDV21] Dashboard load failed:",
      error
    );

    renderDashboardError(error);

    throw error;
  }
}

/* ========================================================================
 * LOAD OS MODULES
 * ====================================================================== */

async function loadOSModules() {
  try {

    const payload =
      await apiFetch(
        API.osModules
      );

    const data =
      safeObject(payload);

    const modules =
      safeArray(
        data.modules ||
        data.data ||
        data.osModules ||
        payload
      );

    if (
      modules.length
    ) {
      state.osModules =
        modules;
    }

    renderOSOverview(
      state.osModules.length ? state.osModules : OS_MODULES
    );

    return state.osModules;

  } catch (error) {

    handleAuthFailure(error);

    console.warn(
      "[GRIDV21] OS module API failed:",
      error
    );

    renderOSOverview(
      state.osModules.length ? state.osModules : OS_MODULES
    );

    return state.osModules;
  }
}


/* ========================================================================
 * LOAD PERMITS
 * ====================================================================== */

function renderPermitsTable(permits) {
  const body = byId("permits-body");
  if (!body) return;

  const rows = safeArray(permits).slice(0, 100);

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No permits found.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(p => {
    const r = safeObject(p);

    return `
      <tr>
        <td>${escapeHTML(r.city || "—")}</td>
        <td>${escapeHTML(r.permit_type || r.permit_id || "—")}</td>
        <td>${escapeHTML(r.status || "—")}</td>
        <td>${escapeHTML(r.ai_score ?? "—")}</td>
        <td>${r.estimated_value != null && r.estimated_value !== "" ? money(r.estimated_value) : "—"}</td>
      </tr>`;
  }).join("");
}

async function loadPermits() {

  try {

    const payload =
      await apiFetch(
        API.permits
      );

    const data =
      safeObject(payload);

    const permits =
      safeArray(
        data.permits ||
        data.data ||
        payload
      );

    state.permits = permits;

    renderPermitsTable(permits);

    return permits;

  } catch (error) {

    /*
     * Some backend versions do not expose
     * /api/permits. Do not break dashboard.
     */

    if (
      error.status !== 404
    ) {
      console.warn(
        "[GRIDV21] Permit API failed:",
        error
      );
    }

    return state.permits;
  }
}


/* ========================================================================
 * REFRESH DASHBOARD
 * ====================================================================== */

async function refreshDashboardData() {

  if (
    state.requestInFlight
  ) {
    return;
  }

  state.requestInFlight =
    true;

  setRefreshState(
    true
  );

  try {

    /*
     * First verify the backend is alive.
     */

    try {

      await apiFetch(
        API.health
      );

    } catch (healthError) {

      console.warn(
        "[GRIDV21] Health check failed:",
        healthError
      );
    }


    /*
     * Dashboard data is the primary request.
     */

    await loadDashboard();


    /*
     * These are secondary requests.
     * Promise.allSettled prevents one optional
     * endpoint from blocking the entire dashboard.
     */

    await Promise.allSettled([
      loadOSModules(),
      loadPermits()
    ]);


    setGlobalStatus(
      true,
      "Connected"
    );

  } catch (error) {

    console.error(
      "[GRIDV21] Refresh failed:",
      error
    );

    if (
      error.status === 401
    ) {

      setGlobalStatus(
        false,
        "Authentication required"
      );

    } else {

      setGlobalStatus(
        false,
        "API unavailable"
      );
    }

  } finally {

    state.requestInFlight =
      false;

    setRefreshState(
      false
    );
  }
}


/* ========================================================================
 * REFRESH BUTTON STATE
 * ====================================================================== */

function setRefreshState(
  loading
) {
  const button =
    byId("refresh-btn");

  if (!button) {
    return;
  }

  button.disabled =
    Boolean(loading);

  if (loading) {

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      "Refreshing...";

  } else {

    button.textContent =
      button.dataset.originalText ||
      "Refresh";
  }
}


/* ========================================================================
 * DASHBOARD RENDERER
 * ====================================================================== */

function renderDashboard(
  dashboard
) {

  const engine =
    safeObject(
      dashboard.engine
    );

  const metrics =
    safeObject(
      dashboard.metrics
    );

  const revenue =
    safeObject(
      dashboard.revenue
    );


  /* ----------------------------------------------------------------------
   * ENGINE
   * -------------------------------------------------------------------- */

  const running =
    engine.running ??
    engine.isRunning ??
    metrics.running ??
    false;

  const scanning =
    engine.scanning ??
    engine.isScanning ??
    metrics.scanning ??
    false;


  text(
    "metric-engine",
    running
      ? "Running"
      : "Stopped"
  );


  text(
    "metric-engine-sub",
    scanning
      ? "Scanning"
      : running
        ? "Operational"
        : "Idle"
  );


  /* ----------------------------------------------------------------------
   * ACTIVE OS
   * -------------------------------------------------------------------- */

  const activeOS =
    safeNumber(
      metrics.activeOS ??
      metrics.activeOs ??
      metrics.active_modules ??
      dashboard.osModules.length,
      dashboard.osModules.length
    );

  text(
    "metric-os",
    activeOS
  );


  /* ----------------------------------------------------------------------
   * LEADS
   * -------------------------------------------------------------------- */

  const leadCount =
    safeNumber(
      metrics.leads ??
      metrics.leadCount ??
      metrics.totalLeads ??
      dashboard.leads.length,
      dashboard.leads.length
    );

  text(
    "metric-leads",
    number(leadCount)
  );


  /* ----------------------------------------------------------------------
   * REVENUE
   * -------------------------------------------------------------------- */

  const revenueValue =
    revenue.total ??
    revenue.amount ??
    metrics.revenue ??
    metrics.totalRevenue ??
    0;

  text(
    "metric-revenue",
    money(revenueValue)
  );


  renderTelemetry(
    engine
  );

  renderRecommendation(
    dashboard.recommendation
  );

  renderTopLeads(
    dashboard.leads.length
      ? dashboard.leads
      : state.leads
  );

  renderLatestEvents(
    dashboard.activity
  );

  renderOSOverview(
    dashboard.osModules.length
      ? dashboard.osModules
      : (
          state.osModules.length
            ? state.osModules
            : OS_MODULES
        )
  );
}


/* ========================================================================
 * TELEMETRY
 * ====================================================================== */

function renderTelemetry(
  engine
) {

  const data =
    safeObject(engine);


  text(
    "telemetry-running",
    bool(
      data.running ??
      data.isRunning
    )
  );


  text(
    "telemetry-scanning",
    bool(
      data.scanning ??
      data.isScanning
    )
  );


  text(
    "telemetry-permits",
    number(
      data.permitsFound ??
      data.permits_found ??
      data.totalPermits ??
      0
    )
  );


  text(
    "telemetry-errors",
    number(
      data.errors ??
      data.errorCount ??
      0
    )
  );


  text(
    "telemetry-last-scan",
    dateTime(
      data.lastScan ??
      data.last_scan
    )
  );


  text(
    "telemetry-duration",
    formatDuration(
      data.lastScanDuration ??
      data.last_scan_duration ??
      data.duration
    )
  );


  text(
    "telemetry-uptime",
    formatUptime(
      data.uptime
    )
  );


  text(
    "telemetry-emergency",
    bool(
      data.emergency ??
      data.emergencyStop ??
      data.emergency_stop
    )
  );


  const status =
    data.running
      ? (
          data.scanning
            ? "Scanning"
            : "Running"
        )
      : "Ready";


  const statusElement =
    document.querySelector(
      "#engine-runtime-status"
    );


  if (statusElement) {
    statusElement.textContent =
      status;
  }
}


/* ========================================================================
 * DASHBOARD ERROR STATE
 * ====================================================================== */

function renderDashboardError(
  error
) {

  const message =
    error?.status === 401
      ? "Authentication required"
      : "Unable to load dashboard data";


  text(
    "metric-engine",
    "Offline"
  );


  text(
    "metric-engine-sub",
    message
  );


  text(
    "metric-os",
    "—"
  );


  text(
    "metric-leads",
    "—"
  );


  text(
    "metric-revenue",
    "—"
  );


  const telemetryIds = [
    "telemetry-running",
    "telemetry-scanning",
    "telemetry-permits",
    "telemetry-errors",
    "telemetry-last-scan",
    "telemetry-duration",
    "telemetry-uptime",
    "telemetry-emergency"
  ];


  telemetryIds.forEach(
    id => text(id, "—")
  );


  renderRecommendation(
    null,
    message
  );


  renderTopLeads(
    []
  );


  renderLatestEvents(
    []
  );


  renderOSOverview(
    OS_MODULES
  );
}


/* ========================================================================
 * AI RECOMMENDATION
 * ====================================================================== */

function renderRecommendation(
  recommendation,
  fallback = ""
) {

  const element =
    byId("ai-recommendation") ||
    byId("recommendation-text") ||
    document.querySelector(
      "[data-ai-recommendation]"
    );


  if (!element) {
    return;
  }


  let message = "";


  if (
    typeof recommendation ===
    "string"
  ) {

    message =
      recommendation;

  } else if (
    recommendation &&
    typeof recommendation ===
    "object"
  ) {

    message =
      recommendation.message ||
      recommendation.text ||
      recommendation.recommendation ||
      recommendation.action ||
      "";
  }


  if (!message) {

    message =
      fallback ||
      "No AI recommendation available.";
  }


  element.textContent =
    message;
}


/* ========================================================================
 * TOP LEADS
 * ====================================================================== */

function renderTopLeads(leads) {

  const container =
    byId("top-leads-body");

  if (!container) return;

  let rows =
    safeArray(leads)
      .slice(0, 10);

  // Fallback 1: state.leads
  if (!rows.length) {
    rows =
      safeArray(state.leads)
        .slice(0, 10);
  }

  // Fallback 2: highest-value permits
  if (!rows.length) {
    rows =
      safeArray(state.permits)
        .slice()
        .sort((a, b) =>
          Number(b.estimated_value || b.ai_score || 0) -
          Number(a.estimated_value || a.ai_score || 0)
        )
        .slice(0, 10);
  }

  // Fallback 3: dashboard permits
  if (!rows.length && state.dashboard?.permits) {
    rows =
      safeArray(state.dashboard.permits)
        .slice()
        .sort((a, b) =>
          Number(b.estimated_value || b.ai_score || 0) -
          Number(a.estimated_value || a.ai_score || 0)
        )
        .slice(0, 10);
  }

  if (!rows.length) {
    container.innerHTML =
      `<tr><td colspan="4" class="empty">No lead data available.</td></tr>`;
    return;
  }

  container.innerHTML =
    rows.map(item => {

      const r =
        safeObject(item);

      const city =
        r.city ||
        r.region ||
        r.location ||
        "—";

      const type =
        r.type ||
        r.permit_type ||
        r.trade_type ||
        r.project_type ||
        "—";

      const score =
        r.score ??
        r.ai_score ??
        r.lead_score ??
        "—";

      const value =
        r.estimated_value ??
        r.value_estimate ??
        r.value ??
        r.predicted_revenue ??
        "";

      return `
        <tr>
          <td>${escapeHTML(city)}</td>
          <td>${escapeHTML(type)}</td>
          <td>${escapeHTML(score)}</td>
          <td>${value !== "" && value != null ? money(value) : "—"}</td>
        </tr>`;

    }).join("");
}


/* ========================================================================
 * LATEST EVENTS
 * ====================================================================== */

function renderLatestEvents(
  events
) {

  const container =
    byId("dashboard-activity") ||
    byId("latest-events") ||
    byId("events-container") ||
    document.querySelector(
      "[data-latest-events]"
    );


  if (!container) {
    return;
  }


  const rows =
    safeArray(events)
      .slice(0, 10);


  if (!rows.length) {

    container.innerHTML = `
      <div class="empty">
        No recent activity.
      </div>
    `;

    return;
  }


  container.innerHTML =
    rows.map(
      event => {

        const item =
          safeObject(event);


        const message =
          item.message ||
          item.action ||
          item.event_type ||
          item.eventType ||
          "System event";


        const created =
          item.created_at ||
          item.createdAt ||
          item.timestamp;


        return `
          <div class="event-row">
            <strong>
              ${escapeHTML(message)}
            </strong>

            <small>
              ${escapeHTML(dateTime(created))}
            </small>
          </div>
        `;
      }
    ).join("");
}


/* ========================================================================
 * OS OVERVIEW
 * ====================================================================== */

function renderOSOverview(
  modules
) {

  const container =
    byId("os-overview-grid") ||
    byId("os-overview") ||
    byId("os-modules") ||
    document.querySelector(
      "[data-os-overview]"
    );


  if (!container) {
    return;
  }


  const rows =
    safeArray(modules);


  if (!rows.length) {

    container.innerHTML = `
      <div class="empty">
        No operating-system modules available.
      </div>
    `;

    return;
  }


  container.innerHTML =
    rows.map(
      module => {

        const item =
          safeObject(module);


        const id =
          item.id ??
          "";


        const name =
          item.name ||
          `OS Module ${id}`;


        const enabled =
          item.enabled ??
          item.active ??
          item.status === "active";


        const layer =
          item.layer ||
          "Enterprise OS";


        return `
          <div
            class="os-module-row"
            data-os-module="${escapeHTML(id)}"
          >

            <div class="os-module-info">

              <strong>
                ${escapeHTML(name)}
              </strong>

              <small>
                ${escapeHTML(layer)}
              </small>

            </div>

            <button
              type="button"
              class="os-toggle ${enabled ? "active" : ""}"
              data-os-toggle="${escapeHTML(id)}"
              aria-pressed="${enabled ? "true" : "false"}"
            >
              ${enabled ? "Active" : "Off"}
            </button>

          </div>
        `;
      }
    ).join("");
}


/* ========================================================================
 * EXPORT PART 2 FUNCTIONS
 * ====================================================================== */

window.GRIDV21 = {
  ...(window.GRIDV21 || {}),

  normaliseDashboard,

  loadDashboard,
  loadOSModules,
  loadPermits,

  refreshDashboardData,

  renderDashboard,
  renderTelemetry,
  renderDashboardError,

  renderRecommendation,
  renderTopLeads,
  renderLatestEvents,
  renderOSOverview
};


/* ==========================================================================
 * GRIDV21 BRAIN ENTERPRISE — DASHBOARD APP
 * VERSION: 6.3.7
 *
 * PART 3 / 4
 * - Engine controls
 * - Scan controls
 * - Brain pause/resume
 * - Emergency stop
 * - OS toggles
 * - Control error handling
 * ========================================================================== */


/* ========================================================================
 * GENERIC CONTROL REQUEST
 * ====================================================================== */

async function controlRequest(
  url,
  options = {}
) {

  try {

    const payload =
      await apiFetch(
        url,
        {
          method:
            options.method || "POST",

          body:
            options.body !== undefined
              ? JSON.stringify(
                  options.body
                )
              : undefined,

          headers:
            options.headers || {}
        }
      );


    state.authenticated =
      true;


    setGlobalStatus(
      true,
      "Connected"
    );


    return payload;


  } catch (error) {

    handleAuthFailure(
      error
    );


    console.error(
      "[GRIDV21] Control request failed:",
      error
    );


    throw error;
  }
}


/* ========================================================================
 * ENGINE ACTION
 *
 * Supported actions:
 *   scan/start
 *   scan/stop
 *   brain/pause
 *   brain/resume
 * ====================================================================== */

async function engineAction(
  action
) {

  const normalized =
    String(action || "")
      .trim()
      .toLowerCase();


  const actionMap = {

    "scan/start":
      API.scrapeNow,

    "scan/stop":
      API.scanStop,

    "brain/pause":
      API.brainPause,

    "brain/resume":
      API.brainResume
  };


  const endpoint =
    actionMap[normalized];


  if (!endpoint) {

    showToast(
      `Unknown engine action: ${normalized}`,
      "error"
    );

    return false;
  }


  const button =
    document.querySelector(
      `[data-action="${CSS.escape(normalized.replace("/", "-"))}"]`
    );


  if (button) {

    button.disabled =
      true;
  }


  const labels = {

    "scan/start":
      "Starting scan...",

    "scan/stop":
      "Stopping scan...",

    "brain/pause":
      "Pausing engine...",

    "brain/resume":
      "Resuming engine..."
  };


  if (button) {

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      labels[normalized];
  }


  try {

    const payload =
      await controlRequest(
        endpoint,
        {
          method: "POST"
        }
      );


    const messages = {

      "scan/start":
        "Scan started successfully.",

      "scan/stop":
        "Scan stop requested.",

      "brain/pause":
        "Brain engine paused.",

      "brain/resume":
        "Brain engine resumed."
    };


    showToast(
      payload?.message ||
      messages[normalized],
      "success"
    );


    /*
     * Give the backend a moment to update
     * ENGINE telemetry before refreshing.
     */

    await wait(350);

    await refreshDashboardData();

    return true;


  } catch (error) {

    const messages = {

      "scan/start":
        "Unable to start scan.",

      "scan/stop":
        "Unable to stop scan.",

      "brain/pause":
        "Unable to pause engine.",

      "brain/resume":
        "Unable to resume engine."
    };


    showToast(
      error?.message ||
      messages[normalized],
      "error"
    );


    return false;


  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        button.dataset.originalText ||
        button.textContent;
    }
  }
}


/* ========================================================================
 * EMERGENCY STOP
 * ====================================================================== */

async function emergencyStop() {

  const confirmed =
    window.confirm(
      "EMERGENCY STOP\n\n" +
      "This will request an immediate GRIDV21 engine stop.\n\n" +
      "Continue?"
    );


  if (!confirmed) {
    return false;
  }


  const button =
    document.querySelector(
      '[data-action="emergency-stop"]'
    );


  if (button) {

    button.disabled =
      true;

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      "Stopping...";
  }


  try {

    const payload =
      await controlRequest(
        API.emergencyStop,
        {
          method: "POST"
        }
      );


    showToast(
      payload?.message ||
      "Emergency stop requested.",
      "success"
    );


    await wait(500);

    await refreshDashboardData();


    return true;


  } catch (error) {

    showToast(
      error?.message ||
      "Emergency stop request failed.",
      "error"
    );


    return false;


  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        button.dataset.originalText ||
        "Emergency Stop";
    }
  }
}


/* ========================================================================
 * OS TOGGLE
 * ====================================================================== */

async function toggleOS(
  moduleId
) {

  const id =
    String(moduleId ?? "")
      .trim();


  if (!id) {

    showToast(
      "Invalid OS module.",
      "error"
    );

    return false;
  }


  const button =
    document.querySelector(
      `[data-os-toggle="${CSS.escape(id)}"]`
    );


  if (button) {

    button.disabled =
      true;
  }


  try {

    /*
     * Backend versions may accept:
     *   { enabled: true/false }
     *
     * We derive the requested state from
     * the current button state.
     */

    const currentlyEnabled =
      button?.getAttribute(
        "aria-pressed"
      ) === "true";


    const nextEnabled =
      !currentlyEnabled;


    const payload =
      await controlRequest(
        API.osToggle(id),
        {
          method: "POST",

          body: {
            enabled:
              nextEnabled
          }
        }
      );


    showToast(
      payload?.message ||
      (
        nextEnabled
          ? "OS module enabled."
          : "OS module disabled."
      ),
      "success"
    );


    await wait(250);

    await refreshDashboardData();


    return true;


  } catch (error) {

    showToast(
      error?.message ||
      "Unable to update OS module.",
      "error"
    );


    return false;


  } finally {

    if (button) {

      button.disabled =
        false;
    }
  }
}


/* ========================================================================
 * WAIT HELPER
 * ====================================================================== */

function wait(
  milliseconds
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


/* ========================================================================
 * NAVIGATION
 * ====================================================================== */

function navigate(
  section
) {

  const target =
    String(section || "")
      .trim();


  if (!target) {
    return;
  }


  /*
   * Hide all sections.
   */

  $$(".section")
    .forEach(
      element => {

        element.classList.remove(
          "active-section"
        );

        element.classList.remove(
          "active"
        );
      }
    );


  /*
   * Activate requested section.
   */

  const sectionElement =
    byId(
      `section-${target}`
    );


  if (sectionElement) {

    sectionElement.classList.add(
      "active-section"
    );

    sectionElement.classList.add(
      "active"
    );
  }


  /*
   * Update navigation state.
   */

  $$(".nav-item")
    .forEach(
      button => {

        const active =
          button.dataset.section ===
          target;


        button.classList.toggle(
          "active",
          active
        );


        button.setAttribute(
          "aria-current",
          active
            ? "page"
            : "false"
        );
      }
    );


  /*
   * Update page title.
   */

  const activeNav =
    document.querySelector(
      `.nav-item[data-section="${CSS.escape(target)}"]`
    );


  const label =
    activeNav
      ?.querySelector("span")
      ?.textContent
      ?.trim();


  if (label) {

    text(
      "page-title",
      label
    );
  }


  /*
   * Dashboard is the default command centre.
   */

  if (
    target === "dashboard"
  ) {

    text(
      "page-kicker",
      "COMMAND CENTRE"
    );

  } else {

    text(
      "page-kicker",
      "INTELLIGENCE OS"
    );
  }


  closeMobileSidebar();
}


/* ========================================================================
 * MOBILE SIDEBAR
 * ====================================================================== */

function openMobileSidebar() {

  state.mobileSidebarOpen =
    true;


  document.body.classList.add(
    "sidebar-open"
  );


  const sidebar =
    document.querySelector(
      ".sidebar"
    );


  if (sidebar) {

    sidebar.classList.add(
      "open"
    );
  }


  const overlay =
    byId(
      "sidebar-overlay"
    );


  if (overlay) {

    overlay.classList.add(
      "active"
    );
  }
}


function closeMobileSidebar() {

  state.mobileSidebarOpen =
    false;


  document.body.classList.remove(
    "sidebar-open"
  );


  const sidebar =
    document.querySelector(
      ".sidebar"
    );


  if (sidebar) {

    sidebar.classList.remove(
      "open"
    );
  }


  const overlay =
    byId(
      "sidebar-overlay"
    );


  if (overlay) {

    overlay.classList.remove(
      "active"
    );
  }
}


/* ========================================================================
 * DISABLE CONTROL BUTTONS WHEN AUTHENTICATION IS LOST
 * ====================================================================== */

function setControlsEnabled(
  enabled
) {

  const selectors = [

    '[data-action="scan-start"]',

    '[data-action="scan-stop"]',

    '[data-action="brain-pause"]',

    '[data-action="brain-resume"]',

    '[data-action="emergency-stop"]',

    "[data-os-toggle]"
  ];


  selectors.forEach(
    selector => {

      $$(selector)
        .forEach(
          button => {

            button.disabled =
              !enabled;
          }
        );
    }
  );
}


/* ========================================================================
 * EXPORT ENGINE CONTROLS
 * ====================================================================== */

window.GRIDV21 = {
  ...(window.GRIDV21 || {}),

  engineAction,
  emergencyStop,
  toggleOS,

  navigate,

  openMobileSidebar,
  closeMobileSidebar,

  setControlsEnabled
};


/*
 * Legacy/global compatibility.
 *
 * These are also assigned again in Part 4,
 * but exposing them here makes the controls
 * available immediately.
 */

window.engineAction =
  engineAction;

window.emergencyStop =
  emergencyStop;

window.toggleOS =
  toggleOS;

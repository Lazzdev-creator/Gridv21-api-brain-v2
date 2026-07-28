/* ==========================================================================
 * GRIDV21 BRAIN ENTERPRISE — DASHBOARD APP
 * VERSION: 6.3.7
 *
 * PART 1 / 4
 * - Core configuration
 * - State
 * - Canonical OS modules
 * - DOM helpers
 * - Formatting helpers
 * - API/authentication foundation
 * ========================================================================== */

(() => {
  "use strict";

  /* ========================================================================
   * VERSION
   * ====================================================================== */

  const VERSION = "6.3.7";


  /* ========================================================================
   * API
   * ====================================================================== */

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
    auditLogs: "/api/audit-logs",
    systemEvents: "/api/system-events"
  };


  /* ========================================================================
   * STATE
   * ====================================================================== */

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


  /* ========================================================================
   * CANONICAL GRIDV21 OS
   * ====================================================================== */

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


  /* ========================================================================
   * DOM HELPERS
   * ====================================================================== */

  function byId(id) {
    return document.getElementById(id);
  }


  function $$(selector, root = document) {
    return Array.from(
      root.querySelectorAll(selector)
    );
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


  /* ========================================================================
   * HTML ESCAPING
   *
   * IMPORTANT:
   * This fixes the fatal syntax error in the previous app.js.
   * ====================================================================== */

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  /* ========================================================================
   * ARRAY / OBJECT HELPERS
   * ====================================================================== */

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


  /* ========================================================================
   * DATE / TIME
   * ====================================================================== */

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


  /* ========================================================================
   * MONEY
   * ====================================================================== */

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


  /* ========================================================================
   * NUMBERS
   * ====================================================================== */

  function number(value) {
    return new Intl.NumberFormat(
      "en-GB"
    ).format(
      safeNumber(value, 0)
    );
  }


  /* ========================================================================
   * BOOLEAN DISPLAY
   * ====================================================================== */

  function bool(value) {
    return value
      ? "YES"
      : "NO";
  }


  /* ========================================================================
   * DURATION
   * ====================================================================== */

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


  /* ========================================================================
   * UPTIME
   * ====================================================================== */

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


  /* ========================================================================
   * TOAST
   * ====================================================================== */

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


  /* ========================================================================
   * ADMIN KEY STORAGE
   * ====================================================================== */

  function loadAdminKey() {
    let key = "";

    try {
      key =
        sessionStorage.getItem(
          "gridv21_admin_key"
        ) ||
        localStorage.getItem(
          "gridv21_admin_key"
        ) ||
        "";
    } catch (_) {
      key = "";
    }

    const params =
      new URLSearchParams(
        window.location.search
      );

    const queryKey =
      params.get("admin_key") ||
      params.get("key") ||
      "";

    if (queryKey) {
      key = queryKey;

      try {
        sessionStorage.setItem(
          "gridv21_admin_key",
          key
        );
      } catch (_) {}
    }

    state.adminKey =
      String(key || "").trim();

    return state.adminKey;
  }


  /* ========================================================================
   * SAVE ADMIN KEY
   * ====================================================================== */

  function saveAdminKey(key) {
    state.adminKey =
      String(key || "").trim();

    if (!state.adminKey) {
      return;
    }

    try {
      sessionStorage.setItem(
        "gridv21_admin_key",
        state.adminKey
      );
    } catch (_) {}

    try {
      localStorage.setItem(
        "gridv21_admin_key",
        state.adminKey
      );
    } catch (_) {}
  }


  /* ========================================================================
   * CLEAR ADMIN KEY
   * ====================================================================== */

  function clearAdminKey() {
    state.adminKey = "";
    state.authenticated = false;

    try {
      sessionStorage.removeItem(
        "gridv21_admin_key"
      );
    } catch (_) {}

    try {
      localStorage.removeItem(
        "gridv21_admin_key"
      );
    } catch (_) {}

    setGlobalStatus(
      false,
      "Authentication required"
    );

    showToast(
      "Admin key cleared.",
      "warning"
    );
  }


  /* ========================================================================
   * API FETCH
   * ====================================================================== */

  async function apiFetch(
    url,
    options = {}
  ) {
    const requestOptions = {
      ...options,
      headers: {
        Accept:
          "application/json",

        ...(options.body
          ? {
              "Content-Type":
                "application/json"
            }
          : {}),

        ...(state.adminKey
          ? {
              "x-admin-key":
                state.adminKey
            }
          : {}),

        ...(options.headers || {})
      }
    };

    let response;

    try {
      response =
        await fetch(
          url,
          requestOptions
        );
    } catch (error) {
      throw new APIError(
        `Network error: ${
          error.message ||
          "Unable to connect to GRIDV21."
        }`,
        0
      );
    }

    let payload = null;

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      try {
        payload =
          await response.json();
      } catch (_) {
        payload = null;
      }
    } else {
      try {
        const textResponse =
          await response.text();

        payload =
          textResponse
            ? {
                raw: textResponse
              }
            : null;
      } catch (_) {
        payload = null;
      }
    }

    if (!response.ok) {
      const message =
        payload?.error ||
        payload?.message ||
        `Request failed (${response.status})`;

      if (
        response.status === 401
      ) {
        state.authenticated =
          false;

        setGlobalStatus(
          false,
          "Authentication required"
        );
      }

      throw new APIError(
        message,
        response.status,
        payload
      );
    }

    return payload;
  }


  /* ========================================================================
   * AUTHENTICATION
   * ====================================================================== */

  async function verifyAdminKey() {
    if (!state.adminKey) {
      state.authenticated =
        false;

      setGlobalStatus(
        false,
        "Admin key required"
      );

      return false;
    }

    try {
      const payload =
        await apiFetch(
          API.authVerify
        );

      state.authenticated =
        Boolean(
          payload?.authenticated ??
          payload?.ok
        );

      if (
        state.authenticated
      ) {
        setGlobalStatus(
          true,
          "Connected"
        );
      }

      return state.authenticated;

    } catch (error) {
      state.authenticated =
        false;

      setGlobalStatus(
        false,
        error.status === 401
          ? "Invalid admin key"
          : "Authentication failed"
      );

      showToast(
        error.status === 401
          ? "Invalid GRIDV21 admin key."
          : error.message,
        "error"
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
    try {
      const payload =
        await apiFetch(
          API.dashboard
        );

      const dashboard =
        normaliseDashboard(
          payload
        );

      state.dashboard =
        dashboard;

      if (
        dashboard.leads.length
      ) {
        state.leads =
          dashboard.leads;
      }

      if (
        dashboard.permits.length
      ) {
        state.permits =
          dashboard.permits;
      }

      if (
        dashboard.osModules.length
      ) {
        state.osModules =
          dashboard.osModules;
      }

      renderDashboard(
        dashboard
      );

      return dashboard;

    } catch (error) {
      handleAuthFailure(
        error
      );

      console.error(
        "[GRIDV21] Dashboard load failed:",
        error
      );

      renderDashboardError(
        error
      );

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
        state.osModules.length
          ? state.osModules
          : OS_MODULES
      );

      return state.osModules;

    } catch (error) {
      handleAuthFailure(
        error
      );

      console.warn(
        "[GRIDV21] OS module API failed:",
        error
      );

      /*
       * Keep the dashboard usable even if
       * the optional OS endpoint is unavailable.
       */

      renderOSOverview(
        state.osModules.length
          ? state.osModules
          : OS_MODULES
      );

      return state.osModules;
    }
  }


  /* ========================================================================
   * LOAD PERMITS
   * ====================================================================== */

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

      state.permits =
        permits;

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

  function renderTopLeads(
    leads
  ) {
    const container =
      byId("top-leads-body") ||
      byId("leads-container") ||
      document.querySelector(
        "[data-top-leads]"
      );


    if (!container) {
      return;
    }


    const rows =
      safeArray(leads)
        .slice(0, 10);


    if (!rows.length) {
      container.innerHTML = `
        <div class="empty">
          No lead data available.
        </div>
      `;

      return;
    }


    container.innerHTML =
      rows.map(
        lead => {
          const item =
            safeObject(lead);


          const city =
            item.city ||
            item.location ||
            "—";


          const type =
            item.type ||
            item.project_type ||
            item.permit_type ||
            "—";


          const score =
            item.score ??
            item.lead_score ??
            item.ai_score ??
            "—";


          return `
            <div class="lead-row">
              <span>${escapeHTML(city)}</span>
              <span>${escapeHTML(type)}</span>
              <span>${escapeHTML(score)}</span>
            </div>
          `;
        }
      ).join("");
  }


  /* ========================================================================
   * LATEST EVENTS
   * ====================================================================== */

  function renderLatestEvents(
    events
  ) {
    const container =
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

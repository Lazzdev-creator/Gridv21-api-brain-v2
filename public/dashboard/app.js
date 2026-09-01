(() => {
  "use strict";

  /*
   * ================================================================
   * GRIDV21 BRAIN — EXECUTIVE DASHBOARD CONTROLLER
   * ================================================================
   *
   * Corrected replacement for the truncated dashboard app.js.
   *
   * Executive access:
   *   authType === "admin_key"
   *
   * Tenant access:
   *   authType === "tenant"
   *
   * Tenant sessions are NEVER treated as Executive sessions.
   *
   * Backend authorization remains the final security boundary.
   * ================================================================
   */

  const VERSION = "6.4.2";

  const API = Object.freeze({
    health: "/api/health",

    authVerify: "/api/auth/verify",
    authMe: "/api/auth/me",
    authLogout: "/api/auth/logout",

    dashboard: "/api/dashboard",
    osModules: "/api/os-modules",
    permits: "/api/permits",
    scanStatus: "/api/scan-status",

    scrapeNow: "/api/scrape-now",
    brainPause: "/api/brain/pause",
    brainResume: "/api/brain/resume",
    emergencyStop: "/api/brain/emergency-stop",
    scanStop: "/api/brain/scan-stop",

    systemEvents: "/api/system-events",
    forecast: "/api/forecast",
    integrations: "/api/integrations",

    osToggle: id =>
      `/api/os-toggle/${encodeURIComponent(id)}`
  });

  const ADMIN_STORAGE_KEY = "GRIDV21_ADMIN_KEY";

  const state = {
    authenticated: false,
    authType: null,
    role: null,
    adminKey: "",

    connected: false,

    dashboard: null,

    engine: {
      running: false,
      scanning: false,
      emergencyStopped: false,
      lastScan: null,
      lastScanDuration: null,
      permitsFound: 0,
      errors: 0,
      uptime: 0,
      lastError: null
    },

    modules: [],
    permits: [],
    events: [],
    forecast: null,
    integrations: [],

    refreshTimer: null,
    refreshInFlight: false,
    actionInFlight: false,

    activeSection: "dashboard",
    mobileSidebarOpen: false
  };

  const FALLBACK_MODULES = [
    {
      id: 1,
      name: "Executive Intelligence",
      description: "Strategy and executive decision intelligence.",
      layer: "Strategy"
    },
    {
      id: 2,
      name: "Revenue Intelligence",
      description: "Revenue performance and forecasting.",
      layer: "Finance"
    },
    {
      id: 3,
      name: "Sales & CRM",
      description: "Sales pipeline and customer intelligence.",
      layer: "Sales"
    },
    {
      id: 4,
      name: "Marketing",
      description: "Growth, campaigns and acquisition intelligence.",
      layer: "Growth"
    },
    {
      id: 5,
      name: "Operations",
      description: "Operational performance intelligence.",
      layer: "Operations"
    },
    {
      id: 6,
      name: "Finance",
      description: "Accounting and financial intelligence.",
      layer: "Accounting"
    },
    {
      id: 7,
      name: "Human Capital",
      description: "People and workforce intelligence.",
      layer: "People"
    },
    {
      id: 8,
      name: "Project Management",
      description: "Projects and delivery intelligence.",
      layer: "Projects"
    },
    {
      id: 9,
      name: "Knowledge Intelligence",
      description: "Enterprise knowledge intelligence.",
      layer: "Knowledge"
    },
    {
      id: 10,
      name: "Legal & Compliance",
      description: "Risk and compliance intelligence.",
      layer: "Compliance"
    },
    {
      id: 11,
      name: "Supply Chain",
      description: "Suppliers, logistics and procurement.",
      layer: "Supply"
    },
    {
      id: 12,
      name: "Acquisition Intelligence",
      description: "Lead discovery and acquisition.",
      layer: "Lead Generation"
    },
    {
      id: 13,
      name: "Customer Success",
      description: "Retention and customer health.",
      layer: "Customer"
    },
    {
      id: 14,
      name: "IT & Security",
      description: "Technology and security intelligence.",
      layer: "Technology"
    },
    {
      id: 15,
      name: "Analytics & BI",
      description: "Business intelligence and analytics.",
      layer: "Analytics"
    }
  ];

  /* ================================================================
   * DOM HELPERS
   * ================================================================ */

  function byId(id) {
    return document.getElementById(id);
  }

  function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function setText(id, value) {
    const element = byId(id);

    if (!element) return;

    element.textContent =
      value === undefined ||
      value === null ||
      value === ""
        ? "—"
        : String(value);
  }

  function setHTML(id, value) {
    const element = byId(id);

    if (!element) return;

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
    return Array.isArray(value) ? value : [];
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

  function numeric(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  /* ================================================================
   * FORMATTING
   * ================================================================ */

  function formatNumber(value) {
    return new Intl.NumberFormat("en-GB").format(
      numeric(value, 0)
    );
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(
      numeric(value, 0)
    );
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function formatDuration(value) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return "—";
    }

    const seconds = numeric(value, NaN);

    if (!Number.isFinite(seconds)) {
      return String(value);
    }

    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);

    if (minutes < 60) {
      return `${minutes}m ${remaining}s`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${hours}h ${mins}m`;
  }

  function formatUptime(value) {
    const seconds = numeric(value, NaN);

    if (!Number.isFinite(seconds)) {
      return "—";
    }

    const days = Math.floor(seconds / 86400);

    const hours = Math.floor(
      (seconds % 86400) / 3600
    );

    const minutes = Math.floor(
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

  function yesNo(value) {
    return value ? "YES" : "NO";
  }

  /* ================================================================
   * TOAST / STATUS
   * ================================================================ */

  function showToast(message, type = "info") {
    const toast = byId("toast");

    if (!toast) {
      console.log("[GRIDV21]", message);
      return;
    }

    toast.textContent = String(message ?? "");
    toast.className = `toast toast-${type}`;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  function actionMessage(message, type = "info") {
    const element = byId("action-message");

    if (!element) return;

    element.textContent = String(message ?? "");
    element.dataset.type = type;
  }

  function setGlobalStatus(connected, message) {
    state.connected = Boolean(connected);

    const text = byId("global-status-text");
    const dot = byId("global-status-dot");
    const sidebarDot = byId("sidebar-status-dot");
    const sidebarText = byId("sidebar-status-text");
    const badge = byId("global-status");

    const finalMessage =
      message ||
      (
        connected
          ? "Connected"
          : "Disconnected"
      );

    if (text) {
      text.textContent = finalMessage;
    }

    if (sidebarText) {
      sidebarText.textContent = finalMessage;
    }

    if (badge) {
      badge.classList.toggle(
        "badge-success",
        Boolean(connected)
      );

      badge.classList.toggle(
        "badge-muted",
        !Boolean(connected)
      );
    }

    if (dot) {
      dot.classList.toggle(
        "status-online",
        Boolean(connected)
      );

      dot.classList.toggle(
        "status-offline",
        !Boolean(connected)
      );
    }

    if (sidebarDot) {
      sidebarDot.classList.toggle(
        "status-online",
        Boolean(connected)
      );

      sidebarDot.classList.toggle(
        "status-offline",
        !Boolean(connected)
      );
    }
  }

  /* ================================================================
   * API ERROR
   * ================================================================ */

  class APIError extends Error {
    constructor(message, status = 0, payload = null) {
      super(message || "Request failed");

      this.name = "APIError";
      this.status = status;
      this.payload = payload;
    }
  }

  /* ================================================================
   * API REQUEST
   * ================================================================ */

  async function apiFetch(url, options = {}) {
    const headers = {
      Accept: "application/json"
    };

    if (options.body !== undefined) {
      headers["Content-Type"] =
        "application/json";
    }

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    /*
     * Executive requests may carry the admin key.
     * Tenant sessions are handled by the backend session cookie.
     */
    if (state.adminKey) {
      headers["x-admin-key"] =
        state.adminKey;
    }

    let response;

    try {
      response = await fetch(url, {
        ...options,
        credentials: "include",
        cache: "no-store",
        headers
      });
    } catch (error) {
      throw new APIError(
        "Unable to connect to GRIDV21 server.",
        0,
        null
      );
    }

    const contentType =
      response.headers.get("content-type") || "";

    let payload = {};

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      payload =
        await response.json().catch(
          () => ({})
        );
    } else {
      const text =
        await response.text().catch(
          () => ""
        );

      payload = {
        message: text
      };
    }

    if (!response.ok) {
      throw new APIError(
        payload.error ||
          payload.message ||
          `Request failed (${response.status})`,
        response.status,
        payload
      );
    }

    return payload;
  }

  /* ================================================================
   * ADMIN KEY STORAGE
   * ================================================================ */

  function loadAdminKey() {
    try {
      state.adminKey =
        localStorage.getItem(
          ADMIN_STORAGE_KEY
        ) || "";
    } catch (error) {
      console.warn(
        "[GRIDV21] Could not load admin key.",
        error
      );

      state.adminKey = "";
    }

    const input = byId("adminKeyInput");

    if (input && state.adminKey) {
      input.value = state.adminKey;
    }
  }

  function clearAdminKeyStorage() {
    try {
      localStorage.removeItem(
        ADMIN_STORAGE_KEY
      );
    } catch (_) {}

    state.adminKey = "";
  }

  /* ================================================================
   * EXECUTIVE AUTH UI
   * ================================================================ */

  function setAuthUI(authenticated) {
    const input = byId("adminKeyInput");
    const save = byId("saveKeyBtn");
    const status = byId("keyStatus");

    if (input) {
      input.disabled =
        Boolean(authenticated);
    }

    if (save) {
      save.disabled = false;
    }

    if (status) {
      status.textContent =
        authenticated
          ? "Owner authenticated"
          : "Admin key required";
    }

    setControlsEnabled(
      authenticated
    );
  }

  function setControlsEnabled(enabled) {
    const privilegedActions = [
      "scan-start",
      "scan-stop",
      "brain-pause",
      "brain-resume",
      "emergency-stop"
    ];

    all("[data-action]").forEach(
      button => {
        const action =
          button.dataset.action;

        if (
          privilegedActions.includes(
            action
          )
        ) {
          button.disabled =
            !enabled;
        }
      }
    );

    all("[data-os-toggle]").forEach(
      input => {
        input.disabled =
          !enabled;
      }
    );

    document.body.classList.toggle(
      "executive-authenticated",
      Boolean(enabled)
    );

    document.body.classList.toggle(
      "executive-locked",
      !Boolean(enabled)
    );
  }

  /* ================================================================
   * EXECUTIVE AUTHENTICATION
   * ================================================================ */

  async function verifyAdminKey(key = null) {
    const supplied = String(
      key ??
        state.adminKey ??
        ""
    ).trim();

    if (!supplied) {
      state.authenticated = false;
      state.authType = null;
      state.role = null;

      setAuthUI(false);

      setGlobalStatus(
        true,
        "Admin key required"
      );

      actionMessage(
        "Enter the Executive ADMIN_KEY.",
        "warning"
      );

      return false;
    }

    state.adminKey = supplied;

    const status = byId("keyStatus");

    if (status) {
      status.textContent =
        "Verifying admin key...";
    }

    try {
      const payload =
        await apiFetch(
          API.authVerify,
          {
            method: "POST",
            headers: {
              "x-admin-key":
                supplied
            }
          }
        );

      /*
       * IMPORTANT:
       * Only admin_key is allowed to establish
       * Executive authentication.
       */
      if (
        payload.ok !== true ||
        payload.authenticated !== true ||
        payload.authType !==
          "admin_key"
      ) {
        throw new APIError(
          "Invalid admin key.",
          401,
          payload
        );
      }

      state.authenticated = true;
      state.authType = "admin_key";
      state.role =
        payload.role || "owner";

      try {
        localStorage.setItem(
          ADMIN_STORAGE_KEY,
          supplied
        );
      } catch (_) {}

      setAuthUI(true);

      setGlobalStatus(
        true,
        "Admin authenticated"
      );

      if (status) {
        status.textContent =
          "Owner authenticated";
      }

      actionMessage(
        "Executive access authenticated.",
        "success"
      );

      showToast(
        "Owner authenticated.",
        "success"
      );

      await refreshAll();

      return true;

    } catch (error) {
      state.authenticated = false;
      state.authType = null;
      state.role = null;

      setAuthUI(false);

      if (
        error instanceof APIError &&
        error.status === 401
      ) {
        actionMessage(
          "Invalid ADMIN_KEY.",
          "error"
        );

        showToast(
          "Invalid ADMIN_KEY.",
          "error"
        );
      } else {
        actionMessage(
          error.message ||
            "Authentication failed.",
          "error"
        );

        showToast(
          error.message ||
            "Authentication failed.",
          "error"
        );
      }

      return false;
    }
  }

  /* ================================================================
   * SESSION CHECK
   * ================================================================ */

  async function checkExistingSession() {
    try {
      const payload =
        await apiFetch(
          API.authMe
        );

      /*
       * Tenant authentication must never unlock
       * Executive controls.
       */
      if (
        payload &&
        payload.authenticated === true &&
        payload.authType ===
          "admin_key"
      ) {
        state.authenticated = true;
        state.authType = "admin_key";
        state.role =
          payload.role || "owner";

        setAuthUI(true);

        return true;
      }

      state.authenticated = false;
      state.authType = null;
      state.role = null;

      setAuthUI(false);

      return false;

    } catch (_) {
      setAuthUI(
        Boolean(state.authenticated)
      );

      return false;
    }
  }

  /* ================================================================
   * LOGOUT / CLEAR KEY
   * ================================================================ */

  async function logoutExecutive() {
    try {
      await apiFetch(
        API.authLogout,
        {
          method: "POST"
        }
      );
    } catch (_) {}

    clearAdminKeyStorage();

    state.authenticated = false;
    state.authType = null;
    state.role = null;

    setAuthUI(false);

    setGlobalStatus(
      true,
      "Executive access cleared"
    );

    actionMessage(
      "Executive access cleared.",
      "info"
    );

    showToast(
      "Admin key cleared.",
      "info"
    );
      }
  /* ================================================================
   * DATA NORMALISATION
   * ================================================================ */

  function normaliseDashboard(payload) {
    const source =
      safeObject(payload);

    const dashboard =
      safeObject(
        source.dashboard ||
        source.data ||
        source
      );

    const engine =
      safeObject(
        dashboard.engine ||
        source.engine
      );

    state.engine = {
      ...state.engine,
      ...engine,

      running:
        Boolean(
          engine.running ??
          engine.isRunning ??
          dashboard.running
        ),

      scanning:
        Boolean(
          engine.scanning ??
          engine.isScanning ??
          dashboard.scanning
        ),

      emergencyStopped:
        Boolean(
          engine.emergencyStopped ??
          engine.emergency_stop ??
          dashboard.emergencyStopped
        ),

      permitsFound:
        numeric(
          engine.permitsFound ??
          engine.permits_found ??
          dashboard.permitsFound,
          0
        ),

      errors:
        numeric(
          engine.errors ??
          dashboard.errors,
          0
        ),

      uptime:
        numeric(
          engine.uptime ??
          dashboard.uptime,
          0
        )
    };

    state.dashboard =
      dashboard;

    return dashboard;
  }

  function extractModules(payload) {
    const source =
      safeObject(payload);

    const candidates = [
      source.modules,
      source.osModules,
      source.os_modules,
      source.data?.modules,
      source.data?.osModules,
      source.data?.os_modules
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return FALLBACK_MODULES.slice();
  }

  function extractPermits(payload) {
    const source =
      safeObject(payload);

    const candidates = [
      source.permits,
      source.data?.permits,
      source.rows,
      source.data
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  function extractEvents(payload) {
    const source =
      safeObject(payload);

    const candidates = [
      source.events,
      source.systemEvents,
      source.system_events,
      source.data?.events,
      source.data?.systemEvents,
      source.data?.system_events
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  function extractIntegrations(payload) {
    const source =
      safeObject(payload);

    const candidates = [
      source.integrations,
      source.data?.integrations
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  /* ================================================================
   * DASHBOARD DATA
   * ================================================================ */

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

      renderDashboard(
        dashboard
      );

      return dashboard;

    } catch (error) {
      console.error(
        "[GRIDV21] Dashboard load failed:",
        error
      );

      if (
        error instanceof APIError &&
        error.status === 401
      ) {
        state.authenticated = false;
        setAuthUI(false);

        actionMessage(
          "Executive authentication required.",
          "warning"
        );
      }

      throw error;
    }
  }

  async function loadModules() {
    try {
      const payload =
        await apiFetch(
          API.osModules
        );

      state.modules =
        extractModules(
          payload
        );

    } catch (error) {
      console.warn(
        "[GRIDV21] OS modules endpoint unavailable.",
        error
      );

      state.modules =
        FALLBACK_MODULES.slice();
    }

    renderModules();
  }

  async function loadPermits() {
    try {
      const payload =
        await apiFetch(
          API.permits
        );

      state.permits =
        extractPermits(
          payload
        );

    } catch (error) {
      console.warn(
        "[GRIDV21] Permit endpoint unavailable.",
        error
      );

      state.permits = [];
    }

    renderPermits();
    renderLeads();
  }

  async function loadEvents() {
    try {
      const payload =
        await apiFetch(
          API.systemEvents
        );

      state.events =
        extractEvents(
          payload
        );

    } catch (error) {
      console.warn(
        "[GRIDV21] Events endpoint unavailable.",
        error
      );

      state.events = [];
    }

    renderEvents();
    renderAudit();
  }

  async function loadForecast() {
    try {
      const payload =
        await apiFetch(
          API.forecast
        );

      state.forecast =
        safeObject(
          payload.forecast ||
          payload.data ||
          payload
        );

    } catch (error) {
      console.warn(
        "[GRIDV21] Forecast unavailable.",
        error
      );

      state.forecast = null;
    }

    renderForecast();
  }

  async function loadIntegrations() {
    try {
      const payload =
        await apiFetch(
          API.integrations
        );

      state.integrations =
        extractIntegrations(
          payload
        );

    } catch (error) {
      console.warn(
        "[GRIDV21] Integrations endpoint unavailable.",
        error
      );

      state.integrations = [];
    }

    renderIntegrations();
  }

  async function refreshAll() {
    if (state.refreshInFlight) {
      return;
    }

    if (
      !state.authenticated
    ) {
      return;
    }

    state.refreshInFlight = true;

    try {
      setGlobalStatus(
        true,
        "Refreshing..."
      );

      await Promise.allSettled([
        loadDashboard(),
        loadModules(),
        loadPermits(),
        loadEvents(),
        loadForecast(),
        loadIntegrations()
      ]);

      setGlobalStatus(
        true,
        "Connected"
      );

    } catch (error) {
      console.error(
        "[GRIDV21] Refresh error:",
        error
      );

      setGlobalStatus(
        false,
        "Refresh failed"
      );

    } finally {
      state.refreshInFlight = false;
    }
  }

  /* ================================================================
   * DASHBOARD RENDERING
   * ================================================================ */

  function renderDashboard(data) {
    const source =
      safeObject(data);

    const engine =
      safeObject(
        source.engine ||
        state.engine
      );

    const running =
      Boolean(
        engine.running ??
        engine.isRunning ??
        state.engine.running
      );

    const scanning =
      Boolean(
        engine.scanning ??
        engine.isScanning ??
        state.engine.scanning
      );

    const emergency =
      Boolean(
        engine.emergencyStopped ??
        engine.emergency_stop ??
        state.engine.emergencyStopped
      );

    const permitsFound =
      numeric(
        engine.permitsFound ??
        engine.permits_found ??
        state.engine.permitsFound,
        state.engine.permitsFound
      );

    const errors =
      numeric(
        engine.errors,
        state.engine.errors
      );

    const uptime =
      numeric(
        engine.uptime,
        state.engine.uptime
      );

    state.engine = {
      ...state.engine,
      running,
      scanning,
      emergencyStopped: emergency,
      permitsFound,
      errors,
      uptime,
      lastScan:
        engine.lastScan ??
        engine.last_scan ??
        state.engine.lastScan,
      lastScanDuration:
        engine.lastScanDuration ??
        engine.last_scan_duration ??
        state.engine.lastScanDuration,
      lastError:
        engine.lastError ??
        engine.last_error ??
        state.engine.lastError
    };

    setText(
      "metric-engine",
      running
        ? "RUNNING"
        : "STOPPED"
    );

    setText(
      "metric-engine-sub",
      scanning
        ? "Scanning"
        : "Idle"
    );

    const activeModules =
      safeArray(
        state.modules
      ).filter(
        module =>
          Boolean(
            module.enabled ??
            module.active ??
            module.is_active ??
            true
          )
      );

    setText(
      "metric-os",
      formatNumber(
        activeModules.length
      )
    );

    const leadsCount =
      numeric(
        source.leads ??
        source.leadCount ??
        source.leadsCount ??
        state.permits.length,
        state.permits.length
      );

    setText(
      "metric-leads",
      formatNumber(
        leadsCount
      )
    );

    const revenue =
      source.revenue ??
      source.totalRevenue ??
      source.total_revenue ??
      state.dashboard?.revenue ??
      0;

    setText(
      "metric-revenue",
      formatMoney(
        revenue
      )
    );

    setText(
      "telemetry-running",
      yesNo(running)
    );

    setText(
      "telemetry-scanning",
      yesNo(scanning)
    );

    setText(
      "telemetry-permits",
      formatNumber(
        permitsFound
      )
    );

    setText(
      "telemetry-errors",
      formatNumber(
        errors
      )
    );

    setText(
      "telemetry-last-scan",
      formatDate(
        state.engine.lastScan
      )
    );

    setText(
      "telemetry-duration",
      formatDuration(
        state.engine.lastScanDuration
      )
    );

    setText(
      "telemetry-uptime",
      formatUptime(
        uptime
      )
    );

    setText(
      "telemetry-emergency",
      yesNo(emergency)
    );

    const badge =
      byId("engine-badge");

    if (badge) {
      badge.textContent =
        emergency
          ? "EMERGENCY STOP"
          : scanning
            ? "SCANNING"
            : running
              ? "RUNNING"
              : "STOPPED";

      badge.className =
        emergency
          ? "badge badge-danger"
          : running
            ? "badge badge-success"
            : "badge badge-muted";
    }

    const recommendation =
      source.recommendation ??
      source.brainRecommendation ??
      source.brain_recommendation ??
      state.forecast?.recommendation;

    if (recommendation) {
      setText(
        "brain-recommendation",
        recommendation
      );
    } else {
      setText(
        "brain-recommendation",
        running
          ? "Executive engine is online and monitoring the operating environment."
          : "Executive engine is currently stopped."
      );
    }

    renderTopLeads(
      safeArray(
        source.topLeads ||
        source.top_leads
      )
    );

    renderEvents();
  }

  /* ================================================================
   * MODULE RENDERING
   * ================================================================ */

  function renderModules() {
    const container =
      byId(
        "os-overview-grid"
      );

    if (!container) {
      return;
    }

    const modules =
      safeArray(
        state.modules
      );

    if (!modules.length) {
      container.innerHTML =
        '<div class="empty">No OS modules available.</div>';

      return;
    }

    container.innerHTML =
      modules.map(
        module => {
          const id =
            module.id ??
            module.module_id ??
            module.slug ??
            "";

          const enabled =
            Boolean(
              module.enabled ??
              module.active ??
              module.is_active ??
              true
            );

          const name =
            module.name ??
            module.module_name ??
            "Unnamed OS";

          const description =
            module.description ??
            "GRIDV21 operating system module.";

          return `
            <article class="os-card">
              <div class="os-card-head">
                <div>
                  <strong>${escapeHTML(name)}</strong>
                  <small>${escapeHTML(
                    module.layer || ""
                  )}</small>
                </div>

                <label class="switch">
                  <input
                    type="checkbox"
                    data-os-toggle="${escapeHTML(id)}"
                    ${enabled ? "checked" : ""}
                  >
                  <span class="slider"></span>
                </label>
              </div>

              <p>${escapeHTML(
                description
              )}</p>

              <span class="badge ${
                enabled
                  ? "badge-success"
                  : "badge-muted"
              }">
                ${enabled ? "ACTIVE" : "OFF"}
              </span>
            </article>
          `;
        }
      ).join("");

    setControlsEnabled(
      state.authenticated
    );
  }

  /* ================================================================
   * LEADS
   * ================================================================ */

  function getPermitCity(item) {
    return (
      item.city ||
      item.municipality ||
      item.region ||
      item.location ||
      "—"
    );
  }

  function getPermitType(item) {
    return (
      item.trade ||
      item.type ||
      item.category ||
      item.permit_type ||
      item.permitType ||
      "—"
    );
  }

  function getPermitValue(item) {
    return (
      item.estimated_value ??
      item.estimatedValue ??
      item.value ??
      item.permit_value ??
      0
    );
  }

  function getPermitScore(item) {
    return (
      item.ai_score ??
      item.aiScore ??
      item.score ??
      item.lead_score ??
      0
    );
  }

  function renderTopLeads(items = []) {
    const body =
      byId(
        "top-leads-body"
      );

    if (!body) return;

    const rows =
      safeArray(
        items.length
          ? items
          : state.permits
      )
        .slice()
        .sort(
          (a, b) =>
            numeric(
              getPermitScore(b)
            ) -
            numeric(
              getPermitScore(a)
            )
        )
        .slice(0, 10);

    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="empty">No leads available.</td></tr>';

      return;
    }

    body.innerHTML =
      rows.map(
        item => `
          <tr>
            <td>${escapeHTML(
              getPermitCity(item)
            )}</td>
            <td>${escapeHTML(
              getPermitType(item)
            )}</td>
            <td>${formatNumber(
              getPermitScore(item)
            )}</td>
            <td>${formatMoney(
              getPermitValue(item)
            )}</td>
          </tr>
        `
      ).join("");
  }

  function renderLeads() {
    const body =
      byId(
        "leads-body"
      );

    if (!body) return;

    const rows =
      safeArray(
        state.permits
      ).slice(0, 100);

    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="empty">No lead data available.</td></tr>';

      return;
    }

    body.innerHTML =
      rows.map(
        item => `
          <tr>
            <td>${escapeHTML(
              getPermitType(item)
            )}</td>
            <td>${escapeHTML(
              getPermitCity(item)
            )}</td>
            <td>${formatMoney(
              getPermitValue(item)
            )}</td>
            <td>${escapeHTML(
              item.status ||
              item.lead_status ||
              "New"
            )}</td>
            <td>${escapeHTML(
              formatDate(
                item.created_at ||
                item.createdAt ||
                item.date
              )
            )}</td>
          </tr>
        `
      ).join("");
      }
  /* ================================================================
   * PERMITS
   * ================================================================ */

  function renderPermits() {
    const body =
      byId(
        "permits-body"
      );

    if (!body) return;

    const rows =
      safeArray(
        state.permits
      ).slice(0, 200);

    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="empty">No permits available.</td></tr>';

      return;
    }

    body.innerHTML =
      rows.map(
        item => `
          <tr>
            <td>${escapeHTML(
              getPermitCity(item)
            )}</td>

            <td>${escapeHTML(
              item.permit_id ||
              item.permitId ||
              item.id ||
              "—"
            )}</td>

            <td>${escapeHTML(
              item.status ||
              "—"
            )}</td>

            <td>${formatNumber(
              getPermitScore(item)
            )}</td>

            <td>${formatMoney(
              getPermitValue(item)
            )}</td>
          </tr>
        `
      ).join("");
  }

  /* ================================================================
   * EVENTS / ACTIVITY
   * ================================================================ */

  function renderEvents() {
    const activity =
      byId(
        "dashboard-activity"
      );

    if (activity) {
      const events =
        safeArray(
          state.events
        ).slice(0, 10);

      if (!events.length) {
        activity.innerHTML =
          '<div class="empty">No recent activity.</div>';
      } else {
        activity.innerHTML =
          events.map(
            event => `
              <div class="activity-item">
                <strong>${escapeHTML(
                  event.title ||
                  event.event ||
                  event.type ||
                  "System event"
                )}</strong>

                <span>${escapeHTML(
                  event.message ||
                  event.description ||
                  ""
                )}</span>

                <small>${escapeHTML(
                  formatDate(
                    event.created_at ||
                    event.createdAt ||
                    event.timestamp
                  )
                )}</small>
              </div>
            `
          ).join("");
      }
    }
  }

  function renderAudit() {
    const container =
      byId(
        "log-container"
      );

    if (!container) return;

    const events =
      safeArray(
        state.events
      );

    if (!events.length) {
      container.innerHTML =
        '<div class="empty">No audit activity available.</div>';

      return;
    }

    container.innerHTML =
      events.map(
        event => `
          <div class="log-entry">
            <div>
              <strong>${escapeHTML(
                event.title ||
                event.event ||
                event.type ||
                "Event"
              )}</strong>

              <p>${escapeHTML(
                event.message ||
                event.description ||
                ""
              )}</p>
            </div>

            <time>${escapeHTML(
              formatDate(
                event.created_at ||
                event.createdAt ||
                event.timestamp
              )
            )}</time>
          </div>
        `
      ).join("");
  }

  /* ================================================================
   * FORECAST
   * ================================================================ */

  function renderForecast() {
    const recommendation =
      byId(
        "brain-recommendation"
      );

    if (!recommendation) {
      return;
    }

    const forecast =
      safeObject(
        state.forecast
      );

    const text =
      forecast.recommendation ||
      forecast.summary ||
      forecast.message;

    if (text) {
      recommendation.textContent =
        String(text);

      return;
    }

    if (
      state.authenticated &&
      state.engine.running
    ) {
      recommendation.textContent =
        "GRIDV21 is monitoring the operating environment.";
    } else {
      recommendation.textContent =
        "Authenticate Executive access to activate Brain controls.";
    }
  }

  /* ================================================================
   * INTEGRATIONS
   * ================================================================ */

  function renderIntegrations() {
    const container =
      byId(
        "integrations-grid"
      );

    if (!container) return;

    const integrations =
      safeArray(
        state.integrations
      );

    if (!integrations.length) {
      container.innerHTML = `
        <div class="empty-panel">
          Integration status unavailable.
        </div>
      `;

      return;
    }

    container.innerHTML =
      integrations.map(
        integration => {
          const name =
            integration.name ||
            integration.provider ||
            integration.type ||
            "Integration";

          const status =
            integration.status ||
            (
              integration.connected
                ? "Connected"
                : "Disconnected"
            );

          return `
            <article class="card">
              <div class="card-header">
                <h3>${escapeHTML(
                  name
                )}</h3>

                <span class="badge ${
                  String(status)
                    .toLowerCase()
                    .includes("connect")
                    ? "badge-success"
                    : "badge-muted"
                }">
                  ${escapeHTML(status)}
                </span>
              </div>
            </article>
          `;
        }
      ).join("");
  }

  /* ================================================================
   * SECTION NAVIGATION
   * ================================================================ */

  const SECTION_TITLES = {
    dashboard: [
      "COMMAND CENTRE",
      "Executive Dashboard"
    ],

    executive: [
      "INTELLIGENCE OS",
      "Executive Intelligence"
    ],

    revenue: [
      "INTELLIGENCE OS",
      "Revenue Intelligence"
    ],

    sales: [
      "INTELLIGENCE OS",
      "Sales & CRM"
    ],

    marketing: [
      "INTELLIGENCE OS",
      "Marketing"
    ],

    operations: [
      "INTELLIGENCE OS",
      "Operations"
    ],

    finance: [
      "INTELLIGENCE OS",
      "Finance"
    ],

    "human-capital": [
      "INTELLIGENCE OS",
      "Human Capital"
    ],

    projects: [
      "INTELLIGENCE OS",
      "Project Management"
    ],

    knowledge: [
      "INTELLIGENCE OS",
      "Knowledge Intelligence"
    ],

    legal: [
      "INTELLIGENCE OS",
      "Legal & Compliance"
    ],

    supply: [
      "INTELLIGENCE OS",
      "Supply Chain"
    ],

    acquisition: [
      "INTELLIGENCE OS",
      "Acquisition Intelligence"
    ],

    "customer-success": [
      "INTELLIGENCE OS",
      "Customer Success"
    ],

    "it-security": [
      "INTELLIGENCE OS",
      "IT & Security"
    ],

    analytics: [
      "INTELLIGENCE OS",
      "Analytics & BI"
    ],

    leads: [
      "DATA & CONTROL",
      "Leads"
    ],

    permits: [
      "DATA & CONTROL",
      "Permits"
    ],

    integrations: [
      "DATA & CONTROL",
      "Integrations"
    ],

    audit: [
      "DATA & CONTROL",
      "Audit & Activity"
    ],

    settings: [
      "ADMINISTRATION",
      "Settings"
    ]
  };

  function showSection(section) {
    const target =
      String(
        section || "dashboard"
      );

    const sectionElement =
      byId(
        `section-${target}`
      );

    if (!sectionElement) {
      console.warn(
        "[GRIDV21] Section not found:",
        target
      );

      return;
    }

    all(".section").forEach(
      element => {
        element.classList.remove(
          "active-section"
        );
      }
    );

    sectionElement.classList.add(
      "active-section"
    );

    all(".nav-item").forEach(
      button => {
        button.classList.toggle(
          "active",
          button.dataset.section ===
            target
        );
      }
    );

    state.activeSection =
      target;

    const title =
      SECTION_TITLES[target] ||
      [
        "GRIDV21",
        target
      ];

    setText(
      "page-kicker",
      title[0]
    );

    setText(
      "page-title",
      title[1]
    );

    closeMobileSidebar();
  }

  /* ================================================================
   * MOBILE SIDEBAR
   * ================================================================ */

  function openMobileSidebar() {
    const sidebar =
      byId("sidebar");

    const overlay =
      byId("sidebar-overlay");

    if (sidebar) {
      sidebar.classList.add(
        "open"
      );
    }

    if (overlay) {
      overlay.classList.add(
        "show"
      );
    }

    state.mobileSidebarOpen =
      true;
  }

  function closeMobileSidebar() {
    const sidebar =
      byId("sidebar");

    const overlay =
      byId("sidebar-overlay");

    if (sidebar) {
      sidebar.classList.remove(
        "open"
      );
    }

    if (overlay) {
      overlay.classList.remove(
        "show"
      );
    }

    state.mobileSidebarOpen =
      false;
  }

  /* ================================================================
   * EXECUTIVE ACTIONS
   * ================================================================ */

  async function runExecutiveAction(
    action
  ) {
    if (!state.authenticated) {
      actionMessage(
        "Executive authentication is required.",
        "warning"
      );

      showToast(
        "Authenticate with the ADMIN_KEY first.",
        "warning"
      );

      return;
    }

    if (state.actionInFlight) {
      return;
    }

    const endpointMap = {
      "scan-start":
        API.scrapeNow,

      "scan-stop":
        API.scanStop,

      "brain-pause":
        API.brainPause,

      "brain-resume":
        API.brainResume,

      "emergency-stop":
        API.emergencyStop
    };

    const url =
      endpointMap[action];

    if (!url) {
      return;
    }

    state.actionInFlight =
      true;

    const buttons =
      all(
        `[data-action="${action}"]`
      );

    buttons.forEach(
      button => {
        button.disabled = true;
      }
    );

    const labels = {
      "scan-start":
        "Starting scan...",

      "scan-stop":
        "Stopping scan...",

      "brain-pause":
        "Pausing engine...",

      "brain-resume":
        "Resuming engine...",

      "emergency-stop":
        "Activating emergency stop..."
    };

    actionMessage(
      labels[action] ||
        "Executing action...",
      "info"
    );

    try {
      const payload =
        await apiFetch(
          url,
          {
            method: "POST"
          }
        );

      const message =
        payload.message ||
        payload.status ||
        (
          action ===
          "emergency-stop"
            ? "Emergency stop activated."
            : "Action completed."
        );

      actionMessage(
        message,
        "success"
      );

      showToast(
        message,
        "success"
      );

      await refreshAll();

    } catch (error) {
      console.error(
        "[GRIDV21] Executive action failed:",
        error
      );

      if (
        error instanceof APIError &&
        error.status === 401
      ) {
        state.authenticated =
          false;

        setAuthUI(false);
      }

      actionMessage(
        error.message ||
          "Action failed.",
        "error"
      );

      showToast(
        error.message ||
          "Action failed.",
        "error"
      );

    } finally {
      state.actionInFlight =
        false;

      setControlsEnabled(
        state.authenticated
      );
    }
  }

  /* ================================================================
   * OS TOGGLE
   * ================================================================ */

  async function toggleOS(input) {
    if (!input) return;

    if (!state.authenticated) {
      input.checked =
        !input.checked;

      showToast(
        "Executive authentication required.",
        "warning"
      );

      return;
    }

    const id =
      input.dataset.osToggle;

    if (!id) return;

    const enabled =
      Boolean(
        input.checked
      );

    input.disabled = true;

    try {
      const payload =
        await apiFetch(
          API.osToggle(id),
          {
            method: "POST",

            body:
              JSON.stringify({
                enabled
              })
          }
        );

      const message =
        payload.message ||
        `OS module ${enabled ? "enabled" : "disabled"}.`;

      showToast(
        message,
        "success"
      );

      actionMessage(
        message,
        "success"
      );

      await loadModules();
      await loadDashboard();

    } catch (error) {
      input.checked =
        !enabled;

      showToast(
        error.message ||
          "Unable to change OS module.",
        "error"
      );

      actionMessage(
        error.message ||
          "Unable to change OS module.",
        "error"
      );

    } finally {
      input.disabled =
        !state.authenticated;
    }
  }

  /* ================================================================
   * CSV EXPORT
   * ================================================================ */

  function csvEscape(value) {
    const text =
      String(
        value ?? ""
      );

    if (
      /[",\n]/.test(
        text
      )
    ) {
      return `"${text.replace(
        /"/g,
        '""'
      )}"`;
    }

    return text;
  }

  function exportPermitsCSV() {
    const rows =
      safeArray(
        state.permits
      );

    if (!rows.length) {
      showToast(
        "There are no permits to export.",
        "warning"
      );

      return;
    }

    const header = [
      "City",
      "Permit",
      "Status",
      "Score",
      "Estimated Value",
      "Created"
    ];

    const lines = [
      header
        .map(csvEscape)
        .join(",")
    ];

    rows.forEach(
      item => {
        lines.push(
          [
            getPermitCity(item),
            item.permit_id ||
              item.permitId ||
              item.id ||
              "",
            item.status || "",
            getPermitScore(item),
            getPermitValue(item),
            item.created_at ||
              item.createdAt ||
              ""
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    );

    const blob =
      new Blob(
        [
          lines.join("\n")
        ],
        {
          type:
            "text/csv;charset=utf-8"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href = url;
    anchor.download =
      `gridv21-permits-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(
      anchor
    );

    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(
      url
    );

    showToast(
      "Permit CSV exported.",
      "success"
    );
  }

  /* ================================================================
   * SETTINGS / OS SHELLS
   * ================================================================ */

  function renderSettings() {
    const container =
      byId(
        "settings-content"
      );

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="card-grid">
        <article class="card">
          <div class="card-header">
            <h3>Executive Authentication</h3>
          </div>
          <div class="card-body">
            <p>
              Status:
              <strong>
                ${
                  state.authenticated
                    ? "Authenticated"
                    : "Locked"
                }
              </strong>
            </p>

            <p>
              Role:
              <strong>
                ${
                  escapeHTML(
                    state.role ||
                    "—"
                  )
                }
              </strong>
            </p>

            <p>
              Authentication type:
              <strong>
                ${
                  escapeHTML(
                    state.authType ||
                    "—"
                  )
                }
              </strong>
            </p>
          </div>
        </article>

        <article class="card">
          <div class="card-header">
            <h3>Dashboard Version</h3>
          </div>
          <div class="card-body">
            <p>
              Controller:
              <strong>
                ${VERSION}
              </strong>
            </p>

            <p>
              Executive controls:
              <strong>
                ${
                  state.authenticated
                    ? "Unlocked"
                    : "Locked"
                }
              </strong>
            </p>
          </div>
        </article>
      </div>
    `;
  }

  function renderGenericOS(section) {
    const container =
      byId(
        `${section}-content`
      );

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="empty-panel">
        <strong>
          ${escapeHTML(
            SECTION_TITLES[
              section
            ]?.[1] ||
            section
          )}
        </strong>

        <p>
          Operating-system shell is online.
          Live metrics will populate from the
          connected GRIDV21 backend.
        </p>
      </div>
    `;
  }

  function renderAnalytics() {
    const container =
      byId(
        "analytics-content"
      );

    if (!container) return;

    const active =
      safeArray(
        state.modules
      ).filter(
        module =>
          Boolean(
            module.enabled ??
            module.active ??
            module.is_active ??
            true
          )
      ).length;

    container.innerHTML = `
      <div class="metric-grid">
        <article class="metric-card">
          <span>OS Modules</span>
          <strong>${formatNumber(
            state.modules.length
          )}</strong>
          <small>Loaded</small>
        </article>

        <article class="metric-card">
          <span>Active OS</span>
          <strong>${formatNumber(
            active
          )}</strong>
          <small>Currently enabled</small>
        </article>

        <article class="metric-card">
          <span>Permits</span>
          <strong>${formatNumber(
            state.permits.length
          )}</strong>
          <small>Loaded</small>
        </article>

        <article class="metric-card">
          <span>Events</span>
          <strong>${formatNumber(
            state.events.length
          )}</strong>
          <small>Loaded</small>
        </article>
      </div>
    `;
  }

  function renderAcquisition() {
    const container =
      byId(
        "acquisition-content"
      );

    if (!container) return;

    container.innerHTML = `
      <div class="empty-panel">
        Acquisition Intelligence is connected to the
        current permit and lead data pipeline.
        <br><br>
        Loaded permits:
        <strong>${formatNumber(
          state.permits.length
        )}</strong>
      </div>
    `;
  }

  function renderSecurity() {
    const container =
      byId(
        "security-content"
      );

    if (!container) return;

    container.innerHTML = `
      <div class="empty-panel">
        <strong>
          Executive security boundary active.
        </strong>

        <p>
          Tenant authen

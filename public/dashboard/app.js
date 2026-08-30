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

/* ========================================================================
 * ADMIN AUTHENTICATION
 * ====================================================================== */

const ADMIN_STORAGE_KEY =
  "GRIDV21_ADMIN_KEY";


/* ------------------------------------------------------------------------
 * API FETCH
 * ---------------------------------------------------------------------- */

class APIError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message || "Request failed");
    this.name = "APIError";
    this.status = status;
    this.payload = payload;
  }
}

async function apiFetch(
  url,
  options = {}
) {

  const requestOptions = {
    ...options,

    credentials:
      "include",

    cache:
      options.cache ||
      "no-store",

    headers: {
      "Accept":
        "application/json",

      ...(options.body
        ? {
            "Content-Type":
              "application/json"
          }
        : {}),

      ...(options.headers || {})
    }
  };


  /*
   * Send ADMIN_KEY as a header.
   *
   * The server can then validate it directly,
   * or use the authenticated owner session.
   */
  if (state.adminKey) {

    requestOptions.headers[
      "x-admin-key"
    ] =
      state.adminKey;
  }


  let response;

  try {

    response =
      await fetch(
        url,
        requestOptions
      );

  } catch (error) {

    throw new APIError(
      "Unable to connect to GRIDV21 server.",
      0,
      null
    );
  }


  const payload =
    await response
      .json()
      .catch(
        () => ({})
      );


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


/* ------------------------------------------------------------------------
 * LOAD ADMIN KEY
 * ---------------------------------------------------------------------- */

function loadAdminKey() {

  try {

    state.adminKey =
      localStorage.getItem(
        ADMIN_STORAGE_KEY
      ) ||
      "";

  } catch (error) {

    console.warn(
      "[GRIDV21] Unable to read admin key:",
      error
    );

    state.adminKey =
      "";
  }


  const input =
    byId(
      "adminKeyInput"
    );


  if (
    input &&
    state.adminKey
  ) {

    input.value =
      state.adminKey;
  }


  return state.adminKey;
}


/* ------------------------------------------------------------------------
 * SAVE ADMIN KEY
 * ---------------------------------------------------------------------- */

function saveAdminKey(
  key
) {

  const value =
    String(
      key ??
      ""
    ).trim();


  if (!value) {

    return false;
  }


  state.adminKey =
    value;


  try {

    localStorage.setItem(
      ADMIN_STORAGE_KEY,
      value
    );

  } catch (error) {

    console.warn(
      "[GRIDV21] Unable to persist admin key:",
      error
    );
  }


  return true;
}


/* ------------------------------------------------------------------------
 * CLEAR ADMIN KEY
 * ---------------------------------------------------------------------- */

async function clearAdminKey() {

  state.adminKey =
    "";

  state.authenticated =
    false;


  try {

    localStorage.removeItem(
      ADMIN_STORAGE_KEY
    );

  } catch (_) {}


  /*
   * Destroy the OWNER server session.
   */
  try {

    await fetch(
      "/api/auth/logout",
      {
        method:
          "POST",

        credentials:
          "include",

        headers: {
          "Accept":
            "application/json"
        }
      }
    );

  } catch (error) {

    console.warn(
      "[GRIDV21] Admin logout request failed:",
      error
    );
  }


  setAuthUI(
    false
  );

  setControlsEnabled(
    false
  );

  setGlobalStatus(
    false,
    "Admin key required"
  );


  const input =
    byId(
      "adminKeyInput"
    );

  if (input) {

    input.value =
      "";
  }


  const status =
    byId(
      "keyStatus"
    );

  if (status) {

    status.textContent =
      "Admin key cleared";
  }


  showToast(
    "Admin access cleared.",
    "success"
  );
}


/* ------------------------------------------------------------------------
 * VERIFY ADMIN KEY
 * ---------------------------------------------------------------------- */

async function verifyAdminKey() {

  const key =
    String(
      state.adminKey ||
      ""
    ).trim();


  if (!key) {

    setAuthUI(
      false
    );

    setControlsEnabled(
      false
    );

    return false;
  }


  try {

    const payload =
      await apiFetch(
        API.authVerify,
        {
          method:
            "POST",

          headers: {
            "x-admin-key":
              key
          }
        }
      );


    if (
      payload.ok !== true ||
      payload.authenticated !== true
    ) {

      throw new APIError(
        "Invalid admin key.",
        401,
        payload
      );
    }


    state.authenticated =
      true;


    state.connected =
      true;


    setGlobalStatus(
      true,
      "Admin authenticated"
    );


    setAuthUI(
      true
    );


    setControlsEnabled(
      true
    );


    const status =
      byId(
        "keyStatus"
      );

    if (status) {

      status.textContent =
        "Owner authenticated";
    }


    return true;

  } catch (error) {

    state.authenticated =
      false;


    setAuthUI(
      false
    );


    setControlsEnabled(
      false
    );


    setGlobalStatus(
      false,
      "Admin key rejected"
    );


    const status =
      byId(
        "keyStatus"
      );

    if (status) {

      status.textContent =
        error.status === 401
          ? "Invalid admin key"
          : "Verification failed";
    }


    console.error(
      "[GRIDV21 ADMIN AUTH]",
      error
    );


    return false;
  }
}


/* ------------------------------------------------------------------------
 * ADMIN UI
 * ---------------------------------------------------------------------- */

function setAuthUI(
  authenticated
) {

  const input =
    byId(
      "adminKeyInput"
    );

  const saveButton =
    byId(
      "saveKeyBtn"
    );

  const status =
    byId(
      "keyStatus"
    );


  if (input) {

    input.disabled =
      Boolean(authenticated);
  }


  if (saveButton) {

    saveButton.disabled =
      Boolean(authenticated);
  }


  if (status) {

    status.textContent =
      authenticated
        ? "Owner authenticated"
        : "Admin key required";
  }


  setControlsEnabled(
    Boolean(authenticated)
  );
}


/* ------------------------------------------------------------------------
 * SESSION CHECK
 *
 * IMPORTANT:
 * We intentionally DO NOT use the tenant Supabase session here.
 *
 * The Brain Control dashboard is ADMIN_KEY protected.
 * ---------------------------------------------------------------------- */

async function verifyAdminSession() {

  try {

    const payload =
      await apiFetch(
        "/api/auth/me"
      );


    if (
      payload.authenticated === true &&
      payload.authType === "admin_key"
    ) {

      state.authenticated =
        true;

      setAuthUI(
        true
      );

      setGlobalStatus(
        true,
        "Admin authenticated"
      );

      return true;
    }

  } catch (_) {

    /*
     * Expected when there is no owner session.
     */
  }


  return false;
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
    se

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

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

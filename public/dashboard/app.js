(() => {
  "use strict";

  /*
   * GRIDV21 EXECUTIVE DASHBOARD
   * Clean frontend controller
   *
   * Version: 6.4.1
   *
   * IMPORTANT:
   * - This file controls the Executive dashboard only.
   * - Tenant authentication is NOT treated as Executive authentication.
   * - Executive controls are enabled only after /api/auth/verify succeeds.
   * - All privileged operations are still protected by the backend.
   */

  const VERSION = "6.4.1";

  /* ============================================================
   * API CONTRACT
   * ========================================================== */

  const API = Object.freeze({
    health: "/api/health",

    authVerify: "/api/auth/verify",
    authMe: "/api/auth/me",
    authLogout: "/api/auth/logout",

    dashboard: "/api/dashboard",
    osModules: "/api/os-modules",
    permits: "/api/permits",

    scrapeNow: "/api/scrape-now",
    scanStatus: "/api/scan-status",

    scanStop: "/api/brain/scan-stop",
    brainPause: "/api/brain/pause",
    brainResume: "/api/brain/resume",
    emergencyStop: "/api/brain/emergency-stop",

    forecast: "/api/forecast",
    integrations: "/api/integrations",

    systemEvents: "/api/system-events",

    osToggle: id =>
      `/api/os-toggle/${encodeURIComponent(id)}`
  });

  /* ============================================================
   * EXECUTIVE STORAGE
   * ========================================================== */

  const ADMIN_STORAGE_KEY = "GRIDV21_ADMIN_KEY";

  /* ============================================================
   * APPLICATION STATE
   * ========================================================== */

  const state = {
    initialized: false,

    authenticated: false,
    connected: false,

    adminKey: "",

    dashboard: null,
    engine: {
      running: false,
      scanning: false,
      emergencyStopped: false
    },

    osModules: [],
    permits: [],
    systemEvents: [],
    integrations: [],
    forecast: null,

    refreshTimer: null,
    statusTimer: null,

    requestInFlight: false,

    activeSection: "overview"
  };

  /* ============================================================
   * EXECUTIVE OS DEFINITIONS
   *
   * These are UI fallback definitions only.
   * The backend remains authoritative.
   * ========================================================== */

  const OS_MODULES = [
    {
      id: 1,
      name: "Executive Intelligence",
      description:
        "Strategy and executive decision intelligence.",
      layer: "Strategy"
    },
    {
      id: 2,
      name: "Revenue Intelligence",
      description:
        "Revenue performance, forecasting and monetisation.",
      layer: "Finance"
    },
    {
      id: 3,
      name: "Sales & CRM",
      description:
        "Sales pipeline, prospects and customer relationship intelligence.",
      layer: "Sales"
    },
    {
      id: 4,
      name: "Marketing",
      description:
        "Growth, campaigns, audiences and acquisition intelligence.",
      layer: "Growth"
    },
    {
      id: 5,
      name: "Operations",
      description:
        "Operational performance and process intelligence.",
      layer: "Operations"
    },
    {
      id: 6,
      name: "Finance",
      description:
        "Accounting, cash flow and financial intelligence.",
      layer: "Accounting"
    },
    {
      id: 7,
      name: "Human Capital",
      description:
        "People, workforce and organisational intelligence.",
      layer: "People"
    },
    {
      id: 8,
      name: "Project Management",
      description:
        "Projects, delivery, milestones and resource intelligence.",
      layer: "Projects"
    },
    {
      id: 9,
      name: "Knowledge Intelligence",
      description:
        "Enterprise knowledge and institutional intelligence.",
      layer: "Knowledge"
    },
    {
      id: 10,
      name: "Legal & Compliance",
      description:
        "Risk, regulatory and compliance intelligence.",
      layer: "Compliance"
    },
    {
      id: 11,
      name: "Supply Chain",
      description:
        "Suppliers, logistics and procurement intelligence.",
      layer: "Supply"
    },
    {
      id: 12,
      name: "Acquisition Intelligence",
      description:
        "Lead discovery, permit intelligence and acquisition.",
      layer: "Lead Generation"
    },
    {
      id: 13,
      name: "Customer Success",
      description:
        "Customer health, retention and expansion intelligence.",
      layer: "Customer"
    },
    {
      id: 14,
      name: "IT & Security",
      description:
        "Technology, infrastructure and security intelligence.",
      layer: "Technology"
    },
    {
      id: 15,
      name: "Analytics & BI",
      description:
        "Enterprise analytics, reporting and business intelligence.",
      layer: "Analytics"
    }
  ];

  /* ============================================================
   * DOM HELPERS
   * ========================================================== */

  function byId(id) {
    return document.getElementById(id);
  }

  function all(selector, root = document) {
    return Array.from(
      root.querySelectorAll(selector)
    );
  }

  function setText(id, value) {
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

  function setHTML(id, value) {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.innerHTML =
      value ?? "";
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
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeObject(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    )
      ? value
      : {};
  }

  function number(value, fallback = 0) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(
      "en-ZA"
    ).format(
      number(value)
    );
  }

  function formatMoney(value) {
    return new Intl.NumberFormat(
      "en-ZA",
      {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 2
      }
    ).format(
      number(value)
    );
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return date.toLocaleString(
      "en-ZA",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );
  }

  function formatUptime(seconds) {
    const value =
      number(seconds, NaN);

    if (
      !Number.isFinite(value)
    ) {
      return "—";
    }

    const total =
      Math.max(
        0,
        Math.floor(value)
      );

    const days =
      Math.floor(
        total / 86400
      );

    const hours =
      Math.floor(
        (total % 86400) / 3600
      );

    const minutes =
      Math.floor(
        (total % 3600) / 60
      );

    if (days > 0) {
      return `${days}d ${hours}h`;
    }

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
  }

  /* ============================================================
   * TOAST
   * ========================================================== */

  function toast(
    message,
    type = "info"
  ) {
    const element =
      byId("toast");

    if (!element) {
      console[type === "error" ? "error" : "log"](
        "[GRIDV21]",
        message
      );

      return;
    }

    element.textContent =
      String(message ?? "");

    element.className =
      `toast toast-${type}`;

    element.classList.add(
      "show"
    );

    clearTimeout(
      toast.timer
    );

    toast.timer =
      setTimeout(
        () => {
          element.classList.remove(
            "show"
          );
        },
        3500
      );
  }

  /* ============================================================
   * GLOBAL STATUS
   * ========================================================== */

  function setGlobalStatus(
    connected,
    message
  ) {
    state.connected =
      Boolean(connected);

    const badge =
      byId("global-status");

    const label =
      byId(
        "global-status-text"
      );

    const dot =
      byId(
        "global-status-dot"
      );

    if (label) {
      label.textContent =
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
  }

  /* ============================================================
   * API ERROR
   * ========================================================== */

  class APIError extends Error {
    constructor(
      message,
      status = 0,
      payload = null
    ) {
      super(
        message ||
        "Request failed"
      );

      this.name =
        "APIError";

      this.status =
        status;

      this.payload =
        payload;
    }
  }

  /* ============================================================
   * API REQUEST
   * ========================================================== */

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
        Accept:
          "application/json",

        ...(options.body !== undefined
          ? {
              "Content-Type":
                "application/json"
            }
          : {}),

        ...(options.headers || {})
      }
    };

    /*
     * Executive key is sent explicitly.
     *
     * The backend remains responsible for
     * deciding whether it is valid.
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
        "Unable to connect to the GRIDV21 server.",
        0,
        null
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    let payload = {};

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      payload =
        await response
          .json()
          .catch(
            () => ({})
          );
    } else {
      const text =
        await response
          .text()
          .catch(
            () => ""
          );

      payload = {
        message:
          text
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

  /* ============================================================
   * ADMIN KEY STORAGE
   * ========================================================== */

  function loadAdminKey() {
    try {
      state.adminKey =
        localStorage.getItem(
          ADMIN_STORAGE_KEY
        ) || "";
    } catch (error) {
      state.adminKey =
        "";

      console.warn(
        "[GRIDV21] Could not read admin key.",
        error
      );
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

  function clearStoredAdminKey() {
    try {
      localStorage.removeItem(
        ADMIN_STORAGE_KEY
      );
    } catch (_) {}

    state.adminKey =
      "";
  }

  function storeAdminKey(key) {
    state.adminKey =
      String(
        key ?? ""
      ).trim();

    try {
      localStorage.setItem(
        ADMIN_STORAGE_KEY,
        state.adminKey
      );
    } catch (error) {
      console.warn(
        "[GRIDV21] Could not persist admin key.",
        error
      );
    }
  }

  /* ============================================================
   * EXECUTIVE AUTH UI
   * ========================================================== */

  function setControlsEnabled(
    enabled
  ) {
    const privilegedSelectors = [
      "[data-executive-action]",
      "[data-os-toggle]",
      "#scrapeNowBtn",
      "#scanNowBtn",
      "#scanStartBtn",
      "#scanStopBtn",
      "#brainPauseBtn",
      "#brainResumeBtn",
      "#emergencyStopBtn"
    ];

    privilegedSelectors.forEach(
      selector => {
        all(selector).forEach(
          element => {
            element.disabled =
              !enabled;
          }
        );
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

  function updateAdminKeyUI() {
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
        Boolean(
          state.authenticated
        );

      if (
        !input.value &&
        state.adminKey
      ) {
        input.value =
          state.adminKey;
      }
    }

    if (saveButton) {
      saveButton.disabled =
        false;
    }

    if (status) {
      status.textContent =
        state.authenticated
          ? "Owner authenticated"
          : "Executive admin key required";
    }
  }

  /* ============================================================
   * VERIFY EXECUTIVE KEY
   * ========================================================== */

  async function verifyAdminKey(
    keyOverride = null
  ) {
    const key =
      String(
        keyOverride ??
        state.adminKey ??
        ""
      ).trim();

    if (!key) {
      state.authenticated =
        false;

      setControlsEnabled(
        false
      );

      updateAdminKeyUI();

      setGlobalStatus(
        false,
        "Executive key required"
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
          "Invalid Executive admin key.",
          401,
          payload
        );
      }

      storeAdminKey(
        key
      );

      state.authenticated =
        true;

      setControlsEnabled(
        true
      );

      updateAdminKeyUI();

      setGlobalStatus(
        true,
        "Executive authenticated"
      );

      toast(
        "Executive access authenticated successfully.",
        "success"
      );

      await refreshDashboard();

      return true;

    } catch (error) {
      state.authenticated =
        false;

      setControlsEnabled(
        false
      );

      updateAdminKeyUI();

      setGlobalStatus(
        false,
        error.status === 401
          ? "Invalid Executive key"
          : "Executive authentication failed"
      );

      console.error(
        "[GRIDV21 EXECUTIVE AUTH]",
        error
      );

      return false;
    }
  }

  /* ============================================================
   * CHECK EXISTING EXECUTIVE SESSION
   * ========================================================== */

  async function verifyAdminSession() {
    try {
      const payload =
        await apiFetch(
          API.authMe
        );

      if (
        payload.authenticated === true &&
        payload.authType === "admin_key"
      ) {
        state.authenticated =
          true;

        setControlsEnabled(
          true
        );

        updateAdminKeyUI();

        setGlobalStatus(
          true,
          "Executive authenticated"
        );

        return true;
      }

      /*
       * A tenant session is NOT an Executive session.
       */

      if (
        payload.authenticated === true &&
        payload.authType === "tenant"
      ) {
        state.authenticated =
          false;

        setControlsEnabled(
          false
        );

        setGlobalStatus(
          true,
          "Tenant session — Executive key required"
        );

        return false;
      }

    } catch (error) {
      /*
       * 401 here simply means there is no existing
       * Executive session.
       */

      if (
        error.status !== 401
      ) {
        console.warn(
          "[GRIDV21] Executive session check failed.",
          error
        );
      }
    }

    state.authenticated =
      false;

    setControlsEnabled(
      false
    );

    return false;
  }

  /* ============================================================
   * SAVE ADMIN KEY
   * ========================================================== */

  async function handleSaveAdminKey(
    event
  ) {
    event?.preventDefault();

    const input =
      byId(
        "adminKeyInput"
      );

    const button =
      byId(
        "saveKeyBtn"
      );

    const status =
      byId(
        "keyStatus"
      );

    const key =
      String(
        input?.value ||
        ""
      ).trim();

    if (!key) {
      if (status) {
        status.textContent =
          "Enter your Executive admin key";
      }

      toast(
        "Please enter the Executive admin key.",
        "error"
      );

      input?.focus();

      return false;
    }

    if (button) {
      button.disabled =
        true;
    }

    if (status) {
      status.textContent =
        "Verifying Executive key...";
    }

    const success =
      await verifyAdminKey(
        key
      );

    if (!success) {
      clearStoredAdminKey();

      if (input) {
        input.value =
          "";
        input.disabled =
          false;
      }

      if (status) {
        status.textContent =
          "Invalid Executive admin key";
      }
    }

    if (button) {
      button.disabled =
        false;
    }

    return success;
  }

  /* ============================================================
   * EXECUTIVE LOGOUT
   * ========================================================== */

  async function logoutExecutive() {
    try {
      await fetch(
        API.authLogout,
        {
          method:
            "POST",

          credentials:
            "include",

          headers: {
            Accept:
              "application/json",

            ...(state.adminKey
              ? {
                  "x-admin-key":
                    state.adminKey
                }
              : {})
          }
        }
      );
    } catch (error) {
      console.warn(
        "[GRIDV21] Executive logout request failed.",
        error
      );
    }

    clearStoredAdminKey();

    state.authenticated =
      false;

    state.dashboard =
      null;

    setControlsEnabled(
      false
    );

    updateAdminKeyUI();

    setGlobalStatus(
      false,
      "Executive session ended"
    );

    toast(
      "Executive access logged out.",
      "success"
    );
  }

  /* =====

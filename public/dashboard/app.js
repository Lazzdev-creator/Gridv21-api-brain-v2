(() => {
  "use strict";

  const VERSION = "6.3.7";

  /* ========================================================================
   * API ENDPOINTS
   * ====================================================================== */

  const API = {
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

    osToggle: id =>
      `/api/os-toggle/${encodeURIComponent(id)}`,

    forecast: "/api/forecast",
    integrations: "/api/integrations",

    auditLogs: "/api/system-events",
    systemEvents: "/api/system-events"
  };


  /* ========================================================================
   * APPLICATION STATE
   * ====================================================================== */

  const state = {
    adminKey: "",

    /*
     * IMPORTANT:
     * authenticated refers to Executive/Admin access.
     * Tenant login is handled separately by verifySession().
     */
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
   * ENTERPRISE OS MODULE DEFINITIONS
   * ====================================================================== */

  const OS_MODULES = [
    {
      id: 1,
      name: "Executive Intelligence",
      description:
        "Strategy and executive decision intelligence.",
      layer: "Strategy",
      kpis_count: 12,
      agents_count: 4
    },

    {
      id: 2,
      name: "Revenue Intelligence",
      description:
        "Revenue performance, forecasting and monetisation.",
      layer: "Finance",
      kpis_count: 14,
      agents_count: 5
    },

    {
      id: 3,
      name: "Sales & CRM",
      description:
        "Sales pipeline, prospects and customer relationship intelligence.",
      layer: "Sales",
      kpis_count: 16,
      agents_count: 6
    },

    {
      id: 4,
      name: "Marketing",
      description:
        "Growth, campaigns, audiences and acquisition intelligence.",
      layer: "Growth",
      kpis_count: 15,
      agents_count: 5
    },

    {
      id: 5,
      name: "Operations",
      description:
        "Operational performance and process intelligence.",
      layer: "Operations",
      kpis_count: 14,
      agents_count: 5
    },

    {
      id: 6,
      name: "Finance",
      description:
        "Accounting, cash flow and financial intelligence.",
      layer: "Accounting",
      kpis_count: 13,
      agents_count: 4
    },

    {
      id: 7,
      name: "Human Capital",
      description:
        "People, workforce and organisational intelligence.",
      layer: "People",
      kpis_count: 11,
      agents_count: 4
    },

    {
      id: 8,
      name: "Project Management",
      description:
        "Projects, delivery, milestones and resource intelligence.",
      layer: "Projects",
      kpis_count: 13,
      agents_count: 4
    },

    {
      id: 9,
      name: "Knowledge Intelligence",
      description:
        "Enterprise knowledge and institutional intelligence.",
      layer: "Knowledge",
      kpis_count: 10,
      agents_count: 3
    },

    {
      id: 10,
      name: "Legal & Compliance",
      description:
        "Risk, regulatory and compliance intelligence.",
      layer: "Compliance",
      kpis_count: 12,
      agents_count: 4
    },

    {
      id: 11,
      name: "Supply Chain",
      description:
        "Suppliers, logistics and procurement intelligence.",
      layer: "Supply",
      kpis_count: 13,
      agents_count: 4
    },

    {
      id: 12,
      name: "Acquisition Intelligence",
      description:
        "Lead discovery, permit intelligence and acquisition.",
      layer: "Lead Generation",
      kpis_count: 18,
      agents_count: 7
    },

    {
      id: 13,
      name: "Customer Success",
      description:
        "Customer health, retention and expansion intelligence.",
      layer: "Customer",
      kpis_count: 12,
      agents_count: 4
    },

    {
      id: 14,
      name: "IT & Security",
      description:
        "Technology, infrastructure and security intelligence.",
      layer: "Technology",
      kpis_count: 15,
      agents_count: 5
    },

    {
      id: 15,
      name: "Analytics & BI",
      description:
        "Enterprise analytics, reporting and business intelligence.",
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
    const element =
      byId(id);

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
    const element =
      byId(id);

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
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value;
    }

    return {};
  }


  function safeNumber(
    value,
    fallback = 0
  ) {
    const numberValue =
      Number(value);

    return Number.isFinite(
      numberValue
    )
      ? numberValue
      : fallback;
  }


  function dateTime(value) {
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
      "en-GB",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );
  }


  function money(value) {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2
      }
    ).format(
      safeNumber(value, 0)
    );
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

    if (
      !Number.isFinite(seconds)
    ) {
      return String(value);
    }

    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }

    const minutes =
      Math.floor(
        seconds / 60
      );

    const remainingSeconds =
      Math.round(
        seconds % 60
      );

    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    const hours =
      Math.floor(
        minutes / 60
      );

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

    if (
      !Number.isFinite(seconds)
    ) {
      return String(value);
    }

    const days =
      Math.floor(
        seconds / 86400
      );

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

    toast.classList.add(
      "show"
    );

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
   * GLOBAL CONNECTION STATUS
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
      byId(
        "global-status-text"
      );

    const dot =
      byId(
        "global-status-dot"
      );

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
    }
  }


  /* ========================================================================
   * ADMIN AUTHENTICATION
   * ====================================================================== */

  const ADMIN_STORAGE_KEY =
    "GRIDV21_ADMIN_KEY";


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


  /* ========================================================================
   * API FETCH
   * ====================================================================== */

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
     * Executive/Admin key.
     *
     * Tenant authentication still uses
     * the normal authenticated session cookie.
     */

    if (
      state.adminKey
    ) {

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


  /* ========================================================================
   * LOAD ADMIN KEY
   * ====================================================================== */

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


  /* ========================================================================
   * SAVE ADMIN KEY
   * ====================================================================== */

  function saveAdminKey(
    key
  ) {

    const value =
      String(
        key ?? ""
      ).trim();


    if (!value) {

      const status =
        byId(
          "keyStatus"
        );

      if (status) {
        status.textContent =
          "Admin key required";
      }

      showToast(
        "Please enter the Executive Dashboard key.",
        "error"
      );

      return false;
    }


    /*
     * Store in application state immediately.
     */

    state.adminKey =
      value;


    /*
     * Persist locally.
     */

    try {

      localStorage.setItem(
        ADMIN_STORAGE_KEY,
        value
      );

    } catch (error) {

      console.warn(
        "[GRIDV21] Unable to save admin key:",
        error
      );
    }


    /*
     * Keep the input synchronised.
     */

    const input =
      byId(
        "adminKeyInput"
      );

    if (input) {
      input.value =
        value;
    }


    const status =
      byId(
        "keyStatus"
      );

    if (status) {
      status.textContent =
        "Admin key saved — verifying...";
    }


    showToast(
      "Executive Dashboard key saved.",
      "success"
    );


    return true;
  }


  /* ========================================================================
   * CLEAR ADMIN KEY
   * ====================================================================== */

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


    try {

      await fetch(
        API.authLogout,
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

      input.disabled =
        false;
    }


    const saveButton =
      byId(
        "saveKeyBtn"
      );

    if (saveButton) {

      saveButton.disabled =
        false;
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
      "Executive Dashboard access cleared.",
      "success"
    );
  }


  /* ========================================================================
   * VERIFY ADMIN KEY
   * ====================================================================== */

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


      state.adminKey =
        key;

      state.authenticated =
        true;

      state.connected =
        true;


      /*
       * Persist only after successful
       * server verification.
       */

      try {

        localStorage.setItem(
          ADMIN_STORAGE_KEY,
          key
        );

      } catch (_) {}


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


      showToast(
        "Executive Dashboard access granted.",
        "success"
      );


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


  /* ========================================================================
   * ADMIN UI
   * ====================================================================== */

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

      /*
       * Only Executive authentication
       * controls this field.
       *
       * Tenant login does NOT disable it.
       */

      input.disabled =
        Boolean(authenticated);
    }


    if (saveButton) {

      /*
       * Keep Save enabled until the key
       * has actually been verified.
       */

      saveButton.disabled =
        false;
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


  /* ========================================================================
   * EXECUTIVE / ADMIN SESSION CHECK
   * ====================================================================== */

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

        state.connected =
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

    } catch (error) {

      /*
       * No Executive session is not
       * considered a tenant logout.
       */

      console.info(
        "[GRIDV21] No existing Executive session."
      )

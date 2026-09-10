(() => {
  "use strict";

  /*
   * ================================================================
   * GRIDV21 BRAIN — EXECUTIVE DASHBOARD CONTROLLER
   * ================================================================
   *
   * GRIDV21 BRAIN Enterprise Intelligence
   *
   * VERSION: 6.4.2
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
   *
   * South Africa and Zimbabwe acquisition intelligence are
   * integrated without replacing the existing Enterprise OS.
   * ================================================================
   */

  const VERSION = "6.4.2";


  /* ================================================================
   * API ENDPOINTS
   * ================================================================ */

  const API = Object.freeze({

    health:
      "/api/health",

    authVerify:
      "/api/auth/verify",

    authMe:
      "/api/auth/me",

    authLogout:
      "/api/auth/logout",


    /* --------------------------------------------------------------
     * EXECUTIVE DASHBOARD
     * -------------------------------------------------------------- */

    dashboard:
      "/api/dashboard",

    osModules:
      "/api/os-modules",

    permits:
      "/api/permits",

    scanStatus:
      "/api/scan-status",


    /* --------------------------------------------------------------
     * BRAIN / ENGINE CONTROLS
     * -------------------------------------------------------------- */

    scrapeNow:
      "/api/scrape-now",

    brainPause:
      "/api/brain/pause",

    brainResume:
      "/api/brain/resume",

    emergencyStop:
      "/api/brain/emergency-stop",

    scanStop:
      "/api/brain/scan-stop",


    /* --------------------------------------------------------------
     * SYSTEM / INTELLIGENCE
     * -------------------------------------------------------------- */

    systemEvents:
      "/api/system-events",

    forecast:
      "/api/forecast",

    integrations:
      "/api/integrations",


    /* --------------------------------------------------------------
     * OS MODULE CONTROL
     * -------------------------------------------------------------- */

    osToggle:
      id =>
        `/api/os-toggle/${encodeURIComponent(id)}`,


    /* --------------------------------------------------------------
     * SOUTH AFRICA ACQUISITION INTELLIGENCE
     * -------------------------------------------------------------- */

    saSources:
      "/api/sa-intelligence/sources",

    saStatus:
      "/api/sa-intelligence/status",

    saScan:
      "/api/sa-intelligence/scan",

    saOpportunities:
      "/api/sa-intelligence/opportunities",

    saMatch:
      "/api/sa-intelligence/match",

    saScanAndMatch:
      "/api/sa-intelligence/scan-and-match",


    /* --------------------------------------------------------------
     * ZIMBABWE ACQUISITION INTELLIGENCE
     * -------------------------------------------------------------- */

    zwSources:
      "/api/zw-intelligence/sources",

    zwStatus:
      "/api/zw-intelligence/status",

    zwScan:
      "/api/zw-intelligence/scan",

    zwOpportunities:
      "/api/zw-intelligence/opportunities"

  });


  /* ================================================================
   * STORAGE
   * ================================================================ */

  const ADMIN_STORAGE_KEY =
    "GRIDV21_ADMIN_KEY";


  /* ================================================================
   * APPLICATION STATE
   * ================================================================ */

  const state = {

    /*
     * Executive authentication.
     *
     * IMPORTANT:
     * Tenant authentication must never set these values.
     */

    authenticated:
      false,

    authType:
      null,

    role:
      null,

    adminKey:
      "",


    /* --------------------------------------------------------------
     * CONNECTION
     * -------------------------------------------------------------- */

    connected:
      false,


    /* --------------------------------------------------------------
     * DASHBOARD
     * -------------------------------------------------------------- */

    dashboard:
      null,


    /* --------------------------------------------------------------
     * BRAIN ENGINE
     * -------------------------------------------------------------- */

    engine: {

      running:
        false,

      scanning:
        false,

      emergencyStopped:
        false,

      lastScan:
        null,

      lastScanDuration:
        null,

      permitsFound:
        0,

      errors:
        0,

      uptime:
        0,

      lastError:
        null

    },


    /* --------------------------------------------------------------
     * ENTERPRISE OS
     * -------------------------------------------------------------- */

    modules:
      [],


    /* --------------------------------------------------------------
     * PERMITS
     * -------------------------------------------------------------- */

    permits:
      [],


    /* --------------------------------------------------------------
     * SYSTEM EVENTS
     * -------------------------------------------------------------- */

    events:
      [],


    /* --------------------------------------------------------------
     * FORECAST
     * -------------------------------------------------------------- */

    forecast:
      null,


    /* --------------------------------------------------------------
     * INTEGRATIONS
     * -------------------------------------------------------------- */

    integrations:
      [],


    /* --------------------------------------------------------------
     * SOUTH AFRICA INTELLIGENCE
     * -------------------------------------------------------------- */

    sa: {

      status:
        null,

      sources:
        [],

      opportunities:
        [],

      loading:
        false,

      lastError:
        null

    },


    /* --------------------------------------------------------------
     * ZIMBABWE INTELLIGENCE
     * -------------------------------------------------------------- */

    zw: {

      status:
        null,

      sources:
        [],

      opportunities:
        [],

      loading:
        false,

      lastError:
        null

    },


    /* --------------------------------------------------------------
     * REFRESH / ACTION STATE
     * -------------------------------------------------------------- */

    refreshTimer:
      null,

    refreshInFlight:
      false,

    actionInFlight:
      false,


    /* --------------------------------------------------------------
     * NAVIGATION
     * -------------------------------------------------------------- */

    activeSection:
      "dashboard",

    mobileSidebarOpen:
      false

  };


  /* ================================================================
   * FALLBACK ENTERPRISE OS MODULES
   *
   * These remain available even if /api/os-modules temporarily fails.
   * ================================================================ */

  const FALLBACK_MODULES = [

    {
      id:
        1,

      name:
        "Executive Intelligence",

      description:
        "Strategy and executive decision intelligence.",

      layer:
        "Strategy"
    },


    {
      id:
        2,

      name:
        "Revenue Intelligence",

      description:
        "Revenue performance and forecasting.",

      layer:
        "Finance"
    },


    {
      id:
        3,

      name:
        "Sales & CRM",

      description:
        "Sales pipeline and customer intelligence.",

      layer:
        "Sales"
    },


    {
      id:
        4,

      name:
        "Marketing",

      description:
        "Growth, campaigns and acquisition intelligence.",

      layer:
        "Growth"
    },


    {
      id:
        5,

      name:
        "Operations",

      description:
        "Operational performance intelligence.",

      layer:
        "Operations"
    },


    {
      id:
        6,

      name:
        "Finance",

      description:
        "Accounting and financial intelligence.",

      layer:
        "Accounting"
    },


    {
      id:
        7,

      name:
        "Human Capital",

      description:
        "People and workforce intelligence.",

      layer:
        "People"
    },


    {
      id:
        8,

      name:
        "Project Management",

      description:
        "Projects and delivery intelligence.",

      layer:
        "Projects"
    },


    {
      id:
        9,

      name:
        "Knowledge Intelligence",

      description:
        "Enterprise knowledge intelligence.",

      layer:
        "Knowledge"
    },


    {
      id:
        10,

      name:
        "Legal & Compliance",

      description:
        "Risk and compliance intelligence.",

      layer:
        "Compliance"
    },


    {
      id:
        11,

      name:
        "Supply Chain",

      description:
        "Suppliers, logistics and procurement.",

      layer:
        "Supply"
    },


    {
      id:
        12,

      name:
        "Acquisition Intelligence",

      description:
        "Lead discovery and acquisition.",

      layer:
        "Lead Generation"
    },


    {
      id:
        13,

      name:
        "Customer Success",

      description:
        "Retention and customer health.",

      layer:
        "Customer"
    },


    {
      id:
        14,

      name:
        "IT & Security",

      description:
        "Technology and security intelligence.",

      layer:
        "Technology"
    },


    {
      id:
        15,

      name:
        "Analytics & BI",

      description:
        "Business intelligence and analytics.",

      layer:
        "Analytics"
    }

  ];


  /* ================================================================
   * DOM HELPERS
   * ================================================================ */

  function byId(id) {

    return document.getElementById(
      id
    );

  }


  function all(
    selector,
    root = document
  ) {

    return Array.from(
      root.querySelectorAll(
        selector
      )
    );

  }


  function setText(
    id,
    value
  ) {

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


  function setHTML(
    id,
    value
  ) {

    const element =
      byId(id);

    if (!element) {
      return;
    }

    element.innerHTML =
      value ?? "";

  }


  function escapeHTML(
    value
  ) {

    return String(
      value ?? ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );

  }


  function safeArray(
    value
  ) {

    return Array.isArray(
      value
    )
      ? value
      : [];

  }


  function safeObject(
    value
  ) {

    if (
      value &&
      typeof value ===
        "object" &&
      !Array.isArray(value)
    ) {

      return value;

    }

    return {};

  }


  function numeric(
    value,
    fallback = 0
  ) {

    const number =
      Number(value);

    return Number.isFinite(
      number
    )
      ? number
      : fallback;

  }


  /* ================================================================
   * FORMATTING
   * ================================================================ */

  function formatNumber(
    value
  ) {

    return new Intl.NumberFormat(
      "en-GB"
    ).format(
      numeric(
        value,
        0
      )
    );

  }


  function formatMoney(
    value
  ) {

    return new Intl.NumberFormat(
      "en-US",
      {
        style:
          "currency",

        currency:
          "USD",

        maximumFractionDigits:
          2
      }
    ).format(
      numeric(
        value,
        0
      )
    );

  }


  function formatDate(
    value
  ) {

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

      return String(
        value
      );

    }

    return date.toLocaleString(
      "en-GB",
      {
        dateStyle:
          "medium",

        timeStyle:
          "short"
      }
    );

  }


  function formatDuration(
    value
  ) {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      return "—";

    }

    const seconds =
      numeric(
        value,
        NaN
      );

    if (
      !Number.isFinite(
        seconds
      )
    ) {

      return String(
        value
      );

    }

    if (
      seconds < 60
    ) {

      return `${Math.round(
        seconds
      )}s`;

    }

    const minutes =
      Math.floor(
        seconds / 60
      );

    const remaining =
      Math.round(
        seconds % 60
      );

    if (
      minutes < 60
    ) {

      return `${minutes}m ${remaining}s`;

    }

    const hours =
      Math.floor(
        minutes / 60
      );

    const mins =
      minutes % 60;

    return `${hours}h ${mins}m`;

  }


  function formatUptime(
    value
  ) {

    const seconds =
      numeric(
        value,
        NaN
      );

    if (
      !Number.isFinite(
        seconds
      )
    ) {

      return "—";

    }

    const days =
      Math.floor(
        seconds / 86400
      );

    const hours =
      Math.floor(
        (seconds % 86400) /
        3600
      );

    const minutes =
      Math.floor(
        (seconds % 3600) /
        60
      );

    if (
      days > 0
    ) {

      return `${days}d ${hours}h`;

    }

    if (
      hours > 0
    ) {

      return `${hours}h ${minutes}m`;

    }

    return `${minutes}m`;

  }


  function yesNo(
    value
  ) {

    return value
      ? "YES"
      : "NO";

  }


  /* ================================================================
   * TOAST / ACTION STATUS
   * ================================================================ */

  function showToast(
    message,
    type = "info"
  ) {

    const toast =
      byId("toast");

    if (!toast) {

      console.log(
        "[GRIDV21]",
        message
      );

      return;

    }

    toast.textContent =
      String(
        message ?? ""
      );

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


  function actionMessage(
    message,
    type = "info"
  ) {

    const element =
      byId(
        "action-message"
      );

    if (!element) {
      return;
    }

    element.textContent =
      String(
        message ?? ""
      );

    element.dataset.type =
      type;

  }


  /* ================================================================
   * GLOBAL CONNECTION STATUS
   * ================================================================ */

  function setGlobalStatus(
    connected,
    message
  ) {

    state.connected =
      Boolean(
        connected
      );

    const text =
      byId(
        "global-status-text"
      );

    const dot =
      byId(
        "global-status-dot"
      );

    const sidebarDot =
      byId(
        "sidebar-status-dot"
      );

    const sidebarText =
      byId(
        "sidebar-status-text"
      );

    const badge =
      byId(
        "global-status"
      );


    const finalMessage =
      message ||
      (
        connected
          ? "Connected"
          : "Disconnected"
      );


    if (text) {

      text.textContent =
        finalMessage;

    }


    if (sidebarText) {

      sidebarText.textContent =
        finalMessage;

    }


    if (badge) {

      badge.classList.toggle(
        "badge-success",
        Boolean(
          connected
        )
      );

      badge.classList.toggle(
        "badge-muted",
        !Boolean(
          connected
        )
      );

    }


    if (dot) {

      dot.classList.toggle(
        "status-online",
        Boolean(
          connected
        )
      );

      dot.classList.toggle(
        "status-offline",
        !Boolean(
          connected
        )
      );

    }


    if (sidebarDot) {

      sidebarDot.classList.toggle(
        "status-online",
        Boolean(
          connected
        )
      );

      sidebarDot.classList.toggle(
        "status-offline",
        !Boolean(
          connected
        )
      );

    }

    }
  all("[data-os-toggle]").forEach(
      input => {
        input.disabled =
          !enabled;
      }
    );

    all("[data-admin-action]").forEach(
      element => {
        element.disabled =
          !enabled;
      }
    );
  }

  function showAuthError(message) {
    const status = byId("keyStatus");

    if (status) {
      status.textContent =
        String(
          message ||
          "Admin authentication failed."
        );
    }

    actionMessage(
      message ||
      "Admin authentication failed.",
      "error"
    );

    showToast(
      message ||
      "Admin authentication failed.",
      "error"
    );
  }

  /* ================================================================
   * EXECUTIVE AUTHENTICATION
   * ================================================================ */

  async function verifyAdminKey(key) {
    const cleanKey =
      String(key ?? "").trim();

    if (!cleanKey) {
      showAuthError(
        "Enter the Executive admin key."
      );

      return false;
    }

    try {
      const payload =
        await apiFetch(
          API.authVerify,
          {
            method: "POST",
            body: JSON.stringify({
              admin_key: cleanKey
            })
          }
        );

      /*
       * Executive access is deliberately strict.
       * A successful tenant session must never unlock
       * Executive dashboard controls.
       */
      const authenticated =
        payload &&
        payload.ok === true &&
        payload.authenticated === true &&
        payload.authType === "admin_key";

      if (!authenticated) {
        clearAdminKeyStorage();

        setAuthUI(false);

        showAuthError(
          payload?.message ||
          payload?.error ||
          "Invalid Executive admin key."
        );

        return false;
      }

      state.adminKey = cleanKey;

      try {
        localStorage.setItem(
          ADMIN_STORAGE_KEY,
          cleanKey
        );
      } catch (error) {
        console.warn(
          "[GRIDV21] Admin key could not be saved.",
          error
        );
      }

      state.authenticated = true;
      state.authType = "admin_key";

      setAuthUI(true);

      setGlobalStatus(
        true,
        "Executive authenticated"
      );

      actionMessage(
        "Executive access verified.",
        "success"
      );

      showToast(
        "Executive access verified.",
        "success"
      );

      return true;
    } catch (error) {
      clearAdminKeyStorage();

      setAuthUI(false);

      if (error instanceof APIError) {
        if (
          error.status === 401 ||
          error.status === 403
        ) {
          showAuthError(
            "Invalid or expired Executive admin key."
          );
        } else {
          showAuthError(
            error.message
          );
        }
      } else {
        showAuthError(
          "Executive authentication failed."
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
          API.authMe,
          {
            method: "GET"
          }
        );

      if (
        payload &&
        payload.authenticated === true
      ) {
        const authType =
          payload.authType ||
          payload.auth_type ||
          "";

        /*
         * Only admin_key authentication grants
         * Executive dashboard privileges.
         */
        if (
          authType === "admin_key"
        ) {
          state.authenticated = true;
          state.authType = "admin_key";

          setAuthUI(true);

          setGlobalStatus(
            true,
            "Executive authenticated"
          );

          return true;
        }

        /*
         * Tenant authentication may exist,
         * but it must remain isolated from Executive controls.
         */
        if (
          authType === "tenant"
        ) {
          state.authenticated = false;
          state.authType = "tenant";

          setAuthUI(false);

          setGlobalStatus(
            true,
            "Tenant session detected"
          );

          return false;
        }
      }

      state.authenticated = false;
      state.authType = "";

      setAuthUI(false);

      return false;
    } catch (error) {
      /*
       * A failed session check must not crash the
       * dashboard. The Executive key can still be entered.
       */
      state.authenticated = false;
      state.authType = "";

      setAuthUI(false);

      setGlobalStatus(
        false,
        "Server unavailable"
      );

      return false;
    }
  }

  /* ================================================================
   * EXECUTIVE LOGOUT
   * ================================================================ */

  async function logoutExecutive() {
    try {
      await apiFetch(
        API.authLogout,
        {
          method: "POST"
        }
      );
    } catch (error) {
      /*
       * Local Executive credentials are cleared even
       * when the server logout endpoint is unavailable.
       */
      console.warn(
        "[GRIDV21] Executive logout request failed.",
        error
      );
    }

    clearAdminKeyStorage();

    state.authenticated = false;
    state.authType = "";

    setAuthUI(false);

    setGlobalStatus(
      true,
      "Executive signed out"
    );

    actionMessage(
      "Executive access signed out.",
      "success"
    );

    showToast(
      "Executive signed out.",
      "success"
    );
  }

  /* ================================================================
   * GENERAL DATA HELPERS
   * ================================================================ */

  function firstDefined(...values) {
    for (const value of values) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return null;
  }

  function arrayFromPayload(
    payload,
    ...keys
  ) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!payload || typeof payload !== "object") {
      return [];
    }

    for (const key of keys) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }

    return [];
  }

  function objectFromPayload(payload) {
    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload)
    ) {
      return payload;
    }

    return {};
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
      value === undefined ||
      value === null
        ? ""
        : String(value);
  }

  function setValue(id, value) {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.value =
      value === undefined ||
      value === null
        ? ""
        : String(value);
  }

  function setVisible(id, visible) {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.hidden = !Boolean(visible);
  }

  function setDisabled(id, disabled) {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.disabled =
      Boolean(disabled);
  }

  function setProgress(id, value) {
    const element = byId(id);

    if (!element) {
      return;
    }

    const number =
      Math.max(
        0,
        Math.min(
          100,
          numeric(value, 0)
        )
      );

    element.style.width =
      `${number}%`;

    element.setAttribute(
      "aria-valuenow",
      String(number)
    );
  }

  /* ================================================================
   * EVENT FEED
   * ================================================================ */

  function addEvent(
    message,
    type = "info"
  ) {
    const container =
      byId("events");

    if (!container) {
      return;
    }

    const item =
      document.createElement("div");

    item.className =
      `event event-${type}`;

    item.textContent =
      String(message ?? "");

    container.prepend(item);

    /*
     * Keep the live event feed bounded so repeated
     * refreshes cannot grow the DOM indefinitely.
     */
    const children =
      Array.from(
        container.children
      );

    children
      .slice(15)
      .forEach(child => {
        child.remove();
      });
  }

  /* ================================================================
   * AUTHENTICATION UI EVENTS
   * ================================================================ */

  async function handleSaveAdminKey() {
    const input =
      byId("adminKeyInput");

    if (!input) {
      showToast(
        "Executive key input was not found.",
        "error"
      );

      return;
    }

    const key =
      String(
        input.value ?? ""
      ).trim();

    if (!key) {
      showAuthError(
        "Enter the Executive admin key."
      );

      input.focus();

      return;
    }

    const button =
      byId("saveKeyBtn");

    if (button) {
      button.disabled = true;
    }

    actionMessage(
      "Verifying Executive access...",
      "info"
    );

    try {
      await verifyAdminKey(key);
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  async function handleAdminKeyKeydown(event) {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();

      await handleSaveAdminKey();
    }
  }

  /* ================================================================
   * EXECUTIVE ACTION GUARD
   * ================================================================ */

  function requireExecutiveAccess() {
    if (
      state.authenticated === true &&
      state.authType === "admin_key"
    ) {
      return true;
    }

    showAuthError(
      "Executive authentication is required."
    );

    return false;
  }

  async function runExecutiveAction(
    action,
    options = {}
  ) {
    if (!requireExecutiveAccess()) {
      return null;
    }

    const {
      method = "POST",
      body,
      successMessage,
      loadingMessage,
      errorMessage
    } = options;

    if (loadingMessage) {
      actionMessage(
        loadingMessage,
        "info"
      );
    }

    try {
      const payload =
        await apiFetch(
          action,
          {
            method,
            ...(body !== undefined
              ? {
                  body:
                    JSON.stringify(body)
                }
              : {})
          }
        );

      if (successMessage) {
        actionMessage(
          successMessage,
          "success"
        );

        showToast(
          successMessage,
          "success"
        );
      }

      return payload;
    } catch (error) {
      const message =
        error instanceof APIError
          ? error.message
          : (
              errorMessage ||
              "Action failed."
            );

      actionMessage(
        message,
        "error"
      );

      showToast(
        message,
        "error"
      );

      if (
        error instanceof APIError &&
        (
          error.status === 401 ||
          error.status === 403
        )
      ) {
        state.authenticated = false;
        state.authType = "";

        setAuthUI(false);
      }

      return null;
    }
    }

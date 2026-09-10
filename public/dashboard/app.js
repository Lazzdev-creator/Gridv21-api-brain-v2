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

    const input =
      byId("adminKeyInput");

    if (
      input &&
      state.adminKey
    ) {
      input.value =
        state.adminKey;
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
    const input =
      byId("adminKeyInput");

    const save =
      byId("saveKeyBtn");

    const status =
      byId("keyStatus");

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

    all("[data-admin-action]").forEach(
      element => {
        element.disabled =
          !enabled;
      }
    );
  }

  /* ================================================================
   * AUTH ERROR
   * ================================================================ */

  function showAuthError(message) {
    const status =
      byId("keyStatus");

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

      state.adminKey =
        cleanKey;

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
      state.authType =
        "admin_key";

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
          state.authenticated =
            true;

          state.authType =
            "admin_key";

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
          state.authenticated =
            false;

          state.authType =
            "tenant";

          setAuthUI(false);

          setGlobalStatus(
            true,
            "Tenant session detected"
          );

          return false;
        }
      }

      state.authenticated =
        false;

      state.authType =
        "";

      setAuthUI(false);

      return false;
    } catch (error) {
      /*
       * A failed session check must not crash the
       * dashboard. The Executive key can still be entered.
       */
      state.authenticated =
        false;

      state.authType =
        "";

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
      console.warn(
        "[GRIDV21] Executive logout request failed.",
        error
      );
    }

    clearAdminKeyStorage();

    state.authenticated =
      false;

    state.authType =
      "";

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
      "Executive access signed out.",
      "success"
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

if (!state.authenticated) {
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
    loadIntegrations(),
    loadSaStatus(),
    loadSaSources(),
    loadSaOpportunities(),
    loadZwStatus(),
    loadZwSources(),
    loadZwOpportunities()
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
const zwStatus = safeObject(zw.status);
    const zwStats = safeObject(zwStatus.stats);
    const zwOpps = safeArray(zw.opportunities);
    const zwSources = safeArray(zw.sources);
    const zwRunning = Boolean(zwStatus.running);

    const saHigh = saOpps.filter(o => o.tier === "HIGH").length;
    const saMedium = saOpps.filter(o => o.tier === "MEDIUM").length;
    const zwHigh = zwOpps.filter(o => o.tier === "HIGH").length;
    const zwMedium = zwOpps.filter(o => o.tier === "MEDIUM").length;

    const renderOpp = (o, country) => {
      const tier = o.tier || "LOW";
      const title =
        o.project_type ||
        o.project_title ||
        o.application_type ||
        o.permit_type ||
        o.source_category ||
        "Opportunity";

      const place = [
        o.address,
        o.suburb,
        o.town,
        o.municipality,
        o.procuring_entity
      ]
        .filter(Boolean)
        .join(", ");

      return `
        <article class="card" style="padding:1rem 1.1rem;">
          <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:start;margin-bottom:.5rem;">
            <div>
              <strong>${escapeHTML(title)}</strong>

              <div
                class="muted"
                style="font-size:.88rem;margin-top:.15rem;"
              >
                ${escapeHTML(
                  place || country
                )}
              </div>
            </div>

            <span
              class="badge ${
                tier === "HIGH"
                  ? "badge-success"
                  : tier === "MEDIUM"
                    ? "badge-warning"
                    : "badge-muted"
              }"
            >
              ${escapeHTML(tier)} ·
              ${escapeHTML(
                String(
                  o.score ?? "—"
                )
              )}
            </span>
          </div>

          <div
            style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.6rem;font-size:.9rem;"
          >
            <div>
              <span class="muted">
                Entity
              </span>
              <br>
              ${escapeHTML(
                o.procuring_entity || "—"
              )}
            </div>

            <div>
              <span class="muted">
                Municipality
              </span>
              <br>
              ${escapeHTML(
                o.municipality || "—"
              )}
            </div>

            <div>
              <span class="muted">
                Category
              </span>
              <br>
              ${escapeHTML(
                o.source_category ||
                o.category ||
                "—"
              )}
            </div>

            <div>
              <span class="muted">
                Status
              </span>
              <br>
              ${escapeHTML(
                o.status || "—"
              )}
            </div>

            <div>
              <span class="muted">
                Closing
              </span>
              <br>
              ${escapeHTML(
                o.closing_date ||
                o.deadline ||
                "—"
              )}
            </div>
          </div>

          ${
            o.ai_summary
              ? `
                <p
                  class="muted"
                  style="margin:.7rem 0 0;font-size:.85rem;"
                >
                  ${escapeHTML(
                    o.ai_summary
                  )}
                </p>
              `
              : ""
          }
        </article>
      `;
    };

    container.innerHTML = `
      <div
        class="section-actions"
        style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;"
      >
        <button
          class="btn btn-primary"
          type="button"
          data-sa-action="scan"
          ${
            saRunning ||
            state.actionInFlight
              ? "disabled"
              : ""
          }
        >
          ${
            saRunning
              ? "Scanning…"
              : "Run SA Scan"
          }
        </button>

        <button
          class="btn btn-secondary"
          type="button"
          data-sa-action="match"
          ${
            state.actionInFlight
              ? "disabled"
              : ""
          }
        >
          Match to Tenants
        </button>

        <button
          class="btn btn-secondary"
          type="button"
          data-sa-action="scan-match"
          ${
            saRunning ||
            state.actionInFlight
              ? "disabled"
              : ""
          }
        >
          Scan + Match
        </button>

        <button
          class="btn btn-secondary"
          type="button"
          data-sa-action="refresh"
          ${
            state.actionInFlight
              ? "disabled"
              : ""
          }
        >
          Refresh
        </button>
      </div>

      <div
        class="metric-grid"
        style="margin-bottom:1.25rem;"
      >
        <article class="metric-card">
          <span>
            SA Scan Status
          </span>

          <strong>
            ${
              saRunning
                ? "RUNNING"
                : (
                    saStatus.lastRun
                      ? "IDLE"
                      : "NEVER RUN"
                  )
            }
          </strong>

          <small>
            ${
              saStatus.lastRun
                ? escapeHTML(
                    new Date(
                      saStatus.lastRun
                    ).toLocaleString()
                  )
                : "No scan yet"
            }
          </small>
        </article>

        <article class="metric-card">
          <span>
            SA Sources
          </span>

          <strong>
            ${
              saSources.filter(
                s => s.enabled
              ).length
            }/${saSources.length || "—"}
          </strong>

          <small>
            Enabled / total
          </small>
        </article>

        <article class="metric-card">
          <span>
            SA Fetched
          </span>

          <strong>
            ${formatNumber(
              saStats.fetched ?? 0
            )}
          </strong>

          <small>
            New
            ${formatNumber(
              saStats.new ?? 0
            )}
            · Updated
            ${formatNumber(
              saStats.updated ?? 0
            )}
          </small>
        </article>

        <article class="metric-card">
          <span>
            SA HIGH / MEDIUM
          </span>

          <strong>
            ${formatNumber(
              saStats.high ?? saHigh
            )}
            /
            ${formatNumber(
              saStats.medium ?? saMedium
            )}
          </strong>

          <small>
            Opportunity tiers
          </small>
        </article>
      </div>

      ${
        saStatus.lastError ||
        sa.lastError
          ? `
            <div
              class="empty-panel"
              style="border-color:#ef4444;margin-bottom:1rem;"
            >
              <strong>
                South Africa last error
              </strong>
              <br>
              ${escapeHTML(
                saStatus.lastError ||
                sa.lastError
              )}
            </div>
          `
          : ""
      }

      <div
        class="section-head"
        style="margin-bottom:.75rem;"
      >
        <div>
          <span class="eyebrow">
            LIVE FEED
          </span>

          <h3 style="margin:.15rem 0;">
            South Africa Opportunities
          </h3>

          <p
            class="muted"
            style="margin:0;"
          >
            Top scored construction /
            development leads from
            enabled sources.
          </p>
        </div>
      </div>

      ${
        saOpps.length
          ? `
            <div
              class="list"
              style="display:grid;gap:.75rem;"
            >
              ${saOpps
                .map(
                  o =>
                    renderOpp(
                      o,
                      "South Africa"
                    )
                )
                .join("")}
            </div>
          `
          : `
            <div class="empty-panel">
              No South Africa opportunities
              loaded yet.
              <br>
              Click
              <strong>
                Run SA Scan
              </strong>
              to pull enabled source data.
            </div>
          `
      }

      ${
        saSources.length
          ? `
            <div
              class="section-head"
              style="margin:1.5rem 0 .75rem;"
            >
              <div>
                <span class="eyebrow">
                  SOURCES
                </span>

                <h3 style="margin:.15rem 0;">
                  South Africa Sources
                </h3>
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Municipality</th>
                    <th>Category</th>
                    <th>Enabled</th>
                    <th>Confidence</th>
                  </tr>
                </thead>

                <tbody>
                  ${saSources
                    .map(
                      s => `
                        <tr>
                          <td>
                            ${escapeHTML(
                              s.id
                            )}
                          </td>

                          <td>
                            ${escapeHTML(
                              s.municipality ||
                              "—"
                            )}
                          </td>

                          <td>
                            ${escapeHTML(
                              s.category ||
                              "—"
                            )}
                          </td>

                          <td>
                            ${
                              s.enabled
                                ? "Yes"
                                : "No"
                            }
                          </td>

                          <td>
                            ${escapeHTML(
                              String(
                                s.confidence ??
                                "—"
                              )
                            )}
                          </td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : ""
      }

      <div
        class="section-head"
        style="margin:1.75rem 0 .75rem;"
      >
        <div>
          <span class="eyebrow">
            ZIMBABWE ACQUISITION INTELLIGENCE
          </span>

          <h3 style="margin:.15rem 0;">
            🇿🇼 Zimbabwe Construction
            Opportunities
          </h3>

          <p
            class="muted"
            style="margin:0;"
          >
            Zimbabwe procurement and
            construction opportunities from
            registered acquisition sources.
          </p>
        </div>
      </div>

      <div
        class="section-actions"
        style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;"
      >
        <button
          class="btn btn-primary"
          type="button"
          data-zw-action="scan"
          ${
            zwRunning ||
            state.actionInFlight
              ? "disabled"
              : ""
          }
        >
          ${
            zwRunning
              ? "Zimbabwe Scanning…"
              : "🇿🇼 Zimbabwe Scan"
          }
        </button>

        <button
          class="btn btn-secondary"
          type="button"
          data-zw-action="refresh"
          ${
            state.actionInFlight
              ? "disabled"
              : ""
          }
        >
          Refresh Zimbabwe
        </button>
      </div>

      <div
        class="metric-grid"
        style="margin-bottom:1rem;"
      >
        <article class="metric-card">
          <span>
            ZW Scan Status
          </span>

          <strong>
            ${
              zwRunning
                ? "RUNNING"
                : (
                    zwStatus.lastRun
                      ? "IDLE"
                      : "NEVER RUN"
                  )
            }
          </strong>

          <small>
            ${
              zwStatus.lastRun
                ? escapeHTML(
                    new Date(
                      zwStatus.lastRun
                    ).toLocaleString()
                  )
                : "No Zimbabwe scan yet"
            }
          </small>
        </article>

        <article class="metric-card">
          <span>
            ZW Sources
          </span>

          <strong>
            ${
              zwSources.filter(
                s => s.enabled
              ).length
            }/${zwSources.length || "—"}
          </strong>

          <small>
            Enabled / total
          </small>
        </article>

        <article class="metric-card">
          <span>
            ZW Fetched
          </span>

          <strong>
            ${formatNumber(
              zwStats.fetched ?? 0
            )}
          </strong>

          <small>
            New
            ${formatNumber(
              zwStats.new ?? 0
            )}
          </small>
        </article>

        <article class="metric-card">
          <span>
            ZW HIGH / MEDIUM
          </span>

          <strong>
            ${formatNumber(
              zwStats.high ?? zwHigh
            )}
            /
            ${formatNumber(
              zwStats.medium ?? zwMedium
            )}
          </strong>

          <small>
            Opportunity tiers
          </small>
        </article>
      </div>

      ${
        zwStatus.lastError ||
        zw.lastError
          ? `
            <div
              class="empty-panel"
              style="border-color:#ef4444;margin-bottom:1rem;"
            >
              <strong>
                Zimbabwe last error
              </strong>
              <br>
              ${escapeHTML(
                zwStatus.lastError ||
                zw.lastError
              )}
            </div>
          `
          : ""
      }

      ${
        zwOpps.length
          ? `
            <div
              class="list"
              style="display:grid;gap:.75rem;"
            >
              ${zwOpps
                .map(
                  o =>
                    renderOpp(
                      o,
                      "Zimbabwe"
                    )
                )
                .join("")}
            </div>
          `
          : `
            <div class="empty-panel">
              No Zimbabwe opportunities
              loaded yet.
              <br>
              Click
              <strong>
                🇿🇼 Zimbabwe Scan
              </strong>
              to run the acquisition engine.
            </div>
          `
      }
    `;

    container
      .querySelectorAll(
        "[data-sa-action]"
      )
      .forEach(
        btn => {
          btn.addEventListener(
            "click",
            async () => {
              const action =
                btn.dataset.saAction;

              if (
                action === "scan"
              ) {
                await runSaScan();

              } else if (
                action === "match"
              ) {
                await runSaMatch();

              } else if (
                action === "scan-match"
              ) {
                await runSaScanAndMatch();

              } else if (
                action === "refresh"
              ) {
                await Promise.all([
                  loadSaStatus(),
                  loadSaSources(),
                  loadSaOpportunities(),
                  loadZwStatus(),
                  loadZwSources(),
                  loadZwOpportunities()
                ]);

                renderAcquisition();
              }
            }
          );
        }
      );

    container
      .querySelectorAll(
        "[data-zw-action]"
      )
      .forEach(
        btn => {
          btn.addEventListener(
            "click",
            async () => {
              const action =
                btn.dataset.zwAction;

              if (
                action === "scan"
              ) {
                await runZwScan();

              } else if (
                action === "refresh"
              ) {
                await Promise.all([
                  loadZwStatus(),
                  loadZwSources(),
                  loadZwOpportunities()
                ]);

                renderAcquisition();
              }
            }
          );
        }
      );
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
          Tenant authentication is not treated as
          Executive authentication. Privileged controls
          remain protected by backend authorization.
        </p>
      </div>
    `;
  }

  /* ================================================================
   * EVENT HANDLERS
   * ================================================================ */

  function bindEvents() {
    const saveKey =
      byId(
        "saveKeyBtn"
      );

    const keyInput =
      byId(
        "adminKeyInput"
      );

    if (saveKey) {
      saveKey.addEventListener(
        "click",
        async () => {
          const key =
            keyInput
              ? keyInput.value
              : "";

          await verifyAdminKey(
            key
          );
        }
      );
    }

    if (keyInput) {
      keyInput.addEventListener(
        "keydown",
        event => {
          if (
            event.key ===
            "Enter"
          ) {
            event.preventDefault();

            verifyAdminKey(
              keyInput.value
            );
          }
        }
      );
    }

    const logout =
      byId(
        "logout-btn"
      );

    if (logout) {
      logout.addEventListener(
        "click",
        logoutExecutive
      );
    }

    const refresh =
      byId(
        "refresh-btn"
      );

    if (refresh) {
      refresh.addEventListener(
        "click",
        async () => {
          if (
            !state.authenticated
          ) {
            showToast(
              "Authenticate first.",
              "warning"
            );

            return;
          }

          await refreshAll();

          showToast(
            "Dashboard refreshed.",
            "success"
          );
        }
      );
    }

    all(
      ".nav-item[data-section]"
    ).forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            showSection(
              button.dataset.section
            );
          }
        );
      }
    );

    all(
      "[data-section-target]"
    ).forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            showSection(
              button.dataset.sectionTarget
            );
          }
        );
      }
    );

    all(
      "[data-action]"
    ).forEach(
      button => {
        button.addEventListener(
          "click",
          async event => {
            const action =
              event.currentTarget
                .dataset.action;

            if (
              action ===
              "refresh"
            ) {
              await refreshAll();

              return;
            }

            if (
              action ===
              "clear-logs"
            ) {
              state.events = [];

              renderEvents();
              renderAudit();

              showToast(
                "Audit view cleared.",
                "info"
              );

              return;
            }

            await runExecutiveAction(
              action
            );
          }
        );
      }
    );

    document.addEventListener(
      "change",
      event => {
        const target =
          event.target;

        if (
          target &&
          target.matches(
            "[data-os-toggle]"
          )
        ) {
          toggleOS(
            target
          );
        }
      }
    );

    const exportButton =
      byId(
        "btnExportPermits"
      );

    if (exportButton) {
      exportButton.addEventListener(
        "click",
        exportPermitsCSV
      );
    }

    const openSidebar =
      byId(
        "open-sidebar"
      );

    if (openSidebar) {
      openSidebar.addEventListener(
        "click",
        openMobileSidebar
      );
    }

    const closeSidebar =
      byId(
        "close-sidebar"
      );

    if (closeSidebar) {
      closeSidebar.addEventListener(
        "click",
        closeMobileSidebar
      );
    }

    const overlay =
      byId(
        "sidebar-overlay"
      );

    if (overlay) {
      overlay.addEventListener(
        "click",
        closeMobileSidebar
      );
    }
  }

  /* ================================================================
   * INITIALISE UI
   * ================================================================ */

  function initialiseUI() {
    setAuthUI(
      state.authenticated
    );

    setGlobalStatus(
      true,
      "Checking system..."
    );

    renderModules();
    renderPermits();
    renderLeads();
    renderEvents();
    renderAudit();
    renderIntegrations();
    renderForecast();
    renderSettings();
    renderAnalytics();
    renderAcquisition();
    renderSecurity();

    /*
     * Generic OS shells.
     */
    [
      "executive",
      "revenue",
      "sales",
      "marketing",
      "operations",
      "finance",
      "human-capital",
      "projects",
      "knowledge",
      "legal",
      "supply",
      "customer-success"
    ].forEach(
      renderGenericOS
    );
  }

  /* ================================================================
   * STARTUP
   * ================================================================ */

  async function initialise() {
    try {
      loadAdminKey();

      initialiseUI();

      bindEvents();

      showSection(
        "dashboard"
      );

      /*
       * First try the existing authenticated session.
       */
      const sessionValid =
        await checkExistingSession();

      /*
       * If no active session exists, attempt the stored
       * Executive admin key.
       */
      if (
        !sessionValid &&
        state.adminKey
      ) {
        await verifyAdminKey(
          state.adminKey
        );
      }

      if (
        state.authenticated
      ) {
        await refreshAll();

        /*
         * Keep dashboard telemetry current.
         */
        clearInterval(
          state.refreshTimer
        );

        state.refreshTimer =
          setInterval(
            () => {
              if (
                state.authenticated &&
                !state.refreshInFlight
              ) {
                refreshAll();
              }
            },
            30000
          );
      } else {
        setGlobalStatus(
          true,
          "Admin key required"
        );

        actionMessage(
          "Enter the Executive ADMIN_KEY to unlock controls.",
          "warning"
        );
      }

    } catch (error) {
      console.error(
        "[GRIDV21] Dashboard startup failed:",
        error
      );

      setGlobalStatus(
        false,
        "Dashboard error"
      );

      actionMessage(
        error.message ||
          "Dashboard initialisation failed.",
        "error"
      );
    }
  }

  /* ================================================================
   * GLOBAL ERROR HANDLING
   * ================================================================ */

  window.addEventListener(
    "error",
    event => {
      console.error(
        "[GRIDV21] JavaScript error:",
        event.error ||
          event.message
      );
    }
  );

  window.addEventListener(
    "unhandledrejection",
    event => {
      console.error(
        "[GRIDV21] Unhandled promise rejection:",
        event.reason
      );
    }
  );

  /* ================================================================
   * PUBLIC DEBUG HANDLE
   * ================================================================ */

  window.GRIDV21Dashboard =
    Object.freeze({
      version:
        VERSION,

      refresh:
        refreshAll,

      authenticate:
        verifyAdminKey,

      logout:
        logoutExecutive,

      state
    });

  /* ================================================================
   * RUN
   * ================================================================ */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialise,
      {
        once: true
      }
    );
  } else {
    initialise();
  }

})();

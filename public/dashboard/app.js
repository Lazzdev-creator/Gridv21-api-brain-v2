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

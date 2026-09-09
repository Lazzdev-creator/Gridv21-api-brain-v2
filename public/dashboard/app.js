(() => {
  "use strict";

  const VERSION = "6.4.0";

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
    label
  ) {
    state.connected =
      Boolean(connected);

    const status =
      byId("connection-status") ||
      byId("system-connection") ||
      byId("api-status");

    if (status) {
      status.textContent =
        label ||
        (
          connected
            ? "Connected"
            : "Disconnected"
        );

      status.classList.toggle(
        "online",
        Boolean(connected)
      );

      status.classList.toggle(
        "offline",
        !connected
      );
    }

    const badge =
      byId("connection-badge");

    if (badge) {
      badge.textContent =
        connected
          ? "ONLINE"
          : "OFFLINE";

      badge.classList.toggle(
        "badge-success",
        Boolean(connected)
      );

      badge.classList.toggle(
        "badge-danger",
        !connected
      );
    }

    const dot =
      byId("connection-dot");

    if (dot) {
      dot.classList.toggle(
        "online",
        Boolean(connected)
      );

      dot.classList.toggle(
        "offline",
        !connected
      );
    }
  }


  /* ========================================================================
   * API REQUEST HELPER
   * ====================================================================== */

  async function apiRequest(
    url,
    options = {}
  ) {
    const config = {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json"
      },
      ...options
    };

    if (
      config.body &&
      typeof config.body === "object" &&
      !(config.body instanceof FormData)
    ) {
      config.headers = {
        ...config.headers,
        "Content-Type": "application/json"
      };

      config.body =
        JSON.stringify(
          config.body
        );
    }

    if (state.adminKey) {
      config.headers = {
        ...config.headers,
        "X-Admin-Key":
          state.adminKey
      };
    }

    const response =
      await fetch(
        url,
        config
      );

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    let data;

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      data =
        await response.json();
    } else {
      data =
        await response.text();
    }

    if (!response.ok) {
      const error =
        new Error(
          (
            data &&
            typeof data === "object" &&
            (
              data.error ||
              data.message
            )
          ) ||
          `Request failed: ${response.status}`
        );

      error.status =
        response.status;

      error.data =
        data;

      throw error;
    }

    return data;
  }


  /* ========================================================================
   * AUTHENTICATION
   * ====================================================================== */

  function getStoredAdminKey() {
    try {
      return (
        localStorage.getItem(
          "gridv21_admin_key"
        ) || ""
      );
    } catch {
      return "";
    }
  }


  function storeAdminKey(key) {
    state.adminKey =
      String(key || "");

    try {
      if (state.adminKey) {
        localStorage.setItem(
          "gridv21_admin_key",
          state.adminKey
        );
      } else {
        localStorage.removeItem(
          "gridv21_admin_key"
        );
      }
    } catch {
      /* Ignore storage errors. */
    }
  }


  function clearAdminKey() {
    state.adminKey = "";

    try {
      localStorage.removeItem(
        "gridv21_admin_key"
      );
    } catch {
      /* Ignore storage errors. */
    }
  }


  function setAuthUI(
    authenticated
  ) {
    state.authenticated =
      Boolean(authenticated);

    const loginPanel =
      byId("admin-login");

    const dashboardPanel =
      byId("admin-dashboard");

    if (loginPanel) {
      loginPanel.hidden =
        state.authenticated;
    }

    if (dashboardPanel) {
      dashboardPanel.hidden =
        !state.authenticated;
    }

    $$(
      "[data-auth-required]"
    ).forEach(
      element => {
        element.disabled =
          !state.authenticated;
      }
    );

    const authStatus =
      byId("auth-status");

    if (authStatus) {
      authStatus.textContent =
        state.authenticated
          ? "Authenticated"
          : "Authentication required";
    }
  }


  async function verifyAdminKey(
    key
  ) {
    const suppliedKey =
      String(key || "").trim();

    if (!suppliedKey) {
      throw new Error(
        "Admin key is required."
      );
    }

    state.adminKey =
      suppliedKey;

    const result =
      await apiRequest(
        API.authVerify,
        {
          method: "POST",
          body: {
            admin_key:
              suppliedKey
          }
        }
      );

    const authenticated =
      Boolean(
        result?.authenticated ??
        result?.authorized ??
        result?.success
      );

    if (!authenticated) {
      clearAdminKey();

      throw new Error(
        result?.message ||
        result?.error ||
        "Invalid admin key."
      );
    }

    storeAdminKey(
      suppliedKey
    );

    setAuthUI(true);

    return result;
  }


  async function verifyAdminSession() {
    try {
      const result =
        await apiRequest(
          API.authMe
        );

      const authenticated =
        Boolean(
          result?.authenticated ??
          result?.authorized ??
          result?.admin ??
          result?.user
        );

      if (authenticated) {
        state.authenticated =
          true;

        setAuthUI(true);

        return true;
      }
    } catch {
      /* Session may not exist. */
    }

    if (state.adminKey) {
      try {
        await verifyAdminKey(
          state.adminKey
        );

        return true;
      } catch {
        clearAdminKey();
      }
    }

    setAuthUI(false);

    return false;
  }


  async function logoutAdmin() {
    try {
      await apiRequest(
        API.authLogout,
        {
          method: "POST"
        }
      );
    } catch {
      /* Logout locally even if server rejects. */
    }

    clearAdminKey();

    state.authenticated =
      false;

    setAuthUI(false);

    showToast(
      "Logged out.",
      "info"
    );
  }

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
      badge.classList.toggle(
        "badge-success",
        Boolean(connected)
      );

      badge.classList.toggle(
        "badge-danger",
        !connected
      );
    }

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


  /* ========================================================================
   * DASHBOARD NORMALISATION
   * ====================================================================== */

  function normalizeDashboard(
    payload
  ) {
    const data =
      safeObject(payload);

    return {
      ...data,

      metrics:
        safeObject(
          data.metrics
        ),

      system:
        safeObject(
          data.system
        ),

      revenue:
        safeObject(
          data.revenue
        ),

      leads:
        safeArray(
          data.leads
        ),

      permits:
        safeArray(
          data.permits
        ),

      osModules:
        safeArray(
          data.osModules ||
          data.os_modules
        ),

      integrations:
        safeArray(
          data.integrations
        )
    };
  }


  /* ========================================================================
   * LOAD DASHBOARD
   * ====================================================================== */

  async function loadDashboard() {
    if (!state.authenticated) {
      return null;
    }

    try {
      const payload =
        await apiRequest(
          API.dashboard
        );

      state.dashboard =
        normalizeDashboard(
          payload
        );

      setGlobalStatus(
        true,
        "Connected"
      );

      renderDashboard(
        state.dashboard
      );

      return state.dashboard;
    } catch (error) {
      setGlobalStatus(
        false,
        "API Error"
      );

      if (
        error.status === 401 ||
        error.status === 403
      ) {
        clearAdminKey();

        state.authenticated =
          false;

        setAuthUI(false);

        showToast(
          "Admin session expired.",
          "error"
        );
      } else {
        showToast(
          error.message ||
          "Unable to load dashboard.",
          "error"
        );
      }

      throw error;
    }
  }


  /* ========================================================================
   * LOAD OS MODULES
   * ====================================================================== */

  async function loadOSModules() {
    if (!state.authenticated) {
      return [];
    }

    try {
      const payload =
        await apiRequest(
          API.osModules
        );

      const modules =
        Array.isArray(payload)
          ? payload
          : (
              payload?.modules ||
              payload?.osModules ||
              payload?.os_modules ||
              []
            );

      state.osModules =
        safeArray(modules);

      renderOSModules(
        state.osModules
      );

      return state.osModules;
    } catch (error) {
      /*
       * Do not destroy the UI when the endpoint is temporarily
       * unavailable. Fall back to the built-in module definitions.
       */
      state.osModules =
        OS_MODULES.map(
          module => ({
            ...module,
            active: false
          })
        );

      renderOSModules(
        state.osModules
      );

      console.warn(
        "OS module request failed:",
        error
      );

      return state.osModules;
    }
  }


  /* ========================================================================
   * LOAD PERMITS
   * ====================================================================== */

  async function loadPermits() {
    if (!state.authenticated) {
      return [];
    }

    try {
      const payload =
        await apiRequest(
          API.permits
        );

      state.permits =
        safeArray(
          Array.isArray(payload)
            ? payload
            : (
                payload?.permits ||
                payload?.data ||
                []
              )
        );

      renderPermits(
        state.permits
      );

      return state.permits;
    } catch (error) {
      console.warn(
        "Permit request failed:",
        error
      );

      state.permits = [];

      renderPermits([]);

      return [];
    }
  }


  /* ========================================================================
   * DASHBOARD RENDERING
   * ====================================================================== */

  function renderDashboard(
    dashboard
  ) {
    const data =
      normalizeDashboard(
        dashboard
      );

    const metrics =
      safeObject(
        data.metrics
      );

    const system =
      safeObject(
        data.system
      );

    const revenue =
      safeObject(
        data.revenue
      );

    const totalLeads =
      metrics.total_leads ??
      metrics.totalLeads ??
      data.total_leads ??
      data.totalLeads ??
      safeArray(data.leads).length;

    const totalPermits =
      metrics.total_permits ??
      metrics.totalPermits ??
      data.total_permits ??
      data.totalPermits ??
      safeArray(data.permits).length;

    const activeModules =
      metrics.active_modules ??
      metrics.activeModules ??
      system.active_modules ??
      system.activeModules ??
      safeArray(
        data.osModules
      ).filter(
        module =>
          module.active === true ||
          module.enabled === true
      ).length;

    const uptime =
      system.uptime ??
      data.uptime ??
      metrics.uptime;

    const revenueValue =
      revenue.monthly ??
      revenue.monthly_revenue ??
      revenue.est_revenue_month ??
      metrics.revenue ??
      data.revenue;

    text(
      "total-leads",
      number(totalLeads)
    );

    text(
      "total_permits",
      number(totalPermits)
    );

    text(
      "active-modules",
      number(activeModules)
    );

    text(
      "uptime",
      formatUptime(uptime)
    );

    text(
      "revenue",
      money(revenueValue)
    );

    /*
     * Compatibility with older dashboard IDs.
     */
    text(
      "total_leads",
      number(totalLeads)
    );

    text(
      "os_count",
      `${number(activeModules)}/${number(
        OS_MODULES.length
      )}`
    );

    text(
      "est_revenue_month",
      money(revenueValue)
    );

    renderLeads(
      safeArray(
        data.leads
      )
    );

    renderPermits(
      safeArray(
        data.permits
      )
    );

    renderSystemHealth(
      data
    );
  }


  /* ========================================================================
   * SYSTEM HEALTH
   * ====================================================================== */

  function renderSystemHealth(
    dashboard
  ) {
    const system =
      safeObject(
        dashboard.system
      );

    const health =
      safeObject(
        dashboard.health
      );

    const status =
      dashboard.status ||
      system.status ||
      health.status ||
      (
        dashboard.connected
          ? "Operational"
          : "Unknown"
      );

    text(
      "system-status",
      status
    );

    text(
      "system-version",
      dashboard.version ||
      system.version ||
      VERSION
    );

    text(
      "last-update",
      dateTime(
        dashboard.updated_at ||
        dashboard.updatedAt ||
        system.updated_at ||
        system.updatedAt
      )
    );
  }


  /* ========================================================================
   * LEAD RENDERING
   * ====================================================================== */

  function renderLeads(
    leads
  ) {
    const container =
      byId("leads-list") ||
      byId("lead-list") ||
      byId("leads");

    if (!container) {
      return;
    }

    const items =
      safeArray(leads);

    if (!items.length) {
      container.innerHTML =
        `
          <div class="empty-state">
            No leads available.
          </div>
        `;

      return;
    }

    container.innerHTML =
      items
        .slice(0, 50)
        .map(
          lead => {
            const id =
              lead.id ??
              lead.lead_id ??
              "";

            const region =
              lead.region ||
              lead.province ||
              lead.location ||
              "Unknown";

            const trade =
              lead.trade_type ||
              lead.trade ||
              lead.category ||
              "Opportunity";

            const status =
              lead.status ||
              "new";

            const value =
              lead.value_estimate ??
              lead.estimated_value ??
              lead.value ??
              0;

            return `
              <div
                class="lead-row"
                data-lead-id="${escapeHTML(id)}"
              >
                <div class="lead-main">
                  <strong>
                    ${escapeHTML(trade)}
                  </strong>

                  <span>
                    ${escapeHTML(region)}
                  </span>
                </div>

                <div class="lead-meta">
                  <span class="lead-status">
                    ${escapeHTML(status)}
                  </span>

                  <span class="lead-value">
                    ${escapeHTML(
                      money(value)
                    )}
                  </span>
                </div>
              </div>
            `;
          }
        )
        .join("");
  }


  /* ========================================================================
   * PERMIT RENDERING
   * ====================================================================== */

  function renderPermits(
    permits
  ) {
    const container =
      byId("permits-list") ||
      byId("permit-list") ||
      byId("permits");

    if (!container) {
      return;
    }

    const items =
      safeArray(permits);

    if (!items.length) {
      container.innerHTML =
        `
          <div class="empty-state">
            No permit intelligence available.
          </div>
        `;

      return;
    }

    container.innerHTML =
      items
        .slice(0, 50)
        .map(
          permit => {
            const authority =
              permit.authority ||
              permit.municipality ||
              permit.source ||
              "Unknown authority";

            const type =
              permit.permit_type ||
              permit.type ||
              "Permit";

            const location =
              permit.location ||
              permit.region ||
              permit.province ||
              "Unknown location";

            const status =
              permit.status ||
              "Unknown";

            return `
              <div class="permit-row">
                <div>
                  <strong>
                    ${escapeHTML(type)}
                  </strong>

                  <span>
                    ${escapeHTML(location)}
                  </span>
                </div>

                <div>
                  <span>
                    ${escapeHTML(authority)}
                  </span>

                  <span class="permit-status">
                    ${escapeHTML(status)}
                  </span>
                </div>
              </div>
            `;
          }
        )
        .join("");
        }

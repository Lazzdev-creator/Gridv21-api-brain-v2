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
  /* ========================================================================
   * NORMALISE DASHBOARD RESPONSE
   * ====================================================================== */

  function normaliseDashboard(payload) {

    const data =
      safeObject(payload);


    /*
     * Backend may return:
     *
     * { data: {...} }
     *
     * or:
     *
     * { dashboard: {...} }
     *
     * or the dashboard object directly.
     */

    const source =
      safeObject(
        data.data ||
        data.dashboard ||
        data
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

    if (
      !state.authenticated
    ) {

      throw new APIError(
        "Executive authentication required.",
        401
      );
    }


    try {

      const payload =
        await apiFetch(
          API.dashboard
        );


      const dashboard =
        normaliseDashboard(
          payload
        );


      /*
       * Store dashboard data.
       */

      state.dashboard =
        dashboard;


      /*
       * Preserve any useful arrays.
       */

      if (
        dashboard.leads.length
      ) {

        state.leads =
          dashboard.leads;
      }


      if (
        dashboard.permits.length
      ) {

        state.permits =
          dashboard.permits;
      }


      if (
        dashboard.osModules.length
      ) {

        state.osModules =
          dashboard.osModules;
      }


      /*
       * Render the complete dashboard.
       */

      renderDashboard(
        dashboard
      );


      if (
        typeof renderPermitsTable ===
        "function"
      ) {

        renderPermitsTable(
          state.permits
        );
      }


      if (
        typeof renderTopLeads ===
        "function"
      ) {

        renderTopLeads(
          state.leads
        );
      }


      return dashboard;

    } catch (error) {

      handleAuthFailure(
        error
      );


      console.error(
        "[GRIDV21] Dashboard load failed:",
        error
      );


      renderDashboardError(
        error
      );


      throw error;
    }
  }


  /* ========================================================================
   * LOAD OS MODULES
   * ====================================================================== */

  async function loadOSModules() {

    try {

      const payload =
        await apiFetch(
          API.osModules
        );


      const data =
        safeObject(
          payload
        );


      const modules =
        safeArray(
          data.modules ||
          data.data ||
          data.osModules ||
          payload
        );


      if (
        modules.length
      ) {

        state.osModules =
          modules;
      }


      renderOSOverview(
        state.osModules.length
          ? state.osModules
          : OS_MODULES
      );


      return state.osModules;

    } catch (error) {

      handleAuthFailure(
        error
      );


      console.warn(
        "[GRIDV21] OS module API failed:",
        error
      );


      /*
       * Keep the dashboard usable even
       * if the OS endpoint is unavailable.
       */

      renderOSOverview(
        state.osModules.length
          ? state.osModules
          : OS_MODULES
      );


      return state.osModules;
    }
  }


  /* ========================================================================
   * PERMITS TABLE
   * ====================================================================== */

  function renderPermitsTable(
    permits
  ) {

    const body =
      byId(
        "permits-body"
      );


    if (!body) {
      return;
    }


    const rows =
      safeArray(
        permits
      ).slice(
        0,
        100
      );


    if (!rows.length) {

      body.innerHTML = `
        <tr>
          <td
            colspan="5"
            class="empty"
          >
            No permits found.
          </td>
        </tr>
      `;

      return;
    }


    body.innerHTML =
      rows
        .map(
          permit => {

            const row =
              safeObject(
                permit
              );


            return `
              <tr>

                <td>
                  ${escapeHTML(
                    row.city ||
                    "—"
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    row.permit_type ||
                    row.permit_id ||
                    "—"
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    row.status ||
                    "—"
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    row.ai_score ??
                    "—"
                  )}
                </td>

                <td>
                  ${
                    row.estimated_value != null &&
                    row.estimated_value !== ""
                      ? money(
                          row.estimated_value
                        )
                      : "—"
                  }
                </td>

              </tr>
            `;
          }
        )
        .join("");
  }


  /* ========================================================================
   * LOAD PERMITS
   * ====================================================================== */

  async function loadPermits() {

    try {

      const payload =
        await apiFetch(
          API.permits
        );


      const data =
        safeObject(
          payload
        );


      const permits =
        safeArray(
          data.permits ||
          data.data ||
          payload
        );


      state.permits =
        permits;


      renderPermitsTable(
        permits
      );


      return permits;

    } catch (error) {

      /*
       * Some backend versions may not
       * expose /api/permits.
       *
       * Do not break the dashboard.
       */

      if (
        error.status !== 404
      ) {

        console.warn(
          "[GRIDV21] Permit API failed:",
          error
        );
      }


      return state.permits;
    }
  }


  /* ========================================================================
   * REFRESH DASHBOARD
   * ====================================================================== */

  async function refreshDashboardData() {

    if (
      state.requestInFlight
    ) {

      return;
    }


    /*
     * Executive authentication is required
     * before protected dashboard requests.
     */

    if (
      !state.authenticated
    ) {

      return;
    }


    state.requestInFlight =
      true;


    setRefreshState(
      true
    );


    try {

      /*
       * Check backend health.
       */

      try {

        await apiFetch(
          API.health
        );

      } catch (healthError) {

        console.warn(
          "[GRIDV21] Health check failed:",
          healthError
        );
      }


      /*
       * Dashboard is the primary request.
       */

      await loadDashboard();


      /*
       * Optional endpoints must not
       * prevent the dashboard from loading.
       */

      await Promise.allSettled(
        [
          loadOSModules(),
          loadPermits()
        ]
      );


      setGlobalStatus(
        true,
        "Connected"
      );

    } catch (error) {

      console.error(
        "[GRIDV21] Refresh failed:",
        error
      );


      if (
        error.status === 401
      ) {

        setGlobalStatus(
          false,
          "Authentication required"
        );

      } else {

        setGlobalStatus(
          false,
          "API unavailable"
        );
      }

    } finally {

      state.requestInFlight =
        false;


      setRefreshState(
        false
      );
    }
  }


  /* ========================================================================
   * REFRESH BUTTON STATE
   * ====================================================================== */

  function setRefreshState(
    loading
  ) {

    const button =
      byId(
        "refresh-btn"
      );


    if (!button) {
      return;
    }


    button.disabled =
      Boolean(loading);


    if (loading) {

      button.dataset.originalText =
        button.textContent;


      button.textContent =
        "Refreshing...";

    } else {

      button.textContent =
        button.dataset.originalText ||
        "Refresh";
    }
  }


  /* ========================================================================
   * DASHBOARD RENDERER
   * ====================================================================== */

  function renderDashboard(
    dashboard
  ) {

    const data =
      safeObject(
        dashboard
      );


    const engine =
      safeObject(
        data.engine
      );


    const metrics =
      safeObject(
        data.metrics
      );


    const revenue =
      safeObject(
        data.revenue
      );


    /* ----------------------------------------------------------------------
     * ENGINE STATUS
     * -------------------------------------------------------------------- */

    const running =
      engine.running ??
      engine.isRunning ??
      metrics.running ??
      false;


    const scanning =
      engine.scanning ??
      engine.isScanning ??
      metrics.scanning ??
      false;


    text(
      "metric-engine",
      running
        ? "Running"
        : "Stopped"
    );


    text(
      "metric-engine-sub",
      scanning
        ? "Scanning"
        : running
          ? "Operational"
          : "Idle"
    );


    /* ----------------------------------------------------------------------
     * ACTIVE OS
     * -------------------------------------------------------------------- */

    const activeOS =
      safeNumber(
        metrics.activeOS ??
        metrics.activeOs ??
        metrics.active_modules ??
        safeArray(
          data.osModules
        ).length,
        safeArray(
          data.osModules
        ).length
      );


    text(
      "metric-os",
      activeOS
    );


    /* ----------------------------------------------------------------------
     * LEADS
     * -------------------------------------------------------------------- */

    const leadCount =
      safeNumber(
        metrics.leads ??
        metrics.leadCount ??
        metrics.totalLeads ??
        safeArray(
          data.leads
        ).length,
        safeArray(
          data.leads
        ).length
      );


    text(
      "metric-leads",
      number(
        leadCount
      )
    );


    /* ----------------------------------------------------------------------
     * REVENUE
     * -------------------------------------------------------------------- */

    const revenueValue =
      revenue.total ??
      revenue.amount ??
      metrics.revenue ??
      metrics.totalRevenue ??
      0;


    text(
      "metric-revenue",
      money(
        revenueValue
      )
    );


    /* ----------------------------------------------------------------------
     * TELEMETRY
     * -------------------------------------------------------------------- */

    renderTelemetry(
      engine
    );


    /* ----------------------------------------------------------------------
     * RECOMMENDATION
     * -------------------------------------------------------------------- */

    renderRecommendation(
      data.recommendation
    );


    /* ----------------------------------------------------------------------
     * TOP LEADS
     * -------------------------------------------------------------------- */

    renderTopLeads(
      data.leads.length
        ? data.leads
        : state.leads
    );


    /* ----------------------------------------------------------------------
     * LATEST EVENTS
     * -------------------------------------------------------------------- */

    renderLatestEvents(
      data.activity
    );


    /* ----------------------------------------------------------------------
     * OS OVERVIEW
     * -------------------------------------------------------------------- */

    renderOSOverview(
      data.osModules.length
        ? data.osModules
        : (
            state.osModules.length
              ? state.osModules
              : OS_MODULES
          )
    );
  }


  /* ========================================================================
   * TELEMETRY
   * ====================================================================== */

  function renderTelemetry(
    engine
  ) {

    const data =
      safeObject(
        engine
      );


    text(
      "telemetry-running",
      bool(
        data.running ??
        data.isRunning
      )
    );


    text(
      "telemetry-scanning",
      bool(
        data.scanning ??
        data.isScanning
      )
    );


    text(
      "telemetry-permits",
      number(
        data.permitsFound ??
        data.permits_found ??
        data.totalPermits ??
        0
      )
    );


    text(
      "telemetry-errors",
      number(
        data.errors ??
        data.errorCount ??
        0
      )
    );


    text(
      "telemetry-last-scan",
      dateTime(
        data.lastScan ??
        data.last_scan
      )
    );


    text(
      "telemetry-duration",
      formatDuration(
        data.lastScanDuration ??
        data.last_scan_duration ??
        data.duration
      )
    );


    text(
      "telemetry-uptime",
      formatUptime(
        data.uptime
      )
    );


    text(
      "telemetry-emergency",
      bool(
        data.emergency ??
        data.emergencyStop ??
        data.emergency_stop
      )
    );


    const status =
      data.running
        ? (
            data.scanning
              ? "Scanning"
              : "Running"
          )
        : "Ready";


    const statusElement =
      byId(
        "engine-runtime-status"
      );


    if (statusElement) {

      statusElement.textContent =
        status;
    }
  }


  /* ========================================================================
   * DASHBOARD ERROR STATE
   * ====================================================================== */

  function renderDashboardError(
    error
  ) {

    const message =
      error?.status === 401
        ? "Authentication required"
        : "Unable to load dashboard data";


    text(
      "metric-engine",
      "Offline"
    );


    text(
      "metric-engine-sub",
      message
    );


    text(
      "metric-os",
      "—"
    );


    text(
      "metric-leads",
      "—"
    );


    text(
      "metric-revenue",
      "—"
    );


    const telemetryIds = [

      "telemetry-running",

      "telemetry-scanning",

      "telemetry-permits",

      "telemetry-errors",

      "telemetry-last-scan",

      "telemetry-duration",

      "telemetry-uptime",

      "telemetry-emergency"

    ];


    telemetryIds.forEach(
      id => {

        text(
          id,
          "—"
        );

      }
    );


    renderRecommendation(
      null,
      message
    );


    renderTopLeads(
      []
    );


    renderLatestEvents(
      []
    );


    renderOSOverview(
      OS_MODULES
    );
  }


  /* ========================================================================
   * EXECUTIVE RECOMMENDATION
   * ====================================================================== */

  function renderRecommendation(
    recommendation,
    fallback = ""
  ) {

    const element =
      byId(
        "ai-recommendation"
      ) ||
      byId(
        "recommendation-text"
      ) ||
      document.querySelector(
        "[data-ai-recommendation]"
      );


    if (!element) {
      return;
    }


    let message =
      "";


    if (
      typeof recommendation ===
      "string"
    ) {

      message =
        recommendation;

    } else if (
      recommendation &&
      typeof recommendation ===
      "object"
    ) {

      message =
        recommendation.message ||
        recommendation.text ||
        recommendation.recommendation ||
        recommendation.action ||
        "";
    }


    if (!message) {

      message =
        fallback ||
        "No executive recommendation available.";
    }


    element.textContent =
      message;
  }


  /* ========================================================================
   * TOP LEADS
   * ====================================================================== */

  function renderTopLeads(
    leads
  ) {

    const container =
      byId(
        "top-leads-body"
      );


    if (!container) {
      return;
    }


    let rows =
      safeArray(
        leads
      ).slice(
        0,
        10
      );


    /*
     * Fallback 1:
     * application state.
     */

    if (
      !rows.length
    ) {

      rows =
        safeArray(
          state.leads
        ).slice(
          0,
          10
        );
    }


    /*
     * Fallback 2:
     * highest-value permits.
     */

    if (
      !rows.length
    ) {

      rows =
        safeArray(
          state.permits
        )
        .slice()
        .sort(
          (a, b) =>
            Number(
              b.estimated_value ||
              b.ai_score ||
              0
            ) -
            Number(
              a.estimated_value ||
              a.ai_score ||
              0
            )
        )
        .slice(
          0,
          10
        );
    }


    /*
     * Fallback 3:
     * dashboard permits.
     */

    if (
      !rows.length &&
      state.dashboard?.permits
    ) {

      rows =
        safeArray(
          state.dashboard.permits
        )
        .slice()
        .sort(
          (a, b) =>
            Number(
              b.estimated_value ||
              b.ai_score ||
              0
            ) -
            Number(
              a.estimated_value ||
              a.ai_score ||
              0
            )
        )
        .slice(
          0,
          10
        );
    }


    if (
      !rows.length
    ) {

      container.innerHTML = `
        <tr>
          <td
            colspan="4"
            class="empty"
          >
            No lead data available.
          </td>
        </tr>
      `;

      return;
    }


    container.innerHTML =
      rows
        .map(
          item => {

            const row =
              safeObject(
                item
              );


            const city =
              row.city ||
              row.region ||
              row.location ||
              "—";


            const type =
              row.type ||
              row.permit_type ||
              row.trade_type ||
              row.project_type ||
              "—";


            const score =
              row.score ??
              row.ai_score ??
              row.lead_score ??
              "—";


            const value =
                            row.estimated_value ??
              row.value_estimate ??
              row.value ??
              row.predicted_revenue ??
              "";


            return `
              <tr>

                <td>
                  ${escapeHTML(
                    city
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    type
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    score
                  )}
                </td>

                <td>
                  ${
                    value !== "" &&
                    value !== null &&
                    value !== undefined
                      ? money(value)
                      : "—"
                  }
                </td>

              </tr>
            `;
          }
        )
        .join("");
  }


  /* ========================================================================
   * LATEST EVENTS
   * ====================================================================== */

  function renderLatestEvents(
    events
  ) {

    const container =
      byId(
        "dashboard-activity"
      ) ||
      byId(
        "latest-events"
      ) ||
      byId(
        "events-container"
      ) ||
      document.querySelector(
        "[data-latest-events]"
      );


    if (!container) {
      return;
    }


    const rows =
      safeArray(
        events
      ).slice(
        0,
        10
      );


    if (!rows.length) {

      container.innerHTML = `
        <div class="empty">
          No recent activity.
        </div>
      `;

      return;
    }


    container.innerHTML =
      rows
        .map(
          event => {

            const item =
              safeObject(
                event
              );


            const message =
              item.message ||
              item.action ||
              item.event_type ||
              item.eventType ||
              "System event";


            const created =
              item.created_at ||
              item.createdAt ||
              item.timestamp;


            return `
              <div class="event-row">

                <strong>
                  ${escapeHTML(
                    message
                  )}
                </strong>

                <small>
                  ${escapeHTML(
                    dateTime(
                      created
                    )
                  )}
                </small>

              </div>
            `;
          }
        )
        .join("");
  }


  /* ========================================================================
   * OS OVERVIEW
   * ====================================================================== */

  function renderOSOverview(
    modules
  ) {

    const container =
      byId(
        "os-overview-grid"
      ) ||
      byId(
        "os-overview"
      ) ||
      byId(
        "os-modules"
      ) ||
      document.querySelector(
        "[data-os-overview]"
      );


    if (!container) {
      return;
    }


    const rows =
      safeArray(
        modules
      );


    if (!rows.length) {

      container.innerHTML = `
        <div class="empty">
          No operating-system modules available.
        </div>
      `;

      return;
    }


    container.innerHTML =
      rows
        .map(
          module => {

            const item =
              safeObject(
                module
              );


            const id =
              item.id ??
              "";


            const name =
              item.name ||
              `OS Module ${id}`;


            const enabled =
              item.enabled ??
              item.active ??
              item.status === "active";


            const layer =
              item.layer ||
              "Enterprise OS";


            return `
              <div
                class="os-module-row"
                data-os-module="${escapeHTML(
                  id
                )}"
              >

                <div class="os-module-info">

                  <strong>
                    ${escapeHTML(
                      name
                    )}
                  </strong>

                  <small>
                    ${escapeHTML(
                      layer
                    )}
                  </small>

                </div>


                <button
                  type="button"
                  class="os-toggle ${
                    enabled
                      ? "active"
                      : ""
                  }"
                  data-os-toggle="${escapeHTML(
                    id
                  )}"
                  aria-pressed="${
                    enabled
                      ? "true"
                      : "false"
                  }"
                >
                  ${
                    enabled
                      ? "Active"
                      : "Off"
                  }
                </button>

              </div>
            `;
          }
        )
        .join("");
  }


  /* ========================================================================
   * SCAN STATUS
   * ====================================================================== */

  async function loadScanStatus() {

    if (!state.authenticated) {
      return null;
    }


    try {

      const payload =
        await apiFetch(
          API.scanStatus
        );


      const data =
        safeObject(
          payload
        );


      const status =
        safeObject(
          data.data ||
          data.status ||
          data
        );


      const running =
        status.running ??
        status.isRunning ??
        false;


      const scanning =
        status.scanning ??
        status.isScanning ??
        false;


      text(
        "scan-status",
        scanning
          ? "Scanning"
          : running
            ? "Running"
            : "Stopped"
      );


      text(
        "scan-running",
        bool(running)
      );


      text(
        "scan-active",
        bool(scanning)
      );


      return status;

    } catch (error) {

      if (
        error.status !== 404
      ) {

        console.warn(
          "[GRIDV21] Scan status failed:",
          error
        );
      }


      return null;
    }
  }


  /* ========================================================================
   * GENERIC CONTROL REQUEST
   * ====================================================================== */

  async function controlRequest(
    url,
    options = {}
  ) {

    if (!state.authenticated) {

      showToast(
        "Executive authentication required.",
        "error"
      );

      return false;
    }


    try {

      const payload =
        await apiFetch(
          url,
          options
        );


      showToast(
        payload.message ||
        "Command completed successfully.",
        "success"
      );


      return payload;

    } catch (error) {

      console.error(
        "[GRIDV21 CONTROL]",
        error
      );


      if (
        handleAuthFailure(
          error
        )
      ) {

        return false;
      }


      showToast(
        error.message ||
        "Command failed.",
        "error"
      );


      return false;
    }
  }


  /* ========================================================================
   * START / SCAN NOW
   * ====================================================================== */

  async function startScan() {

    const button =
      byId(
        "scan-now-btn"
      );


    if (button) {
      button.disabled = true;
    }


    try {

      const result =
        await controlRequest(
          API.scrapeNow,
          {
            method: "POST"
          }
        );


      if (result) {

        await loadScanStatus();

        await loadDashboard();
      }


      return result;

    } finally {

      if (button) {
        button.disabled = false;
      }
    }
  }


  /* ========================================================================
   * STOP SCAN
   * ====================================================================== */

  async function stopScan() {

    const button =
      byId(
        "scan-stop-btn"
      );


    if (button) {
      button.disabled = true;
    }


    try {

      const result =
        await controlRequest(
          API.scanStop,
          {
            method: "POST"
          }
        );


      if (result) {

        await loadScanStatus();

        await loadDashboard();
      }


      return result;

    } finally {

      if (button) {
        button.disabled = false;
      }
    }
  }


  /* ========================================================================
   * PAUSE BRAIN
   * ====================================================================== */

  async function pauseBrain() {

    const result =
      await controlRequest(
        API.brainPause,
        {
          method: "POST"
        }
      );


    if (result) {

      await loadScanStatus();

      await loadDashboard();
    }


    return result;
  }


  /* ========================================================================
   * RESUME BRAIN
   * ====================================================================== */

  async function resumeBrain() {

    const result =
      await controlRequest(
        API.brainResume,
        {
          method: "POST"
        }
      );


    if (result) {

      await loadScanStatus();

      await loadDashboard();
    }


    return result;
  }


  /* ========================================================================
   * EMERGENCY STOP
   * ====================================================================== */

  async function emergencyStop() {

    const confirmed =
      window.confirm(
        "EMERGENCY STOP\n\nAre you sure you want to stop GRIDV21?"
      );


    if (!confirmed) {
      return false;
    }


    const result =
      await controlRequest(
        API.emergencyStop,
        {
          method: "POST"
        }
      );


    if (result) {

      setGlobalStatus(
        true,
        "Emergency stop active"
      );


      await loadScanStatus();

      await loadDashboard();
    }


    return result;
  }


  /* ========================================================================
   * TOGGLE OS MODULE
   * ====================================================================== */

  async function toggleOSModule(
    moduleId,
    button = null
  ) {

    if (
      moduleId === undefined ||
      moduleId === null ||
      moduleId === ""
    ) {

      showToast(
        "Invalid OS module.",
        "error"
      );

      return false;
    }


    if (!state.authenticated) {

      showToast(
        "Executive authentication required.",
        "error"
      );

      return false;
    }


    if (button) {
      button.disabled = true;
    }


    try {

      const result =
        await controlRequest(
          API.osToggle(
            moduleId
          ),
          {
            method: "POST"
          }
        );


      if (result) {

        await loadOSModules();

        await loadDashboard();
      }


      return result;

    } finally {

      if (button) {
        button.disabled = false;
      }
    }
  }


  /* ========================================================================
   * EXECUTIVE CONTROL BUTTON HANDLER
   * ====================================================================== */

  function bindExecutiveControls() {

    document.addEventListener(
      "click",
      async event => {

        const target =
          event.target.closest(
            "[data-action]"
          );


        if (!target) {
          return;
        }


        const action =
          target.dataset.action;


        switch (action) {

          case "refresh":
            await refreshDashboardData();
            break;


          case "scan-now":
            await startScan();
            break;


          case "scan-stop":
            await stopScan();
            break;


          case "brain-pause":
            await pauseBrain();
            break;


          case "brain-resume":
            await resumeBrain();
            break;


          case "emergency-stop":
            await emergencyStop();
            break;


          case "clear-admin-key":
            await clearAdminKey();
            break;


          default:
            break;
        }
      }
    );


    document.addEventListener(
      "click",
      async event => {

        const button =
          event.target.closest(
            "[data-os-toggle]"
          );


        if (!button) {
          return;
        }


        event.preventDefault();


        const moduleId =
          button.dataset.osToggle;


        await toggleOSModule(
          moduleId,
          button
        );
      }
    );
  }


  /* ========================================================================
   * ADMIN KEY INPUT HANDLING
   * ====================================================================== */

  function bindAdminKeyControls() {

    const input =
      byId(
        "adminKeyInput"
      );


    const saveButton =
      byId(
        "saveKeyBtn"
      );


    if (saveButton) {

      saveButton.addEventListener(
        "click",
        async event => {

          event.preventDefault();


          if (
            state.authenticated
          ) {

            showToast(
              "Executive session is already authenticated.",
              "info"
            );

            return;
          }


          const key =
            input
              ? input.value.trim()
              : "";


          if (!key) {

            const status =
              byId(
                "keyStatus"
              );


            if (status) {

              status.textContent =
                "Enter your admin key";
            }


            showToast(
              "Please enter the Executive admin key.",
              "error"
            );


            return;
          }


          /*
           * Save locally first.
           */

          saveAdminKey(
            key
          );


          /*
           * Then verify against
           * the server.
           */

          const verified =
            await verifyAdminKey();


          if (!verified) {

            /*
             * Invalid key should not
             * remain stored.
             */

            try {

              localStorage.removeItem(
                ADMIN_STORAGE_KEY
              );

            } catch (_) {}


            state.adminKey =
              "";


            if (input) {
              input.value = "";
            }


            return;
          }


          /*
           * Successful authentication.
           */

          showToast(
            "Executive access authenticated.",
            "success"
          );


          await refreshDashboardData();
        }
      );
    }


    if (input) {

      input.addEventListener(
        "keydown",
        event => {

          if (
            event.key ===
            "Enter"
          ) {

            event.preventDefault();


            if (saveButton) {
              saveButton.click();
            }
          }
        }
      );
    }
  }


  /* ========================================================================
   * EXECUTIVE SESSION BOOTSTRAP
   * ====================================================================== */

  async function initialiseExecutiveDashboard() {

    /*
     * First check the normal authenticated
     * tenant/owner session.
     */

    const sessionOK =
      await verifySession();


    if (!sessionOK) {
      return false;
    }


    /*
     * Load any previously stored
     * Executive admin key.
     */

    loadAdminKey();


    /*
     * Check whether the server already
     * has an Executive admin session.
     */

    const existingAdminSession =
      await verifyAdminSession();


    if (
      existingAdminSession
    ) {

      await refreshDashboardData();

      return true;
    }


    /*
     * If there is a stored key,
     * verify it automatically.
     */

    if (
      state.adminKey
    ) {

      const verified =
        await verifyAdminKey();


      if (verified) {

        await refreshDashboardData();

        return true;
      }
    }


    /*
     * Tenant authentication is valid,
     * but Executive access still requires
     * the Executive admin key.
     */

    setAuthUI(
      false
    );


    setGlobalStatus(
      true,
      "Executive key required"
    );


    return true;
  }


  /* ========================================================================
   * EXPORT PART 3 FUNCTIONS
   * ====================================================================== */

  window.GRIDV21 = {

    ...(window.GRIDV21 || {}),

    loadScanStatus,

    controlRequest,

    startScan,

    stopScan,

    pauseBrain,

    resumeBrain,

    emergencyStop,

    toggleOSModule,

    bindExecutiveControls,

    bindAdminKeyControls,

    initialiseExecutiveDashboard
  };


  /*
   * ================================================================
   * END OF PART 3
   * ================================================================
   *
   * DO NOT ADD THE FINAL:
   *
   * })();
   *
   * Part 4 will contain the final event/bootstrap section and
   * the single closing wrapper.
   */
  /* ========================================================================
   * EXECUTIVE CONTROL STATE
   * ====================================================================== */

  function setControlsEnabled(
    enabled
  ) {

    const selectors = [

      '[data-action="scan-start"]',

      '[data-action="scan-now"]',

      '[data-action="scan-stop"]',

      '[data-action="brain-pause"]',

      '[data-action="brain-resume"]',

      '[data-action="emergency-stop"]',

      "[data-os-toggle]"

    ];


    selectors.forEach(
      selector => {

        $$(selector)
          .forEach(
            button => {

              button.disabled =
                !Boolean(
                  enabled
                );

            }
          );

      }
    );
  }


  /* ========================================================================
   * NAVIGATION
   * ====================================================================== */

  function navigate(
    section
  ) {

    const target =
      String(
        section ||
        "dashboard"
      ).trim();


    /*
     * Support normal section containers.
     */

    const sections =
      $$(
        "[data-section]"
      );


    if (
      sections.length
    ) {

      sections.forEach(
        element => {

          const matches =
            element.dataset.section ===
            target;


          element.hidden =
            !matches;

          element.classList.toggle(
            "active",
            matches
          );

        }
      );
    }


    /*
     * Support navigation buttons.
     */

    $$(
      "[data-section-target]"
    )
      .forEach(
        button => {

          const active =
            button.dataset.sectionTarget ===
            target;


          button.classList.toggle(
            "active",
            active
          );

        }
      );


    state.currentSection =
      target;


    return true;
  }


  /* ========================================================================
   * MOBILE SIDEBAR
   * ====================================================================== */

  function openMobileSidebar() {

    state.mobileSidebarOpen =
      true;


    const sidebar =
      byId(
        "sidebar"
      );


    const overlay =
      byId(
        "sidebar-overlay"
      );


    if (sidebar) {

      sidebar.classList.add(
        "open"
      );

    }


    if (overlay) {

      overlay.classList.add(
        "show"
      );

    }
  }


  function closeMobileSidebar() {

    state.mobileSidebarOpen =
      false;


    const sidebar =
      byId(
        "sidebar"
      );


    const overlay =
      byId(
        "sidebar-overlay"
      );


    if (sidebar) {

      sidebar.classList.remove(
        "open"
      );

    }


    if (overlay) {

      overlay.classList.remove(
        "show"
      );

    }
  }


  /* ========================================================================
   * GLOBAL EXECUTIVE BUTTON HANDLER
   *
   * Handles buttons generated dynamically by the dashboard.
   * ====================================================================== */

  function bindExecutiveButtonEvents() {

    if (
      document.body.dataset.gridv21EventsBound ===
      "true"
    ) {

      return;
    }


    document.body.dataset.gridv21EventsBound =
      "true";


    document.addEventListener(
      "click",
      async event => {

        const actionButton =
          event.target.closest(
            "[data-action]"
          );


        if (
          actionButton
        ) {

          const action =
            String(
              actionButton.dataset.action ||
              ""
            ).trim();


          /*
           * Do not execute protected Executive
           * controls until the admin key is valid.
           */

          const protectedActions = [

            "scan-start",

            "scan-now",

            "scan-stop",

            "brain-pause",

            "brain-resume",

            "emergency-stop"

          ];


          if (
            protectedActions.includes(
              action
            ) &&
            !state.adminKey
          ) {

            event.preventDefault();


            showToast(
              "Enter and verify the Executive admin key first.",
              "error"
            );


            return;
          }


          switch (
            action
          ) {

            case "scan-start":

            case "scan-now":

              await startScan();

              break;


            case "scan-stop":

              await stopScan();

              break;


            case "brain-pause":

              await pauseBrain();

              break;


            case "brain-resume":

              await resumeBrain();

              break;


            case "emergency-stop":

              await emergencyStop();

              break;


            case "refresh":

              await refreshDashboardData();

              break;


            case "clear-admin-key":

            case "logout":

              await clearAdminKey();

              break;


            default:

              break;
          }


          return;
        }


        /*
         * Dynamically rendered OS buttons.
         */

        const osButton =
          event.target.closest(
            "[data-os-toggle]"
          );


        if (
          osButton
        ) {

          event.preventDefault();


          await toggleOSModule(
            osButton.dataset.osToggle,
            osButton
          );

        }

      }
    );
  }


  /* ========================================================================
   * NAVIGATION EVENTS
   * ====================================================================== */

  function bindNavigationEvents() {

    document.addEventListener(
      "click",
      event => {

        const button =
          event.target.closest(
            "[data-section-target]"
          );


        if (!button) {
          return;
        }


        event.preventDefault();


        navigate(
          button.dataset.sectionTarget
        );


        closeMobileSidebar();
      }
    );


    byId(
      "open-sidebar"
    )?.addEventListener(
      "click",
      openMobileSidebar
    );


    byId(
      "close-sidebar"
    )?.addEventListener(
      "click",
      closeMobileSidebar
    );


    byId(
      "sidebar-overlay"
    )?.addEventListener(
      "click",
      closeMobileSidebar
    );
  }


  /* ========================================================================
   * ADMIN KEY EVENTS
   * ====================================================================== */

  function bindAdminEvents() {

    /*
     * Part 3 already contains the complete
     * admin-key handler.
     */

    bindAdminKeyControls();


    /*
     * Logout / clear button.
     */

    const logoutButton =
      byId(
        "logout-btn"
      );


    if (
      logoutButton
    ) {

      logoutButton.addEventListener(
        "click",
        async event => {

          event.preventDefault();

          await clearAdminKey();

        }
      );

    }
  }


  /* ========================================================================
   * REFRESH EVENTS
   * ====================================================================== */

  function bindRefreshEvents() {

    const refreshButton =
      byId(
        "refresh-btn"
      );


    if (
      refreshButton
    ) {

      refreshButton.addEventListener(
        "click",
        async event => {

          event.preventDefault();

          await refreshDashboardData();

        }
      );

    }
  }


  /* ========================================================================
   * KEYBOARD EVENTS
   * ====================================================================== */

  function bindKeyboardEvents() {

    document.addEventListener(
      "keydown",
      event => {

        /*
         * Escape closes the mobile sidebar.
         */

        if (
          event.key ===
          "Escape"
        ) {

          closeMobileSidebar();

        }


        /*
         * Ctrl + R / Cmd + R refreshes
         * dashboard data only when the user
         * is not typing.
         */

        if (
          event.key.toLowerCase() ===
          "r" &&
          (
            event.ctrlKey ||
            event.metaKey
          )
        ) {

          const target =
            event.target;


          const tag =
            target?.tagName
              ?.toLowerCase();


          const typing =
            tag === "input" ||
            tag === "textarea" ||
            tag === "select";


          if (
            !typing
          ) {

            event.preventDefault();

            refreshDashboardData();

          }

        }

      }
    );
  }


  /* ========================================================================
   * COMPLETE EVENT BINDING
   * ====================================================================== */

  function bindAllEvents() {

    bindExecutiveButtonEvents();

    bindNavigationEvents();

    bindAdminEvents();

    bindRefreshEvents();

    bindKeyboardEvents();
  }


  /* ========================================================================
   * STARTUP ERROR
   * ====================================================================== */

  function renderStartupError(
    error
  ) {

    console.error(
      "[GRIDV21] Startup failure:",
      error
    );


    setGlobalStatus(
      false,
      "Startup error"
    );


    text(
      "metric-engine",
      "ERROR"
    );


    text(
      "metric-engine-sub",
      error?.message ||
      "Dashboard startup failed."
    );


    showToast(
      error?.message ||
      "GRIDV21 dashboard startup failed.",
      "error"
    );
  }


  /* ========================================================================
   * FINAL APPLICATION INITIALISATION
   * ====================================================================== */

  async function init() {

    console.info(
      `[GRIDV21] Starting Executive Dashboard v${VERSION}`
    );


    /*
     * Load locally stored admin key.
     */

    loadAdminKey();


    /*
     * Bind events BEFORE asynchronous requests.
     *
     * This ensures the Save button is responsive
     * as soon as the page is ready.
     */

    bindAllEvents();


    /*
     * Show dashboard section.
     */

    navigate(
      "dashboard"
    );


    /*
     * Load default OS modules immediately.
     */

    state.osModules =
      OS_MODULES.map(
        module => ({
          ...module,
          enabled: true
        })
      );


    renderOSOverview(
      state.osModules
    );


    /*
     * ================================================================
     * STEP 1 — VERIFY TENANT LOGIN
     * ================================================================
     *
     * Tenant authentication and Executive authentication
     * are intentionally treated as two separate layers.
     */

    const tenantSession =
      await verifySession();


    if (
      !tenantSession
    ) {

      return false;
    }


    /*
     * IMPORTANT FIX:
     *
     * verifySession() confirms the tenant login.
     *
     * It must NOT leave the Executive controls authenticated.
     *
     * Therefore we immediately reset the Executive state.
     */

    state.authenticated =
      false;


    setAuthUI(
      false
    );


    setControlsEnabled(
      false
    );


    setGlobalStatus(
      true,
      "Executive key required"
    );


    /*
     * ================================================================
     * STEP 2 — CHECK EXISTING EXECUTIVE SESSION
     * ================================================================
     */

    const existingAdminSession =
      await verifyAdminSession();


    if (
      existingAdminSession
    ) {

      setControlsEnabled(
        true
      );


      setGlobalStatus(
        true,
        "Executive authenticated"
      );


      await refreshDashboardData();


      return true;
    }


    /*
     * ================================================================
     * STEP 3 — CHECK STORED EXECUTIVE KEY
     * ================================================================
     */

    if (
      state.adminKey
    ) {

      const verified =
        await verifyAdminKey();


      if (
        verified
      ) {

        setControlsEnabled(
          true
        );


        setGlobalStatus(
          true,
          "Executive authenticated"
        );


        await refreshDashboardData();


        return true;
      }


      /*
       * Invalid stored key:
       * remove it so the user can enter
       * a new one.
       */

      state.adminKey =
        "";


      try {

        localStorage.removeItem(
          ADMIN_STORAGE_KEY
        );

      } catch (_) {}


      const input =
        byId(
          "adminKeyInput"
        );


      if (
        input
      ) {

        input.value =
          "";

      }
    }


    /*
     * ================================================================
     * STEP 4 — WAIT FOR EXECUTIVE KEY
     * ================================================================
     */

    state.authenticated =
      false;


    setAuthUI(
      false
    );


    setControlsEnabled(
      false
    );


    setGlobalStatus(
      true,
      "Executive key required"
    );


    const keyStatus =
      byId(
        "keyStatus"
      );


    if (
      keyStatus
    ) {

      keyStatus.textContent =
        "Enter Executive admin key";
    }


    return true;
  }


  /* ========================================================================
   * GLOBAL COMPATIBILITY
   * ====================================================================== */

  window.engineAction =
    startScan;


  window.emergencyStop =
    emergencyStop;


  window.verifyAdminKey =
    verifyAdminKey;


  window.refreshAll =
    refreshDashboardData;


  window.logout =
    clearAdminKey;


  window.toggleOS =
    toggleOSModule;


  window.navigate =
    navigate;


  /* ========================================================================
   * FINAL GRIDV21 PUBLIC API
   * ====================================================================== */

  window.GRIDV21 = {

    ...(window.GRIDV21 || {}),

    VERSION,

    API,

    state,

    apiFetch,

    verifySession,

    verifyAdminSession,

    verifyAdminKey,

    saveAdminKey,

    clearAdminKey,

    loadDashboard,

    loadOSModules,

    loadPermits,

    refreshDashboardData,

    loadScanStatus,

    startScan,

    stopScan,

    pauseBrain,

    resumeBrain,

    emergencyStop,

    toggleOSModule,

    renderDashboard,

    renderTelemetry,

    renderRecommendation,

    renderTopLeads,

    renderLatestEvents,

    renderOSOverview,

    setControlsEnabled,

    navigate,

    openMobileSidebar,

    closeMobileSidebar,

    bindAllEvents,

    init

  };


  /* ========================================================================
   * START APPLICATION
   * ====================================================================== */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      () => {

        init()
          .catch(
            renderStartupError
          );

      },
      {
        once: true
      }
    );

  } else {

    init()
      .catch(
        renderStartupError
      );

  }


  /* ========================================================================
   * FINAL FILE CLOSURE
   * ====================================================================== */

})();

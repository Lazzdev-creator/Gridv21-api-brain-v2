/**

* GRIDV21 BRAIN ENTERPRISE v6.3.6
* Dashboard Controller
* 
* Location:
* public/dashboard/app.js
* 
* IMPORTANT:
* This is a standalone JavaScript file.
* Do NOT wrap this file in <script> tags.
  */

(() => {
"use strict";

const VERSION = "6.3.6";

const API = {
health: "/api/health",
verify: "/api/auth/verify",
dashboard: "/api/dashboard",
leads: "/api/leads",
permits: "/api/permits",
forecast: "/api/forecast",
osModules: "/api/os-modules",
auditLogs: "/api/audit-logs",
systemEvents: "/api/system-events",
affiliates: "/api/affiliates",
affiliateTracking: "/api/affiliate-tracking",
integrations: "/api/integrations",
scrapeNow: "/api/scrape-now",
scanStop: "/api/brain/scan-stop",
brainPause: "/api/brain/pause",
brainResume: "/api/brain/resume",
emergencyStop: "/api/brain/emergency-stop"
};

const OS_MODULES = [
{
id: 1,
name: "Executive Intelligence OS",
short: "Strategy",
icon: "◆"
},
{
id: 2,
name: "Revenue Intelligence OS",
short: "Revenue",
icon: "£"
},
{
id: 3,
name: "Sales & CRM OS",
short: "Sales",
icon: "◎"
},
{
id: 4,
name: "Marketing OS",
short: "Growth",
icon: "◇"
},
{
id: 5,
name: "Operations OS",
short: "Operations",
icon: "⚙"
},
{
id: 6,
name: "Finance OS",
short: "Finance",
icon: "₤"
},
{
id: 7,
name: "Human Capital OS",
short: "People",
icon: "♙"
},
{
id: 8,
name: "Project Management OS",
short: "Projects",
icon: "▣"
},
{
id: 9,
name: "Knowledge Intelligence OS",
short: "Knowledge",
icon: "⌘"
},
{
id: 10,
name: "Legal & Compliance OS",
short: "Compliance",
icon: "§"
},
{
id: 11,
name: "Supply Chain OS",
short: "Supply",
icon: "⇄"
},
{
id: 12,
name: "Acquisition Intelligence OS",
short: "Acquisition",
icon: "⌁"
},
{
id: 13,
name: "Customer Success OS",
short: "Customer Success",
icon: "✓"
},
{
id: 14,
name: "IT & Security OS",
short: "Security",
icon: "⌘"
},
{
id: 15,
name: "Analytics & BI OS",
short: "Analytics",
icon: "▥"
}
];

const state = {
adminKey: "",
authenticated: false,
dashboard: null,
health: null,
osModules: [],
leads: [],
permits: [],
forecast: null,
auditLogs: [],
systemEvents: [],
integrations: [],
currentSection: "dashboard",
refreshTimer: null,
requestInFlight: false
};

/* ============================================================
DOM HELPERS
============================================================ */

const $ = (selector, root = document) =>
root.querySelector(selector);

const $$ = (selector, root = document) =>
Array.from(root.querySelectorAll(selector));

const byId = id => document.getElementById(id);

function text(id, value) {
const element = byId(id);
if (element) element.textContent = value ?? "—";
}

function html(id, value) {
const element = byId(id);
if (element) element.innerHTML = value ?? "";
}

function escapeHTML(value) {
return String(value ?? "")
.replace(/&/g, "&")
.replace(/</g, "<")
.replace(/>/g, ">")
.replace(/"/g, """)
.replace(/'/g, "'");
}

function number(value) {
const n = Number(value);
return Number.isFinite(n)
? n.toLocaleString("en-GB")
: "0";
}

function money(value, currency = "USD") {
const n = Number(value);

if (!Number.isFinite(n)) {
  return "—";
}

try {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(n);
} catch {
  return `${currency} ${Math.round(n).toLocaleString("en-GB")}`;
}

}

function dateTime(value) {
if (!value) return "—";

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
  return String(value);
}

return date.toLocaleString("en-GB", {
  dateStyle: "short",
  timeStyle: "short"
});

}

function bool(value) {
if (value === true || value === "true" || value === 1) {
return "YES";
}

return "NO";

}

function safeArray(value) {
if (Array.isArray(value)) return value;

if (Array.isArray(value?.data)) {
  return value.data;
}

if (Array.isArray(value?.rows)) {
  return value.rows;
}

if (Array.isArray(value?.items)) {
  return value.items;
}

if (Array.isArray(value?.results)) {
  return value.results;
}

return [];

}

/* ============================================================
AUTHENTICATION
============================================================ */

function getQueryKey() {
try {
const params = new URLSearchParams(window.location.search);

  return (
    params.get("key") ||
    params.get("admin_key") ||
    params.get("adminKey") ||
    ""
  );
} catch {
  return "";
}

}

function loadAdminKey() {
const queryKey = getQueryKey();

if (queryKey) {
  state.adminKey = queryKey;

  try {
    sessionStorage.setItem(
      "gridv21_admin_key",
      queryKey
    );
  } catch {}

  return queryKey;
}

try {
  state.adminKey =
    sessionStorage.getItem("gridv21_admin_key") || "";
} catch {
  state.adminKey = "";
}

return state.adminKey;

}

function clearAdminKey() {
state.adminKey = "";
state.authenticated = false;

try {
  sessionStorage.removeItem("gridv21_admin_key");
} catch {}

setGlobalStatus(
  false,
  "Key cleared"
);

showToast(
  "Admin key cleared.",
  "info"
);

}

function authHeaders(extra = {}) {
const headers = {
Accept: "application/json",
...extra
};

if (state.adminKey) {
  headers["x-admin-key"] = state.adminKey;
  headers.Authorization = `Bearer ${state.adminKey}`;
}

return headers;

}

async function verifyAdminKey() {
if (!state.adminKey) {
state.authenticated = false;

  setGlobalStatus(
    false,
    "Authentication required"
  );

  return false;
}

try {
  const response = await fetch(API.verify, {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `Authentication failed (${response.status})`
    );
  }

  state.authenticated = true;

  setGlobalStatus(
    true,
    "Authenticated"
  );

  return true;
} catch (error) {
  state.authenticated = false;

  setGlobalStatus(
    false,
    "Authentication failed"
  );

  showToast(
    error.message || "Invalid admin key.",
    "error"
  );

  return false;
}

}

/* ============================================================
API
============================================================ */

async function apiFetch(
url,
options = {},
allowUnauthorized = false
) {
const config = {
method: "GET",
cache: "no-store",
...options
};

config.headers = authHeaders(
  config.headers || {}
);

const response = await fetch(
  url,
  config
);

const contentType =
  response.headers.get("content-type") || "";

let payload;

if (contentType.includes("application/json")) {
  payload = await response.json().catch(() => ({}));
} else {
  payload = await response.text().catch(() => "");
}

if (
  response.status === 401 &&
  !allowUnauthorized
) {
  state.authenticated = false;

  setGlobalStatus(
    false,
    "Authentication required"
  );

  throw new Error(
    "Authentication required."
  );
}

if (!response.ok) {
  const message =
    typeof payload === "object"
      ? payload.message ||
        payload.error ||
        payload.detail
      : payload;

  throw new Error(
    message ||
    `Request failed (${response.status})`
  );
}

return payload;

}

async function apiPost(
url,
body = {}
) {
return apiFetch(url, {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify(body)
});
}

/* ============================================================
STATUS
============================================================ */

function setGlobalStatus(online, label) {
const dot = byId("global-status-dot");
const status = byId("global-status");
const statusText = byId("global-status-text");

const sidebarDot =
  byId("sidebar-status-dot");

const sidebarText =
  byId("sidebar-status-text");

if (dot) {
  dot.classList.toggle(
    "online",
    Boolean(online)
  );

  dot.classList.toggle(
    "offline",
    !online
  );
}

if (sidebarDot) {
  sidebarDot.classList.toggle(
    "online",
    Boolean(online)
  );

  sidebarDot.classList.toggle(
    "offline",
    !online
  );
}

if (statusText) {
  statusText.textContent = label;
}

if (sidebarText) {
  sidebarText.textContent = label;
}

if (status) {
  status.classList.toggle(
    "badge-success",
    Boolean(online)
  );

  status.classList.toggle(
    "badge-muted",
    !online
  );
}

}

function setEngineBadge(running, scanning) {
const badge = byId("engine-badge");

if (!badge) return;

badge.classList.remove(
  "badge-success",
  "badge-warning",
  "badge-danger",
  "badge-muted"
);

if (scanning) {
  badge.textContent = "SCANNING";
  badge.classList.add("badge-warning");
  return;
}

if (running) {
  badge.textContent = "RUNNING";
  badge.classList.add("badge-success");
  return;
}

badge.textContent = "IDLE";
badge.classList.add("badge-muted");

}

/* ============================================================
TOAST
============================================================ */

let toastTimer = null;

function showToast(message, type = "info") {
const toast = byId("toast");

if (!toast) return;

toast.className =
  `toast toast-${type}`;

toast.textContent = message;

requestAnimationFrame(() => {
  toast.classList.add("show");
});

clearTimeout(toastTimer);

toastTimer = setTimeout(() => {
  toast.classList.remove("show");
}, 3500);

}

function setActionMessage(
message,
type = "info"
) {
const element =
byId("action-message");

if (!element) return;

element.textContent = message;

element.className =
  `inline-message ${type}`;

}

/* ============================================================
HEALTH
============================================================ */

async function loadHealth() {
try {
const payload = await apiFetch(
API.health,
{},
true
);

  state.health = payload;

  const health =
    payload?.health ||
    payload?.data ||
    payload;

  const healthy =
    health?.status === "ok" ||
    health?.status === "healthy" ||
    health?.ok === true;

  if (healthy) {
    setGlobalStatus(
      state.authenticated || !state.adminKey,
      state.authenticated
        ? "Authenticated"
        : "System Online"
    );
  }

  return payload;
} catch (error) {
  setGlobalStatus(
    false,
    "Offline"
  );

  return null;
}

}

/* ============================================================
DASHBOARD
============================================================ */

async function loadDashboard() {
const payload =
await apiFetch(API.dashboard);

state.dashboard =
  payload?.dashboard ||
  payload?.data ||
  payload;

renderDashboard(
  state.dashboard
);

return state.dashboard;

}

function extractEngine(data) {
return (
data?.engine ||
data?.ENGINE ||
data?.telemetry ||
{}
);
}

function renderDashboard(data) {
if (!data) return;

const engine =
  extractEngine(data);

const running =
  Boolean(
    engine.running ??
    data.running
  );

const scanning =
  Boolean(
    engine.scanning ??
    data.scanning
  );

const permitsFound =
  engine.permitsFound ??
  data.permitsFound ??
  data.permits_found ??
  data.metrics?.permits ??
  0;

const errors =
  engine.errors ??
  data.errors ??
  0;

const leads =
  data.leadsCount ??
  data.leads_count ??
  data.metrics?.leads ??
  safeArray(data.leads).length ??
  0;

const revenue =
  data.revenue ??
  data.metrics?.revenue ??
  data.revenueTotal ??
  0;

text(
  "metric-engine",
  scanning
    ? "SCANNING"
    : running
      ? "RUNNING"
      : "IDLE"
);

text(
  "metric-engine-sub",
  scanning
    ? "Acquisition engine active"
    : "Engine ready"
);

text(
  "metric-leads",
  number(leads)
);

text(
  "metric-revenue",
  typeof revenue === "number"
    ? money(revenue)
    : String(revenue || "—")
);

text(
  "telemetry-running",
  bool(running)
);

text(
  "telemetry-scanning",
  bool(scanning)
);

text(
  "telemetry-permits",
  number(permitsFound)
);

text(
  "telemetry-errors",
  number(errors)
);

text(
  "telemetry-last-scan",
  dateTime(
    engine.lastScan ??
    data.lastScan
  )
);

text(
  "telemetry-duration",
  formatDuration(
    engine.lastScanDuration ??
    data.lastScanDuration
  )
);

text(
  "telemetry-uptime",
  formatUptime(
    engine.uptime ??
    data.uptime
  )
);

text(
  "telemetry-emergency",
  bool(
    engine.emergencyStop ??
    data.emergencyStop
  )
);

setEngineBadge(
  running,
  scanning
);

const activeOS =
  data.activeOS ??
  data.activeOs ??
  data.osActive ??
  safeArray(
    data.osModules
  ).filter(
    item => item.enabled !== false
  ).length;

text(
  "metric-os",
  number(
    activeOS ||
    state.osModules.filter(
      item => item.enabled !== false
    ).length
  )
);

renderRecommendation(
  data.recommendation ||
  data.aiRecommendation ||
  data.brainRecommendation
);

renderTopLeads(
  safeArray(data.topLeads)
    .concat(
      safeArray(data.leads)
    )
    .slice(0, 8)
);

renderActivity(
  safeArray(data.activity)
    .concat(
      safeArray(data.events)
    )
    .slice(0, 12)
);

}

/* ============================================================
OS MODULES
============================================================ */

async function loadOSModules() {
try {
const payload =
await apiFetch(
API.osModules
);

  const modules =
    safeArray(payload);

  state.osModules =
    modules.length
      ? mergeCanonicalModules(modules)
      : OS_MODULES.map(
          item => ({
            ...item,
            enabled: true
          })
        );

} catch {
  state.osModules =
    OS_MODULES.map(
      item => ({
        ...item,
        enabled: true
      })
    );
}

renderOSModules();
return state.osModules;

}

function mergeCanonicalModules(
modules
) {
return OS_MODULES.map(
canonical => {
const found =
modules.find(
item =>
Number(item.id) ===
canonical.id
) ||
modules.find(
item =>
String(item.name)
.toLowerCase() ===
canonical.name.toLowerCase()
);

    return {
      ...canonical,
      ...(found || {}),
      enabled:
        found?.enabled ??
        found?.active ??
        true
    };
  }
);

}

function renderOSModules() {
const container =
byId("os-overview-grid");

if (!container) return;

container.innerHTML =
  state.osModules
    .map(module => {
      const enabled =
        module.enabled !== false;

      return `
        <article
          class="os-card ${enabled ? "enabled" : "disabled"}"
          data-os-id="${escapeHTML(module.id)}"
        >

          <div class="os-card-top">

            <div class="os-icon">
              ${escapeHTML(module.icon || "◆")}
            </div>

            <button
              class="os-toggle ${enabled ? "on" : "off"}"
              data-os-toggle="${escapeHTML(module.id)}"
              type="button"
              aria-label="Toggle ${escapeHTML(module.name)}"
              aria-pressed="${enabled}"
            >
              <span></span>
            </button>

          </div>

          <h3>
            ${escapeHTML(module.name)}
          </h3>

          <p>
            ${escapeHTML(module.short || "Intelligence module")}
          </p>

          <span class="status-label">
            ${enabled ? "ACTIVE" : "DISABLED"}
          </span>

        </article>
      `;
    })
    .join("");

}

async function toggleOS(id) {
const module =
state.osModules.find(
item => Number(item.id) === Number(id)
);

if (!module) return;

const desired =
  module.enabled === false;

try {
  setActionMessage(
    `Updating ${module.name}…`
  );

  const payload =
    await apiPost(
      `/api/os-toggle/${encodeURIComponent(id)}`,
      {
        enabled: desired,
        active: desired
      }
    );

  module.enabled =
    payload?.enabled ??
    payload?.active ??
    desired;

  renderOSModules();

  showToast(
    `${module.name}: ${
      module.enabled
        ? "enabled"
        : "disabled"
    }`,
    "success"
  );

  setActionMessage(
    `${module.name} updated.`,
    "success"
  );

} catch (error) {
  showToast(
    error.message,
    "error"
  );

  setActionMessage(
    error.message,
    "error"
  );
}

}

/* ============================================================
LEADS
============================================================ */

async function loadLeads() {
try {
const payload =
await apiFetch(API.leads);

  state.leads =
    safeArray(payload);

  renderLeads(
    state.leads
  );

  return state.leads;

} catch (error) {
  renderLeads([]);
  throw error;
}

}

function renderLeads(leads) {
const body =
byId("leads-body");

if (!body) return;

if (!leads.length) {
  body.innerHTML = `
    <tr>
      <td colspan="5" class="empty">
        No leads available.
      </td>
    </tr>
  `;

  return;
}

body.innerHTML =
  leads
    .slice(0, 100)
    .map(lead => `
      <tr>
        <td>
          ${escapeHTML(
            lead.trade ||
            lead.type ||
            lead.category ||
            "—"
          )}
        </td>

        <td>
          ${escapeHTML(
            lead.region ||
            lead.city ||
            lead.location ||
            "—"
          )}
        </td>

        <td>
          ${formatLeadValue(
            lead.value ??
            lead.estimatedValue ??
            lead.estimated_value
          )}
        </td>

        <td>
          <span class="status-pill">
            ${escapeHTML(
              lead.status ||
              "NEW"
            )}
          </span>
        </td>

        <td>
          ${escapeHTML(
            dateTime(
              lead.created_at ||
              lead.createdAt
            )
          )}
        </td>
      </tr>
    `)
    .join("");

}

function renderTopLeads(leads) {
const body =
byId("top-leads-body");

if (!body) return;

if (!leads.length) {
  body.innerHTML = `
    <tr>
      <td colspan="4" class="empty">
        No lead intelligence available.
      </td>
    </tr>
  `;

  return;
}

body.innerHTML =
  leads
    .slice(0, 8)
    .map(lead => `
      <tr>

        <td>
          ${escapeHTML(
            lead.city ||
            lead.region ||
            lead.location ||
            "—"
          )}
        </td>

        <td>
          ${escapeHTML(
            lead.trade ||
            lead.type ||
            lead.category ||
            "—"
          )}
        </td>

        <td>
          <strong>
            ${escapeHTML(
              lead.score ??
              lead.aiScore ??
              lead.ai_score ??
              "—"
            )}
          </strong>
        </td>

        <td>
          ${formatLeadValue(
            lead.value ??
            lead.estimatedValue ??
            lead.estimated_value
          )}
        </td>

      </tr>
    `)
    .join("");

}

function formatLeadValue(value) {
if (
value === undefined ||
value === null ||
value === ""
) {
return "—";
}

if (typeof value === "number") {
  return money(value);
}

return escapeHTML(value);

}

/* ============================================================
PERMITS
============================================================ */

async function loadPermits() {
try {
const payload =
await apiFetch(API.permits);

  state.permits =
    safeArray(payload);

  renderPermits(
    state.permits
  );

  return state.permits;

} catch (error) {
  renderPermits([]);
  throw error;
}

}

function renderPermits(permits) {
const body =
byId("permits-body");

if (!body) return;

if (!permits.length) {
  body.innerHTML = `
    <tr>
      <td colspan="5" class="empty">
        No permits available.
      </td>
    </tr>
  `;

  return;
}

body.innerHTML =
  permits
    .slice(0, 100)
    .map(permit => `
      <tr>

        <td>
          ${escapeHTML(
            permit.city ||
            permit.location ||
            "—"
          )}
        </td>

        <td>
          ${escapeHTML(
            permit.permit_type ||
            permit.permitType ||
            permit.type ||
            permit.description ||
            "—"
          )}
        </td>

        <td>
          <span class="status-pill">
            ${escapeHTML(
              permit.status ||
              "FOUND"
            )}
          </span>
        </td>

        <td>
          ${escapeHTML(
            permit.ai_score ??
            permit.aiScore ??
            

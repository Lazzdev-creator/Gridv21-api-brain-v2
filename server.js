/*****************************************************************************/
/* GRIDV21 BRAIN ENTERPRISE v6.3.6                                           */
/* OWNER: LAZARUS TAKUDZWA CHENANA                                           */
/* Production backend: scanner + detailed permits + acquisitions + activity */
/*****************************************************************************/

import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
import axios from "axios";
import cron from "node-cron";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import Papa from "papaparse";
import crypto from "crypto";
import { createClient as createRedisClient } from "redis";
import { RedisStore } from "connect-redis";

import fs from 'fs';

dotenv.config();
const ADMIN_KEY = process.env.ADMIN_KEY;

/* -------------------------------------------------------------------------- */
/* SECURE API KEY VALIDATION                                                  */
/* -------------------------------------------------------------------------- */

function safeCompare(a, b) {
  const strA = String(a ?? "");
  const strB = String(b ?? "");

  const bufA = Buffer.from(strA);
  const bufB = Buffer.from(strB);

  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(
      Buffer.alloc(bufA.length || 1),
      Buffer.alloc(bufA.length || 1)
    );
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

function getAdminKey(req) {
  return (
    req.get("x-admin-key") ||
    req.headers["x-admin-key"] ||
    req.query.key ||
    ""
  ).trim();
}

function requireAdmin(req, res, next) {
  const supplied = getAdminKey(req);
  const expected = process.env.ADMIN_KEY || ADMIN_KEY || "";

  if (!expected) {
    console.error("[SECURITY] ADMIN_KEY is not set in environment");
    return res.status(500).json({
      ok: false,
      error: "Server misconfiguration"
    });
  }

  if (!supplied || !safeCompare(supplied, expected)) {
    console.warn(
      `[SECURITY] Invalid admin key attempt from ${req.ip} on ${req.method} ${req.originalUrl}`
    );

    return res.status(401).json({
      ok: false,
      authenticated: false,
      error: "Authentication required"
    });
  }

  req.isAdmin = true;
  next();
}

const requireAuth = requireAdmin;
const requireAdminKey = requireAdmin;
const requireBrainAccess = requireAdmin;

// Define __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Auto-detect dashboard folder
const possibleDashboardPaths = [
  path.join(__dirname, "dashboard"),
  path.join(__dirname, "Dashboard"),
  path.join(__dirname, "public"),
  __dirname
];

const DASHBOARD_DIR =
  possibleDashboardPaths.find(p => fs.existsSync(p)) || __dirname;

const PUBLIC_DIR = path.join(__dirname, "public");
const app = express();
export const VERSION = "6.3.6";
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/* -------------------------------------------------------------------------- */
/* GRIDV21 BRAIN — CANONICAL 12 INTELLIGENCE OS MODULES                      */
/* -------------------------------------------------------------------------- */

export const OS_MODULES = [
  {
    id: 1,
    name: "Executive Intelligence OS",
    layer: "Strategy",
    kpis_count: 12,
    agents_count: 3
  },
  {
    id: 2,
    name: "Revenue Intelligence OS",
    layer: "Revenue",
    kpis_count: 12,
    agents_count: 3
  },
  {
    id: 3,
    name: "Sales & CRM OS",
    layer: "Sales",
    kpis_count: 12,
    agents_count: 4
  },
  {
    id: 4,
    name: "Marketing OS",
    layer: "Growth",
    kpis_count: 12,
    agents_count: 4
  },
  {
    id: 5,
    name: "Operations OS",
    layer: "Operations",
    kpis_count: 12,
    agents_count: 4
  },
  {
    id: 6,
    name: "Finance OS",
    layer: "Finance",
    kpis_count: 12,
    agents_count: 3
  },
  {
    id: 7,
    name: "Human Capital OS",
    layer: "People",
    kpis_count: 12,
    agents_count: 3
  },
  {
    id: 8,
    name: "Project Management OS",
    layer: "Projects",
    kpis_count: 12,
    agents_count: 4
  },
  {
    id: 9,
    name: "Knowledge OS",
    layer: "Knowledge",
    kpis_count: 12,
    agents_count: 3
  },
  {
    id: 10,
    name: "Legal & Compliance OS",
    layer: "Compliance",
    kpis_count: 12,
    agents_count: 3
  },
  {
    id: 11,
    name: "Supply Chain OS",
    layer: "Supply",
    kpis_count: 12,
    agents_count: 3
  },
  {
    id: 12,
    name: "Acquisition Intelligence OS",
    layer: "Acquisition",
    kpis_count: 12,
    agents_count: 4
  }
];

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "ADMIN_KEY",
  "FRONTEND_URL"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`FATAL: ${key} missing from ENV`);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

let redisClient = null;
let sessionStore;

if (process.env.REDIS_URL) {
  try {
    redisClient = createRedisClient({ url: process.env.REDIS_URL });
    redisClient.on("error", error => console.warn(`[REDIS] ${error.message}`));
    await redisClient.connect();
    sessionStore = new RedisStore({ client: redisClient });
    console.log("[REDIS] Redis session store enabled");
  } catch (error) {
    console.warn(
      `[REDIS] Redis unavailable. Using memory sessions: ${error.message}`
    );
    redisClient = null;
    sessionStore = undefined;
  }
}

export const ENGINE = {
  running: true,
  scanning: false,
  lastScan: null,
  lastScanDuration: 0,
  permitsFound: 0,
  errors: 0,
  uptime: Date.now(),
  lastError: null,
  emergencyStopped: false
};

export const SCAN_SETTINGS = {
  batchSize: 100,
  requestDelay: 750,
  requestTimeout: 15000,
  scanTimeout: 600000,
  cron: "*/30 * * * *",
  concurrency: 3
};

/* -------------------------------------------------------------------------- */
/* SOURCES                                                                    */
/* -------------------------------------------------------------------------- */

export const CITIES = [
  {
    name: "Austin",
    url: "https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=1000",
    type: "json"
  },
  {
    name: "Chicago",
    url: "https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=1000&$order=issue_date%20DESC",
    type: "json"
  },
  {
    name: "Denver",
    url: "https://www.denvergov.org/media/gis/DataCatalog/building_permits/csv/building_permits.csv",
    type: "csv"
  }
];

/* -------------------------------------------------------------------------- */
/* LOGGING                                                                    */
/* -------------------------------------------------------------------------- */

const logger = {
  info(id, msg) {
    console.log(`[INFO ${id} ${new Date().toISOString()}] ${msg}`);
  },

  warn(id, msg) {
    console.warn(`[WARN ${id} ${new Date().toISOString()}] ${msg}`);
  },

  async error(id, msg) {
    console.error(`[ERROR ${id} ${new Date().toISOString()}] ${msg}`);

    try {
      await supabase.from("audit_logs").insert({
        level: "error",
        message: String(msg).slice(0, 5000),
        request_id: id,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}
  }
};

morgan.token("id", req => req.id || "no-id");

/* -------------------------------------------------------------------------- */
/* MIDDLEWARE                                                                 */
/* -------------------------------------------------------------------------- */

app.set("trust proxy", 1);

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  next();
});

/* -------------------------------------------------------------------------- */
/* SECURITY HEADERS                                                           */
/* -------------------------------------------------------------------------- */

app.use(
  helmet({
    // Content Security Policy – adjust if you load external scripts/fonts/images
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // needed for inline dashboard scripts
        styleSrc: ["'self'", "'unsafe-inline'"],  // needed for inline styles
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.FRONTEND_URL || "'self'"].filter(Boolean),
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },

    // Prevent clickjacking
    frameguard: { action: "deny" },

    // Stop MIME-type sniffing
    noSniff: true,

    // XSS filter (legacy browsers)
    xssFilter: true,

    // Referrer policy
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },

    // HSTS – only enable when you are fully on HTTPS
    hsts: IS_PRODUCTION
      ? {
          maxAge: 31536000,        // 1 year
          includeSubDomains: true,
          preload: true
        }
      : false,

    // Hide Express fingerprint
    hidePoweredBy: true,

    // Cross-Origin policies
    crossOriginEmbedderPolicy: false, // keep false unless you fully control all assets
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" }
  })
);

// Extra explicit headers (belt-and-suspenders)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0"); // modern browsers ignore this; CSP is better
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
});
app.use(compression());
app.use(morgan(":id :method :url :status :response-time ms"));
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// ===================================================
// STATIC FRONTEND (Cleaned & Fixed)
// ===================================================
// Serve static frontend files
app.use('/dashboard', express.static(DASHBOARD_DIR));
app.use(express.static(DASHBOARD_DIR));

// Direct user to dashboard index.html
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, 'index.html'));
});

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});
// ===================================================
// END STATIC FRONTEND
// ===================================================

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          `${process.env.FRONTEND_URL}/auth/google/callback`
      },

      async (accessToken, refreshToken, profile, done) => {
        done(null, {
          id: profile.id,
          displayName: profile.displayName,
          email: profile.emails?.[0]?.value || null
        });
      }
    )
  );
}

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function pick(obj, keys) {
  for (const key of keys) {
    if (
      obj?.[key] !== undefined &&
      obj?.[key] !== null &&
      String(obj[key]).trim() !== ""
    ) {
      return obj[key];
    }
  }

  return null;
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(
    String(value)
      .replace(/[$,]/g, "")
      .replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(n) ? n : null;
}

function dateValue(value) {
  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;

  const result = String(value).trim();

  return result || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

function safeJson(value) {
  try {
    return value == null
      ? {}
      : JSON.parse(JSON.stringify(value));
  } catch (_) {
    return {};
  }
}

function scoreLead(permit) {
  let score = 50;

  const type = String(
    permit.permit_type || ""
  ).toLowerCase();

  const work = String(
    permit.work_type || ""
  ).toLowerCase();

  const description = String(
    permit.work_description || ""
  ).toLowerCase();

  const value = Number(
    permit.estimated_value || 0
  );

  const text = `${type} ${work} ${description}`;

  if (text.includes("commercial")) score += 25;

  if (
    text.includes("building") ||
    text.includes("construction")
  ) {
    score += 10;
  }

  if (
    text.includes("remodel") ||
    text.includes("renovation") ||
    text.includes("alteration")
  ) {
    score += 8;
  }

  if (
    text.includes("restaurant") ||
    text.includes("retail") ||
    text.includes("office")
  ) {
    score += 5;
  }

  if (value >= 1000000) {
    score += 20;
  } else if (value >= 500000) {
    score += 15;
  } else if (value >= 100000) {
    score += 10;
  }

  return Math.min(100, score);
}

function addressFromRaw(city, raw) {
  if (city === "Chicago") {
    const number = pick(raw, ["street_number"]);
    const direction = pick(raw, ["street_direction"]);
    const street = pick(raw, ["street_name"]);
    const type = pick(raw, ["street_type"]);
    const zip = pick(raw, [
      "zip_code",
      "zipcode",
      "zip"
    ]);

    const base = [
      number,
      direction,
      street,
      type
    ]
      .filter(Boolean)
      .join(" ");

    return [
      base,
      zip
    ]
      .filter(Boolean)
      .join(", ") || null;
  }

  if (city === "Austin") {
    return [
      pick(raw, [
        "original_address1",
        "address",
        "street_number"
      ]),
      pick(raw, [
        "original_address2",
        "street_name"
      ]),
      pick(raw, [
        "zip",
        "zipcode",
        "zip_code"
      ])
    ]
      .filter(Boolean)
      .join(" ") || null;
  }

  return normalizeText(
    pick(raw, [
      "address",
      "site_address",
      "address_line1",
      "property_address",
      "address_line_1",
      "street_address"
    ])
  );
}

function mapPermitData(cityName, raw) {
  const permitId = normalizeText(
    pick(raw, [
      /* Chicago's current API identifier is permit_ */
      "permit_",
      "permit_id",
      "permit_num",
      "permit_number",
      "permitnum",
      "id",
      "permit",
      "record_id"
    ])
  );

  const permitType = normalizeText(
    pick(raw, [
      "permit_type_definition",
      "permit_type_desc",
      "permit_type",
      "permit_type_name",
      "type",
      "work_type"
    ])
  );

  const status = normalizeText(
    pick(raw, [
      "permit_status",
      "status_current",
      "status",
      "current_status"
    ])
  );

  const issuedDate = dateValue(
    pick(raw, [
      "issue_date",
      "issued_date",
      "Issue Date",
      "issued",
      "application_date"
    ])
  );

  const applicationDate = dateValue(
    pick(raw, [
      "application_start_date",
      "application_date",
      "application_date_start"
    ])
  );

  const valuation = numberValue(
    pick(raw, [
      /* Chicago renamed ESTIMATED_COST to REPORTED_COST */
      "reported_cost",
      "estimated_value",
      "estimated_cost",
      "total_job_valuation",
      "valuation",
      "job_value",
      "declared_valuation"
    ])
  );

  const address = addressFromRaw(
    cityName,
    raw
  );

  const workDescription = normalizeText(
    pick(raw, [
      "work_description",
      "description",
      "work_desc",
      "project_description"
    ])
  );

  const workType = normalizeText(
    pick(raw, [
      "work_type",
      "construction_type",
      "job_type"
    ])
  );

  const reviewType = normalizeText(
    pick(raw, ["review_type"])
  );

  const milestone = normalizeText(
    pick(raw, ["permit_milestone"])
  );

  const condition = normalizeText(
    pick(raw, ["permit_condition"])
  );

  const contractorName = normalizeText(
    pick(raw, [
      "contractor_name",
      "contact_1_name",
      "contact_2_name"
    ])
  );

  const applicantName = normalizeText(
    pick(raw, [
      "applicant_name",
      "applicant"
    ])
  );

  const ownerName = normalizeText(
    pick(raw, [
      "owner_name",
      "owner"
    ])
  );

  const contractorLicense = normalizeText(
    pick(raw, [
      "contractor_license",
      "contact_1_license",
      "license_number"
    ])
  );

  const latitude = numberValue(
    pick(raw, [
      "latitude",
      "lat"
    ])
  );

  const longitude = numberValue(
    pick(raw, [
      "longitude",
      "lon",
      "lng"
    ])
  );

  const processingTime = numberValue(
    pick(raw, [
      "processing_time"
    ])
  );

  const streetNumber = normalizeText(
    pick(raw, [
      "street_number"
    ])
  );

  const streetDirection = normalizeText(
    pick(raw, [
      "street_direction"
    ])
  );

  const streetName = normalizeText(
    pick(raw, [
      "street_name"
    ])
  );

  const postalCode = normalizeText(
    pick(raw, [
      "zip_code",
      "zipcode",
      "zip",
      "postal_code"
    ])
  );

  const stableSource = JSON.stringify({
    cityName,
    permitId,
    permitType,
    status,
    issuedDate,
    applicationDate,
    valuation,
    address,
    workDescription
  });

  const generatedId = `${cityName.toLowerCase()}-${crypto
    .createHash("sha1")
    .update(stableSource)
    .digest("hex")
    .slice(0, 20)}`;

  const base = {
    city: cityName,
    permit_type: permitType,
    status,
    issued_date: issuedDate,
    application_start_date: applicationDate,
    permit_id: permitId || generatedId,
    ai_confidence: 0,
    ai_enriched: false,
    estimated_value: valuation,
    ai_score: 0,
    address,
    permit_milestone: milestone,
    review_type: reviewType,
    processing_time: processingTime,
    work_type: workType,
    work_description: workDescription,
    permit_condition: condition,
    contractor_name: contractorName,
    contractor_license: contractorLicense,
    applicant_name: applicantName,
    owner_name: ownerName,
    street_number: streetNumber,
    street_direction: streetDirection,
    street_name: streetName,
    postal_code: postalCode,
    latitude,
    longitude,
    source_url:
      CITIES.find(c => c.name === cityName)?.url || null,
    raw_data: safeJson(raw)
  };

  /* Do not invent a project value. The UI will show "Not reported" if source data is null. */
  const score = scoreLead({
    ...base,
    estimated_value: valuation || 0
  });

  return {
    ...base,
    ai_score: score,
    ai_confidence: Number(
      (
        0.70 +
        Math.min(score, 100) / 333
      ).toFixed(2)
    ),
    ai_enriched: true
  };
}
export const AI_ENGINE = {
  async enrichPermit(permit) {
    const score = scoreLead(permit);

    return {
      ...permit,
      ai_enriched: true,
      ai_confidence: Number(
        (
          0.70 +
          Math.min(score, 100) / 333
        ).toFixed(2)
      ),
      ai_score: score,
      ai_note: "GRIDV21 heuristic AI engine"
    };
  },

  scoreLead,

  predictRevenue(permit) {
    const value = Number(
      permit.estimated_value || 0
    );

    return Number(
      (value * 0.03).toFixed(2)
    );
  }
};

/* -------------------------------------------------------------------------- */
/* OS DATABASE SYNCHRONIZATION                                                */
/* -------------------------------------------------------------------------- */

async function syncOSModules() {
  try {
    const payload = OS_MODULES.map(module => ({
      id: module.id,
      name: module.name,
      status: "active",
      kpis_count: module.kpis_count,
      agents_count: module.agents_count,
      layer: module.layer,
      enabled: true
    }));

    const { error } = await supabase
      .from("os_modules")
      .upsert(payload, {
        onConflict: "id"
      });

    if (error) throw error;

    const {
      error: cleanupError
    } = await supabase
      .from("os_modules")
      .delete()
      .gt("id", 12);

    if (cleanupError) {
      throw cleanupError;
    }

    console.log(
      `[OS] GRIDV21 synchronized ${OS_MODULES.length} canonical modules`
    );
  } catch (error) {
    console.warn(
      `[OS] Module synchronization skipped: ${error.message}`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* ACTIVITY LOGGING                                                           */
/* -------------------------------------------------------------------------- */

async function logActivity({
  eventType = "system",
  action = "activity",
  message = "",
  status = "success",
  permitId = null,
  city = null,
  metadata = {}
} = {}) {
  try {
    const { error } = await supabase
      .from("os_activity_logs")
      .insert({
        event_type: eventType,
        action,
        message: String(message).slice(0, 5000),
        status,
        permit_id: permitId,
        city,
        metadata: safeJson(metadata)
      });

    if (error) {
      if (
        !/relation .*os_activity_logs.* does not exist/i.test(
          error.message || ""
        )
      ) {
        console.warn(
          `[ACTIVITY] ${error.message}`
        );
      }

      return false;
    }

    return true;
  } catch (error) {
    console.warn(
      `[ACTIVITY] ${error.message}`
    );

    return false;
  }
}

async function getActivity(limit = 100) {
  const primary = await supabase
    .from("os_activity_logs")
    .select("*")
    .order("created_at", {
      ascending: false
    })
    .limit(limit);

  if (!primary.error) {
    return primary.data || [];
  }

  /* Graceful fallback while migration is being applied. */
  const fallback = await supabase
    .from("audit_logs")
    .select("*")
    .order("timestamp", {
      ascending: false
    })
    .limit(limit);

  if (fallback.error) {
    return [];
  }

  return (fallback.data || []).map(row => ({
    id: row.id,
    event_type: "audit",
    action: "error",
    message: row.message,
    status: row.level || "error",
    created_at: row.timestamp,
    metadata: {
      request_id: row.request_id
    }
  }));
}

/* -------------------------------------------------------------------------- */
/* FETCH + SCANNER                                                            */
/* -------------------------------------------------------------------------- */

async function axiosWithAbort(
  url,
  reqId,
  signal,
  retries = 3
) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= retries;
    attempt++
  ) {
    try {
      const response = await axios.get(
        url,
        {
          signal,
          timeout:
            SCAN_SETTINGS.requestTimeout,
          responseType: "text",
          headers: {
            "User-Agent":
              `GRIDV21-BRAIN/${VERSION}`,
            Accept:
              "application/json,text/csv,*/*"
          },
          validateStatus:
            status =>
              status >= 200 &&
              status < 300
        }
      );

      logger.info(
        reqId,
        `Fetched ${url} (${response.status})`
      );

      return response.data;
    } catch (error) {
      lastError = error;

      if (signal?.aborted) {
        throw new Error("Scan aborted");
      }

      logger.warn(
        reqId,
        `Fetch attempt ${attempt}/${retries} failed: ${error.message}`
      );

      if (attempt < retries) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError;
}

async function supabaseBatchInsert(
  table,
  rows
) {
  if (!rows.length) {
    return {
      inserted: 0,
      errors: 0
    };
  }

  let inserted = 0;

  for (
    let i = 0;
    i < rows.length;
    i += SCAN_SETTINGS.batchSize
  ) {
    const batch = rows.slice(
      i,
      i + SCAN_SETTINGS.batchSize
    );

    const { error } = await supabase
      .from(table)
      .insert(batch);

    if (error) {
      throw error;
    }

    inserted += batch.length;
  }

  return {
    inserted,
    errors: 0
  };
}

async function insertNewPermits(rows) {
  if (!rows.length) {
    return {
      inserted: 0,
      skipped: 0,
      updated: 0
    };
  }

  /* Keep one record per source permit and refresh existing rows with the
     newly-normalized detailed fields. This fixes old rows that were saved
     with generic defaults such as $25,000 or missing dates. */

  const unique = [];
  const seen = new Set();

  for (const row of rows) {
    if (
      !row.permit_id ||
      seen.has(row.permit_id)
    ) {
      continue;
    }

    seen.add(row.permit_id);
    unique.push(row);
  }

  if (!unique.length) {
    return {
      inserted: 0,
      skipped: rows.length,
      updated: 0
    };
  }

  let affected = 0;

  for (
    let i = 0;
    i < unique.length;
    i += SCAN_SETTINGS.batchSize
  ) {
    const batch = unique.slice(
      i,
      i + SCAN_SETTINGS.batchSize
    );

    const { error } = await supabase
      .from("permits")
      .upsert(
        batch,
        {
          onConflict: "permit_id"
        }
      );

    if (error) {
      throw error;
    }

    affected += batch.length;
  }

  return {
    inserted: affected,
    skipped:
      rows.length - unique.length,
    updated: affected
  };
}

async function writeScanLog(payload) {
  try {
    const { error } = await supabase
      .from("scan_logs")
      .insert(payload);

    if (
      error &&
      !/relation .*scan_logs.* does not exist/i.test(
        error.message || ""
      )
    ) {
      logger.warn(
        "scan-log",
        error.message
      );
    }
  } catch (error) {
    logger.warn(
      "scan-log",
      error.message
    );
  }
}

async function scanCity(
  city,
  reqId,
  signal
) {
  const rawText = await axiosWithAbort(
    city.url,
    reqId,
    signal
  );

  let records;

  if (city.type === "csv") {
    const parsed = Papa.parse(
      rawText,
      {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false
      }
    );

    if (parsed.errors?.length) {
      logger.warn(
        reqId,
        `${city.name}: ${parsed.errors.length} CSV parse warnings`
      );
    }

    records = parsed.data || [];
  } else {
    try {
      records =
        typeof rawText === "string"
          ? JSON.parse(rawText)
          : rawText;
    } catch (error) {
      throw new Error(
        `${city.name}: invalid JSON response: ${error.message}`
      );
    }
  }

  if (!Array.isArray(records)) {
    records = records?.data || [];
  }

  return {
    city: city.name,
    fetched: records.length,
    mapped: records
      .map(row =>
        mapPermitData(
          city.name,
          row
        )
      )
      .filter(Boolean)
  };
}

let currentScanAbortController = null;
let scanPromise = null;

export async function scanAllCities(
  reqId = crypto.randomUUID()
) {
  if (ENGINE.scanning) {
    return {
      ok: false,
      status: "already_scanning",
      message:
        "A scan is already running."
    };
  }

  if (!ENGINE.running) {
    return {
      ok: false,
      status: "paused",
      message: "Brain is paused."
    };
  }

  if (ENGINE.emergencyStopped) {
    return {
      ok: false,
      status: "emergency_stopped",
      message:
        "Emergency stop is active."
    };
  }

  ENGINE.scanning = true;
  ENGINE.lastError = null;
  ENGINE.permitsFound = 0;
  ENGINE.errors = 0;

  const started = Date.now();

  const result = {
    ok: true,
    status: "completed",
    started_at:
      new Date().toISOString(),
    finished_at: null,
    duration_ms: 0,
    cities: [],
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: 0
  };

  currentScanAbortController =
    new AbortController();

  const timeout = setTimeout(
    () =>
      currentScanAbortController?.abort(),
    SCAN_SETTINGS.scanTimeout
  );

  await logActivity({
    eventType: "scanner",
    action: "scan_started",
    message:
      `Permit scan started (${CITIES.length} sources)`
  });

  try {
    for (const city of CITIES) {
      if (
        !ENGINE.running ||
        ENGINE.emergencyStopped ||
        currentScanAbortController
          .signal.aborted
      ) {
        result.status = "aborted";
        break;
      }

      try {
        const cityResult =
          await scanCity(
            city,
            reqId,
            currentScanAbortController.signal
          );

        const saved =
          await insertNewPermits(
            cityResult.mapped
          );

        result.fetched +=
          cityResult.fetched;

        result.inserted +=
          saved.inserted;

        result.skipped +=
          saved.skipped;

        ENGINE.permitsFound +=
          saved.inserted;

        result.cities.push({
          name: city.name,
          fetched:
            cityResult.fetched,
          inserted:
            saved.inserted,
          skipped:
            saved.skipped
        });

        await logActivity({
          eventType: "scanner",
          action:
            "city_scan_completed",
          message:
            `${city.name}: ${cityResult.fetched} fetched, ${saved.inserted} new permits`,
          city: city.name,
          metadata: {
            fetched:
              cityResult.fetched,
            inserted:
              saved.inserted,
            skipped:
              saved.skipped
          }
        });

        await sleep(
          SCAN_SETTINGS.requestDelay
        );
      } catch (error) {
        result.errors++;
        ENGINE.errors++;
        ENGINE.lastError =
          `${city.name}: ${error.message}`;

        result.cities.push({
          name: city.name,
          fetched: 0,
          inserted: 0,
          skipped: 0,
          error: error.message
        });

        await logger.error(
          reqId,
          `${city.name}: ${error.message}`
        );

        await logActivity({
          eventType: "scanner",
          action:
            "city_scan_failed",
          message:
            `${city.name}: ${error.message}`,
          status: "error",
          city: city.name
        });
      }
    }

    result.finished_at =
      new Date().toISOString();

    result.duration_ms =
      Date.now() - started;

    ENGINE.lastScan =
      result.finished_at;

    ENGINE.lastScanDuration =
      result.duration_ms;

    await writeScanLog({
      request_id: reqId,
      status: result.status,
      started_at:
        result.started_at,
      finished_at:
        result.finished_at,
      duration_ms:
        result.duration_ms,
      fetched:
        result.fetched,
      inserted:
        result.inserted,
      skipped:
        result.skipped,
      permits_found:
        result.inserted,
      errors:
        result.errors
    });

    await logActivity({
      eventType: "scanner",
      action: "scan_completed",
      message:
        `Scan ${result.status}: ${result.inserted} new permits from ${result.fetched} records`,
      status:
        result.errors
          ? "warning"
          : "success",
      metadata: result
    });

    return result;
  } catch (error) {
    ENGINE.errors++;
    ENGINE.lastError =
      error.message;

    result.ok = false;
    result.status = "failed";
    result.errors++;
    result.finished_at =
      new Date().toISOString();
    result.duration_ms =
      Date.now() - started;

    await logger.error(
      reqId,
      error.stack ||
        error.message
    );

    await logActivity({
      eventType: "scanner",
      action: "scan_failed",
      message: error.message,
      status: "error"
    });

    return result;
  } finally {
    clearTimeout(timeout);

    ENGINE.scanning = false;
    currentScanAbortController = null;
    scanPromise = null;
  }
}
/* -------------------------------------------------------------------------- */
/* HEALTH                                                                     */
/* -------------------------------------------------------------------------- */
app.get("/api/health", async (req, res) => {
  let database = "unknown";

  try {
    const { error } = await supabase
      .from("os_modules")
      .select("id")
      .limit(1);

    database = error ? "error" : "connected";
  } catch (_) {
    database = "error";
  }

  res.json({
    ok: true,
    version: VERSION,
    service: "GRIDV21 BRAIN",
    database,
    engine: {
      running: ENGINE.running,
      scanning: ENGINE.scanning,
      emergency_stopped: ENGINE.emergencyStopped,
      last_scan: ENGINE.lastScan,
      permits_found: ENGINE.permitsFound,
      errors: ENGINE.errors,
      uptime_seconds: Math.floor(
        (Date.now() - ENGINE.uptime) / 1000
      )
    },
    os_count: OS_MODULES.length,
    timestamp: new Date().toISOString(),
    request_id: req.id
  });
});

/* -------------------------------------------------------------------------- */
/* TEST                                                                       */
/* -------------------------------------------------------------------------- */

app.get("/api/test", (req, res) => {
  res.json({
    ok: true,
    message:
      "GRIDV21 BRAIN API operational",
    version: VERSION,
    request_id: req.id
  });
});

/* -------------------------------------------------------------------------- */
/* CONFIG                                                                     */
/* -------------------------------------------------------------------------- */

app.get("/api/config", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    frontend_url:
      process.env.FRONTEND_URL,
    stripe_enabled:
      Boolean(stripe),
    google_oauth_enabled:
      Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET
      ),
    cities: CITIES.map(city => ({
      name: city.name,
      type: city.type
    })),
    os_modules: OS_MODULES,
    scan_settings: {
      batchSize:
        SCAN_SETTINGS.batchSize,
      requestDelay:
        SCAN_SETTINGS.requestDelay,
      requestTimeout:
        SCAN_SETTINGS.requestTimeout,
      scanTimeout:
        SCAN_SETTINGS.scanTimeout,
      cron:
        SCAN_SETTINGS.cron,
      concurrency:
        SCAN_SETTINGS.concurrency
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AUTH                                                                       */
/* -------------------------------------------------------------------------- */

app.get(
  "/auth/google",
  (req, res, next) => {
    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET
    ) {
      return res.status(503).json({
        ok: false,
        error:
          "Google OAuth is not configured"
      });
    }

    passport.authenticate("google", {
      scope: [
        "profile",
        "email"
      ]
    })(req, res, next);
  }
);

app.get(
  "/auth/google/callback",
  (req, res, next) => {
    passport.authenticate(
      "google",
      {
        failureRedirect:
          "/?auth=failed"
      },
      (error, user) => {
        if (error || !user) {
          return res.redirect(
            "/?auth=failed"
          );
        }

        req.logIn(
          user,
          loginError => {
            if (loginError) {
              return res.redirect(
                "/?auth=failed"
              );
            }

            return res.redirect(
              "/?auth=success"
            );
          }
        );
      }
    )(req, res, next);
  }
);

app.get(
  "/auth/me",
  (req, res) => {
    res.json({
      ok: true,
      authenticated:
        Boolean(
          req.isAuthenticated?.()
        ),
      user:
        req.user || null
    });
  }
);

app.post(
  "/auth/logout",
  (req, res) => {
    req.logout(error => {
      if (error) {
        return res.status(500).json({
          ok: false,
          error:
            error.message
        });
      }

      req.session.destroy(() => {
        res.json({
          ok: true
        });
      });
    });
  }
);

/* -------------------------------------------------------------------------- */
/* OS MODULES                                                                 */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/os-modules",
  requireBrainAccess,
  async (req, res) => {
    const { data, error } =
      await supabase
        .from("os_modules")
        .select("*")
        .order("id", {
          ascending: true
        });

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message,
        modules: OS_MODULES
      });
    }

    res.json({
      ok: true,
      count: data?.length || 0,
      modules: data || []
    });
  }
);

app.post(
  "/api/os-toggle/:id",
  requireAdmin,
  async (req, res) => {
    const id = Number(
      req.params.id
    );

    if (
      !Number.isInteger(id) ||
      id < 1 ||
      id > 12
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "OS id must be between 1 and 12"
      });
    }

    const enabled =
      Boolean(req.body?.enabled);

    const { data, error } =
      await supabase
        .from("os_modules")
        .update({
          enabled,
          status: enabled
            ? "active"
            : "paused",
          last_run:
            enabled
              ? new Date().toISOString()
              : null
        })
        .eq("id", id)
        .select()
        .single();

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    await logActivity({
      eventType: "os",
      action:
        "module_toggled",
      message:
        `${data.name} ${enabled ? "enabled" : "disabled"}`,
      metadata: {
        os_id: id,
        enabled
      }
    });

    res.json({
      ok: true,
      module: data
    });
  }
);

/* -------------------------------------------------------------------------- */
/* OS ACTIVITY                                                                */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/activity",
  requireBrainAccess,
  async (req, res) => {
    const limit = Math.min(
      500,
      Math.max(
        1,
        Number(req.query.limit || 100)
      )
    );

    const activity =
      await getActivity(limit);

    res.json({
      ok: true,
      count: activity.length,
      activity
    });
  }
);

app.get(
  "/api/os-activity",
  requireBrainAccess,
  async (req, res) => {
    const limit = Math.min(
      500,
      Math.max(
        1,
        Number(req.query.limit || 100)
      )
    );

    const activity =
      await getActivity(limit);

    res.json({
      ok: true,
      count: activity.length,
      activity
    });
  }
);

/* -------------------------------------------------------------------------- */
/* DASHBOARD                                                                  */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/dashboard",
  requireBrainAccess,
  async (req, res) => {
    try {
      const [
        permitsResult,
        leadsResult,
        contractorsResult,
        revenueResult,
        projectsResult,
        modulesResult,
        integrationsResult,
        dmResult
      ] = await Promise.all([
        supabase
          .from("permits")
          .select(
            "id,city,permit_type,status,issued_date,permit_id,ai_confidence,ai_enriched,estimated_value,ai_score,predicted_revenue,ai_note,address,work_type,work_description,contractor_name,applicant_name,owner_name,latitude,longitude,created_at,updated_at"
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(100),

        supabase
          .from("leads")
          .select(
            "id,trade_type,region,value_estimate,status,contractor_id,created_at,external_id"
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(100),

        supabase
          .from("contractors")
          .select(
            "id,name,phone,email,trade_type,region,address,dm_sent_count,last_dm_at,os_module,paid_status,created_at"
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(100),

        supabase
          .from("revenue_log")
          .select(
            "id,amount,source,contractor_id,lead_id,created_at"
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(100),

        supabase
          .from("projects")
          .select("*")
          .order(
            "updated_at",
            {
              ascending: false
            }
          )
          .limit(100),

        supabase
          .from("os_modules")
          .select("*")
          .order(
            "id",
            {
              ascending: true
            }
          ),

        supabase
          .from("integrations")
          .select("*")
          .order(
            "id",
            {
              ascending: true
            }
          ),

        supabase
          .from("dm_logs")
          .select("*")
          .order(
            "sent_at",
            {
              ascending: false
            }
          )
          .limit(100)
      ]);

      const permits =
        permitsResult.data || [];

      const leads =
        leadsResult.data || [];

      const contractors =
        contractorsResult.data || [];

      const revenue =
        revenueResult.data || [];

      const projects =
        projectsResult.data || [];

      const modules =
        modulesResult.data || [];

      const integrations =
        integrationsResult.data || [];

      const dms =
        dmResult.data || [];

      const totalRevenue =
        revenue.reduce(
          (sum, row) =>
            sum +
            safeNumber(row.amount),
          0
        );

      const estimatedRevenue =
        permits.reduce(
          (sum, row) =>
            sum +
            safeNumber(
              row.predicted_revenue
            ),
          0
        );

      const activeOS =
        modules.filter(
          row =>
            row.enabled !== false &&
            row.status !== "paused"
        ).length;

      const activeIntegrations =
        integrations.filter(
          row =>
            row.status === "active" ||
            row.status === "connected"
        ).length;

      const recentPermits =
        permits.slice(0, 50);

      const topLeads =
        [...recentPermits]
          .sort(
            (a, b) =>
              safeNumber(
                b.ai_score
              ) -
              safeNumber(
                a.ai_score
              )
          )
          .slice(0, 20);

      res.json({
        ok: true,
        version: VERSION,

        metrics: {
          total_leads:
            leads.length ||
            permits.length,

          permits:
            permits.length,

          contractors:
            contractors.length,

          dms_sent:
            dms.length,

          projects:
            projects.length,

          est_revenue_month:
            Number(
              estimatedRevenue.toFixed(
                2
              )
            ),

          revenue:
            Number(
              totalRevenue.toFixed(
                2
              )
            ),

          os_active:
            activeOS,

          integrations_active:
            activeIntegrations
        },

        engine: {
          running:
            ENGINE.running,

          scanning:
            ENGINE.scanning,

          emergency_stopped:
            ENGINE.emergencyStopped,

          last_scan:
            ENGINE.lastScan,

          last_scan_duration:
            ENGINE.lastScanDuration,

          permits_found:
            ENGINE.permitsFound,

          errors:
            ENGINE.errors,

          last_error:
            ENGINE.lastError
        },

        os_modules:
          modules.length
            ? modules
            : OS_MODULES,

        permits:
          recentPermits,

        top_leads:
          topLeads,

        leads,

        contractors,

        projects,

        revenue,

        integrations,

        activity:
          await getActivity(50)
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.stack ||
          error.message
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* PERMITS                                                                    */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/permits",
  requireBrainAccess,
  async (req, res) => {
    const limit = Math.min(
      500,
      Math.max(
        1,
        Number(req.query.limit || 100)
      )
    );

    let query = supabase
      .from("permits")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(limit);

    if (req.query.city) {
      query = query.eq(
        "city",
        req.query.city
      );
    }

    if (req.query.status) {
      query = query.eq(
        "status",
        req.query.status
      );
    }

    const { data, error } =
      await query;

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    res.json({
      ok: true,
      count: data?.length || 0,
      permits: data || []
    });
  }
);

/* -------------------------------------------------------------------------- */
/* SCAN NOW                                                                   */
/* -------------------------------------------------------------------------- */

app.post(
  "/api/scrape-now",
  requireAdmin,
  async (req, res) => {
    if (ENGINE.scanning) {
      return res.status(409).json({
        ok: false,
        error:
          "A scan is already running"
      });
    }

    if (
      ENGINE.emergencyStopped
    ) {
      return res.status(423).json({
        ok: false,
        error:
          "Emergency stop is active"
      });
    }

    const requestId =
      crypto.randomUUID();

    scanPromise =
      scanAllCities(requestId);

    res.status(202).json({
      ok: true,
      message:
        "Scan started",
      request_id:
        requestId,
      version: VERSION
    });
  }
);

/* -------------------------------------------------------------------------- */
/* SCAN STATUS                                                                */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/scan-status",
  requireBrainAccess,
  (req, res) => {
    res.json({
      ok: true,
      scanning:
        ENGINE.scanning,
      running:
        ENGINE.running,
      emergency_stopped:
        ENGINE.emergencyStopped,
      last_scan:
        ENGINE.lastScan,
      last_scan_duration:
        ENGINE.lastScanDuration,
      permits_found:
        ENGINE.permitsFound,
      errors:
        ENGINE.errors,
      last_error:
        ENGINE.lastError
    });
  }
);

/* -------------------------------------------------------------------------- */
/* BRAIN CONTROL                                                              */
/* -------------------------------------------------------------------------- */

app.post(
  "/api/brain/pause",
  requireAdmin,
  async (req, res) => {
    ENGINE.running = false;

    await logActivity({
      eventType: "brain",
      action: "paused",
      message:
        "GRIDV21 BRAIN paused"
    });

    res.json({
      ok: true,
      running:
        ENGINE.running
    });
  }
);

app.post(
  "/api/brain/resume",
  requireAdmin,
  async (req, res) => {
    ENGINE.running = true;
    ENGINE.emergencyStopped = false;

    await logActivity({
      eventType: "brain",
      action: "resumed",
      message:
        "GRIDV21 BRAIN resumed"
    });

    res.json({
      ok: true,
      running:
        ENGINE.running,
      emergency_stopped:
        ENGINE.emergencyStopped
    });
  }
);

app.post(
  "/api/brain/emergency-stop",
  requireAdmin,
  async (req, res) => {
    ENGINE.emergencyStopped = true;
    ENGINE.running = false;

    if (
      currentScanAbortController
    ) {
      currentScanAbortController.abort();
    }

    await logActivity({
      eventType: "brain",
      action:
        "emergency_stop",
      message:
        "GRIDV21 BRAIN emergency stop activated",
      status: "warning"
    });

    res.json({
      ok: true,
      running:
        ENGINE.running,
      emergency_stopped:
        ENGINE.emergencyStopped
    });
  }
);
/* -------------------------------------------------------------------------- */
/* FORECAST                                                                   */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/forecast",
  requireBrainAccess,
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from("permits")
          .select(
            "estimated_value,ai_score,predicted_revenue"
          )
          .limit(5000);

      if (error) throw error;

      const permits = data || [];

      const pipeline =
        permits.reduce(
          (sum, permit) =>
            sum +
            safeNumber(
              permit.estimated_value
            ),
          0
        );

      const projectedRevenue =
        permits.reduce(
          (sum, permit) =>
            sum +
            safeNumber(
              permit.predicted_revenue
            ),
          0
        );

      const averageScore =
        permits.length
          ? Number(
              (
                permits.reduce(
                  (sum, permit) =>
                    sum +
                    safeNumber(
                      permit.ai_score
                    ),
                  0
                ) /
                permits.length
              ).toFixed(2)
            )
          : 0;

      res.json({
        ok: true,
        permits: permits.length,
        estimated_pipeline:
          Number(
            pipeline.toFixed(2)
          ),
        projected_revenue:
          Number(
            projectedRevenue.toFixed(
              2
            )
          ),
        average_ai_score:
          averageScore,
        commission_rate: 0.03,
        currency: "USD"
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* LEADS                                                                      */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/leads",
  requireBrainAccess,
  async (req, res) => {
    try {
      const limit = Math.min(
        500,
        Math.max(
          1,
          Number(
            req.query.limit || 100
          )
        )
      );

      const { data, error } =
        await supabase
          .from("leads")
          .select("*")
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(limit);

      if (error) throw error;

      res.json({
        ok: true,
        count: data?.length || 0,
        leads: data || []
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

app.post(
  "/api/leads",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        trade_type,
        region,
        value_estimate,
        permit_data,
        status,
        contractor_id,
        external_id
      } = req.body || {};

      if (
        !trade_type ||
        !region
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "trade_type and region are required"
        });
      }

      const { data, error } =
        await supabase
          .from("leads")
          .insert({
            trade_type,
            region,
            value_estimate:
              value_estimate == null
                ? null
                : numberValue(
                    value_estimate
                  ),
            permit_data:
              safeJson(
                permit_data
              ),
            status:
              status || "new",
            contractor_id:
              contractor_id || null,
            external_id:
              external_id || null
          })
          .select()
          .single();

      if (error) throw error;

      await logActivity({
        eventType: "lead",
        action: "lead_created",
        message:
          `Lead created for ${trade_type} in ${region}`,
        metadata: {
          lead_id: data.id
        }
      });

      res.status(201).json({
        ok: true,
        lead: data
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* CONTRACTORS                                                                */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/contractors",
  requireBrainAccess,
  async (req, res) => {
    try {
      const limit = Math.min(
        500,
        Math.max(
          1,
          Number(
            req.query.limit || 100
          )
        )
      );

      const { data, error } =
        await supabase
          .from("contractors")
          .select("*")
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(limit);

      if (error) throw error;

      res.json({
        ok: true,
        count: data?.length || 0,
        contractors: data || []
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* PROJECTS                                                                   */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/projects",
  requireBrainAccess,
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from("projects")
          .select(
            `
            *,
            os_modules (
              id,
              name,
              layer,
              status,
              enabled
            )
            `
          )
          .order(
            "updated_at",
            {
              ascending: false
            }
          )
          .limit(500);

      if (error) throw error;

      res.json({
        ok: true,
        count: data?.length || 0,
        projects: data || []
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* PROPOSALS                                                                  */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/proposals",
  requireBrainAccess,
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from("proposals")
          .select("*")
          .order(
            "generated_at",
            {
              ascending: false
            }
          )
          .limit(500);

      if (error) throw error;

      res.json({
        ok: true,
        count: data?.length || 0,
        proposals: data || []
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

app.post(
  "/api/proposals",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        lead_id,
        company,
        client,
        value,
        setup_fee,
        ai_fee,
        performance_fee,
        total_estimate,
        status
      } = req.body || {};

      const calculatedTotal =
        total_estimate != null
          ? numberValue(
              total_estimate
            )
          : numberValue(value) +
            numberValue(
              setup_fee
            ) +
            numberValue(ai_fee);

      const { data, error } =
        await supabase
          .from("proposals")
          .insert({
            lead_id:
              lead_id || null,
            company:
              company || null,
            client:
              client || null,
            value:
              numberValue(value),
            setup_fee:
              numberValue(
                setup_fee
              ),
            ai_fee:
              numberValue(ai_fee),
            performance_fee:
              performance_fee ||
              null,
            total_estimate:
              calculatedTotal,
            generated_at:
              new Date().toISOString(),
            status:
              status || "draft"
          })
          .select()
          .single();

      if (error) throw error;

      await logActivity({
        eventType: "proposal",
        action:
          "proposal_created",
        message:
          `Proposal created for ${company || client || "client"}`,
        metadata: {
          proposal_id:
            data.id
        }
      });

      res.status(201).json({
        ok: true,
        proposal: data
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* REVENUE                                                                    */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/revenue",
  requireBrainAccess,
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from("revenue_log")
          .select("*")
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(500);

      if (error) throw error;

      const rows = data || [];

      const total =
        rows.reduce(
          (sum, row) =>
            sum +
            safeNumber(
              row.amount
            ),
          0
        );

      res.json({
        ok: true,
        count: rows.length,
        total:
          Number(
            total.toFixed(2)
          ),
        revenue: rows
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* INTEGRATIONS                                                               */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/integrations",
  requireBrainAccess,
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from("integrations")
          .select(
            "id,name,status,api_key_present,last_sync,created_at"
          )
          .order(
            "id",
            {
              ascending: true
            }
          );

      if (error) throw error;

      res.json({
        ok: true,
        count: data?.length || 0,
        integrations:
          data || []
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* SETTINGS                                                                   */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/settings",
  requireAdmin,
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from("settings")
          .select(
            "key,value,updated_at"
          )
          .order(
            "key",
            {
              ascending: true
            }
          );

      if (error) throw error;

      res.json({
        ok: true,
        settings:
          data || []
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

app.post(
  "/api/settings",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        key,
        value
      } = req.body || {};

      if (!key) {
        return res.status(400).json({
          ok: false,
          error:
            "key is required"
        });
      }

      const { data, error } =
        await supabase
          .from("settings")
          .upsert(
            {
              key: String(key),
              value:
                value == null
                  ? null
                  : String(value),
              updated_at:
                new Date().toISOString()
            },
            {
              onConflict: "key"
            }
          )
          .select()
          .single();

      if (error) throw error;

      await logActivity({
        eventType: "settings",
        action:
          "setting_updated",
        message:
          `Setting ${key} updated`,
        metadata: {
          key
        }
      });

      res.json({
        ok: true,
        setting: data
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* SYSTEM EVENTS                                                              */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/system-events",
  requireBrainAccess,
  async (req, res) => {
    try {
      const limit = Math.min(
        500,
        Math.max(
          1,
          Number(
            req.query.limit || 100
          )
        )
      );

      const { data, error } =
        await supabase
          .from("system_events")
          .select("*")
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(limit);

      if (error) throw error;

      res.json({
        ok: true,
        count: data?.length || 0,
        events: data || []
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* CSV EXPORT                                                                 */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/export/permits.csv",
  requireBrainAccess,
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from("permits")
          .select("*")
          .order(
            "issued_date",
            {
              ascending: false,
              nullsFirst: false
            }
          )
          .limit(10000);

      if (error) throw error;

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="gridv21-permits.csv"'
      );

      res.send(
        Papa.unparse(
          data || []
        )
      );
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* STRIPE                                                                     */
/* -------------------------------------------------------------------------- */

app.post(
  "/api/stripe/create-checkout-session",
  requireAdmin,
  async (req, res) => {
    if (!stripe) {
      return res.status(503).json({
        ok: false,
        error:
          "Stripe is not configured"
      });
    }

    try {
      const {
        priceId,
        successUrl,
        cancelUrl
      } = req.body || {};

      if (!priceId) {
        return res.status(400).json({
          ok: false,
          error:
            "priceId is required"
        });
      }

      const checkout =
        await stripe.checkout.sessions.create(
          {
            mode: "subscription",

            line_items: [
              {
                price: priceId,
                quantity: 1
              }
            ],

            success_url:
              successUrl ||
              `${process.env.FRONTEND_URL}/?payment=success`,

            cancel_url:
              cancelUrl ||
              `${process.env.FRONTEND_URL}/?payment=cancelled`
          }
        );

      res.json({
        ok: true,
        id: checkout.id,
        url: checkout.url
      });
    } catch (error) {
      await logger.error(
        req.id,
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* ROOT API                                                                   */
/* -------------------------------------------------------------------------- */

app.get(
  "/api",
  (req, res) => {
    res.json({
      ok: true,
      service:
        "GRIDV21 BRAIN ENTERPRISE",
      version: VERSION,
      architecture:
        "GRIDV21 BRAIN — 12 Intelligence OS",
      os_count:
        OS_MODULES.length,
      message:
        "API operational"
    });
  }
);

/* -------------------------------------------------------------------------- */
/* FRONTEND                                                                   */
/* -------------------------------------------------------------------------- */

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "dashboard.html"
      ),
      error => {
        if (
          error &&
          !res.headersSent
        ) {
          res.json({
            ok: true,
            service:
              "GRIDV21 BRAIN ENTERPRISE",
            version: VERSION
          });
        }
      }
    );
  }
);

/* -------------------------------------------------------------------------- */
/* FAVICON                                                                    */
/* -------------------------------------------------------------------------- */

app.get(
  "/favicon.ico",
  (req, res) => {
    res.status(204).end();
  }
);

/* -------------------------------------------------------------------------- */
/* CRON                                                                       */
/* -------------------------------------------------------------------------- */

cron.schedule(
  SCAN_SETTINGS.cron,
  async () => {
    if (
      !ENGINE.running ||
      ENGINE.scanning ||
      ENGINE.emergencyStopped
    ) {
      return;
    }

    const requestId =
      crypto.randomUUID();

    scanPromise =
      scanAllCities(
        requestId
      );

    await scanPromise;
  },
  {
    timezone:
      process.env.CRON_TIMEZONE ||
      "UTC"
  }
);
/* -------------------------------------------------------------------------- */
/* 404                                                                        */
/* -------------------------------------------------------------------------- */

app.use(
  (req, res) => {
    res.status(404).json({
      ok: false,
      error: "Route not found",
      path: req.originalUrl,
      request_id: req.id
    });
  }
);

/* -------------------------------------------------------------------------- */
/* GLOBAL ERROR HANDLER                                                       */
/* -------------------------------------------------------------------------- */

app.use(
  async (
    error,
    req,
    res,
    next
  ) => {
    try {
      await logger.error(
        req.id || "unknown",
        error.stack ||
          error.message ||
          String(error)
      );
    } catch (logError) {
      console.error(
        "[ERROR LOGGER FAILED]",
        logError
      );
    }

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      ok: false,
      error: "Internal server error",
      request_id:
        req.id || null
    });
  }
);

/* -------------------------------------------------------------------------- */
/* PROCESS EVENTS                                                             */
/* -------------------------------------------------------------------------- */

process.on(
  "unhandledRejection",
  reason => {
    console.error(
      "[PROCESS] Unhandled rejection:",
      reason
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "[PROCESS] Uncaught exception:",
      error
    );
  }
);

/* -------------------------------------------------------------------------- */
/* STARTUP                                                                    */
/* -------------------------------------------------------------------------- */

try {
  await syncOSModules();

  console.log(
    `[GRIDV21] OS synchronisation complete: ${OS_MODULES.length} modules`
  );
} catch (error) {
  console.error(
    "[GRIDV21] OS synchronisation failed:",
    error.message
  );
}

  next();

// BRAIN STATE - MEMORY
let brainState = {
  running: true,
  scanning: false,
  permitsFound: 1247, // temp data so UI shows something
  errors: 0,
  lastScan: new Date().toISOString(),
  uptime: process.uptime(),
  emergency: false
};

// 1. DASHBOARD DATA
app.get('/api/brain/status', requireAdminKey, (req, res) => {
  brainState.uptime = Math.floor(process.uptime());
  res.json(brainState);
});

// 2. BRAIN COMMANDS
app.post('/api/scrape-now', requireAdminKey, async (req, res) => {
  brainState.scanning = true;
  brainState.lastScan = new Date().toISOString();
  console.log('Brain: Manual Scan Started');
  res.json({ok: true, scanning: true});
});

app.post('/api/brain/pause', requireAdminKey, (req, res) => {
  brainState.running = false;
  brainState.scanning = false;
  res.json({ok: true});
});

app.post('/api/brain/resume', requireAdminKey, (req, res) => {
  brainState.running = true;
  res.json({ok: true});
});

app.post('/api/brain/emergency-stop', requireAdminKey, (req, res) => {
  brainState = {running: false, scanning: false, emergency: true, permitsFound: 0, errors: 0};
  res.json({ok: true});
});

// 3. AUTH VERIFY - THIS IS WHY YOU GOT 401
app.get("/api/auth/verify", (req, res) => {
  const supplied =
    req.get("x-admin-key") ||
    req.query.key ||
    req.headers["x-admin-key"] ||
    "";

  if (!supplied || supplied !== process.env.ADMIN_KEY) {
    return res.status(401).json({
      ok: false,
      authenticated: false,
      error: "Authentication required"
    });
  }

  res.json({
    ok: true,
    authenticated: true,
    version: VERSION
  });
});
/* ---------------------------
----------------------------------------------- */
/* SERVER                                                                     */
/* -------------------------------------------------------------------------- */
// CRON JOB ROUTE
app.get('/internal/run-cycle', requireAdminKey, async (req, res) => {
  console.log('Cron: Running cycle');
  brainState.scanning = true;
  brainState.lastScan = new Date().toISOString();
  // TODO: trigger actual scrape here
  brainState.scanning = false;
  res.json({ok: true});
});

const server = app.listen(
  PORT,
  () => {
    console.log(
      "============================================================"
    );

    console.log(
      `GRIDV21 BRAIN ENTERPRISE v${VERSION}`
    );

    console.log(
      `Server listening on port ${PORT}`
    );

    console.log(
      `Environment: ${
        IS_PRODUCTION
          ? "production"
          : "development"
      }`
    );

    console.log(
      `Intelligence OS modules: ${OS_MODULES.length}`
    );

    console.log(
      "============================================================"
    );
  }
);

/* -------------------------------------------------------------------------- */
/* GRACEFUL SHUTDOWN                                                          */
/* -------------------------------------------------------------------------- */

async function shutdown(signal) {
  console.log(
    `[SHUTDOWN] ${signal} received`
  );

  ENGINE.running = false;

  if (
    currentScanAbortController
  ) {
    try {
      currentScanAbortController.abort();
    } catch (_) {}
  }

  try {
    server.close(
      async () => {
        try {
          if (
            redisClient &&
            redisClient.isOpen
          ) {
            await redisClient.quit();
          }
        } catch (error) {
          console.error(
            "[SHUTDOWN] Redis close error:",
            error.message
          );
        }

        console.log(
          "[SHUTDOWN] GRIDV21 BRAIN stopped cleanly"
        );

        process.exit(0);
      }
    );
  } catch (error) {
    console.error(
      "[SHUTDOWN] Error:",
      error.message
    );

    process.exit(1);
  }
}

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

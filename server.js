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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(":id :method :url :status :response-time ms"));
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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

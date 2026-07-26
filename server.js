/******************************************************************************
 * GRIDV21 BRAIN ENTERPRISE v6.3.4
 * OWNER: LAZARUS TAKUDZWA CHENANA
 *
 * COMPLETE PRODUCTION BACKEND
 * - Express 5
 * - Supabase
 * - Optional Redis sessions
 * - Passport / Google OAuth
 * - GRIDV21 Brain Engine
 * - Permit scanning
 * - AI scoring
 * - Dashboard API
 * - OS controls
 * - Scan controls
 * - CSV export
 ******************************************************************************/

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

/* ==========================================================================
   PATHS
========================================================================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ==========================================================================
   ENVIRONMENT
========================================================================== */

dotenv.config();

const app = express();

export const VERSION = "6.3.4";

// Safe global fallback so logActivity never crashes any route or scan engine
globalThis.logActivity = globalThis.logActivity || async function(type, action, message, details = {}) {
  try {
    if (typeof logger !== "undefined" && typeof logger[type] === "function") {
      await logger[type]("SYSTEM", `[${action}] ${message}`);
    } else {
      console.log(`[LOG ${type.toUpperCase()}] ${action}: ${message}`, details || "");
    }
  } catch (e) {
    console.error("logActivity error:", e.message);
  }
};

const PORT = Number(process.env.PORT || 3000);

const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

/* ==========================================================================
   ENVIRONMENT VALIDATION
========================================================================== */

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "ADMIN_KEY",
  "FRONTEND_URL"
];

for (const key of REQUIRED_ENV) {

  if (!process.env[key]) {

    throw new Error(
      `FATAL: ${key} missing from ENV`
    );

  }

}

/* ==========================================================================
   SUPABASE
========================================================================== */

const supabase =
  createClient(
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

/* ==========================================================================
   OPTIONAL STRIPE
========================================================================== */

const stripe =
  process.env.STRIPE_SECRET_KEY
    ? new Stripe(
        process.env.STRIPE_SECRET_KEY
      )
    : null;

/* ==========================================================================
   REDIS
========================================================================== */

let redisClient = null;

let sessionStore = undefined;

if (process.env.REDIS_URL) {

  try {

    redisClient =
      createRedisClient({
        url: process.env.REDIS_URL
      });

    redisClient.on(
      "error",
      error => {

        console.warn(
          `[REDIS] ${error.message}`
        );

      }
    );

    await redisClient.connect();

    sessionStore =
      new RedisStore({
        client: redisClient
      });

    console.log(
      "[REDIS] Redis session store enabled"
    );

  } catch (error) {

    console.warn(
      `[REDIS] Redis unavailable. Using memory sessions: ${error.message}`
    );

    redisClient = null;
    sessionStore = undefined;

  }

}

/* ==========================================================================
   ENGINE STATE
========================================================================== */

export const ENGINE = {

  running:
    true,

  scanning:
    false,

  lastScan:
    null,

  lastScanDuration:
    0,

  permitsFound:
    0,

  errors:
    0,

  uptime:
    Date.now(),

  lastError:
    null,

  emergencyStopped:
    false

};

/* ==========================================================================
   SCAN CONFIG
========================================================================== */

export const SCAN_SETTINGS = {

  batchSize:
    100,

  requestDelay:
    750,

  requestTimeout:
    15000,

  scanTimeout:
    600000,

  cron:
    "*/30 * * * *",

  concurrency:
    3

};

/* ==========================================================================
   CITY SOURCES
========================================================================== */

export const CITIES = [
  // United States
  {
    name: "Austin",
    url: "https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=1000",
    type: "json"
  },
  {
    name: "Chicago",
    url: "https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=1000&$order=Issue%20Date%20DESC",
    type: "json"
  },
  {
    name: "Denver",
    url: "https://www.denvergov.org/media/gis/DataCatalog/building_permits/csv/building_permits.csv",
    type: "csv"
  },
  {
    name: "New York",
    url: "https://data.cityofnewyork.us/resource/ipu4-2q9e.json?$limit=1000",
    type: "json"
  },
  {
    name: "Los Angeles",
    url: "https://data.lacity.org/resource/pi9x-tg5x.json?$limit=1000",
    type: "json"
  },

  // South Africa (limited public sources)
  {
    name: "Cape Town",
    url: "https://web1.capetown.gov.za/web1/OpenDataPortal/DownloadFile?fileName=Building%20Plans%20Approved.csv",
    type: "csv",
    note: "May require headers or may be unstable"
  }
];
/* ==========================================================================
   LOGGER
========================================================================== */

const logger = {

  info(reqId, msg) {

    console.log(
      `[INFO ${reqId} ${new Date().toISOString()}] ${msg}`
    );

  },

  warn(reqId, msg) {

    console.warn(
      `[WARN ${reqId} ${new Date().toISOString()}] ${msg}`
    );

  },

  async error(reqId, msg) {

    console.error(
      `[ERROR ${reqId} ${new Date().toISOString()}] ${msg}`
    );

    try {

      await supabase
        .from("audit_logs")
        .insert({

          level:
            "error",

          message:
            String(msg).slice(0, 5000),

          request_id:
            reqId

        });

    } catch (_) {}

  }

};

/* ==========================================================================
   MORGAN REQUEST ID
========================================================================== */

morgan.token(
  "id",
  req =>
    req.id || "no-id"
);

/* ==========================================================================
   MIDDLEWARE
========================================================================== */

app.set(
  "trust proxy",
  1
);

app.use(
  (req, res, next) => {

    req.id =
      crypto.randomUUID();

    res.setHeader(
      "X-Request-ID",
      req.id
    );

    next();

  }
);

app.use(
  helmet({
    contentSecurityPolicy:
      false
  })
);

app.use(
  compression()
);

app.use(
  morgan(
    ":id :method :url :status :response-time ms"
  )
);

app.use(
  cors({

    origin:
      process.env.FRONTEND_URL,

    credentials:
      true

  })
);

app.use(
  express.json({
    limit:
      "20mb"
  })
);

app.use(
  express.urlencoded({
    extended:
      true
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

app.use(
  "/api",
  rateLimit({

    windowMs:
      15 * 60 * 1000,

    max:
      500,

    standardHeaders:
      true,

    legacyHeaders:
      false

  })
);

/* ==========================================================================
   SESSION
========================================================================== */

app.use(
  session({

    store:
      sessionStore,

    secret:
      process.env.SESSION_SECRET,

    resave:
      false,

    saveUninitialized:
      false,

    cookie: {

      httpOnly:
        true,

      secure:
        IS_PRODUCTION,

      sameSite:
        "lax",

      maxAge:
        24 * 60 * 60 * 1000

    }

  })
);

/* ==========================================================================
   PASSPORT
========================================================================== */

app.use(
  passport.initialize()
);

app.use(
  passport.session()
);

passport.serializeUser(
  (user, done) =>
    done(
      null,
      user
    )
);

passport.deserializeUser(
  (user, done) =>
    done(
      null,
      user
    )
);

if (
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET
) {

  passport.use(

    new GoogleStrategy(

      {

        clientID:
          process.env.GOOGLE_CLIENT_ID,

        clientSecret:
          process.env.GOOGLE_CLIENT_SECRET,

        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          `${process.env.FRONTEND_URL}/auth/google/callback`

      },

      async (
        accessToken,
        refreshToken,
        profile,
        done
      ) => {

        done(

          null,

          {

            id:
              profile.id,

            displayName:
              profile.displayName,

            email:
              profile.emails?.[0]?.value ||
              null

          }

        );

      }

    )

  );

}

/* ==========================================================================
   HELPER FUNCTIONS
========================================================================== */

function pick(
  obj,
  keys
) {

  for (
    const key of keys
  ) {

    if (

      obj?.[key] !== undefined &&

      obj?.[key] !== null &&

      String(
        obj[key]
      ).trim() !== ""

    ) {

      return obj[key];

    }

  }

  return null;

}

function numberValue(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;

  }

  const number =
    Number(

      String(value)

        .replace(
          /[$,]/g,
          ""
        )

        .replace(
          /[^0-9.-]/g,
          ""
        )

    );

  return Number.isFinite(
    number
  )
    ? number
    : null;

}

function dateValue(
  value
) {

  if (!value) {

    return null;

  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null;

  }

  return date
    .toISOString()
    .slice(0, 10);

}

function normalizeText(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }

  const result =
    String(value).trim();

  return result || null;

}

function sleep(
  ms
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}

function safeNumber(
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

function safeArray(
  value
) {

  return Array.isArray(
    value
  )
    ? value
    : [];

}

/* ==========================================================================
   AI SCORING
========================================================================== */

function scoreLead(
  permit
) {

  let score =
    50;

  const type =
    String(
      permit.permit_type ||
      ""
    ).toLowerCase();

  const value =
    Number(
      permit.estimated_value ||
      0
    );

  if (
    type.includes(
      "commercial"
    )
  ) {

    score +=
      25;

  }

  if (

    type.includes(
      "building"
    ) ||

    type.includes(
      "construction"
    )

  ) {

    score +=
      10;

  }

  if (

    type.includes(
      "remodel"
    ) ||

    type.includes(
      "renovation"
    )

  ) {

    score +=
      8;

  }

  if (
    value >= 1000000
  ) {

    score +=
      20;

  } else if (
    value >= 500000
  ) {

    score +=
      15;

  } else if (
    value >= 100000
  ) {

    score +=
      10;

  }

  return Math.min(
    100,
    score
  );

}

/* ==========================================================================
   ADDRESS NORMALIZATION
========================================================================== */

function addressFromRaw(
  city,
  raw
) {

  if (
    city === "Austin"
  ) {

    return [

      pick(
        raw,
        [
          "original_address1",
          "address",
          "street_number"
        ]
      ),

      pick(
        raw,
        [
          "original_address2",
          "street_name"
        ]
      )

    ]
      .filter(Boolean)
      .join(" ") ||
      null;

  }

  if (
    city === "Chicago"
  ) {

    return [

      pick(
        raw,
        [
          "street_number"
        ]
      ),

      pick(
        raw,
        [
          "street_direction"
        ]
      ),

      pick(
        raw,
        [
          "street_name"
        ]
      ),

      pick(
        raw,
        [
          "street_type"
        ]
      )

    ]
      .filter(Boolean)
      .join(" ") ||
      null;

  }

  return normalizeText(

    pick(
      raw,
      [
        "address",
        "site_address",
        "address_line1",
        "property_address",
        "address_line_1"
      ]
    )

  );

}

/* ==========================================================================
   PERMIT MAPPING
========================================================================== */
function mapPermitData(cityName, raw) {

  const permitId = normalizeText(
    pick(raw, [
      "permit_id", "permit_num", "permit_number", "permitnum",
      "id", "permit", "record_id", "permitnumber", "PERMIT_NUMBER"
    ])
  );

  const permitType = normalizeText(
    pick(raw, [
      "permit_type_definition", "permit_type_desc", "permit_type",
      "permit_type_name", "type", "work_type", "permittype",
      "PERMIT_TYPE", "worktype", "description", "permit_class"
    ])
  );

  const status = normalizeText(
    pick(raw, [
      "status_current", "status", "permit_status",
      "current_status", "STATUS", "permitstatus"
    ])
  );

  const issuedDate = dateValue(
    pick(raw, [
      "issued_date", "issue_date", "Issue Date", "issued",
      "application_date", "ISSUED_DATE", "issue_dt", "date_issued"
    ])
  );

  const valuation = numberValue(
    pick(raw, [
      "estimated_value", "estimated_cost", "total_job_valuation",
      "reported_cost", "valuation", "job_value", "declared_valuation",
      "ESTIMATED_COST", "job_cost", "value", "total_valuation"
    ])
  );

  const address = addressFromRaw(cityName, raw) || normalizeText(
    pick(raw, ["address", "site_address", "property_address", "street_address", "location"])
  );

  // Better fallback ID
  const stableSource = JSON.stringify({
    cityName, permitId, permitType, status, issuedDate, valuation, address
  });

  const generatedId = `${cityName.toLowerCase()}-${crypto
    .createHash("sha1")
    .update(stableSource)
    .digest("hex")
    .slice(0, 20)}`;

  const base = {
    city: cityName,
    permit_type: permitType || "Unknown",
    status: status || null,
    issued_date: issuedDate,
    permit_id: permitId || generatedId,
    address: address || null,
    estimated_value: valuation || 0,
    ai_score: 0,
    ai_confidence: 0,
    ai_enriched: false
  };

  // Only score if we have some real data
  if (base.permit_type !== "Unknown" || base.estimated_value > 0) {
    const score = scoreLead(base);
    base.ai_score = score;
    base.ai_confidence = Number((0.65 + Math.min(score, 100) / 400).toFixed(2));
    base.ai_enriched = true;
  }

  return base;
     }

/* ==========================================================================
   AI ENGINE
========================================================================== */

export const AI_ENGINE = {

  async enrichPermit(
    permit
  ) {

    const estimatedValue =
      Number(
        permit.estimated_value ||
        25000
      );

    const score =
      scoreLead(
        permit
      );

    return {

      ...permit,

      ai_enriched:
        true,

      estimated_value:
        estimatedValue,

      ai_confidence:
        Number(
          (
            0.70 +
            Math.min(
              score,
              100
            ) / 333
          ).toFixed(2)
        ),

      ai_score:
        score,

      ai_note:
        "GRIDV21 heuristic AI engine"

    };

  },

  scoreLead,

  predictRevenue(
    permit
  ) {

    return Number(

      (

        Number(
          permit.estimated_value ||
          25000
        ) * 0.03

      ).toFixed(2)

    );

  }

};

/* ==========================================================================
   HTTP FETCH
========================================================================== */

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

      const response =
        await axios.get(
          url,
          {

            signal,

            timeout:
              SCAN_SETTINGS.requestTimeout,

            responseType:
              "text",

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

    } catch (
      error
    ) {

      lastError =
        error;

      if (
        signal?.aborted
      ) {

        throw new Error(
          "Scan aborted"
        );

      }

      logger.warn(

        reqId,

        `Fetch attempt ${attempt}/${retries} failed: ${error.message}`

      );

      if (
        attempt < retries
      ) {

        await sleep(
          500 * attempt
        );

      }

    }

  }

  throw lastError;

}

/* ==========================================================================
   SUPABASE BATCH INSERT
========================================================================== */

async function supabaseBatchInsert(
  table,
  rows
) {

  if (
    !rows.length
  ) {

    return {

      inserted:
        0,

      errors:
        0

    };

  }

  let inserted =
    0;

  for (
    let i = 0;
    i < rows.length;
    i +=
      SCAN_SETTINGS.batchSize
  ) {

    const batch =
      rows.slice(
        i,
        i +
          SCAN_SETTINGS.batchSize
      );

    const {
      error
    } =
      await supabase
        .from(table)
        .insert(
          batch
        );

    if (
      error
    ) {

      throw error;

    }

    inserted +=
      batch.length;

  }

  return {

    inserted,

    errors:
      0

  };

}
      
 /* ==========================================================================
   DEDUPLICATED PERMIT INSERT  (FIXED)
========================================================================== */

async function insertNewPermits(rows) {

  if (!rows.length) {
    return {
      inserted: 0,
      skipped: 0
    };
  }

  // Collect unique permit_ids from the new batch
  const ids = [
    ...new Set(
      rows
        .map(row => row.permit_id)
        .filter(Boolean)
    )
  ];

  // Fetch already-existing permit_ids from Supabase (in chunks of 500)
  const existing = new Set();

  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);

    const { data, error } = await supabase
      .from("permits")
      .select("permit_id")
      .in("permit_id", chunk);

    if (error) {
      throw error;
    }

    for (const row of data || []) {
      existing.add(row.permit_id);
    }
  }

  // Filter out duplicates
  const unique = [];
  const seen = new Set(existing);

  for (const row of rows) {
    if (!row.permit_id || seen.has(row.permit_id)) {
      continue;
    }

    seen.add(row.permit_id);
    unique.push(row);
  }

  if (!unique.length) {
    return {
      inserted: 0,
      skipped: rows.length
    };
  }

  // Insert only the new ones
  const { inserted, errors } = await supabaseBatchInsert("permits", unique);

  return {
    inserted,
    skipped: rows.length - inserted,
    errors
  };
}
/* ==========================================================================
   PARSE CITY DATA
========================================================================== */

function parseCityData(city, rawText) {

  if (city.type === "csv") {

    const parsed = Papa.parse(rawText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false
    });

    return safeArray(parsed.data);

  }

  // JSON
  try {
    const data = JSON.parse(rawText);
    return safeArray(data);
  } catch {
    return [];
  }

}

/* ==========================================================================
   SCAN SINGLE CITY
========================================================================== */

async function scanCity(city, reqId, signal) {

  logger.info(reqId, `Scanning ${city.name}...`);

  const rawText = await axiosWithAbort(
    city.url,
    reqId,
    signal
  );

  const records = parseCityData(city, rawText);

  logger.info(
    reqId,
    `${city.name}: received ${records.length} raw records`
  );

  const mapped = [];

  for (const raw of records) {
    if (signal?.aborted) {
      throw new Error("Scan aborted");
    }

    try {
      const permit = mapPermitData(city.name, raw);
      if (permit.permit_id) {
        mapped.push(permit);
      }
    } catch (err) {
      logger.warn(reqId, `Map error ${city.name}: ${err.message}`);
    }
  }

  const result = await insertNewPermits(mapped);

  logger.info(
    reqId,
    `${city.name}: inserted ${result.inserted}, skipped ${result.skipped}`
  );

  return result;
}

/* ==========================================================================
   FULL SCAN ENGINE
========================================================================== */

let currentAbortController = null;

async function runFullScan(reqId = "SYSTEM") {

  // Helper to safely execute logActivity without throwing a ReferenceError
  const safeLogActivity = async (type, action, message) => {
    try {
      if (typeof logActivity === "function") {
        await logActivity(type, action, message);
      } else if (logger && typeof logger[type] === "function") {
        await logger[type](reqId, `[${action}] ${message}`);
      } else {
        console.log(`[${type.toUpperCase()}] [${action}] ${message}`);
      }
    } catch (e) {
      console.error(`Failed to execute logActivity: ${e.message}`);
    }
  };

  if (ENGINE.scanning) {
    logger.warn(reqId, "Scan already running – skipped");
    return { status: "already_running" };
  }

  if (ENGINE.emergencyStopped) {
    logger.warn(reqId, "Engine is emergency-stopped");
    return { status: "emergency_stopped" };
  }

  if (!ENGINE.running) {
    logger.warn(reqId, "Engine is paused");
    return { status: "paused" };
  }

  ENGINE.scanning = true;
  ENGINE.lastError = null;
  const start = Date.now();

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  try {

    logger.info(reqId, "=== FULL SCAN STARTED ===");
    await safeLogActivity("info", "scan_started", "Full scan started");

    for (const city of CITIES) {

      if (signal.aborted || ENGINE.emergencyStopped) {
        break;
      }

      try {
        const result = await scanCity(city, reqId, signal);
        totalInserted += result.inserted || 0;
        totalSkipped += result.skipped || 0;

        // Log each city result
        await safeLogActivity(
          "info",
          "scan_city",
          `Scanned ${city.name}: inserted ${result.inserted}, skipped ${result.skipped}`
        );

      } catch (err) {
        totalErrors++;
        ENGINE.errors++;
        ENGINE.lastError = err.message;
        await logger.error(reqId, `City ${city.name} failed: ${err.message}`);

        await safeLogActivity(
          "error",
          "scan_city_error",
          `Failed scanning ${city.name}: ${err.message}`
        );
      }

      // polite delay between cities
      await sleep(SCAN_SETTINGS.requestDelay);
    }

    ENGINE.lastScan = new Date().toISOString();
    ENGINE.lastScanDuration = Date.now() - start;
    ENGINE.permitsFound += totalInserted;

    logger.info(
      reqId,
      `=== SCAN COMPLETE === inserted=${totalInserted} skipped=${totalSkipped} errors=${totalErrors} duration=${ENGINE.lastScanDuration}ms`
    );

    // Log full scan completion
    await safeLogActivity(
      "info",
      "scan_complete",
      `Full scan finished. Inserted: ${totalInserted}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`
    );

    return {
      status: "completed",
      inserted: totalInserted,
      skipped: totalSkipped,
      errors: totalErrors,
      duration: ENGINE.lastScanDuration
    };

  } catch (err) {

    ENGINE.lastError = err.message;
    ENGINE.errors++;
    await logger.error(reqId, `Full scan crashed: ${err.message}`);

    await safeLogActivity(
      "error",
      "scan_crashed",
      `Full scan crashed: ${err.message}`
    );

    return {
      status: "error",
      message: err.message
    };

  } finally {

    ENGINE.scanning = false;
    currentAbortController = null;

  }

       }

/* ==========================================================================
   AUTH HELPERS
========================================================================== */

function requireAdmin(req, res, next) {

  const key =
    req.headers["x-admin-key"] ||
    req.query.admin_key ||
    req.body?.admin_key;

  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({
      error: "Unauthorized – invalid admin key"
    });
  }

  next();

}

function requireAuth(req, res, next) {

  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  // also allow admin key as fallback
  const key =
    req.headers["x-admin-key"] ||
    req.query.admin_key;

  if (key === process.env.ADMIN_KEY) {
    return next();
  }

  return res.status(401).json({
    error: "Unauthorized"
  });

}

/* ==========================================================================
   ROUTES – HEALTH & STATUS
========================================================================== */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: VERSION,
    uptime: Date.now() - ENGINE.uptime,
    engine: {
      running: ENGINE.running,
      scanning: ENGINE.scanning,
      emergencyStopped: ENGINE.emergencyStopped,
      lastScan: ENGINE.lastScan,
      permitsFound: ENGINE.permitsFound,
      errors: ENGINE.errors
    }
  });
});

app.get("/api/status", requireAuth, (req, res) => {
  res.json({
    version: VERSION,
    engine: ENGINE,
    scanSettings: SCAN_SETTINGS,
    cities: CITIES.map(c => c.name),
    redis: !!redisClient,
    stripe: !!stripe
  });
});

/* ==========================================================================
   ROUTES – AUTH (Google OAuth)
========================================================================== */

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"]
  })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`
  }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

app.get("/auth/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ status: "logged_out" });
    });
  });
});

app.get("/auth/me", (req, res) => {
  if (req.user) {
    return res.json({ user: req.user });
  }
  res.status(401).json({ user: null });
});

/* ==========================================================================
   ROUTES – SCAN CONTROLS
========================================================================== */

app.post("/api/scan/start", requireAdmin, async (req, res) => {
  const result = await runFullScan(req.id);
  res.json(result);
});

app.post("/api/scan/stop", requireAdmin, (req, res) => {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  ENGINE.scanning = false;
  res.json({ status: "stop_requested" });
});

app.post("/api/engine/pause", requireAdmin, (req, res) => {
  ENGINE.running = false;
  res.json({ status: "paused", engine: ENGINE });
});

app.post("/api/engine/resume", requireAdmin, (req, res) => {
  ENGINE.running = true;
  ENGINE.emergencyStopped = false;
  res.json({ status: "resumed", engine: ENGINE });
});

app.post("/api/engine/emergency-stop", requireAdmin, (req, res) => {
  ENGINE.emergencyStopped = true;
  ENGINE.running = false;
  if (currentAbortController) {
    currentAbortController.abort();
  }
  ENGINE.scanning = false;
  res.json({ status: "emergency_stopped", engine: ENGINE });
});
/* ==========================================================================
   ROUTES – DASHBOARD DATA
========================================================================== */

app.get("/api/permits", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const city = req.query.city || null;
    const minScore = Number(req.query.min_score) || 0;

    let query = supabase
      .from("permits")
      .select("*", { count: "exact" })
      .order("issued_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (city) {
      query = query.eq("city", city);
    }

    if (minScore > 0) {
      query = query.gte("ai_score", minScore);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      data: data || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (err) {
    await logger.error(req.id, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const { count: totalPermits } = await supabase
      .from("permits")
      .select("*", { count: "exact", head: true });

    const { data: topCities } = await supabase
      .from("permits")
      .select("city")
      .limit(1000);

    const cityCounts = {};
    for (const row of topCities || []) {
      cityCounts[row.city] = (cityCounts[row.city] || 0) + 1;
    }

    res.json({
      totalPermits: totalPermits || 0,
      engine: ENGINE,
      cityBreakdown: cityCounts,
      version: VERSION
    });
  } catch (err) {
    await logger.error(req.id, err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   ROUTES – CSV EXPORT
========================================================================== */

app.get("/api/export/csv", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("permits")
      .select("*")
      .order("issued_date", { ascending: false })
      .limit(5000);

    if (error) throw error;

    const csv = Papa.unparse(data || []);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="gridv21-permits-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (err) {
    await logger.error(req.id, err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   ROUTES – OS / ADMIN CONTROLS
========================================================================== */

app.get("/api/os/info", requireAdmin, (req, res) => {
  res.json({
    version: VERSION,
    node: process.version,
    platform: process.platform,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    engine: ENGINE,
    env: {
      production: IS_PRODUCTION,
      redis: !!redisClient,
      stripe: !!stripe
    }
  });
});

app.post("/api/os/restart-engine", requireAdmin, (req, res) => {
  ENGINE.running = true;
  ENGINE.emergencyStopped = false;
  ENGINE.scanning = false;
  ENGINE.lastError = null;
  res.json({ status: "engine_restarted", engine: ENGINE });
});

/* ==========================================================================
   CRON – AUTO SCAN
========================================================================== */

if (SCAN_SETTINGS.cron) {
  cron.schedule(SCAN_SETTINGS.cron, async () => {
    if (ENGINE.running && !ENGINE.scanning && !ENGINE.emergencyStopped) {
      console.log("[CRON] Triggering scheduled scan...");
      await runFullScan("CRON");
    }
  });
  console.log(`[CRON] Scheduled: ${SCAN_SETTINGS.cron}`);
}
/* ==========================================================================
   ROUTES – ENHANCED LEADS (with advice)
========================================================================== */

app.get("/api/leads", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const minScore = Number(req.query.min_score) || 0;

    let query = supabase
      .from("permits")
      .select("*")
      .order("issued_date", { ascending: false })
      .limit(limit);

    if (minScore > 0) {
      query = query.gte("ai_score", minScore);
    }

    const { data, error } = await query;
    if (error) throw error;

    const enriched = (data || []).map(lead => {
      const score = lead.ai_score || 0;
      const value = Number(lead.estimated_value || 0);
      const type = (lead.permit_type || "").toLowerCase();

      let advice = "Monitor – low priority";
      let buyers = ["General contractors", "Local realtors"];

      if (score >= 80 || value >= 500000) {
        advice = "High priority – push to developers & large GCs immediately";
        buyers = ["Commercial developers", "General contractors", "Investment groups"];
      } else if (score >= 60 || value >= 150000) {
        advice = "Good opportunity – target specialty trades & mid-size contractors";
        buyers = ["Remodel contractors", "Specialty trades", "Property managers"];
      } else if (type.includes("commercial")) {
        advice = "Commercial lead – focus on commercial brokers & developers";
        buyers = ["Commercial brokers", "Developers", "Facility managers"];
      }

      return {
        ...lead,
        advice,
        possible_buyers: buyers,
        estimated_commission: Number((value * 0.03).toFixed(2))
      };
    });

    res.json({ data: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/* ==========================================================================
   ROUTES – BRAIN OS
========================================================================== */

app.get("/api/brain/suggestion", requireAdmin, async (req, res) => {
  try {
    // Simple intelligence for now
    const { data: recent } = await supabase
      .from("permits")
      .select("ai_score, estimated_value, permit_type, city")
      .order("issued_date", { ascending: false })
      .limit(20);

    const highValue = (recent || []).filter(p => (p.ai_score || 0) >= 70 || (p.estimated_value || 0) >= 300000);

    let suggestion = "System is stable. Continue regular scanning.";
    let action = null;

    if (highValue.length >= 3) {
      suggestion = `Brain detected ${highValue.length} high-value leads. Recommend preparing acquisition packages and outreach.`;
      action = "prepare_acquisitions";
    } else if ((recent || []).length === 0) {
      suggestion = "No recent permits found. Recommend triggering a full scan now.";
      action = "start_scan";
    }

    res.json({
      suggestion,
      recommended_action: action,
      high_value_count: highValue.length,
      analyzed: (recent || []).length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/* ==========================================================================
   ROUTES – REVENUE
========================================================================== */

app.get("/api/revenue", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("revenue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const total = (data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

    res.json({
      data: data || [],
      total_pipeline: total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/revenue", requireAdmin, async (req, res) => {
  try {
    const { source, amount, permit_id, notes, status } = req.body;

    const { data, error } = await supabase
      .from("revenue")
      .insert({
        source,
        amount,
        permit_id,
        notes,
        status: status || "pending"
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity("success", "revenue_created", `Revenue entry created: ${amount}`, { id: data.id });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/* ==========================================================================
   ROUTES – AFFILIATES
========================================================================== */

app.get("/api/affiliates", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("affiliates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/affiliates", requireAdmin, async (req, res) => {
  try {
    const { name, email, type, code } = req.body;

    const { data, error } = await supabase
      .from("affiliates")
      .insert({ name, email, type, code })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   ERROR HANDLING
========================================================================== */

app.use((err, req, res, next) => {
  console.error(`[UNHANDLED ${req.id}]`, err);
  res.status(500).json({
    error: "Internal Server Error",
    requestId: req.id
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path
  });
});

/* ==========================================================================
   START SERVER
========================================================================== */

app.listen(PORT, () => {
  console.log(`
=======================================================
  GRIDV21 BRAIN ENTERPRISE v${VERSION}
  Owner: Lazarus Takudzwa Chenana
  Port: ${PORT}
  Environment: ${IS_PRODUCTION ? "PRODUCTION" : "DEVELOPMENT"}
  Redis: ${redisClient ? "ENABLED" : "DISABLED"}
  Stripe: ${stripe ? "ENABLED" : "DISABLED"}
=======================================================
  `);
});

export default app;

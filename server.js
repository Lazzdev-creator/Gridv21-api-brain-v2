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

import fs from "fs";
import { createSouthAfricaIntelligence } from "./sa-opportunity-intelligence.js";

dotenv.config();

const ADMIN_KEY = process.env.ADMIN_KEY;

/* -------------------------------------------------------------------------- */
/* SUPABASE PUBLIC AUTH KEY                                                   */
/* -------------------------------------------------------------------------- */

/*
 * This is the PUBLIC anon key used only for password authentication.
 *
 * IMPORTANT:
 * The SUPABASE SERVICE ROLE KEY remains server-side.
 * NEVER place the service-role key inside login.html.
 */

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY;

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

/* -------------------------------------------------------------------------- */
/* OWNER / ADMIN AUTHENTICATION                                               */
/* -------------------------------------------------------------------------- */

/*
 * GRIDV21 has TWO separate authentication systems:
 *
 * 1. TENANT:
 *    email + password → Supabase → tenant session
 *
 * 2. OWNER:
 *    ADMIN_KEY → admin session → Brain Control
 *
 * A tenant session MUST NEVER satisfy this middleware.
 */

function requireAdmin(req, res, next) {

  /*
   * Only an ADMIN_KEY-created session is accepted.
   */
  if (
    req.session?.gridv21Authenticated === true &&
    req.session?.authType === "admin_key"
  ) {

    req.isAdmin = true;

    return next();
  }


  /*
   * Allow the ADMIN_KEY directly as a header.
   *
   * This also supports existing API clients.
   */
  const supplied =
    getAdminKey(req);

  const expected =
    process.env.ADMIN_KEY ||
    ADMIN_KEY ||
    "";


  if (!expected) {

    console.error(
      "[SECURITY] ADMIN_KEY is not configured."
    );

    return res.status(500).json({
      ok: false,
      authenticated: false,
      error: "Server misconfiguration"
    });
  }


  if (
    !supplied ||
    !safeCompare(
      supplied,
      expected
    )
  ) {

    console.warn(
      `[SECURITY] Invalid owner/admin access attempt from ${req.ip} on ${req.method} ${req.originalUrl}`
    );

    return res.status(401).json({
      ok: false,
      authenticated: false,
      error: "Admin key required"
    });
  }


  /*
   * Direct ADMIN_KEY access is valid.
   */
  req.isAdmin = true;

  return next();
}


/*
 * All existing Brain Control endpoints use requireAuth.
 *
 * Keep this alias so the rest of the backend does not need
 * to be rewritten.
 */
const requireAuth =
  requireAdmin;

const requireAdminKey =
  requireAdmin;

const requireBrainAccess =
  requireAdmin;

/* -------------------------------------------------------------------------- */
/* TENANT AUTHENTICATION                                                      */
/* -------------------------------------------------------------------------- */

function requireTenant(req, res, next) {
  if (
    req.session?.gridv21Authenticated === true &&
    req.session?.authType === "tenant" &&
    req.session?.userId
  ) {
    req.isTenant = true;
    return next();
  }

  return res.status(401).json({
    ok: false,
    authenticated: false,
    error: "Tenant authentication required"
  });
}

/* -------------------------------------------------------------------------- */
/* ES MODULE PATHS                                                            */
/* -------------------------------------------------------------------------- */

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

/* -------------------------------------------------------------------------- */
/* AUTO-DETECT DASHBOARD FOLDER                                               */
/* -------------------------------------------------------------------------- */

const possibleDashboardPaths = [

  path.join(
    __dirname,
    "dashboard"
  ),

  path.join(
    __dirname,
    "Dashboard"
  ),

  path.join(
    __dirname,
    "public"
  ),

  __dirname
];

const DASHBOARD_DIR =
  possibleDashboardPaths.find(
    p => fs.existsSync(p)
  ) || __dirname;

const PUBLIC_DIR =
  path.join(
    __dirname,
    "public"
  );

/* -------------------------------------------------------------------------- */
/* EXPRESS                                                                    */
/* -------------------------------------------------------------------------- */

const app =
  express();

export const VERSION =
  "6.4.0";

const PORT =
  Number(
    process.env.PORT ||
    3000
  );

const IS_PRODUCTION =
  process.env.NODE_ENV ===
  "production";

/* -------------------------------------------------------------------------- */
/* GRIDV21 BRAIN — CANONICAL 12 INTELLIGENCE OS MODULES                      */
/* -------------------------------------------------------------------------- */

export const OS_MODULES = [

  {
    id: 1,
    name:
      "Executive Intelligence OS",
    layer:
      "Strategy",
    kpis_count:
      12,
    agents_count:
      3
  },

  {
    id: 2,
    name:
      "Revenue Intelligence OS",
    layer:
      "Revenue",
    kpis_count:
      12,
    agents_count:
      4
  },

  {
    id: 3,
    name:
      "Sales & CRM OS",
    layer:
      "Sales",
    kpis_count:
      12,
    agents_count:
      4
  },

  {
    id: 4,
    name:
      "Marketing OS",
    layer:
      "Marketing",
    kpis_count:
      12,
    agents_count:
      4
  },

  {
    id: 5,
    name:
      "Operations OS",
    layer:
      "Operations",
    kpis_count:
      12,
    agents_count:
      4
  },

  {
    id: 6,
    name:
      "Finance OS",
    layer:
      "Finance",
    kpis_count:
      12,
    agents_count:
      3
  },

  {
    id: 7,
    name:
      "Human Capital OS",
    layer:
      "People",
    kpis_count:
      12,
    agents_count:
      3
  },

  {
    id: 8,
    name:
      "Project Management OS",
    layer:
      "Projects",
    kpis_count:
      12,
    agents_count:
      4
  },

  {
    id: 9,
    name:
      "Knowledge OS",
    layer:
      "Knowledge",
    kpis_count:
      12,
    agents_count:
      3
  },

  {
    id: 10,
    name:
      "Legal & Compliance OS",
    layer:
      "Compliance",
    kpis_count:
      12,
    agents_count:
      3
  },

  {
    id: 11,
    name:
      "Supply Chain OS",
    layer:
      "Supply",
    kpis_count:
      12,
    agents_count:
      3
  },

  {
    id: 12,
    name:
      "Acquisition Intelligence OS",
    layer:
      "Acquisition",
    kpis_count:
      12,
    agents_count:
      4
  }

];

/* -------------------------------------------------------------------------- */
/* REQUIRED ENVIRONMENT VARIABLES                                             */
/* -------------------------------------------------------------------------- */

const REQUIRED_ENV = [

  "SUPABASE_URL",

  "SUPABASE_SERVICE_ROLE_KEY",

  "SESSION_SECRET",

  "ADMIN_KEY",

  "FRONTEND_URL"

];

for (
  const key
  of REQUIRED_ENV
) {

  if (
    !process.env[key]
  ) {

    throw new Error(
      `FATAL: ${key} missing from ENV`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* SUPABASE SERVICE CLIENT                                                    */
/* -------------------------------------------------------------------------- */

const supabase =
  createClient(

    process.env.SUPABASE_URL,

    process.env.SUPABASE_SERVICE_ROLE_KEY,

    {
      auth: {

        persistSession:
          false,

        autoRefreshToken:
          false,

        detectSessionInUrl:
          false

      }
    }

  );

/* -------------------------------------------------------------------------- */
/* SUPABASE AUTH CLIENT                                                       */
/* -------------------------------------------------------------------------- */

/*
 * Separate authentication client.
 *
 * It uses the public anon key for sign-in.
 *
 * The service-role key is NEVER sent to the browser.
 */

const supabaseAuth =
  createClient(

    process.env.SUPABASE_URL,

    SUPABASE_ANON_KEY,

    {
      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,

        detectSessionInUrl:
          false
      }
    }

  );

/* -------------------------------------------------------------------------- */
/* STRIPE                                                                     */
/* -------------------------------------------------------------------------- */

const stripe =
  process.env.STRIPE_SECRET_KEY

    ? new Stripe(
        process.env.STRIPE_SECRET_KEY
      )

    : null;

/* -------------------------------------------------------------------------- */
/* REDIS SESSION STORE                                                        */
/* -------------------------------------------------------------------------- */

let redisClient = null;

let sessionStore;

if (
  process.env.REDIS_URL
) {

  try {

    redisClient =
      createRedisClient({
        url:
          process.env.REDIS_URL
      });

    redisClient.on(
      "error",
      error =>
        console.warn(
          `[REDIS] ${error.message}`
        )
    );

    await redisClient.connect();

    sessionStore =
      new RedisStore({
        client:
          redisClient
      });

    console.log(
      "[REDIS] Redis session store enabled"
    );

  } catch (
    error
  ) {

    console.warn(
      `[REDIS] Redis unavailable. Using memory sessions: ${error.message}`
    );

    redisClient =
      null;

    sessionStore =
      undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* ENGINE STATE                                                               */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* SCAN SETTINGS                                                               */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* SOURCES                                                                    */
/* -------------------------------------------------------------------------- */

export const CITIES = [

  {
    name:
      "Austin",

    url:
      "https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=1000",

    type:
      "json"
  },

  {
    name:
      "Chicago",

    url:
      "https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=1000&$order=issue_date%20DESC",

    type:
      "json"
  },

  {
    name:
      "Denver",

    url:
      "https://www.denvergov.org/media/gis/DataCatalog/building_permits/csv/building_permits.csv",

    type:
      "csv"
  }

];

/* -------------------------------------------------------------------------- */
/* END OF PART 1                                                              */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* LOGGING                                                                    */
/* -------------------------------------------------------------------------- */

const logger = {
  info(id, msg) {
    console.log(
      `[INFO ${id} ${new Date().toISOString()}] ${msg}`
    );
  },

  warn(id, msg) {
    console.warn(
      `[WARN ${id} ${new Date().toISOString()}] ${msg}`
    );
  },

  async error(id, msg) {
    console.error(
      `[ERROR ${id} ${new Date().toISOString()}] ${msg}`
    );

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

/* -------------------------------------------------------------------------- */
/* SOUTH AFRICA CONSTRUCTION OPPORTUNITY INTELLIGENCE - PHASE 1              */
/* -------------------------------------------------------------------------- */

export const SA_INTELLIGENCE =
  createSouthAfricaIntelligence({
    supabase,
    logger
  });

morgan.token(
  "id",
  req => req.id || "no-id"
);

/* -------------------------------------------------------------------------- */
/* MIDDLEWARE                                                                 */
/* -------------------------------------------------------------------------- */

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
    contentSecurityPolicy: false
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
    credentials: true
  })
);

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

/* -------------------------------------------------------------------------- */
/* STATIC FRONTEND                                                            */
/* -------------------------------------------------------------------------- */

app.use(
  "/dashboard",
  express.static(DASHBOARD_DIR)
);

app.use(
  express.static(DASHBOARD_DIR)
);

app.get(
  "/dashboard",
  (req, res) => {
    res.redirect(
      308,
      "/dashboard/"
    );
  }
);

app.get(
  "/",
  (req, res) => {
    res.redirect(
      "/dashboard/"
    );
  }
);

/* -------------------------------------------------------------------------- */
/* API RATE LIMIT                                                             */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* SERVER SESSION                                                             */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* PASSPORT                                                                   */
/* -------------------------------------------------------------------------- */

app.use(
  passport.initialize()
);

app.use(
  passport.session()
);

passport.serializeUser(
  (user, done) =>
    done(null, user)
);

passport.deserializeUser(
  (user, done) =>
    done(null, user)
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

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function pick(
  obj,
  keys
) {

  for (
    const key
    of keys
  ) {

    if (
      obj?.[key] !==
        undefined &&

      obj?.[key] !==
        null &&

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

  const n =
    Number(
      String(value)
        .replace(
          /[^0-9.-]/g,
          ""
        )
    );

  return Number.isFinite(n)
    ? n
    : null;
}

function safeText(
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

  return result ||
    null;
}

function parseDate(
  value
) {

  if (!value) {
    return null;
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {

    return null;
  }

  return parsed.toISOString();
}

function hashValue(
  value
) {

  return crypto
    .createHash("sha256")
    .update(
      String(value)
    )
    .digest("hex");
}

/* -------------------------------------------------------------------------- */
/* REQUEST HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function getRequestId(
  req
) {

  return (
    req.id ||
    req.headers["x-request-id"] ||
    crypto.randomUUID()
  );
}

function jsonError(
  res,
  status,
  message,
  extra = {}
) {


  return res.status(
    status
  ).json({
    ok: false,
    error: message,
    ...extra
  });
}

/* -------------------------------------------------------------------------- */
/* ENGINE LOGGING                                                             */
/* -------------------------------------------------------------------------- */

async function logEngineError(
  requestId,
  error
) {

  const message =
    error?.message ||
    String(error);

  ENGINE.errors += 1;

  ENGINE.lastError =
    message;

  await logger.error(
    requestId,
    message
  );
}

/* -------------------------------------------------------------------------- */
/* END OF PART 1                                                              */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* NEXT SECTION CONTINUES AT LINE 762                                         */
/* -------------------------------------------------------------------------- */

Part 1 ends at line 761. The next section starts at line 762, so nothing should be inserted between the two parts.

When you're ready, I will give you STEP 1 — server.js PART 2/5, lines 762–1522.

Ready
STEP 1 — server.js
PART 2 OF 5 — Lines 762–1522

Continue immediately after Part 1. Do not add or remove anything between the parts.

/* -------------------------------------------------------------------------- */
/* SOURCE NORMALIZATION                                                       */
/* -------------------------------------------------------------------------- */

function normalizePermitRecord(
  raw,
  source
) {

  const permitId =
    safeText(
      pick(
        raw,
        [
          "permit_number",
          "permitnumber",
          "permit_id",
          "permitid",
          "application_number",
          "applicationnumber",
          "case_number",
          "casenumber",
          "id"
        ]
      )
    );

  const address =
    safeText(
      pick(
        raw,
        [
          "address",
          "site_address",
          "property_address",
          "street_address",
          "location"
        ]
      )
    );

  const city =
    safeText(
      pick(
        raw,
        [
          "city",
          "municipality",
          "town",
          "jurisdiction"
        ]
      )
    ) ||
    source?.name ||
    null;

  const region =
    safeText(
      pick(
        raw,
        [
          "region",
          "county",
          "province",
          "state"
        ]
      )
    );

  const tradeType =
    safeText(
      pick(
        raw,
        [
          "trade_type",
          "permit_type",
          "permit_type_description",
          "work_type",
          "project_type",
          "description"
        ]
      )
    );

  const status =
    safeText(
      pick(
        raw,
        [
          "status",
          "permit_status",
          "application_status",
          "case_status"
        ]
      )
    ) ||
    "unknown";

  const valueEstimate =
    numberValue(
      pick(
        raw,
        [
          "value_estimate",
          "estimated_value",
          "job_value",
          "project_value",
          "valuation",
          "declared_valuation"
        ]
      )
    );

  const latitude =
    numberValue(
      pick(
        raw,
        [
          "latitude",
          "lat",
          "y"
        ]
      )
    );

  const longitude =
    numberValue(
      pick(
        raw,
        [
          "longitude",
          "lon",
          "lng",
          "x"
        ]
      )
    );

  const receivedDate =
    parseDate(
      pick(
        raw,
        [
          "received_date",
          "application_date",
          "submitted_date",
          "issue_date",
          "created_date"
        ]
      )
    );

  const sourceRecord =
    JSON.stringify(
      raw
    );

  const externalId =
    permitId ||
    hashValue(
      [
        city,
        address,
        tradeType,
        receivedDate,
        sourceRecord
      ].join("|")
    );

  return {

    source:
      source?.name ||
      null,

    external_id:
      externalId,

    permit_id:
      permitId,

    address,

    city,

    region,

    trade_type:
      tradeType,

    status,

    value_estimate:
      valueEstimate,

    latitude,

    longitude,

    received_date:
      receivedDate,

    raw_data:
      raw

  };
}

/* -------------------------------------------------------------------------- */
/* SOURCE REQUEST                                                             */
/* -------------------------------------------------------------------------- */

async function fetchSource(
  source,
  requestId
) {

  const started =
    Date.now();

  try {

    logger.info(
      requestId,
      `Fetching source ${source.name}`
    );

    const response =
      await axios.get(
        source.url,
        {
          timeout:
            SCAN_SETTINGS.requestTimeout,

          responseType:
            source.type === "csv"
              ? "text"
              : "json",

          headers: {
            "User-Agent":
              "GRIDV21-BRAIN/6.4.0"
          }
        }
      );

    let records = [];

    if (
      source.type ===
      "csv"
    ) {

      const parsed =
        Papa.parse(
          response.data,
          {
            header:
              true,

            skipEmptyLines:
              true,

            dynamicTyping:
              true
          }
        );

      records =
        parsed.data ||
        [];

    } else if (
      Array.isArray(
        response.data
      )
    ) {

      records =
        response.data;

    } else if (
      Array.isArray(
        response.data?.data
      )
    ) {

      records =
        response.data.data;

    } else if (
      Array.isArray(
        response.data?.results
      )
    ) {

      records =
        response.data.results;

    } else {

      records =
        response.data
          ? [response.data]
          : [];
    }

    const duration =
      Date.now() -
      started;

    logger.info(
      requestId,
      `Source ${source.name} returned ${records.length} records in ${duration}ms`
    );

    return records;

  } catch (
    error
  ) {

    await logEngineError(
      requestId,
      error
    );

    logger.warn(
      requestId,
      `Source ${source.name} failed: ${error.message}`
    );

    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* SCAN DATABASE HELPERS                                                      */
/* -------------------------------------------------------------------------- */

async function insertPermit(
  record,
  requestId
) {

  try {

    const {
      data,
      error
    } =
      await supabase
        .from("permits")
        .upsert(
          {
            source:
              record.source,

            permit_id:
              record.permit_id,

            address:
              record.address,

            city:
              record.city,

            region:
              record.region,

            trade_type:
              record.trade_type,

            status:
              record.status,

            value_estimate:
              record.value_estimate,

            latitude:
              record.latitude,

            longitude:
              record.longitude,

            received_date:
              record.received_date,

            raw_data:
              record.raw_data
          },
          {
            onConflict:
              "source,permit_id"
          }
        )
        .select()
        .maybeSingle();

    if (error) {

      await logger.error(
        requestId,
        `Permit insert failed: ${error.message}`
      );

      return {
        success:
          false,

        error:
          error.message
      };
    }

    return {
      success:
        true,

      data
    };

  } catch (
    error
  ) {

    await logEngineError(
      requestId,
      error
    );

    return {
      success:
        false,

      error:
        error.message
    };
  }
}

/* -------------------------------------------------------------------------- */
/* SCAN ENGINE                                                                */
/* -------------------------------------------------------------------------- */

export async function runScan(
  options = {}
) {

  const requestId =
    options.requestId ||
    crypto.randomUUID();

  if (
    ENGINE.scanning
  ) {

    return {
      success:
        false,

      alreadyRunning:
        true,

      message:
        "Scan already running",

      requestId
    };
  }

  if (
    ENGINE.emergencyStopped
  ) {

    return {
      success:
        false,

      emergencyStopped:
        true,

      message:
        "Acquisition engine emergency stopped",

      requestId
    };
  }

  ENGINE.scanning =
    true;

  const started =
    Date.now();

  let permitsFound =
    0;

  let inserted =
    0;

  let failed =
    0;

  try {

    logger.info(
      requestId,
      "Starting acquisition scan"
    );

    for (
      const source
      of CITIES
    ) {

      if (
        ENGINE.emergencyStopped
      ) {

        break;
      }

      const records =
        await fetchSource(
          source,
          requestId
        );

      permitsFound +=
        records.length;

      for (
        const raw
        of records
      ) {

        if (
          ENGINE.emergencyStopped
        ) {

          break;
        }

        const normalized =
          normalizePermitRecord(
            raw,
            source
          );

        const result =
          await insertPermit(
            normalized,
            requestId
          );

        if (
          result.success
        ) {

          inserted +=
            1;

        } else {

          failed +=
            1;
        }

        if (
          SCAN_SETTINGS.requestDelay
        ) {

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                SCAN_SETTINGS.requestDelay
              )
          );
        }
      }
    }

    ENGINE.permitsFound =
      permitsFound;

    ENGINE.lastScan =
      new Date().toISOString();

    ENGINE.lastScanDuration =
      Date.now() -
      started;

    logger.info(
      requestId,
      `Acquisition scan completed. Found=${permitsFound}, inserted=${inserted}, failed=${failed}`
    );

    return {

      success:
        true,

      requestId,

      permitsFound,

      inserted,

      failed,

      duration:
        ENGINE.lastScanDuration,

      timestamp:
        ENGINE.lastScan

    };

  } catch (
    error
  ) {

    await logEngineError(
      requestId,
      error
    );

    return {

      success:
        false,

      requestId,

      error:
        error.message,

      permitsFound,

      inserted,

      failed,

      duration:
        Date.now() -
        started

    };

  } finally {

    ENGINE.scanning =
      false;
  }
}

/* -------------------------------------------------------------------------- */
/* ACQUISITION CRON                                                           */
/* -------------------------------------------------------------------------- */

cron.schedule(
  SCAN_SETTINGS.cron,
  async () => {

    if (
      ENGINE.scanning ||
      ENGINE.emergencyStopped
    ) {

      return;
    }

    try {

      await runScan({
        requestId:
          crypto.randomUUID()
      });

    } catch (
      error
    ) {

      await logEngineError(
        crypto.randomUUID(),
        error
      );
    }
  }
);

/* -------------------------------------------------------------------------- */
/* HEALTH                                                                     */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/health",
  async (
    req,
    res
  ) => {

    return res.json({

      ok:
        true,

      version:
        VERSION,

      engine:
        ENGINE.running,

      scanning:
        ENGINE.scanning,

      emergencyStopped:
        ENGINE.emergencyStopped,

      uptime:
        Date.now() -
        ENGINE.uptime,

      timestamp:
        new Date().toISOString()

    });
  }
);

/* -------------------------------------------------------------------------- */
/* TEST                                                                       */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/test",
  requireAuth,
  (
    req,
    res
  ) => {

    res.json({

      success:
        true,

      version:
        VERSION,

      engine:
        "GRIDV21 BRAIN ENTERPRISE",

      authentication:
        "owner",

      os_modules:
        OS_MODULES.length,

      timestamp:
        new Date().toISOString()

    });
  }
);

/* -------------------------------------------------------------------------- */
/* AUTH — CURRENT USER                                                        */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/auth/me",
  requireAuth,
  (
    req,
    res
  ) => {

    res.json({

      authenticated:
        true,

      authType:
        "admin_key",

      role:
        "owner",

      userId:
        "owner",

      email:
        null

    });
  }
);

/* -------------------------------------------------------------------------- */
/* AUTH — OWNER LOGIN                                                         */
/* -------------------------------------------------------------------------- */

app.post(
  "/api/auth/admin",
  (
    req,
    res
  ) => {

    const supplied =
      String(
        req.body?.admin_key ||
        req.body?.key ||
        ""
      ).trim();

    const expected =
      process.env.ADMIN_KEY ||
      "";

    if (
      !expected ||
      !supplied ||
      !safeCompare(
        supplied,
        expected
      )
    ) {

      return res.status(
        401
      ).json({

        success:
          false,

        authenticated:
          false,

        error:
          "Invalid admin key"

      });
    }

    req.session.regenerate(
      sessionError => {

        if (
          sessionError
        ) {

          return res.status(
            500
          ).json({

            success:
              false,

            error:
              "Unable to create session"

          });
        }

        req.session.gridv21Authenticated =
          true;

        req.session.authType =
          "admin_key";

        req.session.userRole =
          "owner";

        req.session.userId =
          "owner";

        req.session.save(
          saveError => {

            if (
              saveError
            ) {

              return res.status(
                500
              ).json({

                success:
                  false,

                error:
                  "Unable to save session"

              });
            }

            return res.json({

              success:
                true,

              authenticated:
                true,

              authType:
                "admin_key",

              role:
                "owner"

            });
          }
        );
      }
    );
  }
);

/* -------------------------------------------------------------------------- */
/* AUTH — TENANT LOGIN                                                        */
/* -------------------------------------------------------------------------- */

app.post(
  "/api/auth/login",
  async (
    req,
    res
  ) => {

    const email =
      safeText(
        req.body?.email
      );

    const password =
      String(
        req.body?.password ||
        ""
      );

    if (
      !email ||
      !password
    ) {

      return res.status(
        400
      ).json({

        success:
          false,

        authenticated:
          false,

        error:
          "Email and password are required"

      });
    }

    if (
      !SUPABASE_ANON_KEY
    ) {

      return res.status(
        500
      ).json({

        success:
          false,

        authenticated:
          false,

        error:
          "SUPABASE_ANON_KEY is not configured"

      });
    }

    try {

      const {
        data,
        error
      } =
        await supabaseAuth.auth.signInWithPassword({
          email,
          password
        });

      if (
        error ||
        !data?.user
      ) {

        console.warn(
          `[AUTH] Login failed for ${email}: ${error?.message || "Invalid credentials"}`
        );

        return res.status(
          401
        ).json({

          success:
            false,

          authenticated:
            false,

          error:
            error?.message ||
            "Invalid email or password"

        });
      }

      const user =
        data.user;

      /*
       * Tenant sessions are intentionally distinct from owner sessions.
       */

      req.session.regenerate(
        sessionError => {

          if (
            sessionError
          ) {

            console.error(
              `[AUTH] Session regeneration failed: ${sessionError.message}`
            );

            return res.status(
              500
            ).json({

              success:
                false,

              authenticated:
                false,

              error:
                "Unable to create session"

            });
          }

          req.session.gridv21Authenticated =
            true;

          req.session.authType =
            "tenant";

          req.session.userRole =
            "tenant";

          req.session.userId =
            user.id;

          req.session.email =
            user.email;

          req.session.save(
            saveError => {

              if (
                saveError
              ) {

                console.error(
                  `[AUTH] Session save failed: ${saveError.message}`
                );

                return res.status(
                  500
                ).json({

                  success:
                    false,

                  authenticated:
                    false,

                  error:
                    "Unable to save session"

                });
              }

              return res.json({

                success:
                  true,

                authenticated:
                  true,

                authType:
                  "tenant",

                role:
                  "tenant",

                userId:
                  user.id,

                email:
                  user.email

              });
            }
          );
        }
      );

    } catch (
      error
    ) {

      console.error(
        `[AUTH] Unexpected login error: ${error.message}`
      );

      return res.status(
        500
      ).json({

        success:
          false,

        authenticated:
          false,

        error:
          "Authentication service error"

      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* AUTH — TENANT CURRENT USER                                                 */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/auth/tenant/me",
  requireTenant,
  async (
    req,
    res
  ) => {

    return res.json({

      success:
        true,

      authenticated:
        true,

      authType:
        "tenant",

      role:
        "tenant",

      userId:
        req.session.userId,

      email:
        req.session.email ||
        null

    });
  }
);

/* -------------------------------------------------------------------------- */
/* AUTH — LOGOUT               

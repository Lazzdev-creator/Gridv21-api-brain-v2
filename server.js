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

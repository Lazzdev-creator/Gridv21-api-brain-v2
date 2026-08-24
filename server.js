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
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdGpneXJwaHJ4ZXE" +
  "QaiJicGZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MTgxNjEsImV4cCI6MjA5MzE5NDE2MX0.sL1_y9VjvppM06p8DG5rybOLvROPuMyhYv4KG5IXhSw";

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
  "6.3.6";

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
          /[$,]/g,
          ""
        )
        .replace(
          /[^0-9.-]/g,
          ""
        )
    );

  return Number.isFinite(n)
    ? n
    : null;
}

function dateValue(
  value
) {

  if (!value) {
    return null;
  }

  const d =
    new Date(value);

  return Number.isNaN(
    d.getTime()
  )
    ? null
    : d.toISOString();
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

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeJson(
  value
) {

  try {

    return value == null
      ? {}
      : JSON.parse(
          JSON.stringify(value)
        );

  } catch (_) {

    return {};
  }
}

/* -------------------------------------------------------------------------- */
/* LEAD SCORING                                                               */
/* -------------------------------------------------------------------------- */

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

  const work =
    String(
      permit.work_type ||
      ""
    ).toLowerCase();

  const description =
    String(
      permit.work_description ||
      ""
    ).toLowerCase();

  const value =
    Number(
      permit.estimated_value ||
      0
    );

  const text =
    `${type} ${work} ${description}`;

  if (
    text.includes(
      "commercial"
    )
  ) {
    score += 25;
  }

  if (
    text.includes(
      "building"
    ) ||
    text.includes(
      "construction"
    )
  ) {
    score += 10;
  }

  if (
    text.includes(
      "remodel"
    ) ||
    text.includes(
      "renovation"
    ) ||
    text.includes(
      "alteration"
    )
  ) {
    score += 8;
  }

  if (
    text.includes(
      "restaurant"
    ) ||
    text.includes(
      "retail"
    ) ||
    text.includes(
      "office"
    )
  ) {
    score += 5;
  }

  if (
    value >= 1000000
  ) {
    score += 20;

  } else if (
    value >= 500000
  ) {
    score += 15;

  } else if (
    value >= 100000
  ) {
    score += 10;
  }

  return Math.min(
    100,
    score
  );
}

/* -------------------------------------------------------------------------- */
/* ADDRESS NORMALISATION                                                      */
/* -------------------------------------------------------------------------- */

function addressFromRaw(
  city,
  raw
) {

  if (
    city ===
    "Chicago"
  ) {

    const number =
      pick(
        raw,
        [
          "street_number"
        ]
      );

    const direction =
      pick(
        raw,
        [
          "street_direction"
        ]
      );

    const street =
      pick(
        raw,
        [
          "street_name"
        ]
      );

    const type =
      pick(
        raw,
        [
          "street_type"
        ]
      );

    const zip =
      pick(
        raw,
        [
          "zip_code",
          "zipcode",
          "zip"
        ]
      );

    const base =
      [
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
      .join(", ") ||
      null;
  }

  if (
    city ===
    "Austin"
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
      ),

      pick(
        raw,
        [
          "zip",
          "zipcode",
          "zip_code"
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
        "address_line_1",
        "street_address"
      ]
    )
  );
}

/* -------------------------------------------------------------------------- */
/* PERMIT MAPPING                                                             */
/* -------------------------------------------------------------------------- */

function mapPermitData(
  cityName,
  raw
) {

  const permitId =
    normalizeText(
      pick(
        raw,
        [
          "permit_",
          "permit_id",
          "permit_num",
          "permit_number",
          "permitnum",
          "id",
          "permit",
          "record_id"
        ]
      )
    );

  const permitType =
    normalizeText(
      pick(
        raw,
        [
          "permit_type_definition",
          "permit_type_desc",
          "permit_type",
          "permit_type_name",
          "type",
          "work_type"
        ]
      )
    );

  const status =
    normalizeText(
      pick(
        raw,
        [
          "permit_status",
          "status_current",
          "status",
          "current_status"
        ]
      )
    );

  const issuedDate =
    dateValue(
      pick(
        raw,
        [
          "issue_date",
          "issued_date",
          "Issue Date",
          "issued",
          "application_date"
        ]
      )
    );

  const applicationDate =
    dateValue(
      pick(
        raw,
        [
          "application_start_date",
          "application_date",
          "application_date_start"
        ]
      )
    );

  const valuation =
    numberValue(
      pick(
        raw,
        [
          "reported_cost",
          "estimated_value",
          "estimated_cost",
          "total_job_valuation",
          "valuation",
          "job_value",
          "declared_valuation"
        ]
      )
    );

  const address =
    addressFromRaw(
      cityName,
      raw
    );

  const workDescription =
    normalizeText(
      pick(
        raw,
        [
          "work_description",
          "description",
          "work_desc",
          "project_description"
        ]
      )
    );

  const workType =
    normalizeText(
      pick(
        raw,
        [
          "work_type",
          "construction_type",
          "job_type"
        ]
      )
    );

  const reviewType =
    normalizeText(
      pick(
        raw,
        [
          "review_type"
        ]
      )
    );

  const milestone =
    normalizeText(
      pick(
        raw,
        [
          "permit_milestone"
        ]
      )
    );

  const condition =
    normalizeText(
      pick(
        raw,
        [
          "permit_condition"
        ]
      )
    );

  const contractorName =
    normalizeText(
      pick(
        raw,
        [
          "contractor_name",
          "contact_1_name",
          "contact_2_name"
        ]
      )
    );

  const applicantName =
    normalizeText(
      pick(
        raw,
        [
          "applicant_name",
          "applicant"
        ]
      )
    );

  const ownerName =
    normalizeText(
      pick(
        raw,
        [
          "owner_name",
          "owner"
        ]
      )
    );

  const contractorLicense =
    normalizeText(
      pick(
        raw,
        [
          "contractor_license",
          "contact_1_license",
          "license_number"
        ]
      )
    );

  const latitude =
    numberValue(
      pick(
        raw,
        [
          "latitude",
          "lat"
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
          "lng"
        ]
      )
    );

  const processingTime =
    numberValue(
      pick(
        raw,
        [
          "processing_time"
        ]
      )
    );

  const streetNumber =
    normalizeText(
      pick(
        raw,
        [
          "street_number"
        ]
      )
    );

  const streetDirection =
    normalizeText(
      pick(
        raw,
        [
          "street_direction"
        ]
      )
    );

  const streetName =
    normalizeText(
      pick(
        raw,
        [
          "street_name"
        ]
      )
    );

  const postalCode =
    normalizeText(
      pick(
        raw,
        [
          "zip_code",
          "zipcode",
          "zip",
          "postal_code"
        ]
      )
    );

  const stableSource =
    JSON.stringify({
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

  const generatedId =
    `${cityName.toLowerCase()}-${crypto
      .createHash("sha1")
      .update(stableSource)
      .digest("hex")
      .slice(0, 20)}`;

  const base = {

    city:
      cityName,

    permit_type:
      permitType,

    status,

    issued_date:
      issuedDate,

    application_start_date:
      applicationDate,

    permit_id:
      permitId ||
      generatedId,

    ai_confidence:
      0,

    ai_enriched:
      false,

    estimated_value:
      valuation,

    ai_score:
      0,

    address,

    permit_milestone:
      milestone,

    review_type:
      reviewType,

    processing_time:
      processingTime,

    work_type:
      workType,

    work_description:
      workDescription,

    permit_condition:
      condition,

    contractor_name:
      contractorName,

    contractor_license:
      contractorLicense,

    applicant_name:
      applicantName,

    owner_name:
      ownerName,

    street_number:
      streetNumber,

    street_direction:
      streetDirection,

    street_name:
      streetName,

    postal_code:
      postalCode,

    latitude,

    longitude,

    source_url:
      CITIES.find(
        c =>
          c.name ===
          cityName
      )?.url ||
      null,

    raw_data:
      safeJson(raw)
  };

  const score =
    scoreLead({
      ...base,
      estimated_value:
        valuation || 0
    });

  return {
    ...base,

    ai_score:
      score,

    ai_confidence:
      Number(
        (
          0.70 +
          Math.min(
            score,
            100
          ) /
            333
        ).toFixed(2)
      ),

    ai_enriched:
      true
  };
}

/* -------------------------------------------------------------------------- */
/* AI ENGINE                                                                  */
/* -------------------------------------------------------------------------- */

export const AI_ENGINE = {

  async enrichPermit(
    permit
  ) {

    const score =
      scoreLead(
        permit
      );

    return {
      ...permit,

      ai_enriched:
        true,

      ai_confidence:
        Number(
          (
            0.70 +
            Math.min(
              score,
              100
            ) /
              333
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

    const value =
      Number(
        permit.estimated_value ||
        0
      );

    return Number(
      (
        value *
        0.03
      ).toFixed(2)
    );
  }
};

/* -------------------------------------------------------------------------- */
/* OS DATABASE SYNCHRONIZATION                                                */
/* -------------------------------------------------------------------------- */

async function syncOSModules() {

  try {

    const payload =
      OS_MODULES.map(
        module => ({
          id:
            module.id,

          name:
            module.name,

          status:
            "active",

          kpis_count:
            module.kpis_count,

          agents_count:
            module.agents_count,

          layer:
            module.layer,

          enabled:
            true
        })
      );

    const {
      error
    } = await supabase
      .from(
        "os_modules"
      )
      .upsert(
        payload,
        {
          onConflict:
            "id"
        }
      );

    if (error) {
      throw error;
    }

    const {
      error:
        cleanupError
    } = await supabase
      .from(
        "os_modules"
      )
      .delete()
      .gt(
        "id",
        OS_MODULES.length
      );

    if (
      cleanupError
    ) {
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
  eventType =
    "system",

  action =
    "activity",

  message =
    "",

  status =
    "success",

  permitId =
    null,

  city =
    null,

  metadata =
    {}
} = {}) {

  try {

    const {
      error
    } = await supabase
      .from(
        "os_activity_logs"
      )
      .insert({
        event_type:
          eventType,

        action,

        message:
          String(
            message
          ).slice(
            0,
            5000
          ),

        status,

        permit_id:
          permitId,

        city,

        metadata:
          safeJson(
            metadata
          )
      });

    if (error) {

      if (
        !/relation .*os_activity_logs.* does not exist/i.test(
          error.message ||
          ""
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

async function getActivity(
  limit = 100
) {

  const primary =
    await supabase
      .from(
        "os_activity_logs"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending:
            false
        }
      )
      .limit(
        limit
      );

  if (
    !primary.error
  ) {

    return (
      primary.data ||
      []
    );
  }

  const fallback =
    await supabase
      .from(
        "audit_logs"
      )
      .select("*")
      .order(
        "timestamp",
        {
          ascending:
            false
        }
      )
      .limit(
        limit
      );

  if (
    fallback.error
  ) {

    return [];
  }

  return (
    fallback.data ||
    []
  ).map(
    row => ({
      id:
        row.id,

      event_type:
        "audit",

      action:
        "error",

          message:
          row.message,

        status:
          row.level ||
          "error",

        created_at:
          row.timestamp,

        metadata: {
          request_id:
            row.request_id
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

/* -------------------------------------------------------------------------- */
/* SUPABASE BATCH INSERT                                                      */
/* -------------------------------------------------------------------------- */

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
    i += SCAN_SETTINGS.batchSize
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
        .insert(batch);

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

/* -------------------------------------------------------------------------- */
/* INSERT NEW PERMITS                                                         */
/* -------------------------------------------------------------------------- */

async function insertNewPermits(
  rows
) {

  if (
    !rows.length
  ) {

    return {

      inserted:
        0,

      skipped:
        0,

      updated:
        0

    };

  }

  /*
   * Keep one record per source permit.
   *
   * Existing records are refreshed with the newly-normalized
   * detailed fields.
   */

  let inserted =
    0;

  let skipped =
    0;

  let updated =
    0;

  for (
    let i = 0;
    i < rows.length;
    i += SCAN_SETTINGS.batchSize
  ) {

    const batch =
      rows.slice(
        i,
        i +
          SCAN_SETTINGS.batchSize
      );

    for (
      const permit
      of batch
    ) {

      try {

        const {
          data:
            existing,
          error:
            lookupError
        } =
          await supabase
            .from("permits")
            .select("id")
            .eq(
              "permit_id",
              permit.permit_id
            )
            .maybeSingle();

        if (
          lookupError
        ) {

          throw lookupError;

        }

        if (
          existing?.id
        ) {

          const {
            error:
              updateError
          } =
            await supabase
              .from("permits")
              .update(
                permit
              )
              .eq(
                "id",
                existing.id
              );

          if (
            updateError
          ) {

            throw updateError;

          }

          updated++;

        } else {

          const {
            error:
              insertError
          } =
            await supabase
              .from("permits")
              .insert(
                permit
              );

          if (
            insertError
          ) {

            /*
             * Ignore duplicate races.
             */

            if (
              /duplicate|unique/i.test(
                insertError.message ||
                ""
              )
            ) {

              skipped++;

            } else {

              throw insertError;

            }

          } else {

            inserted++;

          }

        }

      } catch (
        error
      ) {

        skipped++;

        console.warn(
          `[PERMIT] Failed ${permit.permit_id}: ${error.message}`
        );

      }

    }

  }

  return {

    inserted,

    skipped,

    updated

  };

}

/* -------------------------------------------------------------------------- */
/* PARSE SOURCE DATA                                                          */
/* -------------------------------------------------------------------------- */

function parseSourceData(
  city,
  raw
) {

  if (
    city === "Denver"
  ) {

    try {

      const parsed =
        Papa.parse(
          raw,
          {
            header:
              true,

            skipEmptyLines:
              true
          }
        );

      return (
        parsed.data ||
        []
      );

    } catch (
      error
    ) {

      throw new Error(
        `CSV parsing failed: ${error.message}`
      );

    }

  }

  if (
    typeof raw ===
    "string"
  ) {

    try {

      return JSON.parse(
        raw
      );

    } catch (
      error
    ) {

      throw new Error(
        `JSON parsing failed for ${city}: ${error.message}`
      );

    }

  }

  return (
    raw || []
  );

}

/* -------------------------------------------------------------------------- */
/* CITY SCANNER                                                               */
/* -------------------------------------------------------------------------- */

async function scanCity(
  city,
  requestId,
  signal
) {

  const started =
    Date.now();

  try {

    const raw =
      await axiosWithAbort(
        city.url,
        requestId,
        signal
      );

    const sourceRows =
      parseSourceData(
        city.name,
        raw
      );

    const rows =
      sourceRows
        .map(
          item =>
            mapPermitData(
              city.name,
              item
            )
        )
        .filter(
          permit =>
            permit &&
            permit.permit_id
        );

    const result =
      await insertNewPermits(
        rows
      );

    await logActivity({

      eventType:
        "scanner",

      action:
        "city_scan",

      message:
        `${city.name}: ${rows.length} permits processed`,

      status:
        "success",

      city:
        city.name,

      metadata: {

        source_rows:
          sourceRows.length,

        processed:
          rows.length,

        inserted:
          result.inserted,

        updated:
          result.updated,

        skipped:
          result.skipped,

        duration_ms:
          Date.now() -
          started

      }

    });

    return {

      city:
        city.name,

      fetched:
        sourceRows.length,

      processed:
        rows.length,

      inserted:
        result.inserted,

      updated:
        result.updated,

      skipped:
        result.skipped

    };

  } catch (
    error
  ) {

    await logActivity({

      eventType:
        "scanner",

      action:
        "city_scan_error",

      message:
        `${city.name}: ${error.message}`,

      status:
        "error",

      city:
        city.name,

      metadata: {

        request_id:
          requestId

      }

    });

    throw error;

  }

}

/* -------------------------------------------------------------------------- */
/* SCAN ALL CITIES                                                            */
/* -------------------------------------------------------------------------- */

let scanPromise =
  null;

let currentScanAbortController =
  null;

async function scanAllCities(
  requestId =
    crypto.randomUUID()
) {

  if (
    ENGINE.scanning
  ) {

    return {

      ok:
        false,

      error:
        "Scan already running"

    };

  }

  if (
    ENGINE.emergencyStopped
  ) {

    return {

      ok:
        false,

      error:
        "Emergency stop is active"

    };

  }

  ENGINE.scanning =
    true;

  ENGINE.lastError =
    null;

  const started =
    Date.now();

  currentScanAbortController =
    new AbortController();

  const signal =
    currentScanAbortController
      .signal;

  try {

    await logActivity({

      eventType:
        "scanner",

      action:
        "scan_started",

      message:
        "GRIDV21 scanner started",

      metadata: {

        request_id:
          requestId,

        cities:
          CITIES.map(
            city =>
              city.name
          )

      }

    });

    const results =
      [];

    for (
      const city
      of CITIES
    ) {

      if (
        signal.aborted
      ) {

        throw new Error(
          "Scan aborted"
        );

      }

      if (
        ENGINE.emergencyStopped
      ) {

        throw new Error(
          "Emergency stop is active"
        );

      }

      try {

        const result =
          await scanCity(
            city,
            requestId,
            signal
          );

        results.push(
          result
        );

      } catch (
        error
      ) {

        ENGINE.errors++;

        ENGINE.lastError =
          error.message;

        console.error(
          `[SCAN] ${city.name}: ${error.message}`
        );

      }

      await sleep(
        SCAN_SETTINGS.requestDelay
      );

    }

    ENGINE.lastScan =
      new Date().toISOString();

    ENGINE.lastScanDuration =
      Date.now() -
      started;

    ENGINE.permitsFound =
      results.reduce(
        (
          total,
          item
        ) =>
          total +
          safeNumber(
            item.processed
          ),
        0
      );

    await logActivity({

      eventType:
        "scanner",

      action:
        "scan_completed",

      message:
        `GRIDV21 scanner completed: ${ENGINE.permitsFound} permits processed`,

      status:
        "success",

      metadata: {

        request_id:
          requestId,

        duration_ms:
          ENGINE.lastScanDuration,

        results

      }

    });

    return {

      ok:
        true,

      results,

      permits_found:
        ENGINE.permitsFound,

      duration:
        ENGINE.lastScanDuration

    };

  } catch (
    error
  ) {

    ENGINE.errors++;

    ENGINE.lastError =
      error.message;

    await logActivity({

      eventType:
        "scanner",

      action:
        "scan_failed",

      message:
        error.message,

      status:
        "error",

      metadata: {

        request_id:
          requestId

      }

    });

    return {

      ok:
        false,

      error:
        error.message

    };

  } finally {

    ENGINE.scanning =
      false;

    currentScanAbortController =
      null;

  }

}

/* -------------------------------------------------------------------------- */
/* END OF THIS CONTINUATION                                                   */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* FINAL AUTH + SERVER STARTUP                                                */
/* -------------------------------------------------------------------------- */

/*
 * IMPORTANT:
 * This section completes the GRIDV21 authentication flow.
 *
 * Login:
 *   login.html
 *        ↓
 *   POST /api/auth/login
 *        ↓
 *   Supabase Auth
 *        ↓
 *   Server session created
 *        ↓
 *   Dashboard access
 */

/* -------------------------------------------------------------------------- */
/* AUTH LOGIN                                                                 */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* AUTHENTICATION RATE LIMITER                                                */
/* -------------------------------------------------------------------------- */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 10,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    ok: false,
    authenticated: false,
    error:
      "Too many login attempts. Please try again later."
  }
});

app.post(
  "/api/auth/login",
  authLimiter,
  async (req, res) => {

    try {

      const email =
        String(
          req.body?.email ||
          ""
        )
        .trim()
        .toLowerCase();

      const password =
        String(
          req.body?.password ||
          ""
        );

      if (
        !email ||
        !password
      ) {

        return res.status(400).json({
          ok: false,
          authenticated: false,
          error:
            "Email and password are required."
        });

      }

      /*
       * Authenticate directly against Supabase.
       */

      const {
        data,
        error
      } =
        await supabaseAuth.auth.signInWithPassword({
          email,
          password
        });

      if (error) {

        console.warn(
          `[AUTH] Login failed for ${email}: ${error.message}`
        );

        return res.status(401).json({
          ok: false,
          authenticated: false,
          error:
            "Invalid email or password."
        });

      }

      if (
        !data ||
        !data.user
      ) {

        return res.status(401).json({
          ok: false,
          authenticated: false,
          error:
            "Authentication failed."
        });

      }

      /*
       * Regenerate the session after successful authentication.
       *
       * This prevents session fixation.
       */

      req.session.regenerate(
        (sessionError) => {

          if (sessionError) {

            console.error(
              "[AUTH] Session regeneration failed:",
              sessionError
            );

            return res.status(500).json({
              ok: false,
              authenticated: false,
              error:
                "Could not create secure session."
            });

          }

          /*
 * TENANT SESSION
 *
 * Email/password authentication is for tenants.
 * It does NOT create an owner/admin session.
 */

req.session.gridv21Authenticated =
  true;

req.session.authType =
  "tenant";

req.session.userId =
  data.user.id;

req.session.userEmail =
  data.user.email;

req.session.userRole =
  "tenant";

req.session.authenticatedAt =
  new Date().toISOString();

          /*
           * Save before responding.
           */

          req.session.save(
            (saveError) => {

              if (saveError) {

                console.error(
                  "[AUTH] Session save failed:",
                  saveError
                );

                return res.status(500).json({
                  ok: false,
                  authenticated: false,
                  error:
                    "Could not save authentication session."
                });

              }

              console.log(
                `[AUTH] Successful GRIDV21 login: ${data.user.email}`
              );

              return res.json({

                ok: true,

                authenticated:
                  true,

                message:
                  "Authentication successful.",

                user: {
  id:
    data.user.id,

  email:
    data.user.email,

  role:
    "tenant"
},

authType:
  "tenant"
                
              });

            }
          );

        }
      );

    } catch (error) {

      console.error(
        "[AUTH] Login exception:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          false,

        error:
          "Authentication service unavailable."

      });

    }

  }
);

/* -------------------------------------------------------------------------- */
/* OWNER ADMIN-KEY VERIFICATION                                               */
/* -------------------------------------------------------------------------- */

/*
 * This endpoint is ONLY for the GRIDV21 owner/admin.
 *
 * It is completely separate from tenant email/password authentication.
 */

app.post(
  "/api/auth/verify",
  authLimiter,
  (req, res) => {

    try {

      const supplied =
        getAdminKey(req);

      const expected =
        process.env.ADMIN_KEY ||
        ADMIN_KEY ||
        "";


      if (!expected) {

        console.error(
          "[ADMIN AUTH] ADMIN_KEY is missing."
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
          `[ADMIN AUTH] Invalid admin key attempt from ${req.ip}`
        );

        return res.status(401).json({
          ok: false,
          authenticated: false,
          error: "Invalid admin key"
        });
      }


      /*
       * Regenerate the session so the owner session
       * cannot inherit a previous tenant session.
       */
      req.session.regenerate(
        sessionError => {

          if (sessionError) {

            console.error(
              "[ADMIN AUTH] Session regeneration failed:",
              sessionError
            );

            return res.status(500).json({
              ok: false,
              authenticated: false,
              error:
                "Could not create secure admin session."
            });
          }


          /*
           * OWNER SESSION
           */
          req.session.gridv21Authenticated =
            true;

          req.session.authType =
            "admin_key";

          req.session.userId =
            null;

          req.session.userEmail =
            null;

          req.session.userRole =
            "owner";

          req.session.authenticatedAt =
            new Date().toISOString();


          req.session.save(
            saveError => {

              if (saveError) {

                console.error(
                  "[ADMIN AUTH] Session save failed:",
                  saveError
                );

                return res.status(500).json({
                  ok: false,
                  authenticated: false,
                  error:
                    "Could not save admin session."
                });
              }


              console.log(
                "[ADMIN AUTH] Owner session established."
              );


              return res.json({
                ok: true,
                authenticated: true,
                authType: "admin_key",
                role: "owner",
                message:
                  "GRIDV21 owner authentication successful."
              });

            }
          );

        }
      );

    } catch (error) {

      console.error(
        "[ADMIN AUTH] Verification exception:",
        error
      );

      return res.status(500).json({
        ok: false,
        authenticated: false,
        error:
          "Admin authentication service unavailable."
      });
    }
  }
);
/* -------------------------------------------------------------------------- */
/* AUTH SESSION CHECK                                                         */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/auth/me",
  requireAuth,
  (req, res) => {

    return res.json({

      ok:
        true,

      authenticated:
        true,

      authType:
        "admin_key",

      user: {

        id:
          null,

        email:
          null,

        role:
          "owner"
      }
    });

  }
);

/* -------------------------------------------------------------------------- */
/* AUTH LOGOUT                                                               */
/* -------------------------------------------------------------------------- */

app.post(
  "/api/auth/logout",
  (req, res) => {

    req.session.destroy(
      (error) => {

        if (error) {

          console.error(
            "[AUTH] Logout error:",
            error
          );

          return res.status(500).json({
            ok: false,
            error:
              "Logout failed."
          });

        }

        res.clearCookie(
          "gridv21.sid"
        );

        return res.json({

          ok: true,

          authenticated:
            false,

          message:
            "Logged out successfully."

        });

      }
    );

  }
);


/* -------------------------------------------------------------------------- */
/* AUTH STATUS                                                                */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/auth/status",
  (req, res) => {

    return res.json({

      ok: true,

      authenticated:
        req.session?.gridv21Authenticated ===
        true,

      user:
        req.session?.gridv21Authenticated ===
        true
          ? {
              id:
                req.session.userId ||
                null,

              email:
                req.session.userEmail ||
                null,

              role:
                req.session.userRole ||
                "admin"
            }
          : null

    });

  }
);


/* -------------------------------------------------------------------------- */
/* HEALTH                                                                     */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/health",
  async (req, res) => {

    let database =
      "unknown";

    try {

      const {
        error
      } =
        await supabase
          .from("permits")
          .select("id")
          .limit(1);

      database =
        error
          ? "error"
          : "connected";

    } catch (
      error
    ) {

      database =
        "error";

    }

    return res.json({

      ok: true,

      status:
        "online",

      version:
        VERSION,

      database,

      authenticated:
        req.session?.gridv21Authenticated ===
        true,

      uptime:
        Math.floor(
          (
            Date.now() -
            ENGINE.uptime
          ) / 1000
        ),

      engine: {

        running:
          ENGINE.running,

        scanning:
          ENGINE.scanning,

        permitsFound:
          ENGINE.permitsFound,

        errors:
          ENGINE.errors

      }

    });

  }
);


/* -------------------------------------------------------------------------- */
/* DASHBOARD ACCESS                                                           */
/* -------------------------------------------------------------------------- */

app.get(
  "/dashboard.html",
  (req, res) => {

    return res.sendFile(
      path.join(
        PUBLIC_DIR,
        "dashboard.html"
      )
    );

  }
);

        ok: true,

        authenticated
          true,

        version
          VERSION,

        user 

          id
            req.session?.userId ||
            null,

          email
            req.session?.userEmail ||
            null,

          role
            req.session?.userRole ||
            "admin"


        engine 

          running
            ENGINE.running,

          scanning
            ENGINE.scanning,

          lastScan
            ENGINE.lastScan,

          permitsFound
            ENGINE.permitsFound,

          errors
            ENGINE.errors


        osModules
          OS_MODULES


    (error) 

      console.error(
        "[DASHBOARD]",
        error
      );

       res.status(500).json({

        ok: false,

        error:
          "Unable to load dashboard."

      });

    }

  }
);


/* -------------------------------------------------------------------------- */
/* CURRENT USER                                                                */
/* -------------------------------------------------------------------------- */

app.get(
  "/api/auth/me",
  requireAuth,
  (req, res) => {

    return res.json({

      ok: true,

      authenticated:
        true,

      user: {

        id:
          req.session?.userId ||
          null,

        email:
          req.session?.userEmail ||
          null,

        role:
          req.session?.userRole ||
          "admin"

      }

    });

  }
);


/* -------------------------------------------------------------------------- */
/* STATIC FRONTEND                                                            */
/* -------------------------------------------------------------------------- */

/*
 * login.html remains publicly accessible.
 */

app.get(
  "/login.html",
  (req, res) => {

    return res.sendFile(
      path.join(
        PUBLIC_DIR,
        "login.html"
      )
    );

  }
);


/*
 * Dashboard itself should only be returned to an authenticated user.
 */

app.get(
  "/dashboard.html",
  requireAuth,
  (req, res) => {

    return res.sendFile(
      path.join(
        PUBLIC_DIR,
        "dashboard.html"
      )
    );


/* -------------------------------------------------------------------------- */
/* ROOT                                                                       */
/* -------------------------------------------------------------------------- */

app.get(
  "/",
  (req, res) => {

    /*
     * If already authenticated, send dashboard.
     */

    if (
      req.session?.gridv21Authenticated ===
      true
    ) {

      return res.sendFile(
        path.join(
          PUBLIC_DIR,
          "dashboard.html"
        )
      );

    }

    /*
     * Otherwise send login.
     */

    return res.sendFile(
      path.join(
        PUBLIC_DIR,
        "login.html"
      )
    );

  }
);


/* -------------------------------------------------------------------------- */
/* 404 HANDLER                                                                */
/* -------------------------------------------------------------------------- */

app.use(
  (req, res) => {

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {

      return res.status(404).json({

        ok: false,

        error:
          "API endpoint not found."

      });

    }

    return res.status(404).send(
      "GRIDV21 — Page not found."
    );

  }
);


/* -------------------------------------------------------------------------- */
/* GLOBAL ERROR HANDLER                                                       */
/* -------------------------------------------------------------------------- */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "[SERVER ERROR]",
      error
    );

    if (
      res.headersSent
    ) {

      return next(
        error
      );

    }

    return res.status(
      error.status ||
      500
    ).json({

      ok: false,

      error:
        IS_PRODUCTION
          ? "Internal server error."
          : (
              error.message ||
              "Internal server error."
            )

    });

  }
);


/* -------------------------------------------------------------------------- */
/* START SERVER                                                               */
/* -------------------------------------------------------------------------- */

async function startServer() {

  try {

    /*
     * Session middleware must already have been
     * configured before this point.
     */

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log("");
        console.log(
          "=================================================="
        );

        console.log(
          "GRIDV21 BRAIN ENTERPRISE"
        );

        console.log(
          `Version: ${VERSION}`
        );

        console.log(
          `Port: ${PORT}`
        );

        console.log(
          `Environment: ${
            process.env.NODE_ENV ||
            "development"
          }`
        );

        console.log(
          "Authentication: Supabase + server session"
        );

        console.log(
          "Dashboard authentication: ENABLED"
        );

        console.log(
          "=================================================="
        );

      }
    );

  } catch (error) {

    console.error(
      "[STARTUP] Fatal error:",
      error
    );

    process.exit(
      1
    );

  }

}


/* -------------------------------------------------------------------------- */
/* PROCESS ERROR HANDLERS                                                     */
/* -------------------------------------------------------------------------- */

process.on(
  "unhandledRejection",
  (reason) => {

    console.error(
      "[PROCESS] Unhandled rejection:",
      reason
    );

  }
);

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "[PROCESS] Uncaught exception:",
      error
    );

  }
);


/* -------------------------------------------------------------------------- */
/* START                                                                      */
/* -------------------------------------------------------------------------- */

startServer();

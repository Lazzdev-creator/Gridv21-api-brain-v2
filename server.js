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

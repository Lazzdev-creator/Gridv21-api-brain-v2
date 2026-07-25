/******************************************************************************
 * GRIDV21 BRAIN ENTERPRISE v6.3.4 - ENTERPRISE OS
 * OWNER: LAZARUS TAKUDZWA CHENANA
 *
 * FULL BACKEND BUILD
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

const PORT = Number(process.env.PORT || 3000);

const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

/* ==========================================================================
   REQUIRED ENVIRONMENT VARIABLES
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
    throw new Error(`FATAL: ${key} missing from ENV`);
  }
}

/* ==========================================================================
   SUPABASE
========================================================================== */

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

/* ==========================================================================
   OPTIONAL STRIPE
========================================================================== */

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ==========================================================================
   REDIS / SCAN STATE
========================================================================== */

let redisClient = null;

let currentScanAbortController = null;

let scanPromise = null;

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
          level: "error",
          message: String(msg).slice(0, 5000),
          request_id: reqId
        });

    } catch (_) {}
  }

};

/* ==========================================================================
   MORGAN
========================================================================== */

morgan.token(
  "id",
  req => req.id || "no-id"
);

/* ==========================================================================
   CITY SOURCES
========================================================================== */

export const CITIES = [

  {
    name: "Austin",
    url:
      "https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=1000",
    type: "json"
  },

  {
    name: "Chicago",
    url:
      "https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=1000&$order=Issue%20Date%20DESC",
    type: "json"
  },

  {
    name: "Denver",
    url:
      "https://www.denvergov.org/media/gis/DataCatalog/building_permits/csv/building_permits.csv",
    type: "csv"
  }

];

/* ==========================================================================
   SCANNER CONFIG
========================================================================== */

export const SCAN_SETTINGS = {

  batchSize: 100,

  requestDelay: 750,

  requestTimeout: 15000,

  scanTimeout: 600000,

  cron: "*/30 * * * *",

  concurrency: 3

};

/* ==========================================================================
   ENGINE STATE
========================================================================== */

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

/* ==========================================================================
   AI ENGINE
========================================================================== */

export const AI_ENGINE = {

  async enrichPermit(permit) {

    const estimatedValue =
      Number(permit.estimated_value || 25000);

    const score =
      scoreLead(permit);

    return {

      ...permit,

      ai_enriched: true,

      estimated_value:
        estimatedValue,

      ai_confidence:
        Number(
          (
            0.70 +
            Math.min(score, 100) / 333
          ).toFixed(2)
        ),

      ai_score:
        score,

      ai_note:
        "GRIDV21 heuristic AI engine"

    };

  },

  scoreLead,

  predictRevenue(permit) {

    return Number(
      (
        Number(permit.estimated_value || 25000) *
        0.03
      ).toFixed(2)
    );

  }

};

/* ==========================================================================
   HELPER FUNCTIONS
========================================================================== */

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
        .replace(/[$,]/g, "")
        .replace(/[^0-9.-]/g, "")
    );

  return Number.isFinite(number)
    ? number
    : null;

}

function dateValue(value) {

  if (!value) return null;

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

function normalizeText(value) {

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

function sleep(ms) {

  return new Promise(
    resolve => setTimeout(resolve, ms)
  );

}

/* ==========================================================================
   ADDRESS NORMALIZATION
========================================================================== */

function addressFromRaw(city, raw) {

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
      ])

    ]
      .filter(Boolean)
      .join(" ") || null;

  }

  if (city === "Chicago") {

    return [

      pick(raw, [
        "street_number"
      ]),

      pick(raw, [
        "street_direction"
      ]),

      pick(raw, [
        "street_name"
      ]),

      pick(raw, [
        "street_type"
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
      "property_address"
    ])
  );

}

/* ==========================================================================
   AI SCORE
========================================================================== */

function scoreLead(permit) {

  let score = 50;

  const type =
    String(
      permit.permit_type || ""
    ).toLowerCase();

  const value =
    Number(
      permit.estimated_value || 0
    );

  if (
    type.includes("commercial")
  ) {

    score += 25;

  }

  if (
    type.includes("building") ||
    type.includes("construction")
  ) {

    score += 10;

  }

  if (
    type.includes("remodel") ||
    type.includes("renovation")
  ) {

    score += 8;

  }

  if (value >= 1000000) {

    score += 20;

  } else if (value >= 500000) {

    score += 15;

  } else if (value >= 100000) {

    score += 10;

  }

  return Math.min(
    100,
    score
  );

}

/* ==========================================================================
   PERMIT NORMALIZATION
========================================================================== */

function mapPermitData(
  cityName,
  raw
) {

  const permitId =
    normalizeText(
      pick(raw, [

        "permit_id",
        "permit_num",
        "permit_number",
        "permitnum",
        "id",
        "permit",
        "record_id"

      ])
    );

  const permitType =
    normalizeText(
      pick(raw, [

        "permit_type_definition",
        "permit_type_desc",
        "permit_type",
        "permit_type_name",
        "type",
        "work_type"

      ])
    );

  const status =
    normalizeText(
      pick(raw, [

        "status_current",
        "status",
        "permit_status",
        "current_status"

      ])
    );

  const issuedDate =
    dateValue(
      pick(raw, [

        "issued_date",
        "issue_date",
        "Issue Date",
        "issued",
        "application_date"

      ])
    );

  const valuation =
    numberValue(
      pick(raw, [

        "estimated_value",
        "estimated_cost",
        "total_job_valuation",
        "reported_cost",
        "valuation",
        "job_value",
        "declared_valuation"

      ])
    );

  const address =
    addressFromRaw(
      cityName,
      raw
    );

  const stableSource =
    JSON.stringify({

      cityName,

      permitId,

      permitType,

      status,

      issuedDate,

      valuation,

      address

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

    permit_id:
      permitId ||
      generatedId,

    ai_confidence:
      0,

    ai_enriched:
      false,

    estimated_value:
      valuation ||
      25000,

    ai_score:
      0,

    _address:
      address,

    _raw:
      raw

  };

  const score =
    scoreLead(base);

  return {

    ...base,

    ai_score:
      score,

    ai_confidence:
      Number(
        (
          0.70 +
          Math.min(score, 100) / 333
        ).toFixed(2)
      ),

    ai_enriched:
      true

  };

}

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
                `GRIDV21-BRAIN/${VERSION}`

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

  if (!rows.length) {

    return {
      inserted: 0,
      errors: 0
    };

  }

  let inserted = 0;

  let errors = 0;

  for (
    let i = 0;
    i < rows.length;
    i += SCAN_SETTINGS.batchSize
  ) {

    const batch =
      rows.slice(
        i,
        i + SCAN_SETTINGS.batchSize
      );

    const {
      error
    } =
      await supabase
        .from(table)
        .insert(batch);

    if (error) {

      errors +=
        batch.length;

      throw error;

    }

    inserted +=
      batch.length;

  }

  return {
    inserted,
    errors
  };

}

/* ==========================================================================
   DEDUPLICATED PERMIT INSERT
========================================================================== */

async function insertNewPermits(
  rows
) {

  if (!rows.length) {

    return {
      inserted: 0,
      skipped: 0
    };

  }

  const ids =
    [
      ...new Set(
        rows
          .map(
            row => row.permit_id
          )
          .filter(Boolean)
      )
    ];

  const existing =
    new Set();

  for (
    let i = 0;
    i < ids.length;
    i += 500
  ) {

    const chunk =
      ids.slice(
        i,
        i + 500
      );

    const {
      data,
      error
    } =
      await supabase
        .from("permits")
        .select("permit_id")
        .in(
          "permit_id",
          chunk
        );

    if (error) {

      throw error;

    }

    for (
      const row of data || []
    ) {

      existing.add(
        row.permit_id
      );

    }

  }

  const unique =
    [];

  const seen =
    new Set(existing);

  for (
    const row of rows
  ) {

    if (
      !row.permit_id ||
      seen.has(row.permit_id)
    ) {

      continue;

    }

    seen.add(
      row.permit_id
    );

    unique.push(
      row
    );

  }

  if (!unique.length) {

    return {

      inserted: 0,

      skipped:
        rows.length

    };

  }

  const result =
    await supabaseBatchInsert(
      "permits",
      unique
    );

  return {

    inserted:
      result.inserted,

    skipped:
      rows.length -
      result.inserted

  };

}

/* ==========================================================================
   OPTIONAL SCAN LOG
========================================================================== */

async function writeScanLog(
  payload
) {

  try {

    const {
      error
    } =
      await supabase
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

/* ==========================================================================
   CITY SCANNER
========================================================================== */

async function scanCity(
  city,
  reqId,
  signal
) {

  const rawText =
    await axiosWithAbort(
      city.url,
      reqId,
      signal
    );

  let records;

  if (
    city.type === "csv"
  ) {

    const parsed =
      Papa.parse(
        rawText,
        {

          header: true,

          skipEmptyLines:
            true,

          dynamicTyping:
            false

        }
      );

    if (
      parsed.errors?.length
    ) {

      logger.warn(
        reqId,
        `${city.name}: ${parsed.errors.length} CSV parse warnings`
      );

    }

    records =
      parsed.data || [];

  } else {

    records =
      typeof rawText === "string"
        ? JSON.parse(rawText)
        : rawText;

  }

  if (
    !Array.isArray(records)
  ) {

    records =
      records?.data ||
      [];

  }

  const mapped =
    records
      .map(
        row =>
          mapPermitData(
            city.name,
            row
          )
      )
      .filter(Boolean);

  return {

    city:
      city.name,

    fetched:
      records.length,

    mapped

  };

}

/* ==========================================================================
   FULL SCAN
========================================================================== */

export async function scanAllCities(
  reqId = crypto.randomUUID()
) {

  if (
    ENGINE.scanning
  ) {

    return {

      ok: false,

      status:
        "already_scanning",

      message:
        "A scan is already running."

    };

  }

  if (
    !ENGINE.running
  ) {

    return {

      ok: false,

      status:
        "paused",

      message:
        "Brain is paused."

    };

  }

  ENGINE.scanning =
    true;

  ENGINE.lastError =
    null;

  ENGINE.permitsFound =
    0;

  ENGINE.errors =
    0;

  const started =
    Date.now();

  const scanStartedAt =
    new Date().toISOString();

  currentScanAbortController =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        currentScanAbortController?.abort(),
      SCAN_SETTINGS.scanTimeout
    );

  const result = {

    ok: true,

    status:
      "completed",

    started_at:
      scanStartedAt,

    cities: [],

    fetched: 0,

    inserted: 0,

    skipped: 0,

    errors: 0

  };

  try {

    for (
      const city of CITIES
    ) {

      if (
        !ENGINE.running ||
        currentScanAbortController
          .signal
          .aborted
      ) {

        result.status =
          "aborted";

        break;

      }

      try {

        const cityResult =
          await scanCity(
            city,
            reqId,
            currentScanAbortController.signal
          );

        const rows =
          cityResult.mapped
            .map(
              ({
                _address,
                _raw,
                ...dbRow
              }) =>
                dbRow
            );

        const saved =
          await insertNewPermits(
            rows
          );

        result.fetched +=
          cityResult.fetched;

        result.inserted +=
          saved.inserted;

        result.skipped +=
          saved.skipped;

        result.cities.push({

          name:
            city.name,

          fetched:
            cityResult.fetched,

          inserted:
            saved.inserted,

          skipped:
            saved.skipped

        });

        ENGINE.permitsFound +=
          saved.inserted;

      } catch (error) {

        result.errors +=
          1;

        ENGINE.errors +=
          1;

        ENGINE.lastError =
          `${city.name}: ${error.message}`;

        result.cities.push({

          name:
            city.name,

 

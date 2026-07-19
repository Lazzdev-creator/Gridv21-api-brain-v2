/******************************************************************************
 * GRIDV21 BRAIN ENTERPRISE v6.3.3 - ENTERPRISE OS
 * OWNER: LAZARUS TAKUDZWA CHENANA
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
export const VERSION = "6.3.3";
const PORT = process.env.PORT || 3000;
let supabase;
let redisClient = null;
let currentScanAbortController = null;

/* ================= LOGGER ================= */
const logger = {
  info: (reqId, msg) => console.log(`[INFO ${reqId} ${new Date().toISOString()}] ${msg}`),
  warn: (reqId, msg) => console.warn(`[WARN ${reqId} ${new Date().toISOString()}] ${msg}`),
  error: async (reqId, msg) => {
    console.error(`[ERROR ${reqId} ${new Date().toISOString()}] ${msg}`);
    if (supabase) {
      try { await supabase.from('audit_logs').insert({ level: 'error', message: msg, request_id: reqId }); } catch (_) {}
    }
  }
};

/* ================= ENV VALIDATION ================= */
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET", "ADMIN_KEY", "FRONTEND_URL"];
for (const v of required) {
  if (!process.env[v]) throw new Error(`FATAL: ${v} missing from ENV`);
}

/* ================= GLOBAL ERROR HANDLERS ================= */
process.on("unhandledRejection", async (reason) => {
  await logger.error('system', `Unhandled Rejection: ${reason}`);
  process.exit(1);
});

process.on("uncaughtException", async (err) => {
  await logger.error('system', `Uncaught Exception: ${err.stack}`);
  process.exit(1);
});

/* ================= MIDDLEWARE ================= */
app.use((req, res, next) => { req.id = crypto.randomUUID(); res.setHeader('X-Request-ID', req.id); next(); });
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(':id :method :url :status :response-time ms'));
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

/* ================= SESSION STORE ================= */
app.set('trust proxy', 1);
let sessionStore;
if (process.env.REDIS_URL) {
  const { createClient } = await import("redis");
  const { RedisStore } = await import("connect-redis");
  redisClient = createClient({ url: process.env.REDIS_URL });
  await redisClient.connect();
  sessionStore = new RedisStore({ client: redisClient });
  logger.info('system', "Redis Session Store Enabled");
} else {
  logger.warn('system', "Redis not configured → MemoryStore (dev only)");
}

app.use(session({ store: sessionStore, secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", httpOnly: true, maxAge: 86400000 }}));

app.use(passport.initialize());
app.use(passport.session());

/* ================= SUPABASE (SERVICE ROLE) ================= */
supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/* ================= AUTH & STRIPE ================= */
let oauthEnabled = false;
// Google OAuth setup (same as before - omitted for brevity)

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const SETTINGS = { OWNER: "LAZARUS TAKUDZWA CHENANA", ADMIN_KEY: process.env.ADMIN_KEY, STRIPE_ENABLED: !!stripe };

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin || req.user?.role === 'admin') return next();
  return res.status(401).json({ success: false, message: "Unauthorized" });
}

/* ================= CONFIG ================= */
export const SCAN_SETTINGS = { batchSize: 100, requestDelay: 750, requestTimeout: 15000, scanTimeout: 600000, cron: "*/30 * * * *", concurrency: 3 };
export const ENGINE = { running: true, scanning: false, lastScan: null, lastScanDuration: 0, permitsFound: 0, errors: 0, uptime: Date.now() };

export const CITIES = [
  { name: "Austin", url: "https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=1000", valid: true, type: "json" },
  { name: "Chicago", url: "https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=1000&$order=Issue Date DESC", valid: true, type: "json" },
  { name: "Denver", url: "https://www.denvergov.org/media/gis/DataCatalog/building_permits/csv/building_permits.csv", valid: true, type: "csv" }
];

/* ================= CITY MAPPING ================= */
function mapPermitData(cityName, raw) {
  switch (cityName) {
    case "Austin":
      return { permit_number: raw.permit_number || raw['Permit ID'] || 'N/A', permit_type: raw.work_type || 'PERMIT', address: raw.location || raw.address || cityName, applicant: raw.applicant_name || 'Unknown', issued_date: raw.issue_date || null, description: raw.description || '', valuation: parseFloat(raw.project_cost || raw.estimated_cost || 0), contractor: raw.contractor_name || null, city: cityName };
    case "Chicago":
      return { permit_number: raw.permit_number || raw.id || 'N/A', permit_type: raw.permit_type || 'PERMIT', address: raw.address || cityName, applicant: raw.applicant || 'Unknown', issued_date: raw.issued_date || null, description: raw.description || '', valuation: parseFloat(raw.estimated_cost || 0), contractor: null, city: cityName };
    case "Denver":
    default:
      return { permit_number: raw['Permit #'] || 'N/A', permit_type: raw['Permit Type'] || 'PERMIT', address: raw['Street Address'] || cityName, applicant: raw['Applicant Name'] || 'Unknown', issued_date: raw['Issue Date'] || null, description: raw['Work Description'] || '', valuation: parseFloat(raw['Estimated Cost'] || 0), contractor: raw['Contractor Name'] || null, city: cityName };
  }
}

/* ================= AXIOS WITH RETRY ================= */
async function axiosWithAbort(url, reqId, signal, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, { timeout: SCAN_SETTINGS.requestTimeout, signal });
    } catch (err) {
      if (axios.isCancel(err)) throw err;
      const delay = 1000 * Math.pow(2, i);
      await logger.warn(reqId, `Retry ${i+1}/${retries} for ${url}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/* ================= SCANNER ================= */
export async function scanAllCities() {
  if (!ENGINE.running || ENGINE.scanning) return 0;

  ENGINE.scanning = true;
  ENGINE.errors = 0;
  ENGINE.permitsFound = 0;
  currentScanAbortController = new AbortController();

  const scanId = crypto.randomUUID();
  const startTime = Date.now();
  let newPermits = 0;
  let status = "success";

  ENGINE.lastScan = new Date().toISOString();

  const timeout = setTimeout(() => currentScanAbortController?.abort(), SCAN_SETTINGS.scanTimeout);

  try {
    for (const city of CITIES.filter(c => c.valid)) {
      try {
        logger.info(scanId, `Scanning ${city.name}`);
        const response = await axiosWithAbort(city.url, scanId, currentScanAbortController.signal);

        const rawPermits = city.type === 'csv' ? Papa.parse(response.data, { header: true, skipEmptyLines: true }).data : (response.data || []);
        let batch = [];

        for (const raw of rawPermits) {
          const permit = mapPermitData(city.name, raw);
          if (!permit.permit_number || permit.permit_number === 'N/A') continue;

          const permitID = `${city.name.toLowerCase()}-${permit.permit_number}`;
          let record = { permit_id: permitID, ...permit, status: "new", raw_data: raw };

          record = await AI_ENGINE.enrichPermit(record);
          record.ai_score = AI_ENGINE.scoreLead(record);
          record.predicted_revenue = AI_ENGINE.predictRevenue(record);

          batch.push(record);
          if (batch.length >= SCAN_SETTINGS.batchSize) {
            newPermits += await supabaseBatchUpsert('permits', batch);
            ENGINE.permitsFound = newPermits;
            batch = [];
          }
        }
        if (batch.length) {
          newPermits += await supabaseBatchUpsert('permits', batch);
          ENGINE.permitsFound = newPermits;
        }
      } catch (err) {
        if (axios.isCancel(err)) { status = "timeout"; break; }
        ENGINE.errors++;
        status = "failed";
        await logger.error(scanId, `${city.name}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, SCAN_SETTINGS.requestDelay));
    }
  } finally {
    clearTimeout(timeout);
    currentScanAbortController = null;
    ENGINE.scanning = false;
    ENGINE.lastScanDuration = Date.now() - startTime;

    await supabase.from('scan_logs').insert({ started_at: ENGINE.lastScan, completed_at: new Date().toISOString(), duration_ms: ENGINE.lastScanDuration, permits_found: newPermits, errors: ENGINE.errors, status, request_id: scanId });
  }
  return newPermits;
}

async function supabaseBatchUpsert(table, dataArray) {
  if (!dataArray.length) return 0;
  const { data, error } = await supabase.from(table).upsert(dataArray, { onConflict: 'permit_id', ignoreDuplicates: true }).select('permit_id');
  if (error) { await logger.error('system', `Upsert error: ${error.message}`); return 0; }
  return data?.length || 0;
}

/* ================= HEALTH ================= */
app.get('/api/health', async (req, res) => {
  try {
    const [{ count: permitCount }, redisStatus] = await Promise.all([
      supabase.from('permits').select('*', { count: 'exact', head: true }),
      redisClient ? redisClient.ping().then(() => 'connected').catch(() => 'error') : Promise.resolve('disabled')
    ]);

    res.json({
      success: true,
      status: "healthy",
      version: VERSION,
      permits: permitCount || 0,
      redis: redisStatus,
      stripe: !!stripe,
      oauth: oauthEnabled,
      scanner: ENGINE.scanning ? 'running' : 'idle'
    });
  } catch (e) {
    res.status(503).json({ success: false, error: e.message });
  }
});

/* ================= OTHER ROUTES (dashboard, scrape-now, brain controls, login, etc.) ================= */
// Include your existing dashboard, /api/status, login, checkout, etc. routes here...

/* ================= STARTUP & SHUTDOWN ================= */
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('system', `🚀 GRIDV21 BRAIN v${VERSION} LIVE ON PORT ${PORT}`);
  setImmediate(() => scanAllCities().catch(e => logger.error('startup', e.stack)));
});

process.on("SIGTERM", async () => {
  logger.info('system', "SIGTERM received - shutting down gracefully");
  ENGINE.running = false;
  if (currentScanAbortController) currentScanAbortController.abort();
  if (redisClient) await redisClient.quit();
  server.close(() => process.exit(0));
});

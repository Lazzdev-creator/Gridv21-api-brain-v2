/******************************************************************************
 * GRIDV21 BRAIN ENTERPRISE v6.1.10 - RENDER PRODUCTION MVP
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
import WebSocket from "ws";
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
global.WebSocket = WebSocket;

const app = express();
export const VERSION = "6.1.10";
const PORT = process.env.PORT || 3000;
let supabase;

/* ============================================================
LOGGER
============================================================ */
const logger = {
  info: (reqId, msg) => console.log(`[INFO ${reqId} ${new Date().toISOString()}] ${msg}`),
  warn: (reqId, msg) => console.warn(`[WARN ${reqId} ${new Date().toISOString()}] ${msg}`),
  error: async (reqId, msg) => {
    console.error(`[ERROR ${reqId} ${new Date().toISOString()}] ${msg}`);
    if (supabase) {
      try { await supabase.from('audit_logs').insert({ level: 'error', message: msg, request_id: reqId, timestamp: new Date().toISOString() }); } catch {}
    }
  }
};

/* ============================================================
ENV VALIDATION
============================================================ */
const required = ["SUPABASE_URL", "SUPABASE_KEY", "SESSION_SECRET", "ADMIN_KEY", "FRONTEND_URL"];
for(const v of required){ if(!process.env[v]){ throw new Error(`FATAL: ${v} missing from ENV`); } }

morgan.token('id', req => req.id);

/* ============================================================
GLOBAL ERROR HANDLERS - FIX #8
============================================================ */
process.on("unhandledRejection", (reason, promise) => {
  logger.error('system', `Unhandled Rejection: ${reason}`);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.error('system', `Uncaught Exception: ${err.stack}`);
  process.exit(1);
});

/* ============================================================
MIDDLEWARE
============================================================ */
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  hsts: process.env.NODE_ENV === 'production'? { maxAge: 31536000, includeSubDomains: true } : false
}));
app.use(compression());
app.use(morgan(':id :method :url :status :res[content-length] - :response-time ms'));
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use("/api", apiLimiter);

/* ============================================================
SESSION STORE
============================================================ */
app.set('trust proxy', 1); // CRITICAL: Must be before session

let sessionStore;
let redisClient = null;
if (process.env.REDIS_URL) {
  const { createClient } = await import("redis");
  const { RedisStore } = await import("connect-redis");
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (err) => logger.error('system', 'Redis Error: ' + err));
  await redisClient.connect();
  sessionStore = new RedisStore({ client: redisClient });
  logger.info('system', "Redis Session Store Enabled");
} else {
  logger.warn('system', "Redis not configured. Using MemoryStore");
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true, // Render is HTTPS so always true
    httpOnly: true, 
    sameSite: 'none', // FIX: 'none' required with secure:true on Render
    maxAge: 86400000 // 24 hours
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, "public")));

/* ============================================================
SUPABASE
============================================================ */
supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/* ============================================================
PASSPORT
============================================================ */
let oauthEnabled = false;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthEnabled = true;
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    const { data: company } = await supabase.from("companies").select("*").eq("owner_email", profile.emails[0].value).single();
    if (!company) return done(new Error("Unauthorized email"), null);
    return done(null, { id: company.id, role: company.role || 'admin' });
  }));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    const { data } = await supabase.from("companies").select("*").eq("id", id).single();
    done(null, data);
  });
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login.html' }), (req, res) => res.redirect('/dashboard'));
  logger.info('system', "Google OAuth Enabled");
}

const stripe = process.env.STRIPE_SECRET_KEY? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const SETTINGS = { OWNER: "LAZARUS TAKUDZWA CHENANA", WHATSAPP: "0672049913", AMAZON_ID: process.env.AMAZON_AFFILIATE_ID, ADMIN_KEY: process.env.ADMIN_KEY, STRIPE_ENABLED:!!stripe };

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin || req.user?.role === 'admin') return next();
  return res.status(401).json({ success: false, message: "Unauthorized" });
}

/* ============================================================
BRAIN OS + AI - FIX #6: Marked placeholder
============================================================ */
export const BRAIN_OS = [
  { id: 1, name: "Executive Intelligence OS", layer: "Strategy", agents_count: 3, kpis_count: 5 },
  { id: 2, name: "Revenue Intelligence OS", layer: "Finance", agents_count: 4, kpis_count: 6 },
  { id: 3, name: "Sales & CRM OS", layer: "Sales", agents_count: 5, kpis_count: 4 },
  { id: 4, name: "Marketing OS", layer: "Growth", agents_count: 6, kpis_count: 7 },
  { id: 5, name: "Operations OS", layer: "Operations", agents_count: 4, kpis_count: 5 },
  { id: 6, name: "Finance OS", layer: "Accounting", agents_count: 3, kpis_count: 6 },
  { id: 7, name: "Human Capital OS", layer: "People", agents_count: 4, kpis_count: 4 },
  { id: 8, name: "Project Management OS", layer: "Projects", agents_count: 5, kpis_count: 5 },
  { id: 9, name: "Knowledge Intelligence OS", layer: "Knowledge", agents_count: 3, kpis_count: 3 },
  { id: 10, name: "Legal & Compliance OS", layer: "Compliance", agents_count: 2, kpis_count: 4 },
  { id: 11, name: "Supply Chain OS", layer: "Supply", agents_count: 4, kpis_count: 5 },
  { id: 12, name: "Acquisition Intelligence OS", layer: "Lead Generation", agents_count: 6, kpis_count: 8 }
];
export const OS_STATUS = {}; for (const os of BRAIN_OS) { OS_STATUS[os.id] = "active"; }

export const AI_ENGINE = {
  async enrichPermit(p) {
    // FIX #6: PLACEHOLDER - Replace with OpenAI/Claude
    return {...p, ai_enriched: true, estimated_value: 25000, ai_confidence: 0.75, ai_note: "PLACEHOLDER MODEL" };
  },
  scoreLead(p) { return 50 + (p.permit_type?.includes('Commercial')? 20 : 0); },
  predictRevenue(p) { return (p.estimated_value || 25000) * 0.03; }
};

export const CITIES = [
  { name: "Austin", url: "https://data.austintexas.gov/resource/3syk-w9eu.json", valid: true, type: "json" },
  { name: "Chicago", url: "https://data.cityofchicago.org/resource/ydr8-5enu.json", valid: true, type: "json" },
  { name: "Denver", url: "https://www.denvergov.org/media/gis/DataCatalog/building_permits/csv/building_permits.csv", valid: true, type: "csv" },
  { name: "Phoenix", url: null, valid: false }, { name: "Seattle", url: null, valid: false }, { name: "Portland", url: null, valid: false },
  { name: "Johannesburg", url: null, valid: false }, { name: "Pretoria", url: null, valid: false }, { name: "Cape Town", url: null, valid: false }, { name: "Durban", url: null, valid: false }
];

export const SCAN_SETTINGS = { batchSize: 100, requestDelay: 750, requestTimeout: 15000, scanTimeout: 600000, cron: "*/30 * * * *", concurrency: 3 };
export const REVENUE = { affiliateCommission: 0.03, minimumLeadPrice: 7500, currency: "usd" };
export const ENGINE = { running: false, lastScan: null, lastScanDuration: 0, permitsFound: 0, errors: 0, uptime: Date.now(), queue: 0 };
export function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/* ============================================================
SUPABASE UPSERT
============================================================ */
async function supabaseBatchUpsert(table, dataArray) {
  if (dataArray.length === 0) return 0;
  const { data, error } = await supabase.from(table).upsert(dataArray, { onConflict: 'permit_id', ignoreDuplicates: true }).select('permit_id');
  if (error) { await logger.error('system', `Batch upsert failed ${table}: ${error.message}`); return 0; }
  return data?.length || 0;
}

/* ============================================================
AXIOS WITH ABORT - FIX #2: Real cancellation
============================================================ */
async function axiosWithAbort(url, reqId, signal, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await axios.get(url, { timeout: SCAN_SETTINGS.requestTimeout, signal }); }
    catch (err) {
      if (axios.isCancel(err)) throw err;
      const delay = 1000 * Math.pow(2, i);
      await logger.warn(reqId, `Retry ${i+1}/${retries} for ${url} in ${delay}ms`);
      if (i === retries - 1) throw err;
      await sleep(delay);
    }
  }
}

/* ============================================================
HEALTH
============================================================ */
app.get('/api/health', async (req, res) => {
  try {
    const { error: dbError } = await supabase.from('permits').select('id').limit(1);
    if (dbError) throw dbError;
    let redisStatus = "disabled";
    if (redisClient) { await redisClient.ping(); redisStatus = "connected"; }
    res.json({ success: true, status: "healthy", version: VERSION, redis: redisStatus, stripe:!!stripe, oauth: oauthEnabled });
  } catch (e) { res.status(503).json({ success: false, status: "unhealthy", error: e.message, version: VERSION }); }
});

/* ============================================================
SCANNER - FIX #2 #3 #4 #5
============================================================ */
export async function scanAllCities() {
  if (ENGINE.running) return 0;
  ENGINE.running = true;
  ENGINE.errors = 0; // FIX #4: Reset errors
  ENGINE.permitsFound = 0; // FIX #3: Reset permits
  const scanId = crypto.randomUUID();
  const startTime = Date.now();
  let newPermits = 0;
  let status = "success";
  ENGINE.lastScan = new Date().toISOString();

  const abortController = new AbortController(); // FIX #2
  const timeout = setTimeout(() => abortController.abort(), SCAN_SETTINGS.scanTimeout);

  try {
    const validCities = CITIES.filter(c => c.valid);
    for (const city of validCities) {
      try {
        logger.info(scanId, `Scanning ${city.name}`);
        const response = await axiosWithAbort(city.url, scanId, abortController.signal); // FIX #2
        let permits = [];

        if (city.type === 'csv') {
          const parsed = Papa.parse(response.data, { header: true, skipEmptyLines: true });
          permits = parsed.data.map(p => ({
            permit_number: p.permit_number || p['Permit #'],
            permit_type: p.permit_type_description || p['Work Class'] || p.permit_type,
            applicant: p.applicant_name || p['Applicant Name'],
            issued_date: p.issued_date || p['Issue Date']
          })).filter(p => p.permit_number);
        } else {
          permits = response.data || [];
        }

        const { data: existingPermits } = await supabase.from("permits").select("permit_id").eq("city", city.name);
        const existingIds = new Set(existingPermits?.map(p => p.permit_id) || []);

        let batch = [];
        for (const permit of permits) {
          const permitID = `${city.name.toLowerCase()}-${permit.permit_number || crypto.randomUUID()}`;
          if (existingIds.has(permitID)) continue;
          let record = { permit_id: permitID, city: city.name, permit_type: permit.permit_type || "Unknown", status: "new", raw_data: permit };
          record = await AI_ENGINE.enrichPermit(record);
          record.ai_score = AI_ENGINE.scoreLead(record);
          record.predicted_revenue = AI_ENGINE.predictRevenue(record);
          batch.push(record);

          if (batch.length >= SCAN_SETTINGS.batchSize) {
            const inserted = await supabaseBatchUpsert('permits', batch);
            newPermits += inserted;
            ENGINE.permitsFound = newPermits; // FIX #3
            batch = [];
          }
        }
        if (batch.length > 0) {
          const inserted = await supabaseBatchUpsert('permits', batch);
          newPermits += inserted;
          ENGINE.permitsFound = newPermits; // FIX #3
        }

      } catch (err) {
        if (axios.isCancel(err)) { logger.warn(scanId, "Scan cancelled due to timeout"); status = "timeout"; break; }
        ENGINE.errors++; status = "failed"; await logger.error(scanId, `${city.name}: ${err.message}`);
      }
      await sleep(SCAN_SETTINGS.requestDelay);
    }
    ENGINE.lastScanDuration = Date.now() - startTime;
  } finally {
    clearTimeout(timeout);
    ENGINE.running = false;
    // FIX #5: completed_at added
    await supabase.from('scan_logs').insert({
      started_at: ENGINE.lastScan,
      completed_at: new Date().toISOString(),
      duration_ms: ENGINE.lastScanDuration,
      permits_found: newPermits,
      errors: ENGINE.errors,
      status,
      request_id: scanId
    });
  }
  return newPermits;
}

/* ============================================================
API ROUTES - FIX #7: Graceful RPC fallback
============================================================ */
app.get('/api/status', requireAdmin, (req, res) => {
  const payload = { success: true,...ENGINE, uptime: Date.now() - ENGINE.uptime, version: VERSION, stripe_enabled:!!stripe };
  if (process.env.NODE_ENV!== 'production') payload.memory = process.memoryUsage();
  res.json(payload);
});

app.get('/api/dashboard', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let totalRevenue = 0;
    try {
      const { data: revenueData } = await supabase.rpc('get_monthly_revenue'); // FIX #7
      totalRevenue = revenueData?.[0]?.total || 0;
    } catch (e) {
      logger.warn('system', "RPC get_monthly_revenue not found. Using 0");
    }

    const [{ count: permitCount }, { data: permits }, { data: osModules }, { data: scanLogs }] = await Promise.all([
      supabase.from("permits").select("*", { count: "exact", head: true }),
      supabase.from('permits').select('*').order('created_at', { ascending: false }).range(from, to),
      supabase.from('os_modules').select('*').order('id'),
      supabase.from('scan_logs').select('*').order('started_at', { ascending: false }).limit(10)
    ]);

    res.json({
      success: true,
      metrics: { total_leads: permitCount || 0, dms_sent: scanLogs?.length || 0, os_active: Object.values(OS_STATUS).filter(s => s === "active").length, est_revenue_month: totalRevenue, ai_avg_confidence: 0.75 },
      permits: permits || [],
      osModules: osModules || [],
      scanLogs: scanLogs || [],
      system: process.env.NODE_ENV!== 'production'? { memory: process.memoryUsage(), uptime: process.uptime() } : {},
      stripe_enabled:!!stripe
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/scrape-now', requireAdmin, async (req, res) => { const saved = await scanAllCities(); res.json({ success: true, permits_found: saved }); });

app.post('/api/lead/checkout', requireAdmin, async (req, res) => {
  if (!stripe) return res.status(400).json({ success: false, message: "Stripe not configured" });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: REVENUE.currency, product_data: { name: 'GRIDV21 Lead' }, unit_amount: REVENUE.minimumLeadPrice }, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/dashboard?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard?canceled=true`
    });
    res.json({ success: true, url: session.url });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/login', (req, res) => { if (req.body.key === SETTINGS.ADMIN_KEY) { req.session.isAdmin = true; return res.json({ success: true, redirect: "/dashboard" }); } res.status(401).json({ success: false }); });

cron.schedule(SCAN_SETTINGS.cron, async () => { logger.info('cron', "⏰ Running scheduled scan"); await scanAllCities(); });

app.get('/dashboard', requireAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'public/dashboard/index.html')); });
app.get('/', (req, res) => res.redirect('/login.html'));

app.use(async (err, req, res, next) => {
  await logger.error(req.id, err.stack);
  res.status(500).json({ success: false, message: "Internal Server Error" });
});

/* ============================================================
STARTUP - FIX #1: Non-blocking scan
============================================================ */
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('system', `🚀 GRIDV21 BRAIN v${VERSION} LIVE`);
  setImmediate(() => { // FIX #1
    logger.info('system', "Running initial scan on boot...");
    scanAllCities();
  });
});

process.on("SIGTERM", async () => {
  logger.info('system', "SIGTERM received, shutting down gracefully");
  if (redisClient) await redisClient.quit();
  server.close(() => process.exit(0));
});

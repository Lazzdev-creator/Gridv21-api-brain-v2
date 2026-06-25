import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
dotenv.config();

/* ====================== ENV VALIDATION ====================== */
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SESSION_SECRET'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const VERSION = '5.5.8';

/* ====================== SECURITY MIDDLEWARE ====================== */
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

const corsOrigin = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : true;
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400000
  }
}));

// Auto-auth for demo
app.use((req, res, next) => {
  if (!req.session.authenticated) {
    req.session.authenticated = true;
  }
  next();
});

app.use(passport.initialize());
app.use(passport.session());

/* ====================== SUPABASE ====================== */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY.trim()
);

/* ====================== OS STATUS STATE ====================== */
const BRAIN_OS = [
  { id: 1, name: 'Executive Intelligence OS' },
  { id: 2, name: 'Revenue Intelligence OS' },
  { id: 3, name: 'Sales & CRM OS' },
  { id: 4, name: 'Marketing OS' },
  { id: 5, name: 'Operations OS' },
  { id: 6, name: 'Finance OS' },
  { id: 7, name: 'Human Capital OS' },
  { id: 8, name: 'Project Management OS' },
  { id: 9, name: 'Knowledge OS' },
  { id: 10, name: 'Legal & Compliance OS' },
  { id: 11, name: 'Supply Chain OS' },
  { id: 12, name: 'Acquisition Intelligence OS' }
];

let OS_STATUS = Object.fromEntries(BRAIN_OS.map(os => [os.id, 'active']));

/* ====================== SESSION AUTH MIDDLEWARE ====================== */
function requireSession(req, res, next) {
  if (req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

/* ====================== DATABASE INIT ====================== */
async function initDatabase() {
  try {
    // Seed OS modules if needed
    const { data: existingOS } = await supabase
      .from('os_modules')
      .select('id')
      .limit(1);

    if (!existingOS || existingOS.length === 0) {
      const osData = BRAIN_OS.map(os => ({
        id: os.id,
        name: os.name,
        status: 'active',
        last_run: new Date().toISOString()
      }));
      await supabase.from('os_modules').insert(osData);
      console.log('✅ OS modules seeded');
    } else {
      console.log('✅ OS modules loaded');
    }
  } catch (e) {
    console.error('DB init warning:', e.message);
  }
}

/* ====================== STARTUP ====================== */
initDatabase().then(() => {
  console.log('GRIDV21 Brain initialized');
});

/* ====================== CITIES ====================== */
const CITIES = [
  { name: 'Austin', url: 'https://data.austintexas.gov/resource/3syk-w9eu.json' },
  { name: 'Dallas', url: 'https://www.dallasopendata.com/resource/6rcc-fs8n.json' },
  { name: 'Houston', url: 'https://data.houstontx.gov/resource/f7m3-7pxw.json' },
  { name: 'Phoenix', url: 'https://www.phoenixopendata.com/resource/2gsx-6exx.json' },
  { name: 'Seattle', url: 'https://data.seattle.gov/resource/cqnp-6rgi.json' },
  { name: 'Chicago', url: 'https://data.cityofchicago.org/resource/6ij4-pg3t.json' },
  { name: 'San Diego', url: 'https://data.sandiegoca.gov/resource/ax4p-qtjx.json' },
  { name: 'Portland', url: 'https://data.portlandoregon.gov/resource/6w8u-tmxa.json' },
  { name: 'Denver', url: 'https://data.denvergov.org/resource/r5jd-p7g9.json' }
];

async function savePermit(city, p) {
  const permit_id = `${city.name.toLowerCase()}-${p.permit_number || p.id || Date.now()}`;

  const { data: existing } = await supabase
    .from('permits')
    .select('permit_id')
    .eq('permit_id', permit_id)
    .maybeSingle();

  if (existing) return { inserted: false, permit_id };

  const permitData = {
    permit_id,
    city: city.name,
    permit_type: p.permit_type_description || p.permit_type || p.type || 'Unknown',
    status: 'new',
    issued_date: p.issued_date || p.issue_date || p.date_issued || null,
    raw_data: p
  };

  const { error } = await supabase.from('permits').insert(permitData);
  if (error) {
    console.error('Supabase insert error:', error.message);
    return null;
  }
  return { inserted: true, permit_id };
}

async function logRevenue(permit_id, value) {
  const amount = Math.round(Number(value || 0) * 0.03);
  if (amount <= 0) return;
  await supabase.from('revenue_log').insert({
    amount,
    source: permit_id,
    created_at: new Date().toISOString()
  }).catch(e => console.error('Revenue log:', e.message));
}

/* ====================== SCAN ====================== */
let scanRunning = false;

async function scanAllCities() {
  if (scanRunning) return 0;
  scanRunning = true;
  let totalSaved = 0;
  try {
    for (const city of CITIES) {
      try {
        const response = await axios.get(`${city.url}?$limit=30&$order=issue_date:desc`, { timeout: 12000 });
        const permits = response.data || [];
        let saved = 0;
        for (const p of permits) {
          const value = Number(p.project_valuation || p.estimated_cost || p.value || p.amount || 0);
          const result = await savePermit(city, p);
          if (result?.inserted) {
            saved++;
            await logRevenue(result.permit_id, value);
          }
        }
        totalSaved += saved;
        console.log(`✅ ${city.name}: ${permits.length} scanned, ${saved} saved`);
      } catch (err) {
        console.error(`❌ ${city.name}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 800));
    }
    return totalSaved;
  } finally {
    scanRunning = false;
  }
}

class Engine {
  static async runScan() {
    if (OS_STATUS[12] !== 'active') {
      return { permits_found: 0, skipped: true, message: "Acquisition OS inactive" };
    }
    const saved = await scanAllCities();
    return { permits_found: saved, timestamp: new Date().toISOString() };
  }
}

/* ====================== CRON ====================== */
cron.schedule('*/45 * * * *', async () => {
  console.log('🔄 Auto-scan started');
  await scanAllCities();
}, { timezone: "America/Chicago" });

/* ====================== API ROUTES ====================== */
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', version: VERSION, uptime: process.uptime() });
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const { data: permits } = await supabase
      .from('permits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: osModules } = await supabase
      .from('os_modules')
      .select('*')
      .order('id');

    const { data: revenue } = await supabase
      .from('revenue_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const est_revenue_month = (revenue || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const metrics = {
      total_leads: permits?.length || 0,
      dms_sent: revenue?.length || 0,
      est_revenue_month,
      os_active: osModules?.filter(o => o.status === 'active').length || 0
    };

    res.json({ 
      success: true, 
      metrics, 
      permits: permits || [], 
      osModules: osModules || BRAIN_OS.map(os => ({...os, status: OS_STATUS[os.id] })) 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/os-toggle/:id', requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!BRAIN_OS.find(o => o.id === id)) {
    return res.status(404).json({ error: 'OS not found' });
  }

  const current = OS_STATUS[id] === 'active' ? 'inactive' : 'active';
  OS_STATUS[id] = current;

  await supabase
    .from('os_modules')
    .update({ status: current, last_run: new Date().toISOString() })
    .eq('id', id)
    .catch(() => {});

  res.json({ id, status: current });
});

app.post('/api/scrape-now', requireSession, async (req, res) => {
  try {
    const result = await Engine.runScan();
    res.json({ status: 'success', ...result });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.get('/api/test', (req, res) => {
  const activeCount = Object.values(OS_STATUS).filter(v => v === 'active').length;
  res.json({ 
    alive: true, 
    version: VERSION, 
    os_active: activeCount, 
    engine: 'Gridv21 v5.5.8' 
  });
});

/* ====================== STATIC FILES ====================== */
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/* ====================== ERROR HANDLER ====================== */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ====================== START SERVER ====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GRIDV21 BRAIN v${VERSION} running on http://localhost:${PORT}`);
});

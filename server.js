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
const VERSION = '5.5.7';

/* ====================== SECURITY MIDDLEWARE ====================== */
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

const corsOrigin = process.env.FRONTEND_URL? process.env.FRONTEND_URL.split(',') : true;
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
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: false, // <-- change from true to false
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400000
  }
}));

// ADD THIS RIGHT AFTER app.use(session({...}))
app.use((req,res,next)=>{
  if(!req.session.authenticated){
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
  if(req.session.authenticated){
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

/* ====================== STARTUP VERIFICATION ====================== */
(async () => {
  const { error } = await supabase.from('permits').select('permit_id').limit(1);
  if (error) {
    console.error('Supabase connection failed:', error.message);
    process.exit(1);
  }
  console.log('Supabase connected ✓');

  const { data: osData } = await supabase.from('os_modules').select('id,status');
  if (osData) {
    osData.forEach(os => {
      OS_STATUS[os.id] = os.status;
    });
    console.log('OS status loaded from DB ✓');
  }
})();

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
  const permit_id = `${city.name}-${p.permit_number || p.id || Date.now()}`;

  const { data: existing } = await supabase
.from('permits')
.select('permit_id')
.eq('permit_id', permit_id)
.maybeSingle();

  if (existing) return { inserted: false, permit_id };

  const permitData = {
    permit_id,
    city: city.name,
    permit_type: p.permit_type_description || p.permit_type || 'Unknown',
    status: 'new',
    issued_date: p.issued_date || p.issue_date || null
  };

  const { error } = await supabase.from('permits').insert(permitData);
  if (error) {
    console.error('Supabase error:', error.message);
    return null;
  }
  return { inserted: true, permit_id };
}

async function logRevenue(permit_id, value) {
  const amount = Math.round(Number(value) * 0.03);
  if (amount <= 0) return;

  const { error } = await supabase.from('revenue_log').insert({
    amount,
    source: permit_id
  });

  if (error) console.error('Revenue log error:', error.message);
}

/* ====================== SCAN LOCK ====================== */
let scanRunning = false;
async function scanAllCities() {
  if (scanRunning) {
    console.log('Scan already running, skipping');
    return 0;
  }
  scanRunning = true;
  try {
    let totalSaved = 0;
    for (const city of CITIES) {
      try {
        const response = await axios.get(`${city.url}?$limit=50`, { timeout: 15000 });
        const permits = response.data || [];
        let saved = 0;
        for (const p of permits) {
          const value = Number(p.project_valuation || p.estimated_cost || p.value || 0);
          const result = await savePermit(city, p);
          if (result?.inserted) {
            saved++;
            await logRevenue(result.permit_id, value);
          }
        }
        totalSaved += saved;
        console.log(`Brain scanned ${permits.length} from ${city.name}, saved ${saved}`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`${city.name}:`, err.message);
      }
    }
    return totalSaved;
  } finally {
    scanRunning = false;
  }
}

const dmLimiter = rateLimit({ windowMs: 30 * 60 * 1000, max: 50 });

class Engine {
  static async runScan() {
    if (OS_STATUS[12]!== 'active') return { permits_found: 0, skipped: true };
    const saved = await scanAllCities();
    return { permits_found: saved, timestamp: new Date().toISOString() };
  }
}

/* ====================== CRON FIX - 5 FIELDS ====================== */
const schedule = process.env.CRON_SCHEDULE || '*/30 * * * *';
cron.schedule(schedule, async () => {
  console.log('Auto scan started at', new Date().toISOString());
  await scanAllCities();
}, { timezone: "America/Chicago" });

/* ====================== HEALTH ENDPOINT ====================== */
app.get('/health', async (req, res) => {
  try {
    const { error } = await supabase.from('permits').select('permit_id').limit(1);
    if (error) throw error;
    res.json({ status: 'healthy', version: VERSION, uptime: process.uptime() });
  } catch (e) {
    res.status(500).json({ status: 'unhealthy', error: e.message });
  }
});

/* ====================== DASHBOARD API ====================== */
app.get('/api/dashboard', async (req, res) => {
  try {
    const { data: permits } = await supabase
 .from('permits')
 .select('*')
 .order('created_at', { ascending: false })
 .limit(25);

    const { data: osModules } = await supabase
 .from('os_modules')
 .select('*')
 .order('id');

    const { data: revenue } = await supabase
 .from('revenue_log')
 .select('*')
 .order('created_at', { ascending: false })
 .limit(100);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const est_revenue_month = (revenue || [])
 .filter(r => {
       const d = new Date(r.created_at);
       return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
     })
 .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const metrics = {
      total_leads: permits?.length || 0,
      dms_sent: revenue?.length || 0,
      est_revenue_month,
      os_active: osModules?.filter(o => o.status === 'active').length || 0
    };

    res.json({ success: true, metrics, permits, osModules, revenue });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/os-status', (req, res) =>
  res.json(BRAIN_OS.map(os => ({...os, status: OS_STATUS[os.id] })))
);

app.post('/api/os-toggle/:id', requireSession, async (req, res) => {
  const id = Number(req.params.id);
  const current = OS_STATUS[id] === 'active'? 'inactive' : 'active';
  OS_STATUS[id] = current;

  await supabase
.from('os_modules')
.update({ status: current, last_run: new Date().toISOString() })
.eq('id', id);

  res.json({ id, status: current });
});

app.post('/api/scrape-now', requireSession, dmLimiter, async (req, res) => {
  const result = await Engine.runScan();
  res.json({ status: 'scraped',...result });
});

app.get('/api/test', (req, res) => {
  const activeCount = Object.values(OS_STATUS).filter(v => v === 'active').length;
  res.json({ alive: true, version: VERSION, os_active: activeCount, engine: 'Gridv21 v5.5.7' });
});

/* ====================== STATIC ====================== */
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

/* ====================== ERROR HANDLER ====================== */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ====================== SERVER ====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GRIDV21 BRAIN v${VERSION} running on ${PORT}`));

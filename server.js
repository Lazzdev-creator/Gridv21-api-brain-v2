import express from 'express';
import cors from 'cors';
import session from 'express-session';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const VERSION = '5.5.8';

/* ====================== ENV ====================== */
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SESSION_SECRET'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Missing env: ${key}`);
    process.exit(1);
  }
}

/* ====================== MIDDLEWARE ====================== */
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({ origin: true, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' }
}));

app.use((req, res, next) => {
  req.session.authenticated = true;
  next();
});

/* ====================== SUPABASE ====================== */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY.trim()
);

/* ====================== CALLMEBOT ====================== */
const CALLMEBOT_PHONE = '27672049913';
const CALLMEBOT_APIKEY = '3083974';

async function sendWhatsApp(message) {
  try {
    const text = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&text=${text}&apikey=${CALLMEBOT_APIKEY}`;
    await axios.get(url, { timeout: 10000 });
    console.log('✅ WhatsApp sent');
  } catch (e) {
    console.error('❌ WhatsApp error:', e.message);
  }
}

/* ====================== OS MODULES ====================== */
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

/* ====================== DB INIT ====================== */
async function initDatabase() {
  try {
    console.log('🔄 Initializing Supabase...');
    // Seed OS modules
    const { data: existing } = await supabase.from('os_modules').select('id').limit(1).catch(() => null);
    if (!existing || existing.length === 0) {
      const seed = BRAIN_OS.map(os => ({
        id: os.id,
        name: os.name,
        status: 'active',
        last_run: new Date().toISOString()
      }));
      await supabase.from('os_modules').insert(seed).catch(() => {});
      console.log('✅ OS modules seeded');
    }
    console.log('✅ Supabase ready');
  } catch (e) {
    console.log('Supabase init warning (first run is normal):', e.message);
  }
}
initDatabase();

/* ====================== CITIES & SCAN ====================== */
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
  try {
    const permit_id = `${city.name.toLowerCase()}-${p.permit_number || p.id || Date.now()}`;
    const { data: existing } = await supabase.from('permits').select('permit_id').eq('permit_id', permit_id).maybeSingle().catch(() => null);
    if (existing) return { inserted: false };

    const permitData = {
      permit_id,
      city: city.name,
      permit_type: p.permit_type_description || p.permit_type || p.type || 'Unknown',
      status: 'new',
      issued_date: p.issued_date || p.issue_date || null,
      raw_data: p
    };

    await supabase.from('permits').insert(permitData).catch(() => {});
    return { inserted: true, permit_id };
  } catch (e) {
    return null;
  }
}

async function logRevenue(permit_id, value) {
  try {
    const amount = Math.round(Number(value || 0) * 0.03);
    if (amount > 0) {
      await supabase.from('revenue_log').insert({ amount, source: permit_id }).catch(() => {});
    }
  } catch (e) {}
}

let scanRunning = false;
async function scanAllCities() {
  if (scanRunning) return 0;
  scanRunning = true;
  let total = 0;
  try {
    for (const city of CITIES) {
      try {
        const res = await axios.get(`${city.url}?$limit=35`, { timeout: 15000 });
        const permits = res.data || [];
        for (const p of permits) {
          const result = await savePermit(city, p);
          if (result?.inserted) {
            total++;
            await logRevenue(result.permit_id, p.project_valuation || p.estimated_cost || 0);
          }
        }
      } catch (e) {
        console.error(`Scan error ${city.name}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 600));
    }
    if (total > 0) await sendWhatsApp(`✅ GridV21 Scan: ${total} new permits found!`);
    return total;
  } finally {
    scanRunning = false;
  }
}

class Engine {
  static async runScan() {
    if (OS_STATUS[12] !== 'active') {
      await sendWhatsApp('⚠️ Acquisition OS is OFF');
      return { permits_found: 0 };
    }
    const saved = await scanAllCities();
    return { permits_found: saved };
  }
}

/* ====================== CRON ====================== */
cron.schedule('*/40 * * * *', () => scanAllCities());

/* ====================== ROUTES ====================== */
app.get('/api/dashboard', async (req, res) => {
  try {
    const { data: permits } = await supabase.from('permits').select('*').order('created_at', { ascending: false }).limit(20).catch(() => ({ data: [] }));
    const { data: osModules } = await supabase.from('os_modules').select('*').order('id').catch(() => ({ data: null }));
    const { data: revenue } = await supabase.from('revenue_log').select('amount').limit(100).catch(() => ({ data: [] }));

    const metrics = {
      total_leads: permits?.length || 0,
      dms_sent: revenue?.length || 0,
      est_revenue_month: (revenue || []).reduce((sum, r) => sum + Number(r.amount || 0), 0),
      os_active: (osModules || BRAIN_OS).filter(o => (o.status || OS_STATUS[o.id]) === 'active').length
    };

    res.json({
      success: true,
      metrics,
      permits: permits || [],
      osModules: osModules || BRAIN_OS.map(o => ({ ...o, status: OS_STATUS[o.id] }))
    });
  } catch (e) {
    console.error(e);
    res.json({ success: true, metrics: { total_leads: 0, dms_sent: 0, est_revenue_month: 0, os_active: 12 }, permits: [], osModules: BRAIN_OS.map(o => ({...o, status: 'active'})) });
  }
});

app.post('/api/os-toggle/:id', async (req, res) => {
  const id = Number(req.params.id);
  const newStatus = OS_STATUS[id] === 'active' ? 'inactive' : 'active';
  OS_STATUS[id] = newStatus;

  await supabase.from('os_modules').update({ status: newStatus, last_run: new Date().toISOString() }).eq('id', id).catch(() => {});

  await sendWhatsApp(`OS ${id} → ${newStatus.toUpperCase()}`);
  res.json({ id, status: newStatus });
});

app.post('/api/scrape-now', async (req, res) => {
  const result = await Engine.runScan();
  res.json({ status: 'success', ...result });
});

app.get('/api/test', (req, res) => {
  const active = Object.values(OS_STATUS).filter(s => s === 'active').length;
  res.json({ version: VERSION, os_active: active, engine: 'GRIDV21' });
});

/* ====================== STATIC ====================== */
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

/* ====================== START ====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GRIDV21 v${VERSION} LIVE on port ${PORT}`);
  sendWhatsApp('🧠 GridV21 v5.5.8 Started Successfully on Render');
});

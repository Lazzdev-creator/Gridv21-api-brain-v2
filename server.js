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
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400000
  }
}));

// Auto-auth for demo
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
    await axios.get(url, { timeout: 8000 });
    console.log('✅ WhatsApp sent:', message);
  } catch (e) {
    console.error('❌ WhatsApp failed:', e.message);
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
    const { data } = await supabase.from('os_modules').select('id').limit(1);
    if (!data || data.length === 0) {
      const seedData = BRAIN_OS.map(os => ({
        id: os.id,
        name: os.name,
        status: 'active',
        last_run: new Date().toISOString()
      }));
      await supabase.from('os_modules').insert(seedData);
      console.log('✅ OS modules seeded');
    }
  } catch (e) {
    console.log('DB init:', e.message);
  }
}
initDatabase();

/* ====================== CITIES & SCAN ====================== */
const CITIES = [ /* your existing cities array */ ];

async function savePermit(city, p) { /* your existing savePermit function */ }
async function logRevenue(permit_id, value) { /* your existing logRevenue */ }

let scanRunning = false;
async function scanAllCities() {
  if (scanRunning) return 0;
  scanRunning = true;
  let total = 0;
  try {
    for (const city of CITIES) {
      try {
        const res = await axios.get(`${city.url}?$limit=40`, { timeout: 15000 });
        const permits = res.data || [];
        for (const p of permits) {
          const result = await savePermit(city, p);
          if (result?.inserted) {
            total++;
            await logRevenue(result.permit_id, p.project_valuation || p.estimated_cost || 0);
          }
        }
      } catch (e) {
        console.error(city.name, e.message);
      }
      await new Promise(r => setTimeout(r, 700));
    }
    if (total > 0) await sendWhatsApp(`✅ GridV21 Scan Complete → ${total} new permits!`);
    return total;
  } finally {
    scanRunning = false;
  }
}

class Engine {
  static async runScan() {
    if (OS_STATUS[12] !== 'active') {
      await sendWhatsApp('⚠️ Acquisition OS is OFF - Scan skipped');
      return { permits_found: 0, skipped: true };
    }
    const saved = await scanAllCities();
    return { permits_found: saved };
  }
}

/* ====================== CRON ====================== */
cron.schedule('*/40 * * * *', () => scanAllCities());

/* ====================== API ROUTES ====================== */
app.get('/api/dashboard', async (req, res) => {
  try {
    const { data: permits } = await supabase.from('permits').select('*').order('created_at', { ascending: false }).limit(25);
    const { data: osModules } = await supabase.from('os_modules').select('*').order('id');
    const { data: revenue } = await supabase.from('revenue_log').select('amount').limit(100);

    const metrics = {
      total_leads: permits?.length || 0,
      dms_sent: revenue?.length || 0,
      est_revenue_month: revenue?.reduce((a, r) => a + Number(r.amount || 0), 0) || 0,
      os_active: osModules?.filter(o => o.status === 'active').length || 12
    };

    res.json({
      success: true,
      metrics,
      permits: permits || [],
      osModules: osModules || BRAIN_OS.map(o => ({ ...o, status: OS_STATUS[o.id] }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

app.post('/api/os-toggle/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!BRAIN_OS.find(o => o.id === id)) return res.status(404).json({ error: 'Not found' });

  const newStatus = OS_STATUS[id] === 'active' ? 'inactive' : 'active';
  OS_STATUS[id] = newStatus;

  await supabase.from('os_modules').update({ status: newStatus, last_run: new Date().toISOString() }).eq('id', id);

  await sendWhatsApp(`OS ${id} turned ${newStatus.toUpperCase()}`);
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
  sendWhatsApp('🧠 GridV21 v5.5.8 Brain Control Started Successfully');
});

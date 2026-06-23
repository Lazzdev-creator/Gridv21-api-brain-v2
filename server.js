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

/* === WHATSAPP NOTIFIER === */
async function sendWhatsApp(msg) {
  const key = process.env.CALLMEBOT_KEY;
  const phone = process.env.CALLMEBOT_PHONE;
  if (!key || !phone) return console.warn('⚠️ CallMeBot creds missing');
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(msg)}&apikey=${key}`;
  try {
    await axios.get(url);
    console.log('✅ WhatsApp sent:', msg);
  } catch (e) {
    console.error('❌ WhatsApp failed:', e.message);
  }
}

/* === ENV CHECK === */
const required = ['SUPABASE_URL', 'SUPABASE_KEY', 'SESSION_SECRET', 'CALLMEBOT_KEY', 'CALLMEBOT_PHONE'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const VERSION = '1.0.1';

/* === MIDDLEWARE === */
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({ origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' } }));
app.use(passport.initialize());
app.use(passport.session());

/* === SUPABASE === */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY.trim());

/* === OS MODULES - FIXED SYNTAX === */
const BRAIN_OS = [
  { id: 1, name: 'Revenue OS' },
  { id: 2, name: 'Customer OS' },
  { id: 3, name: 'Operations OS' },
  { id: 4, name: 'Decision OS' },
  { id: 5, name: 'Knowledge Graph OS' },
  { id: 6, name: 'Forecasting OS' },
  { id: 7, name: 'Marketing OS' },
  { id: 8, name: 'Customer Intelligence OS' },
  { id: 9, name: 'Deal Closing OS' },
  { id: 10, name: 'Risk OS' },
  { id: 11, name: 'Automation OS' },
  { id: 12, name: 'Acquisition OS' }  // ← was broken: { id: 12, 'Acquisition OS' }
];
let OS_STATUS = Object.fromEntries(BRAIN_OS.map(o => [o.id, 'active']));

/* === REVENUE TRACKER === */
async function trackRevenue({ os_id, lead_id, amount, type }) {
  const { error } = await supabase.from('revenue_events').insert({
    os_id, lead_id, amount, type, created_at: new Date().toISOString()
  });
  if (error) {
    console.error('Revenue tracking error:', error.message);
    await sendWhatsApp(`⚠️ GridV21: Revenue tracking failed - ${error.message}`);
  }
}

/* === LEAD SCORING === */
async function scoreLead(lead) {
  const value = Number(lead.value_estimate || 0);
  const score = Math.min(100, Math.round(value / 1000));
  const tier = score > 70 ? 'Hot' : score > 40 ? 'Warm' : 'Cold';
  await trackRevenue({ os_id: 2, lead_id: lead.id, amount: value * 0.03, type: 'lead_scored' });
  
  // WhatsApp alert for hot leads
  if (tier === 'Hot') {
    await sendWhatsApp(`🔥 GridV21 Hot Lead: ${lead.region} - $${value.toLocaleString()} | Score: ${score}`);
  }
  return { score, tier };
}

/* === CITY SCANNER === */
let scanLock = false;
async function scanCities() {
  if (scanLock) return 0;
  scanLock = true;
  const cities = ['Austin','Dallas','Houston','Phoenix','Seattle','Chicago','San Diego','Portland','Denver'];
  let total = 0;
  try {
    for (const city of cities) {
      const url = `https://data.${city.toLowerCase()}-api.com/permits?limit=50`;
      try {
        const res = await axios.get(url, { timeout: 15000 });
        const data = res.data || [];
        for (const p of data) {
          const lead = { external_id: `${city}-${p.id || Date.now()}`, region: city, value_estimate: Number(p.value || 0) };
          const { error } = await supabase.from('leads').upsert(lead);
          if (!error) total++;
          await trackRevenue({ os_id: 12, lead_id: lead.external_id, amount: lead.value_estimate * 0.03, type: 'lead_ingested' });
        }
      } catch {}
    }
  } finally {
    scanLock = false;
  }
  return total;
}

/* === ENGINE === */
class Engine {
  static async runScan() {
    const saved = await scanCities();
    await trackRevenue({ os_id: 5, lead_id: null, amount: saved * 10, type: 'scan_cycle' });
    if (saved > 0) await sendWhatsApp(`📊 GridV21 Scan Complete: ${saved} new leads ingested`);
    return { saved };
  }
}

/* === CRON JOBS === */
cron.schedule('*/30 *', async () => {
  console.log('cron scan running');
  await Engine.runScan();
});

// Daily summary 8PM SAST
cron.schedule('0 18 *', async () => {
  try {
    const { data } = await supabase.from('revenue_events').select('amount').gte('created_at', new Date().toISOString().split('T')[0]);
    const total = (data || []).reduce((s, e) => s + Number(e.amount || 0), 0);
    await sendWhatsApp(`📈 GridV21 Daily: $${total.toFixed(2)} revenue tracked today`);
  } catch (e) {
    console.error('Daily summary error:', e.message);
  }
});

/* === ROUTES === */
app.get('/health', (_, res) => res.json({ status: 'ok', version: VERSION, uptime: process.uptime() }));

app.get('/api/revenue', async (_, res) => {
  try {
    const { data } = await supabase.from('revenue_events').select('*');
    const byOS = {};
    for (const e of data || []) byOS[e.os_id] = (byOS[e.os_id] || 0) + Number(e.amount ||  0);
    res.json({ success: true, byOS });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/leads', async (_, res) => {
  try {
    const { data } = await supabase.from('leads').select('*').limit(50);
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/run-scan', async (_, res) => {
  try {
    const result = await Engine.runScan();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* === STATIC + SPA === */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/affiliates', (req, res) => res.sendFile(path.join(__dirname, 'public', 'affiliates.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

/* === ERROR HANDLER === */
app.use((err, req, res, next) => {
  console.error(err.stack);
  sendWhatsApp(`🚨 GridV21 Crash: ${err.message}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

/* === START === */
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`GRIDV21 v${VERSION} running on ${PORT}`);
  console.log('Dashboard:', `http://localhost:${PORT}/`);
  await sendWhatsApp(`✅ GridV21 v${VERSION} started on Render`);
});

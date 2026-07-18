console.log('GridV21 starting... Node:', process.version);

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import axios from 'axios';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const VERSION = '4.4.4';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'gridv21-final',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

const dmLimiter = rateLimit({ windowMs: 30*60*1000, max: 50, message: 'Rate limited' });

const SUPABASE_URL = 'https://iatjgyrphrxeqaiqbpfb.supabase.co';
const AMAZON_AFFILIATE_ID = 'grid08-20';
const YOUTUBE_HANDLE = '@lazarustakudzwachenana1936';
const LINKEDIN_PROFILE = 'https://za.linkedin.com/in/lazarus-chenana-5b511215b';
const WHATSAPP_NUMBER = '+27672049913';
const OWNER_EMAIL = 'ltchenana.thirteen@gmail.com';
const ADMIN_KEY = 'T578ij74de34vgh9km65vcds32sa9kb5';

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_KEY?.trim());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

/* ====================== 12 OS MODULES ====================== */
const BRAIN_OS = [
  { id: 1, name: 'Executive Intelligence OS', layer: 'Strategy', agents_count: 3, kpis_count: 5 },
  { id: 2, name: 'Revenue Intelligence OS', layer: 'Finance', agents_count: 4, kpis_count: 6 },
  { id: 3, name: 'Sales & CRM OS', layer: 'Sales', agents_count: 5, kpis_count: 4 },
  { id: 4, name: 'Marketing OS', layer: 'Growth', agents_count: 6, kpis_count: 7 },
  { id: 5, name: 'Operations OS', layer: 'Ops', agents_count: 4, kpis_count: 5 },
  { id: 6, name: 'Finance OS', layer: 'Finance', agents_count: 3, kpis_count: 6 },
  { id: 7, name: 'Human Capital OS', layer: 'HR', agents_count: 4, kpis_count: 4 },
  { id: 8, name: 'Project Management OS', layer: 'PMO', agents_count: 5, kpis_count: 5 },
  { id: 9, name: 'Knowledge OS', layer: 'Data', agents_count: 3, kpis_count: 3 },
  { id: 10, name: 'Legal & Compliance OS', layer: 'Legal', agents_count: 2, kpis_count: 4 },
  { id: 11, name: 'Supply Chain OS', layer: 'Supply', agents_count: 4, kpis_count: 5 },
  { id: 12, name: 'Acquisition Intelligence OS', layer: 'Leads', agents_count: 6, kpis_count: 8 }
];
let OS_STATUS = Object.fromEntries(BRAIN_OS.map(os => [os.id, 'active']));

/* ====================== DB INIT ====================== */
async function initDatabase() {
  try {
    console.log('🔄 Initializing Supabase...');
    const { data: existing } = await supabase.from('os_modules').select('id').limit(1).catch(() => null);
    if (!existing || existing.length === 0) {
      const seed = BRAIN_OS.map(os => ({
        id: os.id,
        name: os.name,
        layer: os.layer,
        agents_count: os.agents_count,
        kpis_count: os.kpis_count,
        status: 'active',
        last_run: new Date().toISOString()
      }));
      await supabase.from('os_modules').insert(seed).catch(() => {});
      console.log('✅ OS modules seeded');
    }
    console.log('✅ Supabase ready');
  } catch (e) {
    console.log('Supabase init warning:', e.message);
  }
}
initDatabase();

/* ====================== PASSPORT ====================== */
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  }, async (token, tokenSecret, profile, done) => {
    try {
      const { data } = await supabase.from('companies').upsert({
        email: profile.emails[0].value,
        name: profile.displayName,
        avatar: profile.photos[0]?.value
      }, { onConflict: 'email' }).select().single();
      return done(null, data);
    } catch(e) { return done(e, null); }
  }));
}
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { data } = await supabase.from('companies').select().eq('id', id).single();
    done(null, data);
  } catch(e) { done(e, null); }
});

/* ====================== BRAIN CLASS ====================== */
class Brain {
  static async getMonthlyProjection() {
    try {
      const since = new Date(Date.now() - 24*60*60*1000).toISOString();
      const { data, error } = await supabase.from('revenue_log').select('amount').gte('created_at', since);
      if (error) return 0;
      const daily = data?.reduce((s, r) => s + parseFloat(r.amount), 0) || 0;
      return daily * 30;
    } catch(e) { return 0; }
  }
  static async getLeadCount() {
    try {
      const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true });
      return count || 0;
    } catch(e) { return 0; }
  }
  static async logRevenue(amount, source) {
    try {
      if (amount >= 0) {
        await supabase.from('revenue_log').insert({ amount, source, created_at: new Date() });
      }
    } catch(e) { console.error('Log revenue error:', e); }
  }
}

/* ====================== PERMIT SCANNER ====================== */
const CITIES = [
  { name: 'Austin', url: 'https://data.austintexas.gov/resource/3syk-w9eu.json' },
  { name: 'Denver', url: 'https://data.denvergov.org/resource/r5jd-p7g9.json' },
  { name: 'Chicago', url: 'https://data.cityofchicago.org/resource/6ij4-pg3t.json' }
];

async function savePermit(city, p) {
  try {
    const permit_id = `${city.name.toLowerCase()}-${p.permit_number || p.id || Date.now()}`;
    const { data: existing } = await supabase.from('permits').select('permit_id').eq('permit_id', permit_id).maybeSingle();
    if (existing) return { inserted: false };
    const permitData = {
      permit_id, city: city.name,
      permit_type: p.permit_type_description || p.permit_type || p.type || 'Unknown',
      status: 'new', issued_date: p.issued_date || null, raw_data: p
    };
    await supabase.from('permits').insert(permitData);
    return { inserted: true, permit_id };
  } catch (e) { return null; }
}

let scanRunning = false;
async function scanAllCities() {
  if (scanRunning) return 0;
  scanRunning = true;
  let total = 0;
  try {
    for (const city of CITIES) {
      try {
        const res = await axios.get(`${city.url}?$limit=20`, { timeout: 15000 });
        const permits = res.data || [];
        for (const p of permits) {
          const result = await savePermit(city, p);
          if (result?.inserted) total++;
        }
      } catch (e) { console.error(`Scan error ${city.name}:`, e.message); }
      await new Promise(r => setTimeout(r, 600));
    }
    return total;
  } finally { scanRunning = false; }
}

/* ====================== ROUTES ====================== */

// FIX: New dashboard route for frontend
app.get('/api/dashboard', async (req, res) => {
  try {
    const { data: permits } = await supabase.from('permits').select('*').order('created_at', { ascending: false }).limit(20);
    const { data: osModules } = await supabase.from('os_modules').select('*').order('id');
    const { data: revenue } = await supabase.from('revenue_log').select('amount').limit(100);

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
      osModules: osModules || BRAIN_OS.map(o => ({...o, status: OS_STATUS[o.id] }))
    });
  } catch (e) {
    res.json({
      success: true,
      metrics: { total_leads: 0, dms_sent: 0, est_revenue_month: 0, os_active: 12 },
      permits: [],
      osModules: BRAIN_OS.map(o => ({...o, status: 'active'}))
    });
  }
});

// FIX: Proper health check
app.get('/api/test', (req, res) => {
  const active = Object.values(OS_STATUS).filter(s => s === 'active').length;
  res.json({ version: VERSION, os_active: active, status: 'online', engine: 'GRIDV21' });
});

app.post('/api/os-toggle/:id', async (req, res) => {
  const id = Number(req.params.id);
  const newStatus = OS_STATUS[id] === 'active'? 'inactive' : 'active';
  OS_STATUS[id] = newStatus;
  await supabase.from('os_modules').update({ status: newStatus }).eq('id', id);
  res.json({ id, status: newStatus });
});

app.post('/api/scrape-now', async (req, res) => {
  const saved = await scanAllCities();
  res.json({ status: 'success', permits_found: saved });
});

app.get('/api/forecast', async (req, res) => {
  const monthly = await Brain.getMonthlyProjection();
  const leadCount = await Brain.getLeadCount();
  res.json({
    mode: monthly >= 300? 'growth_mode' : 'zero_capex',
    monthly_projection: monthly,
    daily_revenue: monthly/30,
    total_leads: leadCount,
    youtube: YOUTUBE_HANDLE, linkedin: LINKEDIN_PROFILE,
    whatsapp: WHATSAPP_NUMBER, email: OWNER_EMAIL, amazon_id: AMAZON_AFFILIATE_ID
  });
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { successRedirect: '/dashboard.html' }));

app.get('/', (req, res) => res.redirect('/dashboard.html'));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

/* ====================== CRON ====================== */
cron.schedule('*/30 * * * *', () => scanAllCities());

/* ====================== START ====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 GRIDV21 v${VERSION} LIVE on port ${PORT}`);
});

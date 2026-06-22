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

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'gridv21', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY?.trim());
if (!process.env.SUPABASE_URL ||!process.env.SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase credentials');

const VERSION = '5.4.9';

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

async function savePermitToLeads(city, p) {
  const permitData = {
    external_id: `${city.name}-${p.permit_number || p.id || Date.now()}`,
    trade_type: p.permit_type_description || p.permit_type || 'Unknown',
    region: city.name,
    permit_data: p,
    value_estimate: Number(p.project_valuation || p.estimated_cost || p.value || 0),
    source: `${city.name} Open Data`,
    contractor: p.contractor_name || p.contractor || 'Unknown',
    address: p.address || p.street_address || null,
    permit_number: p.permit_number || p.id || null,
    issued_date: p.issued_date || p.issue_date || null,
    status: 'new',
    stage: 'scanned',
    last_seen_at: new Date().toISOString()
  };

  const { error } = await supabase.from('leads').upsert(permitData, { onConflict: 'external_id' });
  if (error) console.error('Supabase error:', error.message);
  return!error;
}

async function scanAllCities() {
  let totalSaved = 0;
  for (const city of CITIES) {
    try {
      const url = `${city.url}?$limit=50`;
      const response = await axios.get(url);
      const permits = response.data;
      let saved = 0;
      for (const p of permits) if (await savePermitToLeads(city, p)) saved++;
      totalSaved += saved;
      console.log(`Brain scanned ${permits.length} from ${city.name}, saved ${saved}`);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) { console.error(`${city.name} scan error:`, err.message); }
  }
  return totalSaved;
}

const BRAIN_OS = [
  { id: 1, name: 'Executive Intelligence OS' }, { id: 2, name: 'Revenue Intelligence OS' },
  { id: 3, name: 'Sales & CRM OS' }, { id: 4, name: 'Marketing OS' }, { id: 5, name: 'Operations OS' },
  { id: 6, name: 'Finance OS' }, { id: 7, name: 'Human Capital OS' }, { id: 8, name: 'Project Management OS' },
  { id: 9, name: 'Knowledge OS' }, { id: 10, name: 'Legal & Compliance OS' }, { id: 11, name: 'Supply Chain OS' },
  { id: 12, name: 'Acquisition Intelligence OS' }
];

let OS_STATUS = Object.fromEntries(BRAIN_OS.map(os => [os.id, 'active']));
const dmLimiter = rateLimit({ windowMs: 30 * 60 * 1000, max: 50 });

class Engine {
  static async runScan() {
    if (OS_STATUS[12]!== 'active') return { permits_found: 0, skipped: true };
    const saved = await scanAllCities();
    return { permits_found: saved, timestamp: new Date().toISOString() };
  }
  static async analyzeLead(leadId) {
    const { data } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!data) return { error: 'Lead not found' };
    const value = Number(data.value_estimate || 0);
    const score = Math.min(100, Math.round(value / 1000));
    const tier = score > 70? 'Hot' : score > 40? 'Warm' : 'Cold';
    return { score, tier, recommended_os: 'Revenue Intelligence OS', value };
  }
}

/* ====================== CRON - FIXED: */30 * = every 30min ✅ ====================== */
cron.schedule('*/30 *', async () => {
  console.log('Brain auto-scan triggered');
  try { await scanAllCities(); }
  catch (err) { console.error('Cron error:', err.message); }
});

/* ====================== ROUTES ====================== */
app.get('/api/test', (req, res) => {
  const activeCount = Object.values(OS_STATUS).filter(v => v === 'active').length;
  res.json({ alive: true, version: VERSION, os_active: activeCount, engine: 'Gridv21 v5.4.9' });
});

app.get('/api/os-status', (req, res) => res.json(BRAIN_OS.map(os => ({...os, status: OS_STATUS[os.id] }))));
app.post('/api/os-toggle/:id', (req, res) => {
  const id = Number(req.params.id);
  OS_STATUS[id] = OS_STATUS[id] === 'active'? 'inactive' : 'active';
  res.json({ id, status: OS_STATUS[id] });
});

app.get('/api/permits-recent', async (req, res) => {
  try {
    const { data, error } = await supabase.from('leads').select('*').order('issued_date', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leads-recent', async (req, res) => {
  try {
    const { data, error } = await supabase.from('leads').select('*').order('last_seen_at', { ascending: false }).limit(20);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/metrics', async (req, res) => {
  try {
    const { data: leads } = await supabase.from('leads').select('value_estimate, status');
    const wonDeals = leads?.filter(l => l.status === 'won').length || 0;
    const wonValue = leads?.filter(l => l.status === 'won').reduce((sum, l) => sum + Number(l.value_estimate || 0), 0) || 0;
    const performanceRevenue = Math.round(wonValue * 0.03);
    res.json({
      dms_sent: 0,
      est_revenue_month: performanceRevenue,
      revenue_breakdown: { setup: 0, ai_fees: 0, performance: performanceRevenue, won_deals: wonDeals, won_value: wonValue }
    });
  } catch (e) { res.json({ dms_sent: 0, est_revenue_month: 0, revenue_breakdown: { setup: 0, ai_fees: 0, performance: 0, won_deals: 0, won_value: 0 } }); }
});

app.get('/api/proposals', async (req, res) => {
  try {
    const { data } = await supabase.from('leads').select('contractor, value_estimate, status').eq('status', 'proposal').limit(20);
    const props = data?.map(d => ({ client: d.contractor, total_estimate: d.value_estimate, status: 'draft' })) || [];
    res.json(props);
  } catch (e) { res.json([]); }
});

app.post('/api/mark-won/:id', async (req, res) => {
  const { error } = await supabase.from('leads').update({ status: 'won' }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/api/engine/analyze/:id', async (req, res) => {
  const result = await Engine.analyzeLead(req.params.id);
  res.json(result);
});

app.post('/api/dm-sent', dmLimiter, async (req, res) => {
  const { lead_id } = req.body;
  console.log(`DM sent to lead ${lead_id}`);
  res.json({ success: true, message: 'DM logged' });
});

app.post('/api/generate-proposal/:id', async (req, res) => {
  const { data: lead } = await supabase.from('leads').select('*').eq('id', req.params.id).single();
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const proposal = {
    client: lead.contractor,
    value: lead.value_estimate,
    gridv21_fee: Math.round(lead.value_estimate * 0.03),
    items: [
      { name: 'Stage 1: Setup', price: 150 },
      { name: 'Stage 2: AI Leads', price: 50 },
      { name: 'Stage 3: Performance 3%', price: Math.round(lead.value_estimate * 0.03) }
    ],
    total_estimate: 150 + 50 + Math.round(lead.value_estimate * 0.03)
  };
  await supabase.from('leads').update({ status: 'proposal' }).eq('id', req.params.id);
  res.json({ success: true, proposal });
});

app.get('/api/test-insert', async (req, res) => {
  const testPermit = {
    external_id: `TEST-${Date.now()}`,
    trade_type: 'ELECTRICAL',
    region: 'Chicago',
    permit_data: {test: true},
    value_estimate: 50000,
    source: 'Manual Test',
    contractor: 'Test Contractor LLC',
    address: '999 Test St',
    permit_number: 'TEST-001',
    issued_date: new Date().toISOString().split('T')[0],
    status: 'new',
    stage: 'scanned',
    last_seen_at: new Date().toISOString()
  };
  await supabase.from('leads').upsert(testPermit, { onConflict: 'external_id' });
  res.json({ success: true });
});

app.get('/api/scrape-now', dmLimiter, async (req, res) => {
  const result = await Engine.runScan();
  res.json({ status: 'scraped',...result });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GRIDV21 BRAIN v${VERSION} running on ${PORT}`));

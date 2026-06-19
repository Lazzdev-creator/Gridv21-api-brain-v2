console.log('GRIDV21 BRAIN v4.5.0 LIVE-METRICS starting... Node:', process.version);
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';
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
app.use(session({ secret: 'gridv21', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY?.trim());
const dmLimiter = rateLimit({ windowMs: 30*60*1000, max: 50 });

// === 12 INTELLIGENT BRAIN OSes ===
const BRAIN_OS = [
  { id: 1, name: 'Executive Intelligence OS', status: 'active', function: 'Strategy + Decision Making' },
  { id: 2, name: 'Revenue Intelligence OS', status: 'active', function: 'Revenue Forecasting + Optimization' },
  { id: 3, name: 'Sales & CRM OS', status: 'active', function: 'Lead Management + Pipeline' },
  { id: 4, name: 'Marketing OS', status: 'active', function: 'Campaigns + Attribution' },
  { id: 5, name: 'Operations OS', status: 'active', function: 'Workflow Automation' },
  { id: 6, name: 'Finance OS', status: 'active', function: 'Cashflow + Invoicing' },
  { id: 7, name: 'Human Capital OS', status: 'active', function: 'Team + HR Automation' },
  { id: 8, name: 'Project Management OS', status: 'active', function: 'Tasks + Delivery' },
  { id: 9, name: 'Knowledge OS', status: 'active', function: 'Docs + Memory' },
  { id: 10, name: 'Legal & Compliance OS', status: 'active', function: 'Contracts + Compliance' },
  { id: 11, name: 'Supply Chain OS', status: 'active', function: 'Vendors + Logistics' },
  { id: 12, name: 'Acquisition Intelligence OS', status: 'active', function: 'Permit Scanning + Leads' }
];

// === SMART ENGINE ===
class Engine {
  static async analyzeLead(leadId) {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return { leadId, error: 'Lead not found', score: 0, tier: 'None', recommended_os: 'None' };

    let score = 50;
    if (lead.value_estimate > 50000) score += 30;
    else if (lead.value_estimate > 20000) score += 15;
    if (lead.trade_type === 'electrical') score += 15;
    if (lead.trade_type === 'plumbing') score += 10;
    if (lead.region && lead.region.includes('Austin')) score += 10;
    if (lead.status === 'new') score += 5;
    score = Math.min(100, Math.max(0, score));

    const tier = score > 70? 'Hot' : score > 40? 'Warm' : 'Cold';
    const recommended_os = score > 70? 'Revenue Intelligence OS' : score > 50? 'Sales & CRM OS' : 'Acquisition Intelligence OS';

    return { leadId, score, tier, recommended_os, value: lead.value_estimate, trade: lead.trade_type };
  }

  static async runScan() {
    const permits = await PermitScraper.scrapeAustinPermits();
    return { permits_found: permits, os_triggered: 'Acquisition Intelligence OS', timestamp: new Date().toISOString() };
  }
}

class PermitScraper {
  static async scrapeAustinPermits() {
    try {
      const { data: html } = await axios.get('https://abc.austintexas.gov/web/permit-search', { headers: { 'User-Agent': 'GRIDV21' }, timeout: 30000 });
      const $ = cheerio.load(html);
      let permitsFound = 0;
      $('table.permit-results tr').each(async (i, row) => {
        if (i === 0) return;
        const cols = $(row).find('td');
        if (cols.length < 5) return;
        const permitNo = $(cols[0]).text().trim();
        const { data: existing } = await supabase.from('leads').select('id').eq('permit_data->>permit_no', permitNo).single();
        if (!existing) {
          await supabase.from('leads').insert({ trade_type: 'building', region: 'US-TX-Austin', value_estimate: 35000, permit_data: { permit_no: permitNo }, status: 'new' });
          permitsFound++;
        }
      });
      return permitsFound;
    } catch (e) { console.log('Scrape error:', e.message); return 0; }
  }
}

// === API ROUTES ===
app.get('/api/test', (req, res) => res.json({ alive: true, version: '4.5.0', engine: 'online' }));
app.get('/api/os-status', (req, res) => res.json(BRAIN_OS));

// === LIVE METRICS - CALCULATES FROM REAL LEADS ===
app.get('/api/metrics', async (req, res) => {
  try {
    // Count total leads
    const { count: total_leads } = await supabase.from('leads').select('*', { count: 'exact', head: true });

    // Sum all value_estimate for revenue calculation
    const { data: leads } = await supabase.from('leads').select('value_estimate');
    const total_value = leads?.reduce((sum, l) => sum + (l.value_estimate || 0), 0) || 0;

    // Revenue model: $150 base + 0.3% of project value = AI fee
    const est_revenue_month = Math.floor(total_value * 0.003 + (total_leads || 0) * 150);

    // Count DMs - wire to real table later
    const { count: dms_sent } = await supabase.from('dm_logs').select('*', { count: 'exact', head: true });

    res.json({
      total_leads: total_leads || 0,
      dms_sent: dms_sent || 0,
      est_revenue_month: est_revenue_month,
      brain_os_active: 12,
      engine_status: 'online',
      user: {
        email: 'admin@gridv21.com',
        contacts: { YouTube: 'Not connected', LinkedIn: 'Not connected', WhatsApp: 'Not connected' }
      }
    });
  } catch(e) {
    console.log('Metrics error:', e.message);
    res.json({ total_leads:0, dms_sent:0, est_revenue_month:0, brain_os_active:12, engine_status:'online' });
  }
});

app.get('/api/engine/analyze/:leadId', async (req, res) => {
  const result = await Engine.analyzeLead(req.params.leadId);
  res.json(result);
});

app.get('/api/forecast', async (req, res) => {
  const { data: leads } = await supabase.from('leads').select('value_estimate');
  const total_value = leads?.reduce((sum, l) => sum + (l.value_estimate || 0), 0) || 0;
  res.json({ forecast_90days: Math.floor(total_value * 0.009), engine_prediction: 'Revenue Intelligence OS active' });
});

app.get('/api/scrape-now', dmLimiter, async (req, res) => {
  const result = await Engine.runScan();
  res.json({ status: 'scraped',...result });
});

app.get('/api/test-insert', async (req, res) => {
  const { data } = await supabase.from('leads').insert({
    trade_type: 'electrical',
    region: 'US-TX-Austin',
    value_estimate: 65000,
    permit_data: { permit_no: 'TEST-2026-' + Date.now() },
    status: 'new'
  }).select();
  res.json({ inserted: true, lead: data[0] });
});

// === NEW: TENANTS CONTROL FEED ===
app.get('/api/leads-recent', async (req, res) => {
  try {
    const { data, error } = await supabase
    .from('leads')
    .select('id, region, trade_type, value_estimate, created_at, status')
    .order('created_at', { ascending: false })
    .limit(5);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.log('leads-recent error:', e.message);
    res.json([]);
  }
});

// === STATIC LAST ===
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`v4.5.0 LIVE-METRICS on port ${PORT} - Engine + 12 OS online`));

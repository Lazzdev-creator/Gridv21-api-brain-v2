console.log('GRIDV21 BRAIN v5.1.0 REAL-REVENUE starting... Node:', process.version);
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

const BRAIN_OS = [
  { id: 1, name: 'Executive Intelligence OS', status: 'active' },
  { id: 2, name: 'Revenue Intelligence OS', status: 'active' },
  { id: 3, name: 'Sales & CRM OS', status: 'active' },
  { id: 4, name: 'Marketing OS', status: 'active' },
  { id: 5, name: 'Operations OS', status: 'active' },
  { id: 6, name: 'Finance OS', status: 'active' },
  { id: 7, name: 'Human Capital OS', status: 'active' },
  { id: 8, name: 'Project Management OS', status: 'active' },
  { id: 9, name: 'Knowledge OS', status: 'active' },
  { id: 10, name: 'Legal & Compliance OS', status: 'active' },
  { id: 11, name: 'Supply Chain OS', status: 'active' },
  { id: 12, name: 'Acquisition Intelligence OS', status: 'active' }
];

class Engine {
  static async analyzeLead(leadId) {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return { leadId, error: 'Lead not found', score: 0, tier: 'None' };
    
    let score = 50;
    if (lead.value_estimate > 50000) score += 30;
    else if (lead.value_estimate > 20000) score += 15;
    if (lead.trade_type === 'electrical') score += 15;
    if (lead.region?.includes('Austin')) score += 10;
    if (lead.status === 'new') score += 5;
    score = Math.min(100, score);
    
    const tier = score > 70? 'Hot' : score > 40? 'Warm' : 'Cold';
    return { leadId, score, tier, value: lead.value_estimate, trade: lead.trade_type, status: lead.status };
  }
  
  static async runScan() {
    const permits = await PermitScraper.scrapeAustinPermits();
    return { permits_found: permits, timestamp: new Date().toISOString() };
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
          await supabase.from('leads').insert({ trade_type: 'building', region: 'US-TX-Austin', value_estimate: 35000, permit_data: { permit_no }, status: 'new' });
          permitsFound++;
        }
      });
      return permitsFound;
    } catch (e) { console.log('Scrape error:', e.message); return 0; }
  }
}

// === API ROUTES ===
app.get('/api/test', (req, res) => res.json({ alive: true, version: '5.1.0', engine: 'online' }));
app.get('/api/os-status', (req, res) => res.json(BRAIN_OS));

// === REAL 3-STAGE REVENUE ===
app.get('/api/metrics', async (req, res) => {
  try {
    const { count: total_leads } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { data: leads } = await supabase.from('leads').select('value_estimate, status, region');
    
    // Stage 1: Setup $150 per unique region/client
    const unique_regions = new Set(leads?.map(l => l.region)).size;
    const setup_revenue = unique_regions * 150;
    
    // Stage 2: AI $5 per lead processed
    const ai_revenue = (total_leads || 0) * 5;
    
    // Stage 3: Performance 3% of WON deals
    const won_deals = leads?.filter(l => l.status === 'won') || [];
    const won_value = won_deals.reduce((sum, l) => sum + (l.value_estimate || 0), 0);
    const performance_revenue = Math.floor(won_value * 0.03);
    
    const est_revenue_month = setup_revenue + ai_revenue + performance_revenue;
    
    const { count: dms_sent } = await supabase.from('dm_logs').select('*', { count: 'exact', head: true });
    
    res.json({
      total_leads: total_leads || 0,
      dms_sent: dms_sent || 0,
      est_revenue_month,
      revenue_breakdown: { setup: setup_revenue, ai_fees: ai_revenue, performance: performance_revenue, won_deals: won_deals.length, won_value },
      brain_os_active: 12,
      engine_status: 'online'
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

app.get('/api/scrape-now', dmLimiter, async (req, res) => {
  const result = await Engine.runScan();
  res.json({ status: 'scraped', ...result });
});

app.get('/api/test-insert', async (req, res) => {
  const { data } = await supabase.from('leads').insert({
    trade_type: 'electrical', region: 'US-TX-Austin', value_estimate: 65000, 
    permit_data: { permit_no: 'TEST-2026-' + Date.now() }, status: 'new'
  }).select();
  res.json({ inserted: true, lead: data[0] });
});

app.get('/api/leads-recent', async (req, res) => {
  try {
    const { data } = await supabase.from('leads').select('id, region, trade_type, value_estimate, status, created_at').order('created_at', { ascending: false }).limit(5);
    res.json(data || []);
  } catch (e) { res.json([]); }
});

// === DM TRACKING ===
app.post('/api/dm-sent', async (req, res) => {
  const { lead_id } = req.body;
  await supabase.from('dm_logs').insert({ lead_id, sent_at: new Date().toISOString() });
  res.json({ success: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`v5.1.0 REAL-REVENUE on port ${PORT}`));

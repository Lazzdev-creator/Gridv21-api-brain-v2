import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = "6.0.6";

/* ====================== MIDDLEWARE ====================== */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public/dashboard')));

/* ====================== SUPABASE ====================== */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/* ====================== GRIDV21 12 OS CONFIG ====================== */
const VERSION = "6.0.6";
const CITIES = ['Johannesburg', 'Pretoria', 'Cape Town', 'Durban', 'Daveyton']; // Add your cities

const BRAIN_OS = [
  { id: 1, name: 'OS1 Prospecting', layer: 'Acquisition', agents_count: 8, kpis_count: 12 },
  { id: 2, name: 'OS2 Enrichment', layer: 'Data', agents_count: 6, kpis_count: 9 },
  { id: 3, name: 'OS3 Outreach', layer: 'Engagement', agents_count: 12, kpis_count: 15 },
  { id: 4, name: 'OS4 Qualification', layer: 'Sales', agents_count: 5, kpis_count: 8 },
  { id: 5, name: 'OS5 Closing', layer: 'Revenue', agents_count: 4, kpis_count: 6 },
  { id: 6, name: 'OS6 Delivery', layer: 'Ops', agents_count: 7, kpis_count: 10 },
  { id: 7, name: 'OS7 Retention', layer: 'CS', agents_count: 5, kpis_count: 7 },
  { id: 8, name: 'OS8 Finance', layer: 'Money', agents_count: 3, kpis_count: 5 },
  { id: 9, name: 'OS9 Analytics', layer: 'BI', agents_count: 6, kpis_count: 11 },
  { id: 10, name: 'OS10 Compliance', layer: 'Legal', agents_count: 2, kpis_count: 4 },
  { id: 11, name: 'OS11 HR', layer: 'Team', agents_count: 3, kpis_count: 5 },
  { id: 12, name: 'OS12 CEO Brain', layer: 'Strategy', agents_count: 1, kpis_count: 20 }
];

let OS_STATUS = {};
BRAIN_OS.forEach(os => OS_STATUS[os.id] = 'active');


/* ====================== CORE FUNCTION: SCRAPER ====================== */
async function scrapeCity(city) {
  try {
    // EXAMPLE: Replace with your real city permit portal URL
    const url = `https://example-permits.gov/${city}/new`; 
    const { data: html } = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(html);
    const permits = [];

    $('.permit-row').each((i, el) => { // CHANGE SELECTOR TO MATCH SITE
      const permit_id = $(el).find('.permit-id').text().trim();
      const permit_type = $(el).find('.type').text().trim();
      const issued_date = $(el).find('.date').text().trim();
      
      if (permit_id) {
        permits.push({
          permit_id: `${city}-${permit_id}`,
          city,
          permit_type,
          status: 'new',
          issued_date: new Date(issued_date),
          raw_data: { source: url }
        });
      }
    });
    return permits;
  } catch (e) {
    console.error(`Scrape error for ${city}:`, e.message);
    return [];
  }
}


/* ====================== CORE FUNCTION: AI ENRICHMENT OS2 ====================== */
async function enrichPermit(permit) {
  // OS2: Call OpenAI/Claude to find contractor email, phone, project value
  // For now we mock it. Replace with real AI call
  return {
   ...permit,
    contractor_name: "Mock Contractor",
    contractor_email: "contact@mock.com",
    est_project_value: Math.floor(Math.random() * 500000) + 50000
  };
}


/* ====================== CORE FUNCTION: DM OUTREACH OS3 ====================== */
async function sendDM(permit) {
  // OS3: Send email/IG DM/LinkedIn DM
  // For now we log it and save to revenue_log as "DM Sent"
  console.log(`DM SENT to ${permit.contractor_email} for ${permit.permit_id}`);
  await supabase.from('revenue_log').insert({
    amount: 0, // $0 until they reply
    source: `DM: ${permit.permit_id}`
  });
  return true;
}


/* ====================== CORE FUNCTION: MASTER SCAN ====================== */
async function scanAllCities() {
  if (OS_STATUS[1]!== 'active') return 0; // OS1 must be active
  console.log("🧠 GRIDV21 SCAN STARTED");
  let totalSaved = 0;

  for (const city of CITIES) {
    const permits = await scrapeCity(city);
    for (const p of permits) {
      // OS2 Enrichment
      const enriched = OS_STATUS[2] === 'active'? await enrichPermit(p) : p;
      // Save to DB
      const { error } = await supabase.from('permits').upsert(enriched, { onConflict: 'permit_id' });
      if (!error) {
        totalSaved++;
        // OS3 Outreach
        if (OS_STATUS[3] === 'active') await sendDM(enriched);
      }
    }
  }
  console.log(`✅ SCAN COMPLETE: ${totalSaved} new permits`);
  return totalSaved;
}

/* ====================== CRON ====================== */
// Every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    console.log("⏰ Running scheduled permit scan...");
    await scanAllCities();
  } catch (err) {
    console.error("Cron error:", err);
  }
});


/* ====================== GRIDV21 API ROUTES ====================== */
app.get('/api/test', (req, res) => { 
  const active = Object.values(OS_STATUS).filter(s => s === 'active').length;
  res.json({ success: true, version: VERSION, os_active: active }); 
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const { data: permits } = await supabase.from('permits').select('*').order('created_at', { ascending: false }).limit(100);
    const { data: osModules } = await supabase.from('os_modules').select('*').order('id');
    const { data: revenue } = await supabase.from('revenue_log').select('amount').limit(1000);

    const metrics = {
      total_leads: permits?.length || 0,
      dms_sent: revenue?.length || 0,
      est_revenue_month: (revenue || []).reduce((sum, r) => sum + Number(r.amount || 0), 0),
      os_active: (osModules || BRAIN_OS).filter(o => o.status === 'active').length
    };

    res.json({ 
      success: true, 
      metrics, 
      permits: permits || [], 
      osModules: osModules || BRAIN_OS.map(o => ({...o, status: OS_STATUS[o.id]}))
    });
  } catch (e) {
    console.error('Dashboard fatal error', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/os-toggle/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const newStatus = OS_STATUS[id] === 'active'? 'inactive' : 'active';
    OS_STATUS[id] = newStatus;
    await supabase.from('os_modules').update({ status: newStatus }).eq('id', id);
    res.json({ success: true, id, status: newStatus });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/scrape-now', async (req, res) => { 
  try { 
    console.log("Manual scan started"); 
    const saved = await scanAllCities(); 
    const { count } = await supabase.from("permits").select("*", { count: "exact", head: true }); 
    res.json({ success: true, permits_found: saved || 0, total_permits: count || 0 });
  } catch (err) { 
    console.error(err); 
    res.status(500).json({ success: false, message: err.message }); 
  } 
});


/* ====================== FRONTEND ROUTE ====================== */
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/index.html'));
});
app.get('/', (req, res) => res.redirect('/dashboard'));


/* ====================== START SERVER ====================== */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 GRIDV21 BRAIN v${VERSION} LIVE on port ${PORT}`);
  console.log(`12 OS Loaded. Auto-scan every 30min.`);
});

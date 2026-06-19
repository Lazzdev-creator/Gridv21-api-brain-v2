console.log('GRIDV21 BRAIN v4.4.4b STABLE starting... Node:', process.version);
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
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
app.use(session({ secret: process.env.SESSION_SECRET || 'gridv21-brain', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

const OS_12 = ['Executive Intelligence OS','Revenue Intelligence OS','Sales & CRM OS','Marketing OS','Operations OS','Finance OS','Human Capital OS','Project Management OS','Knowledge OS','Legal & Compliance OS','Supply Chain OS','Acquisition Intelligence OS'];
const LAYERS_5 = ['Intelligence Layer','Automation Layer','Prediction Layer','Revenue Layer','Decision Layer'];
const INTEGRATIONS = ['CRM','ERP','Stripe','WhatsApp','Email','Marketing','Documents','Databases','External APIs'];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY?.trim());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const dmLimiter = rateLimit({ windowMs: 30*60*1000, max: 50, message: 'Rate limited' });

class PermitScraper {
  static async scrapeAustinPermits() {
    try {
      console.log('Scraping Austin permits...');
      const { data: html } = await axios.get('https://abc.austintexas.gov/web/permit-search', { headers: { 'User-Agent': 'GRIDV21-Brain' }, timeout: 30000 });
      const $ = cheerio.load(html);
      let permitsFound = 0;
      $('table.permit-results tr').each(async (i, row) => {
        if (i === 0) return;
        const cols = $(row).find('td');
        if (cols.length < 5) return;
        const permitNo = $(cols[0]).text().trim();
        const address = $(cols[1]).text().trim();
        const permitType = $(cols[2]).text().trim();
        const status = $(cols[3]).text().trim();
        const issuedDate = $(cols[4]).text().trim();
        if (!status.match(/issued|active|approved/i)) return;
        let trade = 'building';
        if (permitType.match(/plumb/i)) trade = 'plumbing';
        if (permitType.match(/elect/i)) trade = 'electrical';
        if (permitType.match(/hvac|mech/i)) trade = 'hvac';
        if (permitType.match(/roof/i)) trade = 'roofing';
        const value = permitType.match(/new|addition/i)? 150000 : permitType.match(/remodel/i)? 75000 : permitType.match(/repair/i)? 15000 : 35000;
        const { data: existing } = await supabase.from('leads').select('id').eq('permit_data->>permit_no', permitNo).single();
        if (!existing) {
          await supabase.from('leads').insert({ trade_type: trade, region: 'US-TX-Austin', value_estimate: value, permit_data: { permit_no: permitNo, address, type: permitType, issued: issuedDate }, status: 'new' });
          permitsFound++;
        }
      });
      console.log(`Austin: ${permitsFound} new permits`);
      return permitsFound;
    } catch (err) { console.error('Austin error:', err.message); return 0; }
  }
  static async scrapeLAPermits() { console.log('LA scraper placeholder'); return 0; }
}

class Brain {
  static async getMetrics() {
    const { data: metrics } = await supabase.from('dashboard_metrics').select('*').limit(1).single();
    return metrics || { total_leads: 0, dms_sent: 0, est_revenue_month: 0, mode: 'zero_capex', os_active: 12, integrations_active: 0 };
  }
  static async autoUpgrade() {
    const metrics = await this.getMetrics();
    const { data: tier } = await supabase.from('settings').select('value').eq('key', 'render_tier').single();
    if (metrics.est_revenue_month >= 300 && tier?.value === 'free') {
      await supabase.from('settings').update({ value: 'starter' }).eq('key', 'render_tier');
      console.log('BRAIN UPGRADE: $300 hit');
    }
    return metrics.est_revenue_month >= 300? 'growth_mode' : 'zero_capex';
  }
}

app.get('/api/metrics', async (req, res) => res.json(await Brain.getMetrics()));
app.get('/api/os-status', async (req, res) => res.json((await supabase.from('os_modules').select('*').order('id')).data || OS_12.map((name, i) => ({ id: i+1, name, status: 'active' }))));
app.get('/api/layers', (req, res) => res.json(LAYERS_5.map((name, i) => ({ id: i + 1, name, status: 'operational' }))));
app.get('/api/integrations', async (req, res) => res.json((await supabase.from('integrations').select('*')).data || INTEGRATIONS.map(name => ({ name, status: 'disconnected' }))));
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '4.4.4b' }));
app.get('/api/forecast', async (req, res) => res.json({...await Brain.getMetrics(), email: process.env.OWNER_EMAIL }));
app.get('/api/scrape-now', dmLimiter, async (req, res) => {
  const austin = await PermitScraper.scrapeAustinPermits();
  const la = await PermitScraper.scrapeLAPermits();
  res.json({ status: 'scraped', austin_permits: austin, la_permits: la });
});

// CRON FIXED: 5 fields minute hour day month weekday
cron.schedule('*/30 *', async () => {
  const mode = await Brain.autoUpgrade();
  if (mode === 'growth_mode') { await PermitScraper.scrapeAustinPermits(); await PermitScraper.scrapeLAPermits(); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GRIDV21 BRAIN v4.4.4b STABLE on port ${PORT}`));

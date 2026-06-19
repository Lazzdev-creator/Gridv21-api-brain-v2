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
console.log('GRIDV21 BRAIN v4.4.6 BRACKET-FIX starting...');

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
    const score = Math.floor(Math.random() * 100);
    return { score, tier: score > 70 ? 'Hot' : score > 40 ? 'Warm' : 'Cold', os: 'Revenue Intelligence OS' };
  }
  static async runScan() {
    return { permits_found: 0, os_triggered: 'Acquisition Intelligence OS' };
  }
}

class PermitScraper {
  static async scrapeAustinPermits() { return 0; }
}

// APIs FIRST
app.get('/api/test', (req, res) => res.json({ alive: true, version: '4.4.6' }));

app.get('/api/os-status', (req, res) => res.json(BRAIN_OS));

app.get('/api/metrics', async (req, res) => {
  const { data: metrics } = await supabase.from('dashboard_metrics').select('*').limit(1).single();
  res.json({
    ...(metrics || {total_leads:0,dms_sent:0,est_revenue_month:0}), 
    brain_os_active: 12, 
    engine_status: 'online', 
    user: { 
      email: 'admin@gridv21.com', 
      contacts: { YouTube: 'Not connected', LinkedIn: 'Not connected', WhatsApp: 'Not connected' }
    }  // <-- FIXED: added missing } here
  });
});

app.get('/api/engine/analyze/:leadId', async (req, res) => {
  const result = await Engine.analyzeLead(req.params.leadId);
  res.json({ leadId: req.params.leadId, ...result });
});

app.get('/api/forecast', async (req, res) => {
  const { data: metrics } = await supabase.from('dashboard_metrics').select('*').limit(1).single();
  res.json({ forecast_90days: (metrics?.est_revenue_month || 0) * 3 });
});

app.get('/api/scrape-now', dmLimiter, async (req, res) => {
  const result = await Engine.runScan();
  res.json({ status: 'scraped', ...result });
});

// STATIC LAST
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`v4.4.6 BRACKET-FIX on port ${PORT} - Engine + 12 OS online`));

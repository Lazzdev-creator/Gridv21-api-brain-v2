console.log('GRIDV21 BRAIN v4.4.3 starting... Node:', process.version);
import express from 'express';
import cors from 'cors';
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
  secret: process.env.SESSION_SECRET || 'gridv21-brain', 
  resave: false, 
  saveUninitialized: true 
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

// ========== GRIDV21 BRAIN CONFIG ==========
const OS_12 = [
  'Executive Intelligence OS',
  'Revenue Intelligence OS',
  'Sales & CRM OS',
  'Marketing OS',
  'Operations OS',
  'Finance OS',
  'Human Capital OS',
  'Project Management OS',
  'Knowledge OS',
  'Legal & Compliance OS',
  'Supply Chain OS',
  'Acquisition Intelligence OS'
];

const LAYERS_5 = ['Intelligence Layer', 'Automation Layer', 'Prediction Layer', 'Revenue Layer', 'Decision Layer'];
const INTEGRATIONS = ['CRM', 'ERP', 'Stripe', 'WhatsApp', 'Email', 'Marketing', 'Documents', 'Databases', 'External APIs'];

const SUPABASE_URL = process.env.SUPABASE_URL;
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_KEY?.trim());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const dmLimiter = rateLimit({ windowMs: 30*60*1000, max: 50, message: 'Rate limited' });

// ========== BRAIN CLASS ==========
class Brain {
  static async getMetrics() {
    const { data: metrics } = await supabase.from('dashboard_metrics').select('*').limit(1).single();
    return metrics || {
      total_leads: 0,
      dms_sent: 0,
      est_revenue_month: 0,
      mode: 'zero_capex',
      os_active: 12,
      integrations_active: 0
    };
  }

  static async autoUpgrade() {
    const metrics = await this.getMetrics();
    const { data: tier } = await supabase.from('settings').select('value').eq('key', 'render_tier').single();
    if (metrics.est_revenue_month >= 300 && tier?.value === 'free') {
      await supabase.from('settings').update({ value: 'starter' }).eq('key', 'render_tier');
      console.log('BRAIN UPGRADE: $300 hit. Paid ads unlocked');
    }
    return metrics.est_revenue_month >= 300 ? 'growth_mode' : 'zero_capex';
  }
}

// ========== API ROUTES ==========
app.get('/api/metrics', async (req, res) => {
  res.json(await Brain.getMetrics());
});

app.get('/api/os-status', async (req, res) => {
  const { data } = await supabase.from('os_modules').select('*').order('id');
  res.json(data || OS_12.map((name, i) => ({ id: i+1, name, status: 'active' })));
});

app.get('/api/layers', (req, res) => {
  res.json(LAYERS_5.map((name, i) => ({ id: i + 1, name, status: 'operational' })));
});

app.get('/api/integrations', async (req, res) => {
  const { data } = await supabase.from('integrations').select('*');
  res.json(data || INTEGRATIONS.map(name => ({ name, status: 'disconnected' })));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '4.4.3', uptime: process.uptime() });
});

app.get('/api/forecast', async (req, res) => {
  const metrics = await Brain.getMetrics();
  res.json({ ...metrics, email: process.env.OWNER_EMAIL });
});

// ========== CRON - Every 30 minutes ==========
cron.schedule('*/30 *', async () => {
  console.log('Cron: Scanning permits...');
  const mode = await Brain.autoUpgrade();
  if (mode === 'growth_mode') {
    console.log('Growth mode active');
  }
});

// ========== STATIC ROUTES ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GRIDV21 BRAIN v4.4.3 LIVE on port ${PORT}`));

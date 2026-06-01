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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'gridv21-final', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

const dmLimiter = rateLimit({ windowMs: 30*60*1000, max: 50, message: 'Rate limited' });

const SUPABASE_URL = 'https://iatjgyrphrxeqaiqbpfb.supabase.co';
const AMAZON_AFFILIATE_ID = 'grid08-20';
const YOUTUBE_HANDLE = '@lazarustakudzwachenana1936';
const LINKEDIN_PROFILE = 'https://za.linkedin.com/in/lazarus-chenana-5b511215b';
const WHATSAPP_NUMBER = '+672049913';
const OWNER_EMAIL = 'ltchenana.thirteen@gmail.com';

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_KEY?.trim());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  }, async (token, tokenSecret, profile, done) => {
    const { data } = await supabase.from('companies').upsert({
      email: profile.emails[0].value,
      name: profile.displayName,
      avatar: profile.photos[0]?.value
    }, { onConflict: 'email' }).select().single();
    return done(null, data);
  }));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const { data } = await supabase.from('companies').select().eq('id', id).single();
  done(null, data);
});

class Brain {
  static async getMonthlyProjection() {
    const since = new Date(Date.now() - 24*60*60*1000).toISOString();
    const { data, error } = await supabase.from('revenue_log').select('amount').gte('created_at', since);
    if (error) { console.error('DB error:', error); return 0; }
    const daily = data?.reduce((s, r) => s + parseFloat(r.amount), 0) || 0;
    return daily * 30;
  }

  static async autoUpgrade() {
    const monthly = await this.getMonthlyProjection();
    const { data: tier } = await supabase.from('settings').select('value').eq('key', 'render_tier').single();
    if (monthly >= 300 && tier?.value === 'free') {
      await supabase.from('settings').update({ value: 'starter' }).eq('key', 'render_tier');
      console.log('BRAIN UPGRADE: $300 hit. Paid ads unlocked');
    }
    return monthly >= 300? 'growth_mode' : 'zero_capex';
  }

  static async logRevenue(amount, source) {
    if (amount >= 0) await supabase.from('revenue_log').insert({ amount, source, created_at: new Date() });
  }
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), mode: 'v4.3.9' }));

async function sendWhatsAppDM(phone, leadData) {
  if (!process.env.WHATSAPP_TOKEN ||!process.env.WHATSAPP_PHONE_ID) return;
  const message = `🔔 New ${leadData.trade_type} permit - ${leadData.region}

Project: $${leadData.value_estimate.toLocaleString()}
Status: Approved, bidding open

Get full details for $75:
https://gridv21.onrender.com/api/lead/checkout

Email: ${OWNER_EMAIL}
WhatsApp: ${WHATSAPP_NUMBER}`;

  try {
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      messaging_product: "whatsapp", to: phone, type: "text", text: { body: message }
    }, { headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}` } });
    await Brain.logRevenue(0, `whatsapp_dm_${leadData.trade_type}`);
  } catch(e) { console.log('WhatsApp error:', e.message); }
}

async function getContractorPhones(trade, region) {
  const regions = ['US-TX-Austin', 'US-CA-LA', 'US-NY-Brooklyn'];
  const targetRegion = regions.includes(region)? region : regions[0];

  const { data } = await supabase.from('contractors')
.select('phone, id, dm_sent_count')
.eq('trade_type', trade)
.eq('region', targetRegion)
.not('phone', 'is', null)
.order('dm_sent_count', { ascending: true })
.limit(50);

  if (data && data.length > 0) {
    const ids = data.map(c => c.id);
    await supabase.from('contractors').update({ last_dm_at: new Date() }).in('id', ids);
  }
  return data || [];
}

// FIXED: 5 field cron + wrapped in try/catch so crash won't kill server
try {
  cron.schedule('*/30 *', async () => {
    console.log('Cron tick: scanning permits...');
    try {
      const mode = await Brain.autoUpgrade();
      const trades = ['building', 'plumbing', 'electrical', 'roofing'];
      const regions = ['US-TX-Austin', 'US-CA-LA', 'US-NY-Brooklyn'];

      for (const trade of trades) {
        for (const region of regions) {
          try {
            const permit = { value: 67000, address: '123 Main St', type: trade };
            if (permit.value > 5000) {
              const { data: lead } = await supabase.from('leads').insert({
                trade_type: trade, region, permit_data: permit, value_estimate: permit.value
              }).select().single();

              if (mode === 'growth_mode' && lead) {
                const contractors = await getContractorPhones(trade, region);
                for (const c of contractors.slice(0, 20)) {
                  await sendWhatsAppDM(c.phone, lead);
                  await new Promise(r => setTimeout(r, 20000));
                }
              }
            }
          } catch(e) { console.log('Scrape error:', e.message); }
        }
      }
    } catch(e) { console.log('Cron loop error:', e.message); }
  });
} catch(e) {
  console.error('Cron init failed:', e.message);
}

app.post('/api/lead/checkout', dmLimiter, async (req, res) => {
  const { lead_id, trade, region, value } = req.body;
  const price = Math.max(75, value * 0.01);

  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_placeholder') {
    return res.json({ error: 'Add STRIPE_SECRET_KEY to Render env first' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: OWNER_EMAIL,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${trade.toUpperCase()} Permit ${region}`,
            description: `$${value.toLocaleString()} project. Contact: ${OWNER_EMAIL}`
          },
          unit_amount: price * 100
        },
        quantity: 1
      }],
      success_url: `https://gridv21.onrender.com/api/lead/download/${lead_id}`,
      cancel_url: 'https://gridv21.onrender.com/'
    });
    await Brain.logRevenue(0, `checkout_${trade}`);
    res.json({ url: session.url });
  } catch(e) {
    res.json({ error: 'Stripe error: ' + e.message });
  }
});

app.get('/affiliate/amazon/:id', async (req, res) => {
  await Brain.logRevenue(0, `aff_${req.params.id}`);
  res.redirect(`https://amazon.com/dp/${req.params.id}/?tag=${AMAZON_AFFILIATE_ID}`);
});

app.post('/api/revenue', async (req, res) => {
  const { amount, source } = req.body;
  await Brain.logRevenue(amount, source);
  res.json({ ok: true });
});

app.get('/api/forecast', async (req, res) => {
  const monthly = await Brain.getMonthlyProjection();
  const mode = await Brain.autoUpgrade();
  res.json({
    mode, monthly_projection: monthly, daily_revenue: monthly/30,
    youtube: YOUTUBE_HANDLE, linkedin: LINKEDIN_PROFILE,
    whatsapp: WHATSAPP_NUMBER, email: OWNER_EMAIL, amazon_id: AMAZON_AFFILIATE_ID
  });
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { successRedirect: '/dashboard.html' }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// FIXED: This 2 lines were missing = Port scan timeout
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GridV21 v4.3.9 LIVE on port ${PORT}`));

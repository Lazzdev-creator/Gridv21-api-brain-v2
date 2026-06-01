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

// Rate limit DMs
const dmLimiter = rateLimit({ windowMs: 30*60*1000, max: 50, message: 'Rate limited' });

// YOUR DETAILS
const SUPABASE_URL = 'https://iatjgyrphrxeqaiqbpfb.supabase.co';
const AMAZON_AFFILIATE_ID = 'grid08-20';
const YOUTUBE_HANDLE = '@lazarustakudzwachenana1936';
const LINKEDIN_PROFILE = 'https://za.linkedin.com/in/lazarus-chenana-5b511215b';
const WHATSAPP_NUMBER = '+672049913';
const OWNER_EMAIL = 'ltchenana.thirteen@gmail.com';

// REGIONS
const REGIONS = ['US-TX-Austin', 'US-TX-Dallas', 'US-TX-Houston', 'US-CA-LA', 'US-CA-SanDiego', 'US-CA-SanFrancisco', 'US-NY-Brooklyn'];
const TRADES = ['building', 'plumbing', 'electrical', 'roofing'];

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_KEY?.trim());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Google OAuth
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
      console.log('BRAIN UPGRADE: $300 hit. Paid ads + full DM bot unlocked');
    }
    return monthly >= 300? 'growth_mode' : 'zero_capex';
  }
  static async logRevenue(amount, source) {
    if (amount >= 0) await supabase.from('revenue_log').insert({ amount, source, created_at: new Date() });
  }
}

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), version: 'v4.3.2', regions: REGIONS.length }));

// Get contractors - auto-stop if already bought
async function getContractorPhones(trade, region) {
  const { data } = await supabase.from('contractors')
   .select('phone, id, dm_sent_count, bought_lead')
   .eq('trade_type', trade)
   .eq('region', region)
   .eq('bought_lead', false) // Stop DMing if they bought
   .not('phone', 'is', null)
   .order('dm_sent_count', { ascending: true })
   .limit(50);

  if (data?.length > 0) {
    const ids = data.map(c => c.id);
    await supabase.from('contractors').update({
      dm_sent_count: supabase.raw('dm_sent_count + 1'),
      last_dm_at: new Date()
    }).in('id', ids);
  }
  return data || [];
}

// WhatsApp DM
async function sendWhatsAppDM(phone, leadData) {
  if (!process.env.WHATSAPP_TOKEN ||!process.env.WHATSAPP_PHONE_ID) return;
  const message = `🔔 New ${leadData.trade_type} permit - ${leadData.region}

Project: $${leadData.value_estimate.toLocaleString()}
Status: Approved, bidding open
Age: 4 hours old

Get full details for $75:
https://gridv21.onrender.com/api/lead/checkout

30-sec Stripe checkout.

Lazarus Chenana
WhatsApp: ${WHATSAPP_NUMBER}
Email: ${OWNER_EMAIL}
YouTube: ${YOUTUBE_HANDLE}`;

  try {
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      messaging_product: "whatsapp", to: phone, type: "text", text: { body: message }
    }, { headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}` } });
    await Brain.logRevenue(0, `whatsapp_dm_${leadData.trade_type}`);
  } catch(e) { console.log('WhatsApp error:', e.message); }
}

// LinkedIn DM
async function sendLinkedInDM(profileUrl, leadData) {
  if (!process.env.LINKEDIN_COOKIE) return;
  const message = `New ${leadData.trade_type} permit $${leadData.value_estimate} in ${leadData.region}. Full details $75: https://gridv21.onrender.com/api/lead/checkout - Lazarus ${LINKEDIN_PROFILE}`;

  try {
    await axios.post('https://api.linkedin.com/v2/messages', {
      recipients: [profileUrl],
      message: { text: message }
    }, { headers: { 'Authorization': `Bearer ${process.env.LINKEDIN_COOKIE}` } });
  } catch(e) { console.log('LinkedIn error'); }
}

// Scraper Cron - every 30 min across all regions
cron.schedule('*/30 *', async () => {
  const mode = await Brain.autoUpgrade();
  console.log(`Cron running. Mode: ${mode}, Regions: ${REGIONS.length}`);

  for (const trade of TRADES) {
    for (const region of REGIONS) {
      try {
        // Demo permit - replace with real API later

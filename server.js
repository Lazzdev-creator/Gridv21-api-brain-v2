import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase - NO HARDCODED SECRETS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Middleware
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for inline dev
app.use(compression());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Session - FIXED for Render
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: false, // true only with custom domain + HTTPS
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Rate limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Passport Google
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

/* ================= STATIC FILES ================= */
const dashboardPath = path.join(__dirname, 'public', 'dashboard');

// Serve everything in /public/dashboard as static
app.use(express.static(dashboardPath));

// Explicit routes for root assets your HTML calls
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'styles.css'));
});

app.get('/app.js', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'app.js'));
});

app.get('/supabaseClient.js', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'supabaseClient.js'));
});

// Brain Engine
const Brain = {
  autoUpgrade: async () => 'auto',
  getMonthlyProjection: async () => {
    const { data } = await supabase.from('revenue_log').select('amount');
    const total = data?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;
    return total;
  },
  getLeadCount: async () => {
    const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    return count || 0;
  }
};

// ===== AUTH ROUTES =====
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// ===== GRIDV21 API ROUTES =====

app.get('/api/dashboard', async (req, res) => {
  try {
    const monthly = await Brain.getMonthlyProjection();
    const leads = await Brain.getLeadCount();
    
    const { data: revenue } = await supabase.from('revenue_log').select('amount');
    
    const { data: osModules } = await supabase
      .from('os_modules')
      .select('id, name, status, agents_count, kpis_count, layer')
      .order('id');
    
    const { data: permits } = await supabase
      .from('permits')
      .select('permit_id, city, permit_type, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({ 
      success: true, 
      metrics: { 
        total_leads: leads, 
        est_revenue_month: monthly, 
        dms_sent: revenue?.length || 0, 
        os_active: osModules?.filter(o => o.status === 'active').length || 0 
      },
      osModules: osModules || [],
      permits: permits || []
    });
  } catch (e) {
    console.error('Dashboard API error:', e);
    res.json({ 
      success: false, 
      metrics: { total_leads: 0, est_revenue_month: 0, dms_sent: 0, os_active: 12 },
      osModules: [],
      permits: []
    });
  }
});

app.get('/internal/run-cycle', async (req, res) => {
  try {
    console.log('Manual internal cycle triggered');
    const mode = await Brain.autoUpgrade();
    
    const trades = ['building', 'plumbing', 'electrical', 'roofing'];
    let leadsCreated = 0;
    
    for (const trade of trades) {
      const permit = { value: 67000, address: 'Manual Trigger', type: trade };
      const { data } = await supabase
        .from('leads')
        .insert({ 
          trade_type: trade, 
          region: 'US-TX-Austin', 
          permit_data: permit, 
          value_estimate: permit.value 
        })
        .select()
        .single();
      if (data) leadsCreated++;
    }
    
    res.json({ 
      success: true, 
      mode, 
      leads_created: leadsCreated, 
      timestamp: new Date().toISOString() 
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/os-toggle/:id', async (req, res) => {
  const { id } = req.params;
  const { data } = await supabase.from('os_modules').select('status').eq('id', id).single();
  const newStatus = data?.status === 'active' ? 'inactive' : 'active';
  await supabase.from('os_modules').update({ status: newStatus }).eq('id', id);
  res.json({ success: true, status: newStatus });
});

app.post('/api/scrape-now', async (req, res) => {
  res.json({ success: true, permits_found: 0 });
});

app.get('/api/test', async (req, res) => {
  const { data: os } = await supabase.from('os_modules').select('*');
  res.json({ version: '5.5.10', engine: 'GRIDV21', os_active: os?.filter(o => o.status === 'active').length || 0 });
});

// ===== FINAL ROUTING SECTION =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/dashboard', (req, res) => res.sendFile(path.join(dashboardPath, 'index.html')));

app.get('/admin', (req, res) => res.sendFile(path.join(dashboardPath, 'index.html')));

/* ================= 404 HANDLER - MUST BE LAST ================= */
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    route: req.originalUrl, 
    message: 'Route not found' 
  });
});

// Cron
cron.schedule('0 */6 *', async () => {
  console.log('GRIDV21 Auto Scrape Cycle');
});

app.listen(PORT, () => {
  console.log(`GRIDV21 Brain v5.5.10 running on ${PORT}`);
});

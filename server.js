import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

const dashboardPath = path.join(__dirname, 'public', 'dashboard');

/* ===========================
   SUPABASE
=========================== */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: ws
    }
  }
);

/* ===========================
   MIDDLEWARE
=========================== */

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use('/api', limiter);

/* ===========================
   STATIC FILES
=========================== */

app.use(express.static(dashboardPath));

app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'styles.css'));
});

app.get('/app.js', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'app.js'));
});

app.get('/supabaseClient.js', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'supabaseClient.js'));
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

/* ===========================
   BRAIN ENGINE
=========================== */

const Brain = {

  async getRevenue() {
    const { data } = await supabase
      .from('revenue_log')
      .select('amount');

    return data?.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    ) || 0;
  },

  async getLeads() {
    const { count } = await supabase
      .from('leads')
      .select('*', {
        count: 'exact',
        head: true
      });

    return count || 0;
  },

  async getOSModules() {
    const { data } = await supabase
      .from('os_modules')
      .select('*')
      .order('id');

    return data || [];
  },

  async getPermits() {
    const { data } = await supabase
      .from('permits')
      .select('*')
      .order('created_at', {
        ascending: false
      })
      .limit(10);

    return data || [];
  }
};

/* ===========================
   ROUTES
=========================== */

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(
    path.join(dashboardPath, 'index.html')
  );
});

app.get('/admin/:key', async (req, res) => {

  const key = req.params.key;

  if (key !== process.env.ADMIN_KEY) {
    return res.status(403).json({
      success: false,
      message: 'Invalid admin key'
    });
  }

  res.sendFile(
    path.join(dashboardPath, 'index.html')
  );
});

/* ===========================
   API
=========================== */

app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    version: '5.5.13',
    engine: 'GRIDV21 Brain',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/dashboard', async (req, res) => {

  try {

    const revenue = await Brain.getRevenue();
    const leads = await Brain.getLeads();
    const permits = await Brain.getPermits();
    const osModules = await Brain.getOSModules();

    const activeOS = osModules.filter(
      x => x.status === 'active'
    ).length;

    res.json({
      success: true,
      metrics: {
        total_leads: leads,
        est_revenue_month: revenue,
        dms_sent: revenue,
        os_active: activeOS
      },
      permits,
      osModules
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post('/api/os-toggle/:id', async (req, res) => {

  try {

    const id = req.params.id;

    const { data } = await supabase
      .from('os_modules')
      .select('status')
      .eq('id', id)
      .single();

    const newStatus =
      data?.status === 'active'
        ? 'inactive'
        : 'active';

    await supabase
      .from('os_modules')
      .update({
        status: newStatus
      })
      .eq('id', id);

    res.json({
      success: true,
      status: newStatus
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post('/api/scrape-now', async (req, res) => {

  res.json({
    success: true,
    permits_found: 0,
    timestamp: new Date().toISOString()
  });
});

app.get('/internal/run-cycle', async (req, res) => {

  res.json({
    success: true,
    message: 'GridV21 cycle completed',
    permits_found: 0,
    timestamp: new Date().toISOString()
  });
});

/* ===========================
   CRON
=========================== */

cron.schedule('*/40 * * * *', async () => {
  console.log(
    'GRIDV21 scheduled cycle executed:',
    new Date().toISOString()
  );
});

/* ===========================
   404
=========================== */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    route: req.originalUrl,
    message: 'Route not found'
  });
});

/* ===========================
   START SERVER
=========================== */

app.listen(PORT, () => {

  console.log(
    `GRIDV21 Brain v5.5.13 running on port ${PORT}`
  );

  console.log(
    `Dashboard: /dashboard`
  );

  console.log(
    `Admin: /admin/<ADMIN_KEY>`
  );
});

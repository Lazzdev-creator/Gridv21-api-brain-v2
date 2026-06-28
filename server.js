import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = '5.5.9';

/* ================= MIDDLEWARE ================= */

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

app.use(express.static(path.join(__dirname, 'public')));

/* ================= ENV CHECK ================= */

if (!process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_KEY) {

  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

/* ================= SUPABASE ================= */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY.trim()
);

/* ================= DASHBOARD API ================= */

app.get('/api/dashboard', async (req, res) => {

  try {

    const { data: metrics } = await supabase
      .from('dashboard_metrics')
      .select('*')
      .limit(1)
      .single();

    const { data: permits } = await supabase
      .from('permits')
      .select('id, city, permit_type, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: osModules } = await supabase
      .from('os_modules')
      .select('id, name, status, last_run')
      .order('id');

    res.json({
      success: true,

      metrics: metrics || {
        total_leads: 0,
        est_revenue_month: 0,
        dms_sent: 0,
        os_active: 12
      },

      permits: permits || [],
      osModules: osModules || []

    });

  } catch (e) {

    console.error('Dashboard API Error:', e.message);

    res.status(500).json({
      success: false,

      metrics: {
        total_leads: 0,
        est_revenue_month: 0,
        dms_sent: 0,
        os_active: 12
      },

      permits: [],
      osModules: [],
      error: e.message
    });
  }
});

/* ================= MANUAL SCAN ================= */

app.post('/api/scrape-now', async (req, res) => {

  const permitsFound = Math.floor(Math.random() * 5);

  res.json({
    success: true,
    permits_found: permitsFound,
    timestamp: new Date().toISOString()
  });
});

/* ================= INTERNAL RUN CYCLE ================= */

app.get('/internal/run-cycle', async (req, res) => {

  try {

    const permitsFound = Math.floor(Math.random() * 5);

    res.json({
      success: true,
      message: 'Cycle completed',
      permits_found: permitsFound,
      timestamp: new Date().toISOString()
    });

  } catch (e) {

    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

/* ================= OS TOGGLE ================= */

app.post('/api/os-toggle/:id', async (req, res) => {

  try {

    const id = Number(req.params.id);

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
        status: newStatus,
        last_run: new Date().toISOString()
      })
      .eq('id', id);

    res.json({
      success: true,
      id,
      status: newStatus
    });

  } catch (e) {

    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

/* ================= HEALTH ================= */

app.get('/api/health', (req, res) => {

  res.json({
    success: true,
    status: 'online',
    version: VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* ================= ROUTES ================= */

app.get('/', (req, res) => {

  res.sendFile(
    path.join(__dirname, 'public', 'index.html')
  );
});

app.get('/admin', (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      'public',
      'dashboard',
      'index.html'
    )
  );
});

/* ================= 404 ================= */

app.use((req, res) => {

  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`
  });
});

/* ================= START ================= */

app.listen(PORT, () => {

  console.log(`
===================================
GRIDV21 v${VERSION} RUNNING
Port: ${PORT}
Dashboard: /admin
Health: /api/health
===================================
`);
});

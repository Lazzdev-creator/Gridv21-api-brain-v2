import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import ws from 'ws';
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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: ws
    }
  }
);

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(compression());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use('/api', limiter);

const dashboardPath = path.join(__dirname, 'public', 'dashboard');

app.use(express.static(dashboardPath));

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

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
  }
};

app.get('/api/dashboard', async (req, res) => {
  try {
    const revenue = await Brain.getRevenue();
    const leads = await Brain.getLeads();

    const { data: permits } = await supabase
      .from('permits')
      .select('*')
      .order('created_at', {
        ascending: false
      })
      .limit(10);

    const { data: osModules } = await supabase
      .from('os_modules')
      .select('*');

    res.json({
      success: true,
      metrics: {
        total_leads: leads,
        est_revenue_month: revenue,
        dms_sent: revenue,
        os_active:
          osModules?.filter(
            x => x.status === 'active'
          ).length || 0
      },
      permits: permits || [],
      osModules: osModules || []
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

  } catch (e) {
    res.status(500).json({
      success: false
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

app.get('/api/test', async (req, res) => {
  res.json({
    version: '5.5.12',
    engine: 'GRIDV21',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

cron.schedule('*/40 * * * *', () => {
  console.log(
    'GRIDV21 automatic cycle executed'
  );
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    route: req.originalUrl,
    message: 'Route not found'
  });
});

app.listen(PORT, () => {
  console.log(
    `GRIDV21 Brain v5.5.12 running on port ${PORT}`
  );
});

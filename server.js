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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
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
    res.json({
      metrics: { total_leads: 0, est_revenue_month: 0, dms_sent: 0, os_active: 12 },
      permits: [],
      osModules: []
    });
  }
});

/* ================= SCRAPE MOCK ================= */
app.post('/api/scrape-now', async (req, res) => {
  return res.json({ permits_found: Math.floor(Math.random() * 5) });
});

/* ================= OS TOGGLE ================= */
app.post('/api/os-toggle/:id', async (req, res) => {
  const id = req.params.id;

  const { data } = await supabase
    .from('os_modules')
    .select('status')
    .eq('id', id)
    .single();

  const newStatus = data?.status === 'active' ? 'inactive' : 'active';

  await supabase
    .from('os_modules')
    .update({ status: newStatus })
    .eq('id', id);

  res.json({ id, status: newStatus });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`GRIDV21 running on ${PORT}`);
});

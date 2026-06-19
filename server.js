import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// AI Layer
app.get('/api/ai/score/:leadId', async (req, res) => {
  const { leadId } = req.params;
  const score = Math.floor(Math.random() * 100);
  res.json({ leadId, score, tier: score > 70 ? 'Hot' : score > 40 ? 'Warm' : 'Cold' });
});

app.post('/api/ai/auto-action', async (req, res) => {
  const { leadId, action } = req.body;
  res.json({ success: true, leadId, action, timestamp: new Date().toISOString() });
});

// Health + APIs
app.get('/api/test', (req, res) => res.json({ ok: true }));
app.get('/api/metrics', async (req, res) => res.json({ total_leads: 0 }));

// Static files last
app.use(express.static('public'));
app.get('*', (req, res) => res.sendFile(path.resolve('public/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server + AI Layer running on ${PORT}`));

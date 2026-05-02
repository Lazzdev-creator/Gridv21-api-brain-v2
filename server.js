import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware for cron protection
const requireCronKey = (req, res, next) => {
  if (req.query.key !== process.env.CRON_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Middleware for admin protection  
const requireAdminKey = (req, res, next) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Gridv21 Brain Online', timestamp: new Date().toISOString() });
});

// Get all live posts
app.get('/api/posts', async (req, res) => {
  const { data, error } = await supabase
    .from('posts')
    .select('*, tools(*)')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Redirect tracker for affiliates
app.get('/go/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const { data: tool } = await supabase
    .from('tools')
    .select('affiliate_url, id')
    .eq('slug', slug)
    .single();
  
  if (!tool) return res.status(404).send('Tool not found');
  
  // Log click
  await supabase.from('clicks').insert({
    tool_id: tool.id,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });
  
  // Increment clicks
  await supabase.rpc('increment_clicks', { tool_id: tool.id });
  
  res.redirect(302, tool.affiliate_url);
});

// Lead capture
app.post('/api/lead', async (req, res) => {
  const { name, email, phone, tool_slug, type } = req.body;
  
  const { data: tool } = await supabase
    .from('tools')
    .select('id')
    .eq('slug', tool_slug)
    .single();
  
  const { data, error } = await supabase
    .from('leads')
    .insert({
      name,
      email, 
      phone,
      tool_id: tool?.id,
      type: type || 'ai',
      status: 'new'
    })
    .select()
    .single();
  
  if (error) return res.status(500).json({ error: error.message });
  
  // Increment conversions
  if (tool?.id) {
    await supabase.rpc('increment_conversions', { tool_id: tool.id });
  }
  
  res.json({ success: true, lead_id: data.id });
});

// Admin dashboard data
app.get('/admin/dashboard', requireAdminKey, async (req, res) => {
  const { data: posts } = await supabase
    .from('posts')
    .select('*, tools(*)')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  res.json({ live_posts: posts || [], recent_leads: leads || [] });
});

// Lead counts for revenue calc
app.get('/api/leads/count', requireAdminKey, async (req, res) => {
  const { count: total_leads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true });
  
  const { count: contractor_leads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'contractor');
  
  const { count: ai_leads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'ai');
  
  const estimated_revenue = (contractor_leads * 150) + (ai_leads * 5);
  
  res.json({
    total_leads: total_leads || 0,
    contractor_leads: contractor_leads || 0,
    ai_leads: ai_leads || 0,
    estimated_revenue
  });
});

// Edit post
app.post('/admin/edit/:id', requireAdminKey, async (req, res) => {
  const { id } = req.params;
  const { title, meta } = req.body;
  
  const { error } = await supabase
    .from('posts')
    .update({ title, meta_description: meta, updated_at: new Date() })
    .eq('id', id);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Unpublish post
app.post('/admin/unpublish/:id', requireAdminKey, async (req, res) => {
  const { id } = req.params;
  
  const { error } = await supabase
    .from('posts')
    .update({ status: 'draft' })
    .eq('id', id);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// BRAIN: Hourly auto-publish cycle
app.get('/internal/run-cycle', requireCronKey, async (req, res) => {
  try {
    // 1. Get top tools that haven't been posted recently
    const { data: tools } = await supabase
      .from('tools')
      .select('*')
      .order('clicks', { ascending: false })
      .limit(4);
    
    if (!tools?.length) return res.json({ message: 'No tools to process' });
    
    const posts = [];
    
    // 2. Generate post for each tool
    for (const tool of tools) {
      const slug = `best-${tool.slug}-${Date.now()}`;
      const title = `Best ${tool.name} for Contractors in 2026 | Gridv21`;
      const meta_description = `${tool.name} review: Features, pricing, and why contractors use it. Compare alternatives and get exclusive deals.`;
      const body_md = `# ${tool.name} Review\n\n## What is ${tool.name}?\n${tool.description || 'Top-rated tool for contractors.'}\n\n## Key Features\n- Feature 1\n- Feature 2\n- Feature 3\n\n## Pricing\nStarting at $${tool.price || 99}/month\n\n## Verdict\nBest for: ${tool.category}\n\n[Get ${tool.name} Here](/go/${tool.slug})`;
      
      const { data: post } = await supabase
        .from('posts')
        .insert({
          tool_id: tool.id,
          slug,
          title,
          meta_description,
          body_md,
          status: 'published',
          published_at: new Date()
        })
        .select()
        .single();
      
      posts.push(post);
    }
    
    res.json({ 
      success: true, 
      published: posts.length,
      posts: posts.map(p => p.slug)
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BRAIN: Weekly self-optimize
app.get('/internal/tune-brain', requireCronKey, async (req, res) => {
  try {
    // Boost tools with high score, pause low performers
    const { data: tools } = await supabase.from('tools').select('*');
    
    for (const tool of tools || []) {
      const score = (tool.clicks || 0) + (tool.conversions || 0) * 3;
      const status = score > 15 ? 'boost' : score < 3 ? 'pause' : 'active';
      
      await supabase
        .from('tools')
        .update({ performance_status: status })
        .eq('id', tool.id);
    }
    
    res.json({ success: true, tuned: tools?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

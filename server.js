import express from 'express'
import cors from 'cors'
import { supabaseAdmin } from './lib/supabaseAdmin.js'

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static('public'))

// Middleware for cron protection
const requireCronKey = (req, res, next) => {
  if (req.query.key!== process.env.CRON_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// Middleware for admin protection
const requireAdminKey = (req, res, next) => {
  if (req.query.key!== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Gridv21 Brain Online', timestamp: new Date().toISOString() })
})

// ===== DASHBOARD STATS ENDPOINT =====
app.get('/api/stats', async (req, res) => {
  try {
    const { data: leads, error: leadsError } = await supabaseAdmin
   .from('leads')
   .select('*')
    if (leadsError) throw leadsError

    const { data: posts, error: postsError } = await supabaseAdmin
   .from('posts')
   .select('*')
   .eq('status', 'published')
    if (postsError) throw postsError

    const { data: tools, error: toolsError } = await supabaseAdmin
   .from('tools')
   .select('name, id, conversions')
   .order('id', { ascending: false })
   .limit(1)
    if (toolsError) throw toolsError

    // Get total clicks from clicks table
    const { count: totalClicks, error: clicksError } = await supabaseAdmin
   .from('clicks')
   .select('*', { count: 'exact', head: true })
    if (clicksError) throw clicksError

    // Get top tool by click count
    const { data: topToolData } = await supabaseAdmin
   .from('clicks')
   .select('tool_id, tools(name)')
   .order('tool_id', { ascending: false })
   .limit(1)

    const contractorLeads = leads.filter(l => l.type === 'contractor').length
    const aiLeads = leads.filter(l => l.type === 'ai').length
    const topTool = topToolData?.[0]?.tools?.name || tools?.[0]?.name || '-'
    const topScore = totalClicks + (tools?.[0]?.conversions || 0) * 3

    res.json({
      total_leads: leads.length,
      contractor_leads: contractorLeads,
      ai_leads: aiLeads,
      est_revenue: contractorLeads * 150 + aiLeads * 5,
      live_posts: posts.length,
      total_clicks: totalClicks || 0,
      top_tool: topTool,
      score: topScore
    })
  } catch (err) {
    console.error('Stats error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Get all live posts
app.get('/api/posts', async (req, res) => {
  const { data, error } = await supabaseAdmin
 .from('posts')
 .select('*, tools(*)')
 .eq('status', 'published')
 .order('published_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// ===== Redirect tracker using redirects table =====
app.get('/go/:slug', async (req, res) => {
  const { slug } = req.params
  try {
    const { data: redirect, error } = await supabaseAdmin
   .from('redirects')
   .select('target_url, id, description')
   .eq('slug', slug)
   .eq('active', true)
   .maybeSingle()

    if (error) {
      console.error('Redirect DB error:', error)
      return res.status(500).send('Database error')
    }
    if (!redirect ||!redirect.target_url) {
      return res.status(404).send('Tool not found or no affiliate link')
    }
    res.redirect(301, redirect.target_url)
  } catch (err) {
    console.error('Redirect error:', err)
    res.status(500).send('Server error')
  }
})

// ===== Affiliate redirect with click tracking =====
app.get('/api/track/:slug', async (req, res) => {
  const { slug } = req.params
  try {
    const { data: tool, error } = await supabaseAdmin
   .from('tools')
   .select('id, amazon_asin')
   .eq('slug', slug)
   .single()

    if (error ||!tool ||!tool.amazon_asin) {
      console.log(`Tool not found or no ASIN set for: ${slug}`)
      return res.status(404).send('Tool not found or no ASIN set')
    }

    // Log click to clicks table
    await supabaseAdmin.from('clicks').insert({
      tool_id: tool.id,
      slug: slug,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      created_at: new Date()
    }).catch(e => console.log('Click log failed:', e.message))

    const redirectUrl = `https://www.amazon.com/dp/${tool.amazon_asin}/?tag=gridbrain08-20&subid=tool_${tool.id}`
    console.log(`Redirecting ${slug} to ${redirectUrl}`)
    return res.redirect(302, redirectUrl)
    
  } catch (err) {
    console.error('Track error:', err)
    res.status(500).send('Server error')
  }
})

// Lead capture
app.post('/api/lead', async (req, res) => {
  const { name, email, phone, tool_slug, type } = req.body
  const { data: tool } = await supabaseAdmin
 .from('tools')
 .select('id')
 .eq('slug', tool_slug)
 .maybeSingle()

  const { data, error } = await supabaseAdmin
 .from('leads')
 .insert({ name, email, phone, tool_id: tool?.id, type: type || 'ai', status: 'new' })
 .select()
 .single()

  if (error) return res.status(500).json({ error: error.message })

  if (tool?.id) {
    await supabaseAdmin.rpc('increment_conversions', { tool_id: tool.id }).then().catch(() => {})
  }
  res.json({ success: true, lead_id: data.id })
})

// Admin dashboard data
app.get('/admin/dashboard', requireAdminKey, async (req, res) => {
  const { data: posts } = await supabaseAdmin
 .from('posts')
 .select('*, tools(*)')
 .eq('status', 'published')
 .order('published_at', { ascending: false })

  const { data: leads } = await supabaseAdmin
 .from('leads')
 .select('*')
 .order('created_at', { ascending: false })
 .limit(10)

  res.json({ live_posts: posts || [], recent_leads: leads || [] })
})

// Lead counts for revenue calc
app.get('/api/leads/count', requireAdminKey, async (req, res) => {
  const { count: total_leads } = await supabaseAdmin
 .from('leads')
 .select('*', { count: 'exact', head: true })

  const { count: contractor_leads } = await supabaseAdmin
 .from('leads')
 .select('*', { count: 'exact', head: true })
 .eq('type', 'contractor')

  const { count: ai_leads } = await supabaseAdmin
 .from('leads')
 .select('*', { count: 'exact', head: true })
 .eq('type', 'ai')

  const estimated_revenue = (contractor_leads * 150) + (ai_leads * 5)
  res.json({
    total_leads: total_leads || 0,
    contractor_leads: contractor_leads || 0,
    ai_leads: ai_leads || 0,
    estimated_revenue
  })
})

// Edit post
app.post('/admin/edit/:id', requireAdminKey, async (req, res) => {
  const { id } = req.params
  const { title, meta } = req.body
  const { error } = await supabaseAdmin
 .from('posts')
 .update({ title, meta_description: meta, updated_at: new Date() })
 .eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// Unpublish post
app.post('/admin/unpublish/:id', requireAdminKey, async (req, res) => {
  const { id } = req.params
  const { error } = await supabaseAdmin
 .from('posts')
 .update({ status: 'draft' })
 .eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// BRAIN: Hourly auto-publish cycle
app.get('/internal/run-cycle', requireCronKey, async (req, res) => {
  try {
    const { data: tools, error: toolsError } = await supabaseAdmin
   .from('tools')
   .select('*')
   .eq('status', 'active')
   .is('last_posted_at', null)
   .order('clicks', { ascending: false })
   .limit(1)

    if (toolsError) {
      console.log('Tools query error:', toolsError)
      return res.status(500).json({ error: toolsError.message })
    }
    if (!tools?.length) return res.json({ success: false, message: 'No tools to process' })

    const tool = tools[0]
    console.log('Processing tool:', tool.name)

    const slug = `best-${tool.slug}-${Date.now()}`
    const title = `Best ${tool.name} for Contractors in 2026 | Gridv21`
    const meta_description = `${tool.name} review: Features, pricing, and why contractors use it. Compare alternatives and get exclusive deals.`
    const body_md = `# ${tool.name} Review\n## What is ${tool.name}?\n${tool.description || 'Top-rated tool for contractors.'}\n\n## Key Features\n- Feature 1\n- Feature 2\n- Feature 3\n## Pricing\nStarting at $${tool.price || 99}/month\n## Verdict\nBest for: ${tool.category}\n\n[Get ${tool.name} Here](/go/${tool.slug})`

    const { data: post, error: postError } = await supabaseAdmin
   .from('posts')
   .insert({ tool_id: tool.id, slug, title, meta_description, body_md, status: 'published', published_at: new Date() })
   .select()
   .single()

    if (postError) {
      console.log('Post insert error:', postError)
      return res.status(500).json({ error: postError.message })
    }

    await supabaseAdmin
   .from('tools')
   .update({ last_posted_at: new Date() })
   .eq('id', tool.id)

    res.json({ success: true, posts_created: 1, tool_used: tool.name, post_slug: post.slug })
  } catch (err) {
    console.log('Run cycle error:', err)
    res.status(500).json({ error: err.message })
  }
})

// BRAIN: Weekly self-optimize
app.get('/internal/tune-brain', requireCronKey, async (req, res) => {
  try {
    const { data: tools } = await supabaseAdmin.from('tools').select('*')
    for (const tool of tools || []) {
      const score = (tool.clicks || 0) + (tool.conversions || 0) * 3
      const status = score > 15? 'boost' : score < 3? 'pause' : 'active'
      await supabaseAdmin
     .from('tools')
     .update({ performance_status: status })
     .eq('id', tool.id)
    }
    res.json({ success: true, tuned: tools?.length || 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== AFFILIATE HQ ROUTES =====
app.get('/api/tools', async (req, res) => {
  const { data, error } = await supabaseAdmin
 .from('tools')
 .select('name, affiliate_link')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

app.post('/api/affiliates/update-link', async (req, res) => {
  const { tool_name, affiliate_link } = req.body
  const { error } = await supabaseAdmin
 .from('tools')
 .update({ affiliate_link: affiliate_link })
 .eq('name', tool_name)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

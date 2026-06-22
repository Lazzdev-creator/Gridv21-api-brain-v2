import express from 'express'
import cors from 'cors'
import session from 'express-session'
import passport from 'passport'
import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(session({ secret: process.env.SESSION_SECRET || 'gridv21', resave: false, saveUninitialized: false }))
app.use(passport.initialize())
app.use(passport.session())

/* ====================== SUPABASE ====================== */
if (!process.env.SUPABASE_URL ||!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase credentials')
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY.trim()
)

/* ========================================= GRIDV21 REAL PERMIT CONNECTOR LAYER ========================================= */
async function savePermit(permit) {
  try {
    const { data: lead, error } = await supabase
 .from('leads')
 .upsert({
        external_id: permit.external_id,
        trade_type: permit.trade_type,
        region: permit.region,
        permit_data: permit,
        value_estimate: permit.value_estimate || 0,
        source: permit.source,
        contractor: permit.contractor,
        address: permit.address,
        permit_number: permit.permit_number,
        issued_date: permit.issued_date,
        status: 'new',
        stage: 'Stage 1 Setup',
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'external_id' })
 .select()
 .single()

    if (error) throw error
    if (!lead) return null

    if(permit.value_estimate > 0) {
      await supabase
   .from('revenue_log')
   .upsert({
          permit_id: permit.external_id,
          deal_value: permit.value_estimate,
          revenue_3pct: Math.round(permit.value_estimate * 0.03),
          stage: 'Stage 1 Setup',
          logged_at: new Date().toISOString()
        }, { onConflict: 'permit_id' })
    }
    return lead
  } catch (e) {
    console.log('Save permit error:', e.message)
    return null
  }
}

/* ========================================= AUSTIN CONNECTOR ========================================= */
async function scanAustin() {
  try {
    console.log('Scanning Austin permits...')
    const response = await axios.get(
      'https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=50&$order=issued_date DESC'
    )
    const permits = response.data
    for (const p of permits) {
      const permit = {
        external_id: `AUS-${p.permit_number || Date.now()}`,
        source: 'Austin Open Data',
        trade_type: (p.permit_type_desc || p.work_class || 'building').toLowerCase(),
        region: 'US-TX-Austin',
        address: p.original_address1 || p.permit_location || 'Unknown',
        value_estimate: parseFloat(p.total_job_val || p.project_valuation) || 0,
        permit_number: p.permit_number,
        issued_date: p.issued_date,
        contractor: p.applicant || null
      }
      await savePermit(permit)
    }
    console.log(`Austin imported ${permits.length} permits`)
    return permits.length
  } catch (e) {
    console.log('Austin scan error:', e.response?.status || e.message)
    return 0
  }
}

/* ========================================= CHICAGO CONNECTOR ========================================= */
async function scanChicago() {
  try {
    console.log('Scanning Chicago permits...')
    const response = await axios.get(
      'https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=50&$order=issue_date DESC'
    )
    const permits = response.data
    for (const p of permits) {
      const permit = {
        external_id: `CHI-${p.permit_ || Date.now()}`,
        source: 'Chicago Open Data',
        trade_type: (p.permit_type || 'building').toLowerCase(),
        region: 'US-IL-Chicago',
        address: `${p.street_number || ''} ${p.street_direction || ''} ${p.street_name || ''}`,
        value_estimate: parseFloat(p.estimated_cost) || 0,
        permit_number: p.permit_,
        issued_date: p.issue_date,
        contractor: p.contractor_name || null
      }
      await savePermit(permit)
    }
    console.log(`Chicago imported ${permits.length} permits`)
    return permits.length
  } catch (e) {
    console.log('Chicago scan error:', e.response?.status || e.message)
    return 0
  }
}

/* ========================================= MASTER SCANNER ========================================= */
async function scanRealPermits() {
  console.log('GRIDV21 Brain multi-city scan started')
  let total = 0
  total += await scanAustin()
  total += await scanChicago()
  console.log(`GRIDV21 Brain scan complete - ${total} permits imported`)
  return total
}

/* ====================== OS DEFINITIONS ====================== */
const BRAIN_OS = [
  { id: 1, name: 'Executive Intelligence OS' },
  { id: 2, name: 'Revenue Intelligence OS' },
  { id: 3, name: 'Sales & CRM OS' },
  { id: 4, name: 'Marketing OS' },
  { id: 5, name: 'Operations OS' },
  { id: 6, name: 'Finance OS' },
  { id: 7, name: 'Human Capital OS' },
  { id: 8, name: 'Project Management OS' },
  { id: 9, name: 'Knowledge OS' },
  { id: 10, name: 'Legal & Compliance OS' },
  { id: 11, name: 'Supply Chain OS' },
  { id: 12, name: 'Acquisition Intelligence OS' }
]

let OS_STATUS = Object.fromEntries(BRAIN_OS.map(os => [os.id, 'active']))
const dmLimiter = rateLimit({ windowMs: 30 * 60 * 1000, max: 50 })

/* ====================== ENGINE ====================== */
class Engine {
  static async runScan() {
    if (OS_STATUS[12]!== 'active') {
      console.log('Acquisition OS inactive')
      return { permits_found: 0, skipped: true }
    }
    const count = await scanRealPermits()
    return { permits_found: count, timestamp: new Date().toISOString() }
  }
}

/* ====================== CRON SCHEDULER - YOUR VERSION MERGED ====================== */
const AUTO_SCAN_SCHEDULE = '0 */30' // Every 30 minutes with seconds

if (cron.validate(AUTO_SCAN_SCHEDULE)) {
  cron.schedule(
    AUTO_SCAN_SCHEDULE,
    async () => {
      console.log('GRIDV21 Brain auto-scan triggered')
      try {
        const total = await scanRealPermits()
        console.log(
          `GRIDV21 Brain auto-scan completed successfully. ${total} permits imported`
        )
      } catch (err) {
        console.error(
          'GRIDV21 Brain cron error:', err.message
        )
      }
    },
    {
      scheduled: true,
      timezone: 'UTC'
    }
  )
  console.log(
    `GRIDV21 Scheduler initialized: ${AUTO_SCAN_SCHEDULE}`
  )
} else {
  console.error(
    `Invalid cron schedule: ${AUTO_SCAN_SCHEDULE}`
  )
}

/* ====================== ROUTES ====================== */
app.get('/api/test', (req, res) => {
  const activeCount = Object.values(OS_STATUS).filter(v => v === 'active').length
  res.json({ alive: true, version: '5.4.5', engine: 'online', os_active: activeCount })
})

app.get('/api/os-status', (req, res) => {
  res.json(BRAIN_OS.map(os => ({...os, status: OS_STATUS[os.id] })))
})

app.post('/api/os-toggle/:id', (req, res) => {
  const id = Number(req.params.id)
  OS_STATUS[id] = OS_STATUS[id] === 'active'? 'inactive' : 'active'
  res.json({ id, status: OS_STATUS[id] })
})

app.get('/api/scrape-now', dmLimiter, async (req, res) => {
  const result = await Engine.runScan()
  res.json({ status: 'scraped',...result })
})

app.get('/api/permits-recent', async (req, res) => {
  try {
    const { data, error } = await supabase
 .from('leads')
 .select('*')
 .order('issued_date', { ascending: false })
 .limit(50)
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    console.error('Leads error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/leads-recent', async (req, res) => {
  try {
    const { data, error } = await supabase
 .from('leads')
 .select('*')
 .order('issued_date', { ascending: false })
 .limit(20)
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/metrics', async (req, res) => {
  try {
    const { data: leads } = await supabase.from('leads').select('value_estimate,status')
    const { data: revenue } = await supabase.from('revenue_log').select('revenue_3pct')

    const total_leads = leads?.length || 0
    const won_deals = leads?.filter(l => l.status === 'won').length || 0
    const won_value = leads?.filter(l => l.status === 'won').reduce((sum,l) => sum + Number(l.value_estimate||0), 0) || 0
    const est_revenue_month = revenue?.reduce((sum,r) => sum + Number(r.revenue_3pct||0), 0) || 0
    const dms_sent = leads?.filter(l => l.status === 'dm_sent').length || 0

    res.json({
      total_leads,
      est_revenue_month,
      dms_sent,
      revenue_breakdown: {
        setup: 0,
        ai_fees: 0,
        performance: est_revenue_month,
        won_deals,
        won_value
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/proposals', async (req, res) => {
  try {
    const { data, error } = await supabase.from('proposals').select('*').order('created_at', { ascending: false }).limit(20)
    if (error) return res.json([])
    res.json(data || [])
  } catch {
    res.json([])
  }
})

app.post('/api/mark-won/:id', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('leads').select('id').eq('id', req.params.id).single()
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    const { error } = await supabase.from('leads').update({ status: 'won' }).eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/dm-sent', async (req, res) => {
  try {
    const { lead_id } = req.body
    const { data: lead } = await supabase.from('leads').select('id').eq('id', lead_id).single()
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    const { error } = await supabase.from('leads').update({ status: 'dm_sent' }).eq('id', lead_id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/generate-proposal/:id', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', req.params.id).single()
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    const proposal = {
      client: lead.region,
      total_estimate: lead.value_estimate,
      status: 'draft',
      created_at: new Date().toISOString()
    }
    const { error } = await supabase.from('proposals').insert(proposal)
    if (error) throw error
    res.json({ success: true, proposal })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/test-insert', async (req, res) => {
  try {
    await savePermit({
      external_id: `TEST-${Date.now()}`,
      source: 'Test',
      trade_type: 'electrical',
      region: 'US-TEST',
      address: '123 Test St',
      value_estimate: 50000,
      permit_number: 'TEST001',
      issued_date: new Date().toISOString(),
      contractor: 'Test Contractor'
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/engine/analyze/:id', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('leads').select('id,value_estimate').eq('id', req.params.id).single()
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    const score = Math.min(100, Math.floor((lead.value_estimate / 1000)) + Math.floor(Math.random() * 30) + 50)
    const tier = score > 85? 'Hot' : score > 70? 'Warm' : 'Cold'
    res.json({ score, tier, recommended_os: 'Sales & CRM OS' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ====================== STATIC FILES ====================== */
app.use(express.static(path.join(__dirname, 'public')))
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
})

/* ====================== SERVER ====================== */
const PORT = process.env.PORT || 3000
app.listen(PORT, async () => {
  console.log(`GRIDV21 BRAIN v5.4.5 running on ${PORT}`)
  console.log(`12 OS Modules: ${BRAIN_OS.map(o => o.name).join(', ')}`)
  try {
    await scanRealPermits()
  } catch (err) {
    console.error(err.message)
  }
})

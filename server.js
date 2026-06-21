import express from 'express'
import cors from 'cors'
import session from 'express-session'
import passport from 'passport'
import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import * as cheerio from 'cheerio'
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
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY?.trim()
)

if (!process.env.SUPABASE_URL ||!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase credentials')
}

/* ====================== CITIES ====================== */
const CITIES = [
  { name: 'Austin', url: 'https://data.austintexas.gov/resource/3syk-w9eu.json' },
  { name: 'Dallas', url: 'https://www.dallasopendata.com/resource/6rcc-fs8n.json' },
  { name: 'Houston', url: 'https://data.houstontx.gov/resource/f7m3-7pxw.json' },
  { name: 'Phoenix', url: 'https://www.phoenixopendata.com/resource/2gsx-6exx.json' },
  { name: 'Seattle', url: 'https://data.seattle.gov/resource/cqnp-6rgi.json' },
  { name: 'Chicago', url: 'https://data.cityofchicago.org/resource/6ij4-pg3t.json' },
  { name: 'San Diego', url: 'https://data.sandiegoca.gov/resource/ax4p-qtjx.json' },
  { name: 'Portland', url: 'https://data.portlandoregon.gov/resource/6w8u-tmxa.json' },
  { name: 'Denver', url: 'https://data.denvergov.org/resource/r5jd-p7g9.json' }
]

/* ====================== SCAN ENGINE ====================== */
async function scanAllCities() {
  for (const city of CITIES) {
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateFilter = yesterday.toISOString().split('T')[0]
      const url = `${city.url}?$limit=50`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const permits = await response.json()
      for (const p of permits) {
        const permitData = {
          permit_id: `${city.name}-${p.permit_number || Date.now()}`,
          city: city.name,
          permit_type: p.permit_type_description || 'Unknown',
          value: Number(p.project_valuation) || 0,
          contractor_name: p.contractor_name || null,
          contractor_phone: p.contractor_phone || null,
          status: 'new',
          issued_date: p.issued_date || null,
          last_seen_at: new Date().toISOString(),
          stage: 'Stage 1 Setup'
        }
        await supabase
         .from('permits')
         .upsert(permitData, { onConflict: 'permit_id' })
        await supabase
         .from('revenue_log')
         .upsert({
            permit_id: permitData.permit_id,
            deal_value: permitData.value,
            revenue_3pct: Math.round(permitData.value * 0.03),
            stage: 'Stage 1 Setup',
            logged_at: new Date().toISOString()
          }, { onConflict: 'permit_id' })
      }
      console.log(`Brain scanned ${permits.length} permits from ${city.name}`)
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error(`${city.name} scan error:`, err.message)
    }
  }
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
    await scanAllCities()
    return { permits_found: 'multi-city', timestamp: new Date().toISOString() }
  }
}

/* ====================== CRON FIXED ====================== */
cron.schedule('*/30 *', async () => {
  console.log('Brain auto-scan triggered')
  try {
    await scanAllCities()
  } catch (err) {
    console.error('Cron error:', err.message)
  }
})

/* ====================== ROUTES ====================== */
app.get('/api/test', (req, res) => {
  const activeCount = Object.values(OS_STATUS).filter(v => v === 'active').length
  res.json({ alive: true, version: '5.4.4', os_active: activeCount })
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

// Get recent permits for dashboard - NEW
app.get('/api/permits-recent', async (req, res) => {
  try {
    const { data, error } = await supabase
     .from('permits')
     .select('*')
     .order('created_at', { ascending: false })
     .limit(50)
    if (error) throw error
    res.json(data)
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
  console.log(`GRIDV21 BRAIN v5.4.4 running on ${PORT}`)
  try {
    await scanAllCities()
  } catch (err) {
    console.error(err.message)
  }
})

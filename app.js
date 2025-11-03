import express from 'express'
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json())

// ---------------- Supabase setup ----------------
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---------------- External Services ----------------
const BONES_URL = process.env.BONES_URL || 'https://raw.githubusercontent.com/gwork00100/bones/main/heartbeat_log.json'
const BLOOD_URL = process.env.BLOOD_URL || 'https://blood.onrender.com/api/update'
const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://localhost:11434/api/generate'

// ---------------- Helper: Query Ollama ----------------
async function queryModel(model, prompt, system = '') {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: system ? `${system}\n\n${prompt}` : prompt,
      stream: false
    })
  })
  const data = await res.json()
  return data.response
}

function selectModel(prompt) {
  const len = prompt.length
  const hasCode = /function|class|def|<|>|\{|\}/i.test(prompt)
  if (hasCode) return 'phi3:mini'
  if (len < 120) return 'tinyllama'
  return 'phi3:mini'
}

async function processPrompt(prompt) {
  const primary = selectModel(prompt)
  if (primary === 'tinyllama') return await queryModel('tinyllama', prompt)

  const outline = await queryModel('tinyllama', `Summarize or outline key points:\n${prompt}`)
  const refined = await queryModel(
    'phi3:mini',
    `Using this outline, write a clear and accurate answer:\n${outline}\n\nUser question:\n${prompt}`
  )
  return refined
}

// ---------------- Retry helper ----------------
async function retry(fn, attempts = 3, delayMs = 2000) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      console.warn(`⚠️ Attempt ${i + 1} failed:`, err.message)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastError
}

// ---------------- Supabase save ----------------
async function saveTrend(prompt, output) {
  await retry(async () => {
    const { data, error } = await supabase
      .from('trends')
      .insert([{
        keyword: prompt.slice(0, 50),
        interest: JSON.stringify(output).slice(0, 255),
        fetched_at: new Date()
      }])
    
    if (error) throw error
    console.log('Saved to Supabase:', data)
  })
}

// ---------------- Concurrent processing of trends ----------------
async function processTrend(trend) {
  await retry(async () => {
    console.log("🧩 Processing trend:", trend.title)

    // AI Analysis
    const mindRes = await fetch("http://mind-2wn3.onrender.com/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `Analyze this trend: ${trend.title}`,
        type: "analysis"
      }),
    })
    const mindData = await mindRes.json()
    console.log("🧠 AI output:", mindData.output)

    // Push to blood
    const bloodRes = await fetch(BLOOD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trend: trend.title,
        analysis: mindData.output,
        score: mindData.score,
      }),
    })
    if (!bloodRes.ok) throw new Error(`Failed to push to blood: ${bloodRes.status}`)
    console.log("💾 Sent analysis to blood")

    // Save to Supabase
    await saveTrend(trend.title, mindData)

  }, 3, 3000) // 3 attempts, 3s delay
}

// ---------------- Central Scheduler Loop ----------------
async function mainLoop() {
  while (true) {
    try {
      console.log("🔄 Fetching heartbeat_log from bones...")
      const heartbeatRes = await fetch(BONES_URL)
      const heartbeatData = await heartbeatRes.json()

      console.log(`✅ Retrieved ${heartbeatData.length} trend items.`)

      // Process all trends concurrently with retries
      await Promise.all(heartbeatData.map(trend => processTrend(trend)))

    } catch (err) {
      console.error("❌ Error in main loop:", err)
    }

    console.log("⏳ Waiting 10 minutes before next loop...")
    await new Promise(r => setTimeout(r, 10 * 60 * 1000))
  }
}

// ---------------- API Endpoints ----------------
app.post('/api/query', async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' })

    const start = Date.now()
    const output = await processPrompt(prompt)
    const duration = ((Date.now() - start) / 1000).toFixed(2)

    await saveTrend(prompt, output)
    res.json({ model: 'multi-LLM + dynamic APIs', time: `${duration}s`, output })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/', (req, res) => res.send('✅ Multi-LLM Pro running with dynamic API fetcher'))

app.get('/daily-trends', async (req, res) => {
  try {
    const bonesRes = await fetch(BONES_URL)
    if (!bonesRes.ok) throw new Error(`Failed: ${bonesRes.status}`)
    const bonesData = await bonesRes.json()
    res.json({ source: 'bones', data: bonesData })
  } catch (err) {
    console.error('Failed to fetch from bones:', err)
    res.status(500).json({ detail: 'Failed to fetch from bones.' })
  }
})

// ---------------- Start ----------------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🧠 Nerves server running on port ${PORT}`)
  mainLoop()
})

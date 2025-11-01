import express from 'express'
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config() // Load environment variables from .env

const app = express()
app.use(express.json())

// ---------------- Supabase setup ----------------
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---------------- Ollama setup ----------------
const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://localhost:11434/api/generate'

// Query any Ollama model
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

// Model selector logic
function selectModel(prompt) {
  const len = prompt.length
  const hasCode = /function|class|def|<|>|\{|\}/i.test(prompt)
  if (hasCode) return 'phi3:mini'
  if (len < 120) return 'tinyllama'
  return 'phi3:mini'
}

// Main chain
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

// ---------------- Supabase save function ----------------
async function saveTrend(prompt, output) {
  const { data, error } = await supabase
    .from('trends')
    .insert([{ keyword: prompt.slice(0, 50), interest: output.slice(0, 255), fetched_at: new Date() }])
  
  if (error) console.error('Supabase insert error:', error)
  else console.log('Saved to Supabase:', data)
}

// ---------------- API endpoints ----------------

// 1️⃣  Main LLM endpoint
app.post('/api/query', async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' })

    const start = Date.now()
    const output = await processPrompt(prompt)
    const duration = ((Date.now() - start) / 1000).toFixed(2)

    // Save to Supabase
    await saveTrend(prompt, output)

    res.json({ model: 'tinyllama + phi3:mini', time: `${duration}s`, output })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// 2️⃣  Health check
app.get('/', (req, res) => res.send('✅ Multi-LLM Pro running (TinyLlama + Phi-3-mini)'))

// 3️⃣  🔁 NEW: Proxy endpoint to fetch bones data (for n8n “blood”)
app.get('/daily-trends', async (req, res) => {
  try {
    // 👇 replace with your actual GitHub repo URL or bones API
    const bonesURL = 'https://raw.githubusercontent.com/<YOUR-GITHUB-USERNAME>/<BONES-REPO>/main/data/trends.json'

    const bonesResponse = await fetch(bonesURL)
    if (!bonesResponse.ok) {
      throw new Error(`Failed to fetch bones data: ${bonesResponse.status}`)
    }

    const bonesData = await bonesResponse.json()

    // Optionally log or store to Supabase
    console.log('Fetched bones data:', bonesData?.length || Object.keys(bonesData).length)

    // Send data to blood (n8n)
    res.json({ source: 'bones', data: bonesData })
  } catch (err) {
    console.error('Failed to fetch from bones:', err)
    res.status(500).json({ detail: 'Failed to fetch from bones.' })
  }
})

// ---------------- Server ----------------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🧠 Server running on port ${PORT}`))

import express from 'express'
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'
<<<<<<< HEAD
import dotenv from 'dotenv'

dotenv.config() // Load environment variables from .env
=======
>>>>>>> 416e9b7 (Initial commit)

const app = express()
app.use(express.json())

// ---------------- Supabase setup ----------------
<<<<<<< HEAD
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---------------- Ollama setup ----------------
const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://localhost:11434/api/generate'
=======
const SUPABASE_URL = 'https://ajkemrtlmbuvyjkrioze.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqa2VtcnRsbWJ1dnlqa3Jpb3plIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDg4MTc3NCwiZXhwIjoyMDc2NDU3Nzc0fQ.Y5T6WWzp__A0e8Z0p_zaqtNutwrwCOpic6_hkqcCLjY'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---------------- Ollama setup ----------------
const OLLAMA_URL = 'http://localhost:11434/api/generate'
>>>>>>> 416e9b7 (Initial commit)

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

app.get('/', (req, res) => res.send('✅ Multi-LLM Pro running (TinyLlama + Phi-3-mini)'))

<<<<<<< HEAD
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
=======
app.listen(3000, () => console.log('Server running on port 3000'))
>>>>>>> 416e9b7 (Initial commit)

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

// ---------------- Step 3.1: Fetch conversation context ----------------
async function fetchConversationContext(conversationId, limit = 10) {
  try {
    const { data: messages, error: msgErr } = await supabase
      .from('conversation_memory')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (msgErr) throw msgErr

    const { data: highScoring, error: scoreErr } = await supabase
      .from('conversation_memory')
      .select('*')
      .eq('conversation_id', conversationId)
      .gt('score', 8)
      .order('score', { ascending: false })
      .limit(5)

    if (scoreErr) console.warn('Error fetching high-scoring outputs:', scoreErr)

    return [...messages.reverse(), ...(highScoring || [])]
  } catch (err) {
    console.error('Error fetching conversation context:', err)
    return []
  }
}

// ---------------- Step 3.2: Generate AI reply ----------------
async function generateAIReply(conversationContext, nervesData = {}, trendData = []) {
  const contextText = conversationContext
    .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.ai_output || msg.content}`)
    .join('\n')

  let prompt = `${contextText}\n\nRespond naturally to the conversation.`

  if ((nervesData && Object.keys(nervesData).length) || trendData.length) {
    prompt += `\n\nAdditional Data:`
    if (nervesData && Object.keys(nervesData).length) {
      prompt += `\nNerves: ${JSON.stringify(nervesData)}`
    }
    if (trendData.length) {
      prompt += `\nTrends: ${JSON.stringify(trendData)}`
    }
  }

  const model = prompt.length < 120 ? 'tinyllama' : 'phi3:mini'
  return await queryModel(model, prompt)
}

// ---------------- Step 3.3: Store AI reply ----------------
async function storeAIReply(conversationId, userMessage, aiOutput, score = 0) {
  try {
    const { data, error } = await supabase
      .from('conversation_memory')
      .insert([{
        conversation_id: conversationId,
        role: 'ai',
        content: userMessage,
        ai_output: aiOutput,
        score,
        status: 'processed',
        created_at: new Date()
      }])

    if (error) throw error
    return data
  } catch (err) {
    console.error('Error storing AI reply:', err)
    return null
  }
}

// ---------------- Fetch trends from Bones ----------------
async function fetchTrends(limit = 5) {
  try {
    const res = await fetch(BONES_URL)
    if (!res.ok) throw new Error(`Failed: ${res.status}`)
    const data = await res.json()
    return data.slice(0, limit) // top N trends
  } catch (err) {
    console.error('Failed to fetch trends:', err)
    return []
  }
}

// ---------------- API Endpoint: Chat (Mind-aware) ----------------
app.post('/api/chat', async (req, res) => {
  try {
    const { conversation_id, message, nerves } = req.body
    if (!conversation_id || !message) return res.status(400).json({ error: 'Missing conversation_id or message' })

    // 1️⃣ Fetch conversation context
    const context = await fetchConversationContext(conversation_id)

    // Add new user message
    context.push({ role: 'user', content: message })

    // 1.5️⃣ Fetch trend data
    const trends = await fetchTrends()

    // 2️⃣ Generate AI reply with context + nerves + trends
    const aiReply = await generateAIReply(context, nerves, trends)

    // 3️⃣ Store AI reply
    await storeAIReply(conversation_id, message, aiReply)

    res.json({ output: aiReply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ---------------- Existing endpoints (unchanged) ----------------
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

// ---------------- Start server ----------------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🧠 Nerves server running on port ${PORT}`)
})

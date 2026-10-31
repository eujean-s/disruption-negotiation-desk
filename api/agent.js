import Anthropic from '@anthropic-ai/sdk'
import { createRequire } from 'node:module'
import { ROLES, buildPrompt, sanitizeLog } from '../src/prompts.js'
import { parseFlightRow, scenarioFromRow } from '../src/scenarioFromRow.js'

const require = createRequire(import.meta.url)
const scenarios = require('../src/data/scenarios.json')
const capacity = require('../src/data/airport_capacity.json')
const client = new Anthropic()

// Guard: the endpoint is public, so it never accepts prompt text. The browser sends a role,
// a scenario reference (curated id or one raw flights.csv row) and the negotiation so far;
// the prompt is built here. Model and max_tokens stay server-side.
const MAX_ROW_CHARS = 400

function resolveScenario(ref) {
  if (ref && typeof ref.id === 'string') {
    const s = scenarios.find((x) => x.id === ref.id)
    if (!s) throw new Error('unknown scenario id')
    return s
  }
  if (ref && typeof ref.row === 'string' && ref.row.length <= MAX_ROW_CHARS) return scenarioFromRow(parseFlightRow(ref.row), capacity)
  throw new Error('scenario must be { id } or { row } (one flights.csv line)')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  let prompt
  try {
    const { role, scenario, log } = req.body || {}
    if (!ROLES.includes(role)) throw new Error('role must be one of ' + ROLES.join(', '))
    const s = resolveScenario(scenario)
    prompt = buildPrompt(role, s, sanitizeLog(s, log || []))
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
  try {
    const msg = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 300,
      thinking: { type: 'between_tools' }, // keep thinking blocks from eating the 300-token budget
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.content }],
    })
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    res.status(200).json({ text })
  } catch (err) {
    console.error(err) // details stay in the server log
    res.status(502).json({ error: 'Agent call failed. Try again.' })
  }
}

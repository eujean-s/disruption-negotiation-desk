import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic()

// Guard: the endpoint is public, so only accept requests shaped like the app's own
// (one short system prompt, a few short text messages). Model and max_tokens stay server-side.
const MAX_SYSTEM_CHARS = 4000
const MAX_MESSAGES = 4
const MAX_CONTENT_CHARS = 6000

function validate(body) {
  const { system, messages } = body || {}
  if (typeof system !== 'string' || system.length > MAX_SYSTEM_CHARS) return 'system must be a string under ' + MAX_SYSTEM_CHARS + ' chars'
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return 'messages must be 1-' + MAX_MESSAGES + ' items'
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return 'message role must be user or assistant'
    if (typeof m.content !== 'string' || m.content.length > MAX_CONTENT_CHARS) return 'message content must be a string under ' + MAX_CONTENT_CHARS + ' chars'
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const invalid = validate(req.body)
  if (invalid) return res.status(400).json({ error: invalid })
  try {
    const { system, messages } = req.body
    const msg = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 300,
      thinking: { type: 'between_tools' }, // keep thinking blocks from eating the 300-token budget
      system,
      messages: messages.map(({ role, content }) => ({ role, content })),
    })
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    res.status(200).json({ text })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
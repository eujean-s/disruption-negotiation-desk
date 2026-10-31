import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { system, messages } = req.body
    const msg = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 800,
      system,
      messages,
    })
    res.status(200).json({ text: msg.content[0].text })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
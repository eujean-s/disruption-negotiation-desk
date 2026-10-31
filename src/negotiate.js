// Three-agent negotiation (ATC / PILOT / GROUND). The LLM only talks;
// checkProposal() and fallback() are plain code and have the final word.

import { checkProposal, fallback, connectionStatus, slotMap } from './checker.js'
import { FLIGHTS_HEADER } from './scenarioFromRow.js'
import { ROLES, MAX_ROUNDS, STANCES } from './prompts.js'

export { ROLES, MAX_ROUNDS }

// What the server needs to rebuild the scenario itself: a curated id, or the raw flights.csv row.
const scenarioRef = (s) => (s.custom ? { row: FLIGHTS_HEADER.map((k) => s.source[k]).join(',') } : { id: s.id })

// Safe JSON parse: tolerate fences/prose around the object, validate the shape.
export function parseReply(text) {
  try {
    const a = text.indexOf('{')
    const b = text.lastIndexOf('}')
    const o = JSON.parse(text.slice(a, b + 1))
    const type = String(o.type || '').toUpperCase()
    if (!STANCES.includes(type)) return null
    const delay = o.delay_min === null || o.delay_min === undefined ? null : Number(o.delay_min)
    return {
      type,
      delay_min: Number.isFinite(delay) ? delay : null,
      gate: typeof o.gate === 'string' && o.gate ? o.gate : null,
      message: String(o.message || '').slice(0, 200),
    }
  } catch {
    return null
  }
}

async function callAgent(baseUrl, role, s, log) {
  // Prompts are built on the server from this reference; the browser never sends prompt text.
  const history = log.map(({ kind, round, role, type, delay_min, gate, message, proposal }) =>
    kind === 'check' ? { kind, round, proposal } : { kind, round, role, type, delay_min, gate, message })
  try {
    const res = await fetch(baseUrl + '/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, scenario: scenarioRef(s), log: history }),
    })
    const data = await res.json()
    if (!res.ok || !data.text) throw new Error(data.error || 'HTTP ' + res.status)
    return parseReply(data.text) || { type: 'INVALID', delay_min: null, gate: null, message: 'Unparseable reply: ' + data.text.slice(0, 80) }
  } catch (e) {
    return { type: 'ERROR', delay_min: null, gate: null, message: e.message }
  }
}

// Consensus: nobody rejects/escalates, all give the same delay, GROUND names a gate.
function consensusProposal(msgs) {
  const okType = (m) => m.type === 'PROPOSE' || m.type === 'ACCEPT' || m.type === 'COUNTER'
  if (!msgs.every(okType)) return null
  const delay = msgs[0].delay_min
  if (delay === null || !msgs.every((m) => m.delay_min === delay)) return null
  const gate = msgs.find((m) => m.role === 'GROUND').gate
  return gate ? { delay_min: delay, gate } : null
}

// Short summary of where the agents' last round diverged, for the fallback reason.
function disagreement(msgs) {
  const stuck = msgs.filter((m) => !['PROPOSE', 'ACCEPT', 'COUNTER'].includes(m.type))
  if (stuck.length) return stuck.map((m) => `${m.role} ${m.type}`).join(', ')
  return msgs.map((m) => `${m.role} delay ${m.delay_min ?? '-'}${m.role === 'GROUND' ? ' gate ' + (m.gate ?? '-') : ''}`).join(', ')
}

// What blocks each offered slot with its best gate: the same view as the UI's slot map.
function blockingRules(s) {
  return slotMap(s).map((x) => `+${x.delay_min} ${x.violations.join('/')}`).join(', ')
}

// onEvent receives every message / checker verdict / outcome in order.
export async function runNegotiation(scenario, { onEvent = () => {}, baseUrl = '' } = {}) {
  const log = []
  const emit = (e) => { log.push(e); onEvent(e) }
  let blocked = 0
  let lastRound = 0
  let why = 'no rounds were run'

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    lastRound = round
    const msgs = []
    for (const role of ROLES) {
      const r = await callAgent(baseUrl, role, scenario, log)
      const m = { kind: 'message', round, role, ...r }
      msgs.push(m)
      emit(m)
    }
    if (msgs.every((m) => m.type === 'ESCALATE')) {
      why = `all three agents escalated in round ${round}`
      break
    }
    const candidate = consensusProposal(msgs)
    if (!candidate) {
      why = `no agreement after ${round} of ${MAX_ROUNDS} rounds (${disagreement(msgs)})`
      continue
    }
    const verdict = checkProposal(scenario, candidate)
    emit({ kind: 'check', round, proposal: candidate, ...verdict })
    if (verdict.ok) {
      const out = { kind: 'outcome', outcome: 'CONSENSUS', proposal: candidate, round, blocked, connection: verdict.connection }
      emit(out)
      return { ...out, log }
    }
    blocked++
    why = `round ${round} consensus (delay ${candidate.delay_min}, gate ${candidate.gate}) blocked by checker: ${verdict.violations.join(', ')}`
  }

  const fb = fallback(scenario)
  const out = fb
    ? { kind: 'outcome', outcome: 'FALLBACK', proposal: fb, round: lastRound, blocked, connection: connectionStatus(scenario, fb),
        reason: `${why}. Fallback chose the earliest runway slot and gate that pass every checker rule.` }
    : { kind: 'outcome', outcome: 'ESCALATE', proposal: null, round: lastRound, blocked,
        reason: `${why}. No offered slot passes the checker (${blockingRules(scenario)}), so a human must decide.` }
  emit(out)
  return { ...out, log }
}

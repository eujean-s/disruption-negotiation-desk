// Three-agent negotiation (ATC / PILOT / GROUND). The LLM only talks;
// checkProposal() and fallback() are plain code and have the final word.

import { checkProposal, fallback, FACTS, usableHoldMin, connectionStatus, slotMap } from './checker.js'

export const ROLES = ['ATC', 'PILOT', 'GROUND']
export const MAX_ROUNDS = 3 // brief: one turn = one message from each agent, consensus within 3 turns
const STANCES = ['PROPOSE', 'ACCEPT', 'COUNTER', 'REJECT', 'ESCALATE']

const factsFor = (role, s) => FACTS[role](s)

const DUTY = {
  ATC: 'You are the air traffic controller. You own the runway. Only propose slots listed in your facts with usable=true, i.e. gap_to_leader_min is null or >= required_gap_min (wake turbulence behind a heavy arrival). Propose the earliest such slot first. If another agent needs a different delay, counter with the earliest usable slot that satisfies them.',
  PILOT: 'You are the pilot in command. You own fuel and crew duty. ACCEPT only if the delay on the table is <= usable_holding_min and <= latest_delay_for_crew_min. Otherwise COUNTER with the largest delay you can accept (the smaller of those two limits). Also protect the passenger connection where safely possible.',
  GROUND: 'You are the ground operations manager. You own gates. ACCEPT a gate only if its free_from is no later than arrival time minus gate_change_notice_min, i.e. delay_min >= the gate\'s ready_at_delay_min. Otherwise COUNTER with the smallest delay at which a gate is ready, and name that gate. You must name the gate.',
}

function systemPrompt(role, facts) {
  return `${DUTY[role]}
A flight is disrupted. Negotiate with the other two agents (ATC, PILOT, GROUND) for an arrival delay in minutes and a gate. Times are HH:MM; delays are minutes. Be safe first, then minimise delay.
Your facts (you do not know the other agents' facts):
${JSON.stringify(facts)}
Reply with JSON ONLY, no prose, no code fences:
{"message":"<your reasoning, max 25 words>","type":"PROPOSE|ACCEPT|COUNTER|REJECT|ESCALATE","delay_min":<number or null>,"gate":"<gate id or null>"}
Write message first, then set delay_min and gate to the values you are proposing or accepting, never a value you are rejecting.
Use ACCEPT only if you agree to the exact delay_min (and gate) on the table. Use ESCALATE if you believe no safe option exists.`
}

function transcriptText(log) {
  if (!log.length) return 'No messages yet. ATC opens with a PROPOSE.'
  return log
    .map((m) =>
      m.kind === 'check'
        ? `R${m.round} CHECKER: ${m.ok ? 'PASSED' : 'BLOCKED (' + m.violations.join(', ') + ')'}` +
          (m.warnings.length ? ` WARNING: passenger connection missed (at gate ${m.connection.at_gate}, departs ${m.connection.departs})` : '')
        : `R${m.round} ${m.role} [${m.type}] delay_min=${m.delay_min} gate=${m.gate}: ${m.message}`,
    )
    .join('\n')
}

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
  const system = systemPrompt(role, factsFor(role, s))
  const content = `Negotiation so far:\n${transcriptText(log)}\n\nYour turn (${role}). JSON only.`
  try {
    const res = await fetch(baseUrl + '/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, messages: [{ role: 'user', content }] }),
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

// Three-agent negotiation (ATC / PILOT / GROUND). The LLM only talks;
// checkProposal() and fallback() are plain code and have the final word.

export const ROLES = ['ATC', 'PILOT', 'GROUND']
export const MAX_ROUNDS = 3
const STANCES = ['PROPOSE', 'ACCEPT', 'COUNTER', 'REJECT', 'ESCALATE']

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]))
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')

const REAL_ROW_KEYS = {
  ATC: ['ORIGIN_AIRPORT', 'DESTINATION_AIRPORT', 'SCHEDULED_ARRIVAL', 'ARRIVAL_DELAY', 'WEATHER_DELAY', 'AIR_SYSTEM_DELAY', 'TAXI_IN'],
  PILOT: ['DISTANCE', 'SCHEDULED_TIME', 'AIR_TIME', 'DEPARTURE_DELAY', 'ARRIVAL_DELAY', 'WEATHER_DELAY', 'LATE_AIRCRAFT_DELAY'],
  GROUND: ['AIRLINE', 'FLIGHT_NUMBER', 'TAIL_NUMBER', 'SCHEDULED_ARRIVAL', 'AIRLINE_DELAY', 'LATE_AIRCRAFT_DELAY', 'TAXI_IN'],
}

// Each agent only gets its own facts. Never pass ground_truth or the whole scenario.
export function factsFor(role, s) {
  const base = { flight: s.flight, disruption: s.disruption, scheduled_arrival: s.scheduled_arrival_label }
  const real_row = pick(s.source, REAL_ROW_KEYS[role])
  if (role === 'ATC') return { ...base, runway_slots_delay_min: s.runway_slots_delay_min, real_row }
  if (role === 'PILOT') {
    return {
      ...base,
      fuel_on_board_min: s.fuel_on_board_min,
      min_reserve_min: s.min_reserve_min,
      crew_shift_end: hhmm(s.crew_shift_end_min),
      next_connection: s.next_connection,
      real_row,
    }
  }
  return {
    ...base,
    next_connection: s.next_connection,
    gates: s.gates.map((g) => ({ id: g.id, free_from: hhmm(g.free_from_min) })),
    real_row,
  }
}

const DUTY = {
  ATC: 'You are the air traffic controller. You own the runway slots: arrival delay can only be one of runway_slots_delay_min.',
  PILOT: 'You are the pilot in command. You own fuel and crew duty: delay must stay within (fuel_on_board_min - min_reserve_min), and the aircraft must be on the ground before crew_shift_end.',
  GROUND: 'You are the ground operations manager. You own gates: the aircraft can only use a gate that is free at its actual arrival time (scheduled arrival + delay). You must name the gate.',
}

function systemPrompt(role, facts) {
  return `${DUTY[role]}
A flight is disrupted. Negotiate with the other two agents (ATC, PILOT, GROUND) for an arrival delay in minutes and a gate. Times are HH:MM; delays are minutes. Be safe first, then minimise delay.
Your facts (you do not know the other agents' facts):
${JSON.stringify(facts)}
Reply with JSON ONLY, no prose, no code fences:
{"type":"PROPOSE|ACCEPT|COUNTER|REJECT|ESCALATE","delay_min":<number or null>,"gate":"<gate id or null>","message":"<max 25 words>"}
Use ACCEPT only if you agree to the exact delay_min (and gate) on the table. Use ESCALATE if you believe no safe option exists.`
}

function transcriptText(log) {
  if (!log.length) return 'No messages yet. ATC opens with a PROPOSE.'
  return log
    .map((m) =>
      m.kind === 'check'
        ? `R${m.round} CHECKER: ${m.ok ? 'PASSED' : 'BLOCKED (' + m.violations.join(', ') + ')'}`
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

// Plain-code feasibility check against the full scenario.
export function checkProposal(s, p) {
  const violations = []
  const delay = p && p.delay_min
  const gate = p && s.gates.find((g) => g.id === p.gate)
  if (!Number.isFinite(delay)) return { ok: false, violations: ['SLOT'] }
  const arrival = s.scheduled_arrival_min + delay
  if (!s.runway_slots_delay_min.includes(delay)) violations.push('SLOT')
  if (delay > s.fuel_on_board_min - s.min_reserve_min) violations.push('FUEL')
  if (!gate || gate.free_from_min > arrival) violations.push('GATE')
  if (arrival > s.crew_shift_end_min) violations.push('CREW')
  return { ok: violations.length === 0, violations }
}

// Deterministic fallback: earliest runway slot with the earliest-free gate that passes the checker.
export function fallback(s) {
  const slots = [...s.runway_slots_delay_min].sort((a, b) => a - b)
  const gates = [...s.gates].sort((a, b) => a.free_from_min - b.free_from_min)
  for (const delay_min of slots) {
    for (const g of gates) {
      const p = { delay_min, gate: g.id }
      if (checkProposal(s, p).ok) return p
    }
  }
  return null
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

// onEvent receives every message / checker verdict / outcome in order.
export async function runNegotiation(scenario, { onEvent = () => {}, baseUrl = '' } = {}) {
  const log = []
  const emit = (e) => { log.push(e); onEvent(e) }
  let blocked = 0
  let lastRound = 0

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    lastRound = round
    const msgs = []
    for (const role of ROLES) {
      const r = await callAgent(baseUrl, role, scenario, log)
      const m = { kind: 'message', round, role, ...r }
      msgs.push(m)
      emit(m)
    }
    if (msgs.every((m) => m.type === 'ESCALATE')) break
    const candidate = consensusProposal(msgs)
    if (!candidate) continue
    const verdict = checkProposal(scenario, candidate)
    emit({ kind: 'check', round, proposal: candidate, ...verdict })
    if (verdict.ok) {
      const out = { kind: 'outcome', outcome: 'CONSENSUS', proposal: candidate, round, blocked }
      emit(out)
      return { ...out, log }
    }
    blocked++
  }

  const fb = fallback(scenario)
  const out = fb
    ? { kind: 'outcome', outcome: 'FALLBACK', proposal: fb, round: lastRound, blocked }
    : { kind: 'outcome', outcome: 'ESCALATE', proposal: null, round: lastRound, blocked }
  emit(out)
  return { ...out, log }
}

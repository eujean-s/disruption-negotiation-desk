// Agent prompts, built on the server (api/agent.js) so the public endpoint cannot be used
// with arbitrary prompts. The browser only sends the role, a scenario reference and the
// negotiation so far; checker lines in the transcript are recomputed here, never trusted.
import { FACTS, checkProposal } from './checker.js'

export const ROLES = ['ATC', 'PILOT', 'GROUND']
export const MAX_ROUNDS = 3 // brief: one turn = one message from each agent, consensus within 3 turns
export const STANCES = ['PROPOSE', 'ACCEPT', 'COUNTER', 'REJECT', 'ESCALATE']
const LOGGED_TYPES = [...STANCES, 'INVALID', 'ERROR']
const MAX_LOG = MAX_ROUNDS * (ROLES.length + 1)

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

const cleanGate = (g) => (typeof g === 'string' && g ? g.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || null : null)
const cleanDelay = (d) => (d === null || d === undefined || !Number.isFinite(Number(d)) ? null : Math.round(Number(d)))

// Rebuild the negotiation history from untrusted input: only known fields, bounded lengths,
// and checker verdicts recomputed against the server's own scenario.
export function sanitizeLog(s, log) {
  if (!Array.isArray(log) || log.length > MAX_LOG) throw new Error('log must be an array of at most ' + MAX_LOG + ' events')
  return log.map((e) => {
    const round = Number(e && e.round)
    if (!Number.isInteger(round) || round < 1 || round > MAX_ROUNDS) throw new Error('bad round')
    if (e.kind === 'check') {
      const proposal = { delay_min: cleanDelay(e.proposal && e.proposal.delay_min), gate: cleanGate(e.proposal && e.proposal.gate) }
      return { kind: 'check', round, proposal, ...checkProposal(s, proposal) }
    }
    if (e.kind !== 'message' || !ROLES.includes(e.role) || !LOGGED_TYPES.includes(e.type)) throw new Error('bad message event')
    return {
      kind: 'message', round, role: e.role, type: e.type,
      delay_min: cleanDelay(e.delay_min), gate: cleanGate(e.gate),
      message: String(e.message || '').replace(/\s+/g, ' ').slice(0, 200),
    }
  })
}

export function buildPrompt(role, s, log) {
  return {
    system: systemPrompt(role, FACTS[role](s)),
    content: `Negotiation so far:\n${transcriptText(log)}\n\nYour turn (${role}). JSON only.`,
  }
}

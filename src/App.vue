<script setup>
import { ref, computed, watch } from 'vue'
import scenarios from './data/scenarios.json'
import { runNegotiation, MAX_ROUNDS, ROLES } from './negotiate.js'
import { WAKE_SEPARATION_MIN, GATE_CHANGE_NOTICE_MIN, usableHoldMin, hhmm, ruleChecks, slotMap, FACTS } from './checker.js'
import { parseFlightRow, scenarioFromRow } from './scenarioFromRow.js'

const selectedId = ref(scenarios[0].id)
const events = ref([])
const outcome = ref(null)
const running = ref(false)
// Human decision on the outcome: null until the duty manager approves or rejects.
const decision = ref(null) // { verdict: 'APPROVED' | 'REJECTED', note, at }
const rejectNote = ref('')
const rejecting = ref(false)
const startedAt = ref(null)
const elapsedS = ref(null)

// Any flights.csv row can be pasted in and becomes a scenario (limits from the constraints workbook).
const rowText = ref('2015,1,1,4,AA,8,N368AA,HNL,DFW,1745,1933,108,15,1948,445,446,420,3784,0648,11,0510,0659,109,0,0,,1,0,0,108,0')
const customScenario = ref(null)
const rowError = ref('')

function loadRow() {
  rowError.value = ''
  try {
    customScenario.value = scenarioFromRow(parseFlightRow(rowText.value))
    resetRun()
  } catch (e) {
    customScenario.value = null
    rowError.value = e.message
  }
}

const scenario = computed(() =>
  selectedId.value === 'CUSTOM' ? customScenario.value : scenarios.find((s) => s.id === selectedId.value),
)

// Scenario-specific `interpretations` when present, plus the standing assumptions of this build.
const assumptions = computed(() => !scenario.value ? [] : [
  ...(scenario.value.interpretations || []),
  scenario.value.data_note,
  `Operational limits from challenge2_operational_constraints.xlsx (synthetic planning limits, per the organisers).`,
  `Wake: a slot less than ${WAKE_SEPARATION_MIN} min (120 s, Heavy follows Heavy) behind a heavy arrival is unusable.`,
  `Gate change notice: the gate must be free at least ${GATE_CHANGE_NOTICE_MIN} min before arrival.`,
  'Usable holding = fuel on board minus the minimum reserve. Passenger connection is a warning only; it never blocks.',
].filter(Boolean))

// Headline facts for the human (agents still only see their own slice).
const keyFacts = computed(() => {
  const s = scenario.value
  if (!s) return []
  return [
    { label: 'Scheduled arrival', value: s.scheduled_arrival_label },
    { label: 'Runway slots', value: s.runway_slots_delay_min.map((d) => '+' + d).join(' ') },
    { label: 'Usable holding', value: usableHoldMin(s) + ' min' },
    { label: 'Gates', value: s.gates.map((g) => `${g.id} ${hhmm(g.free_from_min)}`).join(' · ') },
  ]
})

// Messages and checker verdicts grouped by round for the timeline.
const rounds = computed(() => {
  const by = new Map()
  for (const e of events.value) {
    if (!by.has(e.round)) by.set(e.round, [])
    by.get(e.round).push(e)
  }
  return [...by.entries()].map(([round, items]) => ({ round, items }))
})
// Plain-code view of every offered slot: is any gate usable, and if not, what blocks it.
const slots = computed(() => (scenario.value ? slotMap(scenario.value) : []))
const agentFacts = (role) => JSON.stringify(FACTS[role](scenario.value), null, 1)

const status = computed(() => {
  if (running.value) return { text: `running · round ${rounds.value.length || 1}/${MAX_ROUNDS}`, cls: 'live' }
  if (decision.value) return { text: decision.value.verdict.toLowerCase().replace('_', ' '), cls: decision.value.verdict === 'REJECTED' ? 'bad' : 'ok' }
  if (outcome.value) return { text: 'awaiting human decision', cls: 'warn' }
  return { text: 'idle', cls: '' }
})
const messageCount = computed(() => events.value.filter((e) => e.kind === 'message').length)

const nextRole = computed(() => ROLES[events.value.filter((e) => e.kind === 'message').length % ROLES.length])

const roleMeta = {
  ATC: { label: 'ATC', who: 'Air traffic control', cls: 'role-atc' },
  PILOT: { label: 'PIC', who: 'Pilot in command', cls: 'role-pilot' },
  GROUND: { label: 'GND', who: 'Ground operations', cls: 'role-ground' },
}
const ruleText = {
  SLOT: 'not an offered runway slot',
  WAKE: `within ${WAKE_SEPARATION_MIN} min of a heavy arrival (wake)`,
  FUEL: 'beyond usable holding fuel',
  GATE: `no gate free ${GATE_CHANGE_NOTICE_MIN} min before arrival`,
  CREW: 'arrives after crew duty ends',
}
const outcomeMeta = {
  CONSENSUS: { cls: 'outcome-ok', icon: '✓', text: 'Agents agreed and the checker passed' },
  FALLBACK: { cls: 'outcome-warn', icon: '↺', text: 'No agreement; rule-based fallback chose the plan' },
  ESCALATE: { cls: 'outcome-bad', icon: '!', text: 'Nothing is safe; a human must decide' },
}

// Stance -> status colour (accent is reserved for primary actions).
const typeBadge = {
  PROPOSE: 'st-neutral', ACCEPT: 'st-ok', COUNTER: 'st-warn',
  REJECT: 'st-bad', ESCALATE: 'st-bad', INVALID: 'st-muted', ERROR: 'st-muted',
}

function decide(verdict) {
  decision.value = { verdict, note: rejectNote.value.trim() || null, at: new Date().toISOString() }
  rejecting.value = false
}

// Traceable consensus log: every message, checker verdict, outcome and approval as JSON.
function downloadLog() {
  const log = {
    scenario: scenario.value.id,
    flight: scenario.value.flight,
    csv_row: scenario.value.csv_row,
    pasted_row: scenario.value.custom ? scenario.value.source : undefined,
    assumptions: assumptions.value,
    max_rounds: MAX_ROUNDS,
    events: events.value,
    outcome: outcome.value,
    decided_in_s: elapsedS.value,
    human_decision: decision.value,
    exported_at: new Date().toISOString(),
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `negotiation-${scenario.value.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function resetRun() {
  decision.value = null
  rejectNote.value = ''
  rejecting.value = false
  elapsedS.value = null
  events.value = []
  outcome.value = null
}

watch(selectedId, resetRun)

async function run() {
  if (!scenario.value) return
  running.value = true
  resetRun()
  startedAt.value = performance.now()
  const result = await runNegotiation(scenario.value, {
    onEvent: (e) => (e.kind === 'outcome' ? (outcome.value = e) : events.value.push(e)),
  })
  outcome.value = result
  elapsedS.value = Math.round((performance.now() - startedAt.value) / 100) / 10
  running.value = false
}
</script>

<template>
  <header class="app-header">
    <div class="container">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <h1 class="title mb-1">Disruption negotiation desk</h1>
          <div class="small text-muted">ATC · Pilot · Ground agents negotiate. Plain-code rules decide. You approve.</div>
        </div>
        <div class="d-flex gap-2 small">
          <span class="pill status" :class="'status-' + status.cls"><span class="dot"></span>{{ status.text }}</span>
          <span class="pill">3 agents · max <span class="mono">{{ MAX_ROUNDS }}</span> rounds</span>
        </div>
      </div>
    </div>
  </header>

  <main class="container py-4">
    <section class="card mb-4">
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-12 col-md">
            <label class="eyebrow mb-1" for="sc">Disruption</label>
            <select id="sc" v-model="selectedId" class="form-select" :disabled="running">
              <option v-for="s in scenarios" :key="s.id" :value="s.id">{{ s.id }} · {{ s.flight }} · {{ s.trigger }}</option>
              <option value="CUSTOM">Custom · paste any flights.csv row</option>
            </select>
          </div>
          <div class="col-12 col-md-auto">
            <button class="btn btn-primary w-100 px-4" :disabled="running || !scenario" @click="run">
              <span v-if="running" class="spinner-border spinner-border-sm me-2"></span>
              {{ running ? 'Negotiating' : 'Run negotiation' }}
            </button>
          </div>
        </div>

        <div v-if="selectedId === 'CUSTOM'" class="mt-3">
          <label class="form-label small text-muted" for="row">One line from flights.csv (header optional)</label>
          <textarea id="row" v-model="rowText" class="form-control mono small" rows="2" :disabled="running"></textarea>
          <div class="d-flex align-items-center gap-2 mt-2">
            <button class="btn btn-quiet btn-sm" :disabled="running" @click="loadRow">Load row</button>
            <span v-if="rowError" class="text-danger small">{{ rowError }}</span>
            <span v-else-if="scenario" class="text-success small">Loaded {{ scenario.flight }}</span>
          </div>
        </div>

        <template v-if="scenario">
          <p class="mt-3 mb-2 small">
            <strong>{{ scenario.flight }}</strong><span v-if="scenario.date" class="text-muted">, {{ scenario.date }}</span>.
            {{ scenario.disruption }}
          </p>
          <div class="row g-2">
            <div v-for="f in keyFacts" :key="f.label" class="col-6 col-lg-3">
              <div class="fact">
                <div class="fact-label">{{ f.label }}</div>
                <div class="fact-value mono">{{ f.value }}</div>
              </div>
            </div>
          </div>

          <div class="mt-3">
            <div class="eyebrow mb-2">Slot map <span class="text-muted fw-normal text-none">· computed by the checker, not the agents</span></div>
            <div class="slotmap">
              <div v-for="sl in slots" :key="sl.delay_min" class="slot"
                   :class="[sl.ok ? 'slot-ok' : 'slot-bad', outcome?.proposal?.delay_min === sl.delay_min ? 'slot-chosen' : '']">
                <div class="mono slot-delay">+{{ sl.delay_min }}</div>
                <div class="small mono">{{ hhmm(scenario.scheduled_arrival_min + sl.delay_min) }}</div>
                <div class="slot-verdict mono">
                  <template v-if="sl.ok">✓ {{ sl.gate }}</template>
                  <template v-else>✕ {{ sl.violations.join(' ') }}</template>
                </div>
              </div>
            </div>
            <div class="small text-muted mt-1">
              <span v-if="slots.some((x) => x.ok)">Earliest safe: <span class="mono">+{{ slots.find((x) => x.ok).delay_min }} · {{ slots.find((x) => x.ok).gate }}</span>.</span>
              <span v-else class="text-danger">No offered slot is safe: expect ESCALATE.</span>
              Hover a rule code in the log for its meaning.
            </div>
          </div>
        </template>
      </div>
    </section>

    <div class="row g-4">
      <div class="col-lg-8">
        <h2 class="eyebrow mb-3">Negotiation log</h2>

        <div v-if="!events.length && !running" class="empty text-muted small">
          Press <strong>Run negotiation</strong>. Each agent sees only its own facts; every agreement is checked by plain-code rules.
        </div>

        <div v-for="r in rounds" :key="r.round" class="mb-3">
          <div class="round-label mono">ROUND {{ r.round }}/{{ MAX_ROUNDS }}</div>
          <template v-for="(e, i) in r.items" :key="i">
            <div v-if="e.kind === 'message'" class="msg" :class="roleMeta[e.role].cls">
              <div class="avatar">{{ roleMeta[e.role].label }}</div>
              <div class="flex-grow-1 min-w-0">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <span class="fw-semibold small">{{ roleMeta[e.role].who }}</span>
                  <span class="stance mono" :class="typeBadge[e.type]">{{ e.type }}</span>
                  <span v-if="e.delay_min !== null || e.gate" class="plan-chip mono">
                    <template v-if="e.delay_min !== null">+{{ e.delay_min }} min</template>
                    <template v-if="e.gate"> · {{ e.gate }}</template>
                  </span>
                </div>
                <div class="small">{{ e.message }}</div>
                <div class="d-flex flex-wrap gap-3 mt-1 meta">
                  <span>agent reasoning · unverified</span>
                  <details>
                    <summary>what {{ roleMeta[e.role].label }} saw</summary>
                    <pre class="mono facts">{{ agentFacts(e.role) }}</pre>
                  </details>
                </div>
              </div>
            </div>
            <div v-else class="check" :class="e.ok ? 'check-ok' : 'check-bad'">
              <span class="check-icon">{{ e.ok ? '✓' : '✕' }}</span>
              <div class="small">
                <strong>Checker {{ e.ok ? 'passed' : 'blocked' }}</strong>
                <span class="mono ms-1">+{{ e.proposal.delay_min }} min · {{ e.proposal.gate }}</span>
                <span class="meta ms-2">verified by code</span>
                <ul class="rules">
                  <li v-for="c in ruleChecks(scenario, e.proposal)" :key="c.rule" :class="c.ok ? 'r-ok' : 'r-bad'" :title="ruleText[c.rule]">
                    <span class="mono r-code">{{ c.ok ? '✓' : '✕' }} {{ c.rule }}</span> {{ c.detail }}
                  </li>
                </ul>
                <div v-if="e.warnings.length" class="mt-1 warn-note">
                  Connection missed (at gate {{ e.connection.at_gate }}, departs {{ e.connection.departs }}): warning only
                </div>
              </div>
            </div>
          </template>
        </div>

        <div v-if="running" class="msg thinking" :class="roleMeta[nextRole].cls">
          <div class="avatar">{{ roleMeta[nextRole].label }}</div>
          <div class="small text-muted d-flex align-items-center">
            <span class="spinner-grow spinner-grow-sm me-2"></span>{{ roleMeta[nextRole].who }} is thinking
          </div>
        </div>
      </div>

      <aside class="col-lg-4">
        <div class="sticky-lg-top" style="top: 1rem">
          <div v-if="outcome" class="card mb-3 outcome" :class="outcomeMeta[outcome.outcome].cls">
            <div class="card-body">
              <div class="d-flex align-items-center gap-2 mb-2">
                <span class="outcome-icon">{{ outcomeMeta[outcome.outcome].icon }}</span>
                <div>
                  <div class="fw-semibold mono">{{ outcome.outcome }}</div>
                  <div class="small text-muted">{{ outcomeMeta[outcome.outcome].text }}</div>
                </div>
              </div>

              <div v-if="outcome.proposal" class="row g-2 text-center my-3">
                <div class="col-6"><div class="big mono">+{{ outcome.proposal.delay_min }}</div><div class="small text-muted">min delay</div></div>
                <div class="col-6"><div class="big mono">{{ outcome.proposal.gate }}</div><div class="small text-muted">gate</div></div>
              </div>

              <p v-if="outcome.connection" class="small mb-2" :class="outcome.connection.missed ? 'text-danger' : 'text-success'">
                Connection: at gate {{ outcome.connection.at_gate }}, departs {{ outcome.connection.departs }} →
                <strong>{{ outcome.connection.missed ? 'missed (you decide)' : 'protected' }}</strong>
              </p>
              <p v-if="outcome.reason" class="small mb-2"><strong>Why:</strong> {{ outcome.reason }}</p>

              <ul v-if="outcome.proposal" class="rules mb-3">
                <li v-for="c in ruleChecks(scenario, outcome.proposal)" :key="c.rule" :class="c.ok ? 'r-ok' : 'r-bad'">
                  <span class="mono r-code">{{ c.ok ? '✓' : '✕' }} {{ c.rule }}</span> {{ c.detail }}
                </li>
              </ul>

              <div class="timing mono mb-3">
                decided in {{ elapsedS ?? '…' }} s · round {{ outcome.round }}/{{ MAX_ROUNDS }} · {{ messageCount }} messages
              </div>

              <div v-if="decision" class="decision mb-2" :class="decision.verdict === 'REJECTED' ? 'decision-bad' : 'decision-ok'">
                <div class="fw-semibold small">{{ decision.verdict === 'APPROVED' ? 'Approved' : decision.verdict === 'REJECTED' ? 'Rejected' : 'Taken over' }} by duty manager
                  <span class="mono text-muted ms-1">{{ new Date(decision.at).toLocaleTimeString() }}</span></div>
                <div v-if="decision.note" class="small text-muted">“{{ decision.note }}”</div>
              </div>

              <div class="d-grid gap-2">
                <template v-if="!decision">
                  <template v-if="outcome.proposal">
                    <button v-if="!rejecting" class="btn btn-primary" @click="decide('APPROVED')">Approve plan</button>
                    <button v-if="!rejecting" class="btn btn-quiet btn-sm" @click="rejecting = true">Reject…</button>
                    <template v-else>
                      <input v-model="rejectNote" class="form-control form-control-sm" placeholder="Reason (goes in the log)" />
                      <div class="d-flex gap-2">
                        <button class="btn btn-quiet btn-sm flex-fill reject-btn" @click="decide('REJECTED')">Confirm reject</button>
                        <button class="btn btn-quiet btn-sm" @click="rejecting = false">Cancel</button>
                      </div>
                    </template>
                  </template>
                  <button v-else class="btn btn-primary" @click="decide('TAKEN_OVER')">I'll handle it manually</button>
                </template>
                <button class="btn btn-quiet btn-sm" @click="downloadLog">Download consensus log (JSON)</button>
              </div>
            </div>
          </div>

          <details class="card" open>
            <summary class="card-header eyebrow">Assumptions ({{ assumptions.length }})</summary>
            <ul class="card-body small mb-0 ps-4">
              <li v-for="(a, i) in assumptions" :key="i" class="mb-1">{{ a }}</li>
            </ul>
          </details>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.app-header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 1rem 0; }
.title { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; }
.pill { border: 1px solid var(--border); border-radius: 999px; padding: 0.1rem 0.6rem; color: var(--muted); white-space: nowrap; }
.eyebrow { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.fact { background: var(--bg); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.5rem 0.75rem; height: 100%; }
.fact-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.fact-value { font-weight: 500; font-size: 0.85rem; word-break: break-word; }
.empty { border: 1px dashed var(--border); border-radius: 0.5rem; padding: 1.5rem; text-align: center; }
.round-label { font-size: 0.7rem; color: var(--muted); letter-spacing: 0.06em; margin: 0.25rem 0 0.5rem; display: flex; align-items: center; gap: 0.75rem; }
.round-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.msg { display: flex; gap: 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.65rem 0.8rem; margin-bottom: 0.5rem; }
.avatar { flex: 0 0 2.25rem; height: 2.25rem; border-radius: 0.4rem; background: var(--bg); border: 1px solid var(--border); color: var(--fg); font-family: var(--mono); font-size: 0.68rem; font-weight: 500; display: flex; align-items: center; justify-content: center; }
.thinking { opacity: 0.6; }
.min-w-0 { min-width: 0; }
.stance { font-size: 0.68rem; font-weight: 500; letter-spacing: 0.04em; border-radius: 0.3rem; padding: 0.05rem 0.4rem; border: 1px solid currentColor; }
.st-neutral { color: var(--fg); border-color: var(--border); }
.st-ok { color: var(--ok); }
.st-warn { color: var(--warn); }
.st-bad { color: var(--bad); }
.st-muted { color: var(--muted); }
.plan-chip { font-size: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 0.3rem; padding: 0 0.4rem; }
.check { display: flex; gap: 0.6rem; align-items: flex-start; border-radius: 0.5rem; padding: 0.55rem 0.8rem; margin: 0 0 0.5rem; border: 1px solid; }
.check-ok { background: rgba(63, 185, 80, 0.08); border-color: rgba(63, 185, 80, 0.35); }
.check-bad { background: rgba(248, 81, 73, 0.08); border-color: rgba(248, 81, 73, 0.35); }
.check-ok .check-icon { color: var(--ok); }
.check-bad .check-icon { color: var(--bad); }
.check-icon { font-weight: 600; }
.rule-chip { border: 1px solid rgba(248, 81, 73, 0.35); border-radius: 0.3rem; padding: 0 0.4rem; font-size: 0.75rem; color: var(--fg); }
.rule-chip .mono { color: var(--bad); }
.warn-note { color: var(--warn); }
.outcome { border-top: 2px solid var(--oc); }
.outcome-icon { width: 2rem; height: 2rem; border-radius: 0.4rem; border: 1px solid var(--oc); color: var(--oc); display: flex; align-items: center; justify-content: center; font-weight: 600; }
.outcome-ok { --oc: var(--ok); }
.outcome-warn { --oc: var(--warn); }
.outcome-bad { --oc: var(--bad); }
.big { font-size: 1.5rem; font-weight: 500; line-height: 1.1; letter-spacing: -0.02em; }
summary { cursor: pointer; list-style-position: inside; }
.text-none { text-transform: none; letter-spacing: 0; }
.status { display: inline-flex; align-items: center; gap: 0.4rem; }
.dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--muted); }
.status-live .dot { background: var(--warn); animation: pulse 1s infinite; }
.status-warn .dot { background: var(--warn); }
.status-ok .dot { background: var(--ok); }
.status-bad .dot { background: var(--bad); }
@keyframes pulse { 50% { opacity: 0.3; } }
.slotmap { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr)); gap: 0.5rem; }
.slot { border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.45rem 0.6rem; background: var(--bg); }
.slot-delay { font-size: 1rem; font-weight: 500; }
.slot-verdict { font-size: 0.72rem; margin-top: 0.15rem; }
.slot-ok .slot-verdict { color: var(--ok); }
.slot-bad .slot-verdict { color: var(--bad); }
.slot-bad { opacity: 0.75; }
.slot-chosen { border-color: var(--fg); box-shadow: inset 0 0 0 1px var(--fg); opacity: 1; }
.meta { font-size: 0.7rem; color: var(--muted); }
.meta summary { cursor: pointer; }
.facts { font-size: 0.68rem; background: var(--bg); border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.5rem; margin: 0.35rem 0 0; max-height: 14rem; overflow: auto; white-space: pre-wrap; color: var(--fg); }
.rules { list-style: none; padding: 0; margin: 0.35rem 0 0; font-size: 0.75rem; }
.rules li { padding: 0.08rem 0; color: var(--fg); }
.r-code { display: inline-block; min-width: 4.2rem; }
.r-ok .r-code { color: var(--ok); }
.r-bad .r-code { color: var(--bad); }
.timing { font-size: 0.72rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 0.5rem; }
.decision { border: 1px solid var(--border); border-left: 2px solid var(--ok); border-radius: 0.4rem; padding: 0.4rem 0.6rem; }
.decision-bad { border-left-color: var(--bad); }
.reject-btn { color: var(--bad); }
</style>

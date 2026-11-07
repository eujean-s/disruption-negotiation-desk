<script setup>
import { ref, computed, watch } from 'vue'
import scenarios from './data/scenarios.json'
import { runNegotiation, MAX_ROUNDS, ROLES } from './negotiate.js'
import { WAKE_SEPARATION_MIN, GATE_CHANGE_NOTICE_MIN, usableHoldMin, hhmm, ruleChecks, slotMap, FACTS } from './checker.js'
import { parseFlightRow, scenarioFromRow } from './scenarioFromRow.js'
import capacity from './data/airport_capacity.json'

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
    customScenario.value = scenarioFromRow(parseFlightRow(rowText.value), capacity)
    resetRun()
  } catch (e) {
    customScenario.value = null
    rowError.value = e.message
  }
}

const scenario = computed(() =>
  selectedId.value === 'CUSTOM' ? customScenario.value : scenarios.find((s) => s.id === selectedId.value),
)

// Assumptions in plain language, grouped by where each value comes from.
const assumptionGroups = computed(() => {
  const s = scenario.value
  if (!s) return []
  const r = s.source
  const dest = r.DESTINATION_AIRPORT
  const cls = capacity.airports[dest] || 'Non-hub'
  const lim = capacity.classes[cls]
  const slots = s.runway_slots_delay_min.map((d) => '+' + d).join(', ')
  const gates = s.gates.map((g) => `${g.id} from ${hhmm(g.free_from_min)}`).join(', ')
  const heavy = s.heavy_arrivals.map((h) => `a heavy aircraft lands ${h.at_delay_min} min after the scheduled time`)
  const conn = s.next_connection.replace('Passenger connection departs', 'a passenger connection departs at')
  return [
    { title: 'Real (from the 2015 US flight record)', items: [
      `Flight ${r.AIRLINE} ${r.FLIGHT_NUMBER}, ${r.ORIGIN_AIRPORT} to ${dest}, on ${s.date}.`,
      `Scheduled to arrive at ${s.scheduled_arrival_label}; it actually arrived ${r.ARRIVAL_DELAY} min late.`,
      `Recorded causes: ${r.WEATHER_DELAY} min weather, ${r.LATE_AIRCRAFT_DELAY} min late incoming aircraft, ${r.AIR_SYSTEM_DELAY} min air traffic system.`,
      `Taxi from runway to gate took ${r.TAXI_IN} min.`,
    ] },
    { title: 'Assumed (made up for this demo)', items: [
      s.custom
        ? `Runway slots (${slots}): the first equals the weather and air-system delay, then one every ${s.runway_slots_delay_min[1] - s.runway_slots_delay_min[0]} min.`
        : `ATC can offer these runway slots, in minutes of delay: ${slots}.`,
      heavy.length ? `Traffic: ${heavy.join('; ')}.` : 'No heavy aircraft are arriving nearby.',
      s.custom
        ? `Free gates (${gates}) open up one turnaround apart.`
        : `Free gates: ${gates}.`,
      s.custom
        ? `The crew reported for duty 60 min before departure.`
        : `The aircraft carries ${s.fuel_on_board_min} min of fuel and must keep ${s.min_reserve_min} min in reserve, so it can wait at most ${usableHoldMin(s)} min. The crew must land by ${hhmm(s.crew_shift_end_min)}.`,
      `${conn[0].toUpperCase() + conn.slice(1)}. Missing it is shown as a warning but never blocks a plan.`,
    ] },
    { title: 'Rules (from the organisers\' constraints workbook)', items: [
      `A plane landing behind a heavy aircraft needs at least ${WAKE_SEPARATION_MIN} min (120 s) of spacing for wake turbulence.`,
      `A gate must be free at least ${GATE_CHANGE_NOTICE_MIN} min before the plane arrives.`,
      ...(s.custom ? [
        `${dest} is treated as a ${cls.toLowerCase()}: ${lim.max_runway_ops_per_hour} runway movements per hour, ${lim.spare_gates_at_any_time} spare gates, ${lim.min_turnaround_min} min minimum turnaround.`,
        `The aircraft lands with 45 min of spare holding fuel on top of a 30 min final reserve.`,
        `Crew may be on duty for at most 13 hours, so they must land by ${hhmm(s.crew_shift_end_min)}.`,
      ] : []),
      'These limits are synthetic planning values provided by the organisers, not real airport data.',
    ] },
  ]
})
const assumptions = computed(() => assumptionGroups.value.flatMap((g) => g.items.map((i) => `${g.title}: ${i}`)))

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
// Constraint timeline: everything on one axis of "minutes of delay", positioned in plain code.
const timeline = computed(() => {
  const s = scenario.value
  if (!s) return null
  const fuel = usableHoldMin(s)
  const gates = s.gates.map((g) => ({ id: g.id, at: g.free_from_min + GATE_CHANGE_NOTICE_MIN - s.scheduled_arrival_min }))
  const heavy = s.heavy_arrivals.map((h) => h.at_delay_min)
  const max = Math.ceil((Math.max(...s.runway_slots_delay_min, fuel, ...gates.map((g) => g.at)) + 10) / 20) * 20
  const pos = (v) => `${(Math.max(0, Math.min(v, max)) / max) * 100}%`
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((max / 4) * i))
  return { max, pos, fuel, gates, heavy, ticks }
})

const agentFacts = (role) => JSON.stringify(FACTS[role](scenario.value), null, 1)

const nextRole = computed(() => ROLES[events.value.filter((e) => e.kind === 'message').length % ROLES.length])

const roleName = { ATC: 'Air traffic control', PILOT: 'Pilot', GROUND: 'Ground ops' }
const ruleText = {
  SLOT: 'Must be a landing slot ATC offers',
  WAKE: `At least ${WAKE_SEPARATION_MIN} min behind a heavy aircraft`,
  FUEL: 'Delay must fit the usable holding fuel',
  GATE: `Gate free ${GATE_CHANGE_NOTICE_MIN} min before arrival`,
  CREW: 'Must land before crew duty ends',
}

// The sign: one place that always states where the decision stands.
const sign = computed(() => {
  const s = scenario.value
  if (!s) return { state: 'none', title: 'Paste a flight', sub: 'Paste one line from flights.csv above and load it to get a plan.' }
  if (running.value) return { state: 'running', title: 'Negotiating', sub: `Round ${rounds.value.length || 1} of ${MAX_ROUNDS}. ${roleName[nextRole.value]} is replying.` }
  const o = outcome.value
  if (!o) return { state: 'idle', title: `${s.source.ORIGIN_AIRPORT} to ${s.source.DESTINATION_AIRPORT}`, sub: `${s.source.AIRLINE} ${s.source.FLIGHT_NUMBER}, scheduled ${s.scheduled_arrival_label}. Run the negotiation to get a checked plan.` }
  if (decision.value?.verdict === 'REJECTED') return { state: 'rejected', title: 'Plan rejected', sub: decision.value.note || 'The duty manager rejected this plan.', tag: 'REJECTED' }
  if (!o.proposal) return { state: 'escalate', title: 'No safe plan', sub: 'A human must decide.', tag: o.outcome }
  const land = hhmm(s.scheduled_arrival_min + o.proposal.delay_min)
  return o.outcome === 'FALLBACK'
    ? { state: 'plan', title: `Land ${land}`, sub: `+${o.proposal.delay_min} min, gate ${o.proposal.gate}, chosen by the rules. All ${checks.value.length} rules passed.`, tag: o.outcome }
    : { state: 'plan', title: `Land ${land}`, sub: `+${o.proposal.delay_min} min, gate ${o.proposal.gate}. Agents agreed and all ${checks.value.length} rules passed.`, tag: o.outcome }
})

// With a plan, each rule's evidence for it. Without one, how many offered slots each rule blocks.
const checks = computed(() => {
  const s = scenario.value
  if (!s) return []
  if (outcome.value?.proposal) return ruleChecks(s, outcome.value.proposal)
  return Object.keys(ruleText).map((rule) => {
    if (!outcome.value) return { rule, ok: null, detail: ruleText[rule] }
    const blocked = slots.value.filter((x) => x.violations.includes(rule)).length
    return { rule, ok: blocked === 0, detail: blocked ? `Blocks ${blocked} of ${slots.value.length} slots` : 'Blocks no slots' }
  })
})
const noAgentReplied = computed(() => {
  const msgs = events.value.filter((e) => e.kind === 'message')
  return !!outcome.value && msgs.length > 0 && msgs.every((e) => e.type === 'ERROR')
})
const replyCount = computed(() => events.value.filter((e) => e.kind === 'message' && e.type !== 'ERROR' && e.type !== 'INVALID').length)
const statParts = computed(() => (outcome.value ? [`Decided in ${elapsedS.value ?? '…'} s`, `Round ${outcome.value.round} of ${MAX_ROUNDS}`, replyCount.value ? `${replyCount.value} agent replies` : 'No agent replies'] : []))
const isFallback = computed(() => outcome.value?.outcome === 'FALLBACK' && sign.value.state === 'plan')
// The plan still in force: a rejected plan is no longer chosen anywhere on screen.
const chosenDelay = computed(() => (decision.value?.verdict === 'REJECTED' ? null : outcome.value?.proposal?.delay_min ?? null))
// Each party's latest offer, so convergence shows on the sign while the negotiation runs.
const positions = computed(() => ROLES.map((role) => {
  const last = events.value.filter((e) => e.kind === 'message' && e.role === role).at(-1)
  return { role, offer: last ? [last.delay_min !== null ? `+${last.delay_min}` : null, last.gate].filter(Boolean).join(' ') || last.type : '--' }
}))
const recordedCauses = computed(() => {
  const r = scenario.value?.source
  if (!r) return ''
  const parts = [['WEATHER_DELAY', 'weather'], ['LATE_AIRCRAFT_DELAY', 'late aircraft'], ['AIR_SYSTEM_DELAY', 'air system'], ['AIRLINE_DELAY', 'airline'], ['SECURITY_DELAY', 'security']]
  return parts.filter(([k]) => r[k] > 0).map(([k, label]) => `${r[k]} min ${label}`).join(', ')
})
const earliestSafe = computed(() => slots.value.find((x) => x.ok))
const stanceLine = (e) => [e.type, e.delay_min !== null ? `+${e.delay_min}` : null, e.gate].filter(Boolean).join(' ')

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
  <svg width="0" height="0" class="position-absolute" aria-hidden="true">
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="square"/></symbol>
    <symbol id="i-cross" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="square"/></symbol>
    <symbol id="i-stop" viewBox="0 0 24 24"><path d="M12 3 22 21H2z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="miter"/><path d="M12 10v5.5M12 17.5v1.5" stroke="currentColor" stroke-width="2.6"/></symbol>
  </svg>

  <header class="bar">
    <h1 class="brand">Disruption Negotiation Desk</h1>
    <label class="visually-hidden" for="sc">Disruption</label>
    <select id="sc" v-model="selectedId" class="form-select pick" :disabled="running">
      <option v-for="s in scenarios" :key="s.id" :value="s.id">{{ s.id }} · {{ s.flight }}</option>
      <option value="CUSTOM">Custom · paste any flights.csv row</option>
    </select>
    <button class="btn run" :disabled="running || !scenario" @click="run">
      <span v-if="running" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      {{ running ? 'Negotiating' : 'Run negotiation' }}
    </button>
  </header>

  <div v-if="selectedId === 'CUSTOM'" class="paste">
    <label class="fw-semibold" for="row">One line from flights.csv (header optional)</label>
    <textarea id="row" v-model="rowText" class="form-control mono" rows="2" :disabled="running"></textarea>
    <div class="d-flex flex-wrap align-items-center gap-3 mt-2">
      <button class="btn quiet btn-sm" :disabled="running" @click="loadRow">Load row</button>
      <span v-if="rowError" class="is-bad" role="alert">{{ rowError }}</span>
      <span v-else-if="scenario" class="is-ok">Loaded {{ scenario.flight }}</span>
    </div>
  </div>

  <section class="sign" :class="'sign-' + sign.state" aria-live="polite">
    <div class="tile" :class="{ 'tile-wide': (outcome?.proposal?.gate || '').length > 4 }">
      <span class="tile-label">Gate</span>
      <svg v-if="sign.state === 'escalate'" class="tile-icon" aria-label="None"><use href="#i-stop"/></svg>
      <span v-else-if="sign.state === 'running'" class="tile-wait" aria-hidden="true"><i></i><i></i><i></i></span>
      <span v-else class="tile-code mono">{{ (sign.state !== 'rejected' && outcome?.proposal?.gate) || '--' }}</span>
    </div>

    <div class="sign-text" :key="sign.state + sign.title">
      <p class="sign-title">{{ sign.title }}</p>
      <p class="sign-sub">
        <span v-if="sign.tag" class="tag mono">{{ sign.tag }}</span>
        {{ sign.sub }}
      </p>
      <p v-if="outcome?.connection && sign.state === 'plan'" class="sign-note" :class="{ 'is-missed': outcome.connection.missed }">
        <svg class="i" aria-hidden="true"><use :href="outcome.connection.missed ? '#i-stop' : '#i-check'"/></svg>
        Passenger connection {{ outcome.connection.missed ? 'missed' : 'protected' }}: at gate <span class="mono">{{ outcome.connection.at_gate }}</span>, departs <span class="mono">{{ outcome.connection.departs }}</span>{{ outcome.connection.missed ? '. Your call; this never blocks a plan.' : '.' }}
      </p>
      <p v-if="outcome?.reason && sign.state !== 'plan'" class="sign-note">Why: {{ outcome.reason }}</p>
      <p v-else-if="outcome?.reason && outcome.outcome === 'FALLBACK' && !noAgentReplied" class="sign-note">Why: {{ outcome.reason }}</p>
      <p v-if="outcome" class="sign-stat stat-inline mono">{{ statParts.join(' · ') }}</p>
      <p v-if="noAgentReplied" class="sign-note sign-alert">No agent replied, so this plan comes from the rules alone. Check the connection and run it again if you can.</p>
    </div>

    <div v-if="sign.state === 'running'" class="parties">
      <div v-for="p in positions" :key="p.role" class="party">
        <span>{{ roleName[p.role] }}</span>
        <strong class="mono">{{ p.offer }}</strong>
      </div>
    </div>

    <div v-if="outcome" class="act">
      <div v-if="decision" class="decided">
        <svg class="i" aria-hidden="true"><use :href="decision.verdict === 'REJECTED' ? '#i-cross' : '#i-check'"/></svg>
        <div>
          <strong>{{ decision.verdict === 'APPROVED' ? 'Approved' : decision.verdict === 'REJECTED' ? 'Rejected' : 'Taken over' }}</strong>
          <div>By duty manager, <span class="mono">{{ new Date(decision.at).toLocaleTimeString('en-GB') }}</span></div>
        </div>
      </div>
      <template v-else-if="outcome.proposal">
        <template v-if="!rejecting">
          <button class="btn go" @click="decide('APPROVED')">Approve plan</button>
          <button class="btn ghost btn-sm" @click="rejecting = true">Reject plan</button>
        </template>
        <template v-else>
          <label class="fw-semibold" for="why-reject">Reason, saved in the log</label>
          <input id="why-reject" v-model="rejectNote" class="form-control" @keyup.enter="decide('REJECTED')" />
          <div class="d-flex gap-2">
            <button class="btn go btn-sm flex-fill" @click="decide('REJECTED')">Confirm reject</button>
            <button class="btn ghost btn-sm" @click="rejecting = false">Cancel</button>
          </div>
        </template>
      </template>
      <button v-else class="btn go" @click="decide('TAKEN_OVER')">I'll handle it manually</button>
      <p class="sign-stat stat-lines mono"><span v-for="s in statParts" :key="s">{{ s }}</span></p>
    </div>

    <p v-if="isFallback" class="sign-band" :class="{ 'sign-band-alert': noAgentReplied }">
      {{ noAgentReplied ? 'Rules only: no agent replied' : 'Rule-based plan: the agents did not agree' }}
    </p>
  </section>

  <section v-if="scenario" class="strip" aria-label="Flight and constraint timeline">
    <dl class="facts-row">
      <div><dt>Source</dt><dd>2015 flight record</dd></div>
      <div><dt>Flight</dt><dd class="mono">{{ scenario.source.AIRLINE }} {{ scenario.source.FLIGHT_NUMBER }}</dd></div>
      <div><dt>Route</dt><dd class="mono">{{ scenario.source.ORIGIN_AIRPORT }} to {{ scenario.source.DESTINATION_AIRPORT }}</dd></div>
      <div><dt>Date</dt><dd class="mono">{{ scenario.date }}</dd></div>
      <div><dt>Scheduled</dt><dd class="mono">{{ scenario.scheduled_arrival_label }}</dd></div>
      <div><dt>Actually arrived</dt><dd class="mono">+{{ scenario.source.ARRIVAL_DELAY }} min</dd></div>
      <div><dt>Recorded causes</dt><dd>{{ recordedCauses }}</dd></div>
    </dl>
    <div class="tl" role="img" :aria-label="`Delay timeline. Fuel limit at plus ${timeline.fuel} minutes. Details are in the landing slots table.`">
      <div class="tl-fuel" :style="{ left: timeline.pos(timeline.fuel) }"><span class="tl-fuel-label mono">Fuel limit +{{ timeline.fuel }}</span></div>
      <div class="tl-axis"></div>
      <div v-for="h in timeline.heavy" :key="'h' + h" class="tl-heavy" :style="{ left: timeline.pos(h) }"></div>
      <div v-for="sl in slots" :key="sl.delay_min" class="tl-slot"
           :class="[sl.ok ? 'is-safe' : 'is-blocked', chosenDelay === sl.delay_min ? 'is-chosen' : '']"
           :style="{ left: timeline.pos(sl.delay_min) }">
        <span class="tl-delay mono">+{{ sl.delay_min }}</span>
        <span class="tl-dot"></span>
        <span class="tl-verdict mono">{{ sl.ok ? sl.gate : sl.violations.join(' ') }}</span>
      </div>
      <div v-for="g in timeline.gates" :key="g.id" class="tl-gate mono" :class="{ 'has-tick': !slots.some((x) => Math.abs(x.delay_min - g.at) < timeline.max * 0.01) }" :style="{ left: timeline.pos(g.at) }">{{ g.id }} ready</div>
      <div v-for="h in timeline.heavy" :key="'hl' + h" class="tl-heavy-label mono" :style="{ left: timeline.pos(h) }">Heavy +{{ h }}</div>
      <div class="tl-ticks mono"><span v-for="tk in timeline.ticks" :key="tk" :style="{ left: timeline.pos(tk) }">+{{ tk }}</span></div>
    </div>
    <p class="strip-note">Minutes of delay. Assumed for this demo: {{ scenario.custom ? 'slots, gates and heavy traffic' : 'slots, gates, fuel and heavy traffic' }}. The agents do not set any of it.</p>
  </section>

  <main v-if="scenario" class="work">
    <section class="panel">
      <h2>Landing slots</h2>
      <table class="slots">
        <thead><tr><th>Delay</th><th>Land</th><th>Fuel</th><th>Result</th></tr></thead>
        <tbody>
          <tr v-for="sl in slots" :key="sl.delay_min" :class="{ chosen: chosenDelay === sl.delay_min }">
            <td class="mono">+{{ sl.delay_min }}</td>
            <td class="mono">{{ hhmm(scenario.scheduled_arrival_min + sl.delay_min) }}</td>
            <td class="mono">{{ sl.delay_min }}/{{ timeline.fuel }}</td>
            <td class="mono result">
              <template v-if="sl.ok">
                <svg class="i is-ok" aria-hidden="true"><use href="#i-check"/></svg>
                <span class="gate-chip">{{ sl.gate }}</span>
                <span v-if="chosenDelay === sl.delay_min" class="chosen-word">chosen</span>
              </template>
              <template v-else>
                <svg class="i is-bad" aria-hidden="true"><use href="#i-cross"/></svg>
                <span class="is-bad">{{ sl.violations.join(' ') }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="note">
        <template v-if="earliestSafe">Earliest safe: <span class="mono">+{{ earliestSafe.delay_min }}, {{ earliestSafe.gate }}</span>.</template>
        <span v-else class="is-bad">No offered slot is safe.</span>
      </p>
    </section>

    <section class="panel">
      <h2>Rules, checked by code</h2>
      <ul class="rules">
        <li v-for="c in checks" :key="c.rule">
          <span class="rule-code mono" :class="c.ok === null ? '' : c.ok ? 'is-ok' : 'is-bad'">
            <svg v-if="c.ok !== null" class="i" aria-hidden="true"><use :href="c.ok ? '#i-check' : '#i-cross'"/></svg>
            {{ c.rule }}
          </span>
          <span class="rule-detail">{{ c.detail }}</span>
        </li>
      </ul>
      <p v-if="outcome?.proposal" class="note">Verified by code for this plan.</p>
      <p v-else-if="!outcome" class="note">Each plan is checked against all five before you see it.</p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Negotiation log</h2>
        <button v-if="outcome" class="btn quiet btn-sm" @click="downloadLog">Download log (JSON)</button>
      </div>

      <p v-if="!events.length && !running" class="note">
        ATC, the pilot and ground ops will each reply here, using only their own facts, for up to {{ MAX_ROUNDS }} rounds.
      </p>

      <div v-for="r in rounds" :key="r.round" class="round">
        <h3>Round {{ r.round }} of {{ MAX_ROUNDS }}</h3>
        <template v-for="(e, i) in r.items" :key="i">
          <article v-if="e.kind === 'message'" class="msg">
            <div class="msg-head">
              <strong>{{ roleName[e.role] }}</strong>
              <span class="mono">{{ stanceLine(e) }}</span>
            </div>
            <p>{{ e.message }}</p>
            <div class="msg-meta">
              <span>{{ e.type === 'ERROR' ? 'The agent call failed' : e.type === 'INVALID' ? 'The reply could not be read' : 'Agent reasoning, unverified' }}</span>
              <details>
                <summary>What this agent saw</summary>
                <pre class="mono">{{ agentFacts(e.role) }}</pre>
              </details>
            </div>
          </article>
          <div v-else class="verdict" :class="e.ok ? 'verdict-ok' : 'verdict-bad'">
            <svg class="i" aria-hidden="true"><use :href="e.ok ? '#i-check' : '#i-cross'"/></svg>
            <div>
              <strong>Checker {{ e.ok ? 'passed' : 'blocked' }}</strong> <span class="mono">+{{ e.proposal.delay_min }} {{ e.proposal.gate }}</span>
              <div v-if="e.ok">All rules passed. Verified by code.</div>
              <div v-for="c in ruleChecks(scenario, e.proposal).filter((x) => !x.ok)" :key="c.rule"><span class="mono">{{ c.rule }}</span> {{ c.detail }}</div>
              <div v-if="e.warnings.length" class="is-warn">Connection missed: at gate <span class="mono">{{ e.connection.at_gate }}</span>, departs <span class="mono">{{ e.connection.departs }}</span>. Warning only.</div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="running" class="msg replying" aria-hidden="true">
        <strong>{{ roleName[nextRole] }}</strong>
        <span class="skel"></span><span class="skel skel-short"></span>
      </div>
    </section>
  </main>

  <section v-if="scenario" class="sources">
    <h2>Where each value comes from</h2>
    <div class="sources-grid">
      <div v-for="g in assumptionGroups" :key="g.title">
        <h3>{{ g.title }}</h3>
        <ul>
          <li v-for="(a, i) in g.items" :key="i">{{ a }}</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.25rem; background: var(--ink); padding: 0.75rem var(--gutter); }
.brand { margin: 0; color: var(--sign); font-size: 1.125rem; font-weight: 700; white-space: nowrap; }
.pick { flex: 1 1 20rem; width: auto; min-width: 0; }
.run { --bs-btn-bg: var(--sign); --bs-btn-color: var(--ink); --bs-btn-border-color: var(--sign); --bs-btn-hover-bg: #ffe14d; --bs-btn-hover-color: var(--ink); --bs-btn-hover-border-color: #ffe14d; --bs-btn-active-bg: #e6bf00; --bs-btn-active-color: var(--ink); --bs-btn-active-border-color: #e6bf00; --bs-btn-disabled-bg: var(--sign); --bs-btn-disabled-color: var(--ink); --bs-btn-disabled-border-color: var(--sign); font-weight: 700; padding-inline: 1.5rem; }
.bar :focus-visible { outline-color: var(--sign); }

.paste { background: var(--panel); border-bottom: 1px solid var(--line); padding: 1rem var(--gutter); }
.paste textarea { margin-top: 0.375rem; font-size: 0.875rem; }

.sign { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(15rem, auto); gap: 1.5rem 2.5rem; align-items: start; align-content: start; background: var(--sign); color: var(--ink); padding: 2rem var(--gutter); min-height: 16.1rem; transition: background-color 180ms ease-out, color 180ms ease-out; }
.sign-escalate { background: var(--bad); color: #fff; }
.sign-rejected { background: var(--panel); }
.sign-rejected .tile { color: #8a8d90; }
.sign-band { grid-column: 1 / -1; margin: 0; padding: 0.625rem 1rem; background: var(--ink); color: var(--sign); border-radius: 4px; font-size: 2rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.02em; }
.sign-band-alert { background: var(--bad); color: #fff; }
.parties { display: grid; gap: 0.5rem; width: 17rem; }
.party { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; padding: 0.75rem; background: var(--ink); color: #fff; border-radius: 4px; font-size: 0.875rem; }
.party strong { color: var(--sign); font-size: 1.25rem; white-space: nowrap; }
.tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem; min-width: 10rem; min-height: 10rem; padding: 0.75rem 1.25rem; background: var(--ink); color: var(--sign); border-radius: 6px; }
.sign-escalate .tile { color: #fff; }
.tile-label { color: #fff; font-size: 0.875rem; font-weight: 600; }
.tile-code { font-size: 3.625rem; font-weight: 700; line-height: 1.1; white-space: nowrap; }
.tile-wide .tile-code { font-size: 2.75rem; }
.tile-icon { width: 4rem; height: 4rem; }
.tile-wait { display: flex; gap: 0.5rem; height: 4rem; align-items: center; }
.tile-wait i { width: 0.75rem; height: 0.75rem; background: var(--sign); animation: wait 1s ease-in-out infinite; }
.tile-wait i:nth-child(2) { animation-delay: 160ms; }
.tile-wait i:nth-child(3) { animation-delay: 320ms; }
@keyframes wait { 50% { opacity: 0.25; } }
.sign-text { min-width: 0; animation: signIn 320ms cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes signIn { from { clip-path: inset(0 0 100% 0); transform: translateY(0.75rem); } to { clip-path: inset(0 0 -10% 0); transform: none; } }
.sign-text p { margin: 0; }
.sign-title { font-size: 6rem; font-weight: 800; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.sign-sub { margin-top: 0.75rem !important; font-size: 1.375rem; font-weight: 600; line-height: 1.3; max-width: 62ch; }
.tag { display: inline-block; margin-right: 0.375rem; padding: 0.125rem 0.5rem; background: var(--ink); color: var(--sign); border-radius: 3px; font-size: 0.875rem; font-weight: 700; vertical-align: 0.125em; }
.sign-escalate .tag { color: #fff; }
.sign-rejected .tag { color: #fff; }
.sign-note { margin-top: 0.5rem !important; font-size: 1rem; font-weight: 500; max-width: 80ch; }
.sign-note.is-missed { color: #7c0b05; font-weight: 700; }
.sign-alert { font-weight: 700; }
.sign-stat { margin: 0; font-size: 0.875rem; }
.stat-lines { display: grid; }
.stat-inline { display: none; margin-top: 0.5rem !important; }
.act { display: flex; flex-direction: column; gap: 0.625rem; width: 17rem; }
.go { --bs-btn-bg: var(--ink); --bs-btn-color: #fff; --bs-btn-border-color: var(--ink); --bs-btn-hover-bg: #000; --bs-btn-hover-color: #fff; --bs-btn-hover-border-color: #000; --bs-btn-active-bg: #000; --bs-btn-active-color: #fff; --bs-btn-active-border-color: #000; font-size: 1.25rem; font-weight: 700; padding-block: 1rem; }
.go.btn-sm { font-size: 0.9375rem; padding-block: 0.5rem; }
.sign-escalate .go { --bs-btn-bg: #fff; --bs-btn-color: var(--ink); --bs-btn-border-color: #fff; --bs-btn-hover-bg: var(--sign); --bs-btn-hover-color: var(--ink); --bs-btn-hover-border-color: var(--sign); --bs-btn-active-bg: var(--sign); --bs-btn-active-color: var(--ink); --bs-btn-active-border-color: var(--sign); }
.ghost { --bs-btn-color: var(--ink); --bs-btn-border-color: var(--ink); --bs-btn-hover-bg: rgba(0, 0, 0, 0.1); --bs-btn-hover-color: var(--ink); --bs-btn-hover-border-color: var(--ink); --bs-btn-active-bg: rgba(0, 0, 0, 0.18); --bs-btn-active-color: var(--ink); --bs-btn-active-border-color: var(--ink); font-weight: 600; }
.decided { display: flex; gap: 0.75rem; align-items: flex-start; font-size: 1rem; }
.decided strong { display: block; font-size: 2.25rem; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
.decided .i { width: 2.25rem; height: 2.25rem; flex: none; }
.sign-escalate :focus-visible { outline-color: #fff; }

.strip { background: var(--ink); color: #fff; padding: 1rem var(--gutter) 0.75rem; }
.facts-row { display: flex; flex-wrap: wrap; gap: 0.5rem 2.5rem; margin: 0; }
.facts-row dt { color: var(--on-ink-muted); font-size: 0.8125rem; font-weight: 500; }
.facts-row dd { margin: 0; font-size: 1rem; font-weight: 500; }
.tl { position: relative; height: 9.75rem; margin: 0.75rem 1.5rem 0; }
.tl-axis { position: absolute; left: 0; right: 0; top: 3.1rem; height: 2px; background: #5b6066; }
.tl-fuel { position: absolute; top: 0; bottom: 1.5rem; right: 0; border-left: 2px dashed var(--on-ink-bad); background: repeating-linear-gradient(135deg, rgba(255, 112, 99, 0.2) 0 6px, transparent 6px 14px); }
.tl-fuel-label { position: absolute; top: 0.125rem; left: 0.5rem; color: var(--on-ink-bad); font-size: 0.875rem; white-space: nowrap; }
.tl-slot { position: absolute; z-index: 1; top: 0.975rem; display: flex; flex-direction: column; align-items: center; gap: 0.1875rem; transform: translateX(-50%); }
.tl-delay { font-size: 1rem; font-weight: 700; background: var(--ink); padding-inline: 0.25rem; }
.tl-dot { width: 1rem; height: 1rem; border-radius: 50%; border: 3px solid var(--c); background: var(--ink); }
.is-safe { --c: var(--on-ink-ok); }
.is-blocked { --c: var(--on-ink-bad); }
.is-safe .tl-dot { background: var(--c); }
.is-chosen .tl-dot { border-color: var(--sign); background: var(--sign); box-shadow: 0 0 0 3px var(--ink), 0 0 0 5px var(--sign); }
.tl-verdict { color: var(--c); font-size: 0.875rem; white-space: nowrap; background: var(--ink); padding-inline: 0.25rem; }
.tl-heavy { position: absolute; top: 3.1rem; width: 0.625rem; height: 0.625rem; background: #fff; transform: translate(-50%, -50%) rotate(45deg); margin-top: 1px; }
.tl-heavy-label { position: absolute; top: 6.625rem; transform: translateX(-50%); color: var(--on-ink-muted); font-size: 0.8125rem; white-space: nowrap; }
.tl-gate.has-tick::before { content: ''; position: absolute; left: 50%; bottom: 100%; width: 1px; height: 2.05rem; background: #7d8187; }
.tl-heavy-label::before { content: ''; display: inline-block; width: 0.5rem; height: 0.5rem; margin-right: 0.375rem; background: #fff; transform: rotate(45deg); vertical-align: 0.0625rem; }
.tl-gate { position: absolute; top: 5.25rem; transform: translateX(-50%); color: var(--on-ink-muted); font-size: 0.8125rem; white-space: nowrap; }
.tl-ticks { position: absolute; left: 0; right: 0; bottom: 0; height: 1.25rem; color: var(--on-ink-muted); font-size: 0.8125rem; }
.tl-ticks span { position: absolute; transform: translateX(-50%); }
.strip-note { margin: 0.375rem 0 0; color: var(--on-ink-muted); font-size: 0.8125rem; }

.work { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 4fr) minmax(0, 5fr); gap: 1.25rem; align-items: start; padding: 1.5rem var(--gutter); }
.panel { background: var(--panel); border-radius: 6px; padding: 1.25rem; overflow: hidden; }
.sources h2 { margin: 0 0 0.75rem; font-size: 1.125rem; font-weight: 700; }
.panel h2 { display: flex; align-items: center; min-height: 3.1875rem; margin: -1.25rem -1.25rem 0.75rem; padding: 0 1.25rem; background: var(--ink); color: #fff; font-size: 1.125rem; font-weight: 700; }
.panel-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; min-height: 3.1875rem; margin: -1.25rem -1.25rem 0.75rem; padding: 0.25rem 1.25rem; background: var(--ink); }
.panel-head h2 { min-height: 0; margin: 0; padding: 0; background: none; }
.panel-head .quiet { --bs-btn-color: #fff; --bs-btn-border-color: #8a8d90; --bs-btn-hover-color: var(--ink); --bs-btn-hover-bg: var(--sign); --bs-btn-hover-border-color: var(--sign); --bs-btn-active-color: var(--ink); --bs-btn-active-bg: var(--sign); --bs-btn-active-border-color: var(--sign); }
.panel-head :focus-visible { outline-color: var(--sign); }
.note { margin: 0.75rem 0 0; color: var(--muted); font-size: 0.875rem; }
.i { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; }

.slots { width: 100%; table-layout: fixed; }
.slots th:nth-child(1) { width: 15%; }
.slots th:nth-child(2) { width: 18%; }
.slots th:nth-child(3) { width: 21%; }
.result { white-space: nowrap; }
.slots th { padding: 0 0.25rem 0.375rem; color: var(--muted); font-size: 0.8125rem; font-weight: 500; }
.slots td { padding: 0.75rem 0.25rem; border-top: 1px solid var(--line); font-size: 1rem; }
.slots .chosen td { background: var(--sign); font-weight: 700; }

.result .i { margin-right: 0.25rem; }

.gate-chip { display: inline-block; margin-left: 0.25rem; padding: 0 0.375rem; background: var(--ink); color: var(--sign); border-radius: 3px; font-size: 0.9375rem; font-weight: 700; }
.chosen-word { margin-left: 0.375rem; font-family: var(--sans); font-size: 0.9375rem; font-weight: 700; }
.slots .chosen .is-ok { color: var(--ink); }
.rules { list-style: none; margin: 0; padding: 0; }
.rules li { display: grid; grid-template-columns: 5.25rem minmax(0, 1fr); gap: 0.5rem; padding: 0.625rem 0; border-top: 1px solid var(--line); font-size: 0.9375rem; }
.rule-code { font-weight: 700; white-space: nowrap; }
.rule-detail::first-letter { text-transform: uppercase; }

.round h3 { margin: 1rem 0 0.25rem; color: var(--muted); font-size: 0.875rem; font-weight: 600; }
.round:first-of-type h3 { margin-top: 0; }
.msg { padding: 0.625rem 0; border-top: 1px solid var(--line); }
.msg p { margin: 0.25rem 0; }
.msg-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 0.75rem; }
.msg-head .mono { font-size: 0.875rem; font-weight: 700; }
.msg-meta { display: flex; flex-wrap: wrap; gap: 0.125rem 1rem; color: var(--muted); font-size: 0.8125rem; }
.msg-meta summary { cursor: pointer; text-decoration: underline; text-underline-offset: 0.2em; }
.msg-meta pre { margin: 0.375rem 0 0; padding: 0.5rem; background: var(--ground); border-radius: 4px; color: var(--ink); font-size: 0.8125rem; white-space: pre-wrap; word-break: break-word; max-height: 14rem; overflow: auto; }
.verdict { display: flex; gap: 0.625rem; margin: 0.25rem 0 0.5rem; padding: 0.625rem 0.75rem; border-radius: 4px; font-size: 0.9375rem; }
.verdict > .i { flex: none; width: 1.25rem; height: 1.25rem; margin-top: 0.125rem; }
.verdict-ok { background: var(--ok-tint); }
.verdict-ok > .i { color: var(--ok); }
.verdict-bad { background: var(--bad-tint); }
.verdict-bad > .i { color: var(--bad); }
.replying { display: flex; flex-direction: column; gap: 0.375rem; }
.skel { height: 0.75rem; background: var(--ground); border-radius: 2px; animation: wait 1.2s ease-in-out infinite; }
.skel-short { width: 60%; }

.sources { padding: 0.25rem var(--gutter) 2.5rem; }
.sources-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem 2rem; }
.sources h3 { margin: 0 0 0.375rem; font-size: 0.9375rem; font-weight: 700; }
.sources h3 { padding-bottom: 0.375rem; border-bottom: 3px solid var(--ink); }
.sources ul { list-style: none; margin: 0; padding: 0; color: #33373b; font-size: 0.9375rem; }
.sources li { padding: 0.5rem 0; border-bottom: 1px solid var(--line); }

.is-ok { color: var(--ok); }
.is-warn { color: var(--warn); }
.is-bad { color: var(--bad); }

.work > .panel:not(:last-child) { position: sticky; top: 1rem; }

@media (max-width: 1399px) {
  .slots td { font-size: 0.9375rem; }
}
@media (max-width: 1199px) {
  .work > .panel:not(:last-child) { position: static; }
  .work { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .work .panel:last-child { grid-column: 1 / -1; }
  .sign { grid-template-columns: auto minmax(0, 1fr); gap: 1.5rem 2rem; }
  .act { grid-column: 1 / -1; width: 100%; flex-direction: row; flex-wrap: wrap; }
  .parties, .sign-band { grid-column: 1 / -1; }
  .parties { width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .party { flex-direction: column; gap: 0; }
  .stat-lines { display: none; }
  .stat-inline { display: block; }
  .act .go { flex: 2 1 12rem; }
  .act .ghost { flex: 1 1 8rem; min-height: 2.75rem; }
  .sign-title { font-size: 4.5rem; }
}
@media (max-width: 767px) {
  .pick, .run { flex: 1 1 100%; }
  .brand { white-space: normal; }
  .sign { grid-template-columns: minmax(0, 1fr); padding-block: 1.5rem; }
  .tile { min-width: 0; min-height: 0; flex-direction: row; justify-content: flex-start; gap: 1rem; }
  .tile-code, .tile-wide .tile-code { font-size: 3.25rem; }
  .tile-icon, .tile-wait { height: 3.25rem; width: 3.25rem; }
  .sign-title { font-size: 4.25rem; }
  .sign-band { font-size: 1.5rem; }
  .party strong { font-size: 1rem; white-space: normal; }
  .sign-sub { font-size: 1.125rem; }
  .work, .sources-grid { grid-template-columns: minmax(0, 1fr); }
  .tl { height: 5.5rem; margin-inline: 0.75rem; }
  .tl-delay, .tl-verdict, .tl-gate, .tl-heavy-label { display: none; }
  .tl-slot { top: 1.75rem; }
  .tl-axis, .tl-heavy { top: 2.25rem; }
  .tl-fuel-label { font-size: 0.8125rem; }
}
@media (prefers-reduced-motion: reduce) {
  .sign-text, .tile-wait i, .skel { animation: none; }
  .sign { transition: none; }
}
</style>

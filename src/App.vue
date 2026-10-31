<script setup>
import { ref, computed, watch } from 'vue'
import scenarios from './data/scenarios.json'
import { runNegotiation, MAX_ROUNDS } from './negotiate.js'
import { WAKE_SEPARATION_MIN, GATE_CHANGE_NOTICE_MIN } from './checker.js'
import { parseFlightRow, scenarioFromRow } from './scenarioFromRow.js'

const selectedId = ref(scenarios[0].id)
const events = ref([])
const outcome = ref(null)
const running = ref(false)
const approved = ref(false)
const approvedAt = ref(null)

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

const roleBadge = { ATC: 'bg-primary', PILOT: 'bg-success', GROUND: 'bg-warning text-dark' }
const typeBadge = {
  PROPOSE: 'bg-info text-dark', ACCEPT: 'bg-success', COUNTER: 'bg-warning text-dark',
  REJECT: 'bg-danger', ESCALATE: 'bg-dark', INVALID: 'bg-secondary', ERROR: 'bg-secondary',
}
const outcomeClass = { CONSENSUS: 'alert-success', FALLBACK: 'alert-warning', ESCALATE: 'alert-danger' }

function approve() {
  approved.value = true
  approvedAt.value = new Date().toISOString()
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
    human_approved: approved.value,
    approved_at: approvedAt.value,
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
  approved.value = false
  approvedAt.value = null
  events.value = []
  outcome.value = null
}

watch(selectedId, resetRun)

async function run() {
  if (!scenario.value) return
  running.value = true
  resetRun()
  const result = await runNegotiation(scenario.value, {
    onEvent: (e) => (e.kind === 'outcome' ? (outcome.value = e) : events.value.push(e)),
  })
  outcome.value = result
  running.value = false
}
</script>

<template>
  <div class="container py-4" style="max-width: 820px">
    <h1 class="h3 mb-1">ATC · Pilot · Ground negotiation</h1>
    <p class="text-muted">Three separate LLM agents negotiate; plain code checks the result.</p>

    <div class="row g-2 align-items-end mb-3">
      <div class="col">
        <label class="form-label" for="sc">Scenario</label>
        <select id="sc" v-model="selectedId" class="form-select" :disabled="running">
          <option v-for="s in scenarios" :key="s.id" :value="s.id">{{ s.id }} · {{ s.flight }} · {{ s.trigger }}</option>
          <option value="CUSTOM">Custom · paste any flights.csv row</option>
        </select>
      </div>
      <div class="col-auto">
        <button class="btn btn-primary" :disabled="running || !scenario" @click="run">
          {{ running ? 'Negotiating...' : 'Run' }}
        </button>
      </div>
    </div>
    <div v-if="selectedId === 'CUSTOM'" class="mb-3">
      <label class="form-label small" for="row">One line from flights.csv (header optional)</label>
      <textarea id="row" v-model="rowText" class="form-control font-monospace small" rows="2" :disabled="running"></textarea>
      <button class="btn btn-outline-primary btn-sm mt-2" :disabled="running" @click="loadRow">Load row</button>
      <span v-if="rowError" class="text-danger small ms-2">{{ rowError }}</span>
    </div>
    <p v-if="scenario" class="small text-muted">
      <strong v-if="scenario.custom">{{ scenario.flight }}, {{ scenario.date }}: </strong>{{ scenario.disruption }} (max {{ MAX_ROUNDS }} rounds)
    </p>

    <div class="card card-body mb-3 small">
      <h2 class="h6">Assumptions</h2>
      <ul class="mb-0">
        <li v-for="(a, i) in assumptions" :key="i">{{ a }}</li>
      </ul>
    </div>

    <ul class="list-group mb-3">
      <li v-for="(e, i) in events" :key="i" class="list-group-item">
        <template v-if="e.kind === 'message'">
          <span class="badge bg-light text-dark border me-1">Round {{ e.round }}</span>
          <span class="badge me-1" :class="roleBadge[e.role]">{{ e.role }}</span>
          <span class="badge me-2" :class="typeBadge[e.type]">{{ e.type }}</span>
          <span class="small text-muted">delay {{ e.delay_min ?? '-' }} · gate {{ e.gate ?? '-' }}</span>
          <div class="mt-1">{{ e.message }}</div>
        </template>
        <template v-else>
          <span class="badge bg-light text-dark border me-1">Round {{ e.round }}</span>
          <span class="badge bg-dark me-2">CHECKER</span>
          <strong :class="e.ok ? 'text-success' : 'text-danger'">{{ e.ok ? 'PASSED' : 'BLOCKED' }}</strong>
          <span class="small text-muted ms-2">delay {{ e.proposal.delay_min }} · gate {{ e.proposal.gate }}</span>
          <span v-if="!e.ok" class="ms-2 text-danger">violations: {{ e.violations.join(', ') }}</span>
          <span v-if="e.warnings.length" class="badge bg-warning text-dark ms-2">CONNECTION MISSED (warning)</span>
        </template>
      </li>
      <li v-if="running" class="list-group-item text-muted">Waiting for next agent...</li>
    </ul>

    <div v-if="outcome" class="alert" :class="outcomeClass[outcome.outcome]">
      <h2 class="h5">Outcome: {{ outcome.outcome }}</h2>
      <p v-if="outcome.proposal" class="mb-2">
        Arrival delay <strong>{{ outcome.proposal.delay_min }} min</strong>, gate <strong>{{ outcome.proposal.gate }}</strong>
        <span v-if="outcome.outcome === 'FALLBACK'"> (rule-based: earliest slot that passes the checker)</span>
      </p>
      <p v-if="outcome.connection" class="mb-2" :class="outcome.connection.missed ? 'text-danger' : 'text-success'">
        Passenger connection: at gate {{ outcome.connection.at_gate }}, connection departs {{ outcome.connection.departs }}
        → <strong>{{ outcome.connection.missed ? 'MISSED (soft constraint, human decides)' : 'protected' }}</strong>
      </p>
      <p v-if="outcome.reason" class="mb-2"><strong>Why:</strong> {{ outcome.reason }}</p>
      <p v-if="!outcome.proposal" class="mb-2">No option passes the checker. A human must decide.</p>
      <button v-if="outcome.proposal" class="btn btn-success" :disabled="approved" @click="approve">
        {{ approved ? 'Approved by human ✓' : 'Approve' }}
      </button>
      <button class="btn btn-outline-secondary ms-2" @click="downloadLog">Download log (JSON)</button>
    </div>
  </div>
</template>

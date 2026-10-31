// Plain-code checker. No LLM here: this decides what is allowed.
// checkProposal() validates a plan, fallback() picks a deterministic plan, FACTS builds
// the per-role facts each agent is allowed to see.

// A slot less than this many minutes behind a heavy arrival is in its wake.
// Source: constraints workbook, wake_separation: Heavy follows Heavy = 120 s (4 NM).
export const WAKE_SEPARATION_MIN = 2
// Minutes before arrival that a gate must already be free so ground crew can reassign it.
// Source: challenge2_operational_constraints.xlsx, fuel_and_crew: "Gate change notice, at least 20 minutes before arrival".
export const GATE_CHANGE_NOTICE_MIN = 20

export const hhmm = (m) => {
  m = ((m % 1440) + 1440) % 1440 // wrap past midnight for display
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
}
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]))

// Longest delay the aircraft can absorb while keeping its fuel reserve.
export const usableHoldMin = (s) => s.fuel_on_board_min - s.min_reserve_min

// Gap in minutes behind the closest heavy arrival ahead of this slot (null = no leader in its wake range).
export function gapToLeaderMin(s, delay) {
  const ahead = s.heavy_arrivals.map((h) => delay - h.at_delay_min).filter((g) => g >= 0)
  return ahead.length ? Math.min(...ahead) : null
}

export const slotClearOfWake = (s, delay) => {
  const gap = gapToLeaderMin(s, delay)
  return gap === null || gap >= WAKE_SEPARATION_MIN
}

// Smallest delay at which this gate is free early enough for the aircraft.
export const gateReadyDelayMin = (s, g) => g.free_from_min + GATE_CHANGE_NOTICE_MIN - s.scheduled_arrival_min

const REAL_ROW_KEYS = {
  ATC: ['ORIGIN_AIRPORT', 'DESTINATION_AIRPORT', 'SCHEDULED_ARRIVAL', 'ARRIVAL_DELAY', 'WEATHER_DELAY', 'AIR_SYSTEM_DELAY', 'TAXI_IN'],
  PILOT: ['DISTANCE', 'SCHEDULED_TIME', 'AIR_TIME', 'DEPARTURE_DELAY', 'ARRIVAL_DELAY', 'WEATHER_DELAY', 'LATE_AIRCRAFT_DELAY'],
  GROUND: ['AIRLINE', 'FLIGHT_NUMBER', 'TAIL_NUMBER', 'SCHEDULED_ARRIVAL', 'AIRLINE_DELAY', 'LATE_AIRCRAFT_DELAY', 'TAXI_IN'],
}
const base = (s) => ({ flight: s.flight, disruption: s.disruption, scheduled_arrival: s.scheduled_arrival_label })

// Each agent only gets its own facts. Never pass ground_truth or the whole scenario.
export const FACTS = {
  ATC: (s) => ({
    ...base(s),
    required_gap_min: WAKE_SEPARATION_MIN,
    slots: [...s.runway_slots_delay_min]
      .sort((a, b) => a - b)
      .map((delay_min) => ({ delay_min, gap_to_leader_min: gapToLeaderMin(s, delay_min), usable: slotClearOfWake(s, delay_min) })),
    real_row: pick(s.source, REAL_ROW_KEYS.ATC),
  }),
  PILOT: (s) => ({
    ...base(s),
    usable_holding_min: usableHoldMin(s),
    crew_shift_end: hhmm(s.crew_shift_end_min),
    latest_delay_for_crew_min: s.crew_shift_end_min - s.scheduled_arrival_min,
    next_connection: s.next_connection,
    real_row: pick(s.source, REAL_ROW_KEYS.PILOT),
  }),
  GROUND: (s) => ({
    ...base(s),
    gate_change_notice_min: GATE_CHANGE_NOTICE_MIN,
    gates: s.gates.map((g) => ({ id: g.id, free_from: hhmm(g.free_from_min), ready_at_delay_min: gateReadyDelayMin(s, g) })),
    next_connection: s.next_connection,
    real_row: pick(s.source, REAL_ROW_KEYS.GROUND),
  }),
}

// Every hard rule with its verdict and the numbers behind it, so a human can verify the check.
export function ruleChecks(s, p) {
  const delay = p.delay_min
  const gate = s.gates.find((g) => g.id === p.gate)
  const arrival = s.scheduled_arrival_min + delay
  const gap = gapToLeaderMin(s, delay)
  const hold = usableHoldMin(s)
  const gateLatest = arrival - GATE_CHANGE_NOTICE_MIN
  return [
    { rule: 'SLOT', ok: s.runway_slots_delay_min.includes(delay),
      detail: `+${delay} ${s.runway_slots_delay_min.includes(delay) ? 'is' : 'is not'} an offered slot` },
    { rule: 'WAKE', ok: slotClearOfWake(s, delay),
      detail: gap === null ? 'no heavy arrival ahead' : `${gap} min behind heavy, needs ${WAKE_SEPARATION_MIN}` },
    { rule: 'FUEL', ok: delay <= hold, detail: `${delay} min delay vs ${hold} min usable holding` },
    { rule: 'GATE', ok: !!gate && gate.free_from_min <= gateLatest,
      detail: gate ? `${gate.id} free ${hhmm(gate.free_from_min)}, needed by ${hhmm(gateLatest)}` : `gate ${p.gate ?? '-'} unknown` },
    { rule: 'CREW', ok: arrival <= s.crew_shift_end_min, detail: `arrive ${hhmm(arrival)}, duty ends ${hhmm(s.crew_shift_end_min)}` },
  ]
}

// Plain-code feasibility check against the full scenario.
export function checkProposal(s, p) {
  if (!p || !Number.isFinite(p.delay_min)) return { ok: false, violations: ['SLOT'], warnings: [] }
  const violations = ruleChecks(s, p).filter((r) => !r.ok).map((r) => r.rule)
  const connection = connectionStatus(s, p)
  return { ok: violations.length === 0, violations, warnings: connection.missed ? ['CONNECTION_MISSED'] : [], connection }
}

// Per offered slot: the best gate and what (if anything) blocks it. Drives the slot map.
export function slotMap(s) {
  return [...s.runway_slots_delay_min].sort((a, b) => a - b).map((delay_min) => {
    const options = s.gates.map((g) => ({ gate: g.id, violations: checkProposal(s, { delay_min, gate: g.id }).violations }))
    const best = options.reduce((a, b) => (b.violations.length < a.violations.length ? b : a))
    return { delay_min, ok: best.violations.length === 0, gate: best.gate, violations: best.violations }
  })
}

// Soft constraint: never blocks a plan, but is shown to the agents and the human approver.
// At gate = scheduled arrival + delay + real TAXI_IN; connection time comes from next_connection.
export function connectionStatus(s, p) {
  const [, h, m] = s.next_connection.match(/(\d{1,2}):(\d{2})/)
  let departs = Number(h) * 60 + Number(m)
  if (departs < s.scheduled_arrival_min - 120) departs += 1440 // connection is after midnight
  const atGate = s.scheduled_arrival_min + p.delay_min + s.source.TAXI_IN
  return { missed: atGate > departs, at_gate: hhmm(atGate), departs: hhmm(departs) }
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

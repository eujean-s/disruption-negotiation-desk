// Impact measures against simple stand-ins for today's process. Plain code only, no API calls.
// Usage: node scripts/impact.js <path/to/flights.csv> [sampleSize=500]
//
// 1. Unsafe plans caught: today one party plans alone (ATC's earliest slot + ground's first free gate)
//    and nobody checks the other side's limits. How often does that plan break a rule?
// 2. Duty-manager workload: share of disruptions resolved automatically vs escalated to a human.
// 3. Delay vs a cautious planner who takes the latest safe slot instead of the earliest one
//    (an upper-bound estimate), priced at the A4A 2024 block-minute cost.
import fs from 'node:fs'
import { checkProposal, fallback } from '../src/checker.js'
import { parseFlightRow, scenarioFromRow } from '../src/scenarioFromRow.js'

const COST_PER_MIN = 100.76 // USD, Airlines for America, U.S. Passenger Carrier Delay Costs, 2024
const RULES = ['SLOT', 'WAKE', 'FUEL', 'GATE', 'CREW']

const file = process.argv[2]
const sampleSize = Math.max(parseInt(process.argv[3]) || 500, 1)
if (!file) {
  console.error('Usage: node scripts/impact.js <path/to/flights.csv> [sampleSize=500]')
  process.exit(1)
}
const capacity = JSON.parse(fs.readFileSync(new URL('../src/data/airport_capacity.json', import.meta.url)))
const curated = JSON.parse(fs.readFileSync(new URL('../src/data/scenarios.json', import.meta.url)))

// Deterministic sample: every k-th data row, so anyone rerunning gets the same flights.
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
const step = Math.max(Math.floor(lines.length / sampleSize), 1)
const sampled = []
let skipped = 0
for (let i = 0; i < lines.length && sampled.length < sampleSize; i += step) {
  try {
    sampled.push(scenarioFromRow(parseFlightRow(lines[i]), capacity))
  } catch {
    skipped++ // cancelled / diverted / malformed rows have no arrival to plan
  }
}

function safeOptions(s) {
  const out = []
  for (const delay_min of s.runway_slots_delay_min)
    for (const g of s.gates) if (checkProposal(s, { delay_min, gate: g.id }).ok) out.push({ delay_min, gate: g.id })
  return out
}

function measure(scenarios) {
  const r = { n: scenarios.length, singleUnsafe: 0, byRule: Object.fromEntries(RULES.map((k) => [k, 0])), auto: 0, escalated: 0, savings: [] }
  for (const s of scenarios) {
    // 1. Single-party plan: ATC's earliest slot, ground's earliest-free gate, no cross-check.
    const gate = [...s.gates].sort((a, b) => a.free_from_min - b.free_from_min)[0]
    const single = checkProposal(s, { delay_min: Math.min(...s.runway_slots_delay_min), gate: gate.id })
    if (!single.ok) r.singleUnsafe++
    single.violations.forEach((v) => r.byRule[v]++)

    // 2. Workload: does the tool find a checked plan, or hand it to a human?
    const plan = fallback(s)
    if (!plan) { r.escalated++; continue }
    r.auto++

    // 3. Earliest safe (the tool) vs latest safe (a cautious planner).
    const latest = Math.max(...safeOptions(s).map((o) => o.delay_min))
    r.savings.push(latest - plan.delay_min)
  }
  return r
}

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-')
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const median = (xs) => {
  if (!xs.length) return 0
  const v = [...xs].sort((a, b) => a - b)
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}

function report(title, r) {
  console.log(`\n## ${title} (n = ${r.n})`)
  console.log('| Measure | Result |')
  console.log('| --- | --- |')
  console.log(`| 1. Single-party plan breaks a rule | ${r.singleUnsafe}/${r.n} (${pct(r.singleUnsafe, r.n)}) |`)
  console.log(`|    by rule (a plan can break several) | ${RULES.filter((k) => r.byRule[k]).map((k) => `${k} ${r.byRule[k]}`).join(', ') || 'none'} |`)
  console.log(`|    unsafe plans reaching the duty manager with the tool | 0 (every plan is checked) |`)
  console.log(`| 2. Resolved automatically (checked plan to approve) | ${r.auto}/${r.n} (${pct(r.auto, r.n)}) |`)
  console.log(`|    Escalated to the duty manager | ${r.escalated}/${r.n} (${pct(r.escalated, r.n)}) |`)
  const m = mean(r.savings)
  console.log(`| 3. Delay saved vs cautious (latest safe) slot, per resolved flight | mean ${m.toFixed(1)} min, median ${median(r.savings)} min |`)
  console.log(`|    At $${COST_PER_MIN}/min (A4A 2024), estimate | mean $${Math.round(m * COST_PER_MIN).toLocaleString('en-US')} per resolved flight |`)
}

console.log(`# Impact measures (plain code, no LLM calls)`)
console.log(`flights.csv: ${lines.length.toLocaleString('en-US')} rows, every ${step}th sampled, ${skipped} skipped (cancelled/diverted/malformed)`)
report('Sampled flights.csv rows (Custom-row builder, workbook limits)', measure(sampled))
report('Curated scenarios S1-S8', measure(curated))

// Usage: npx vercel dev   (in another terminal, serves /api/agent on :3000)
//        node scripts/evaluate.js [runsPerScenario=3] [baseUrl=http://localhost:3000]
import fs from 'node:fs'
import { runNegotiation, MAX_ROUNDS } from '../src/negotiate.js'

const MAX_RUNS = 5
const n = Math.min(Math.max(parseInt(process.argv[2]) || 3, 1), MAX_RUNS)
const baseUrl = process.argv[3] || 'http://localhost:3000'
const scenarios = JSON.parse(fs.readFileSync(new URL('../src/data/scenarios.json', import.meta.url)))

// Correct = feasible scenario ended with a safe option, or infeasible scenario was escalated.
function isCorrect(s, r) {
  const gt = s.ground_truth
  if (gt.status === 'INFEASIBLE') return r.outcome === 'ESCALATE'
  return r.proposal && gt.safe_options.some((o) => o.arrival_delay_min === r.proposal.delay_min && o.gate === r.proposal.gate)
}

const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null)
const rows = []
for (const s of scenarios) {
  const results = await Promise.all(Array.from({ length: n }, () => runNegotiation(s, { baseUrl })))
  const count = (o) => results.filter((r) => r.outcome === o).length
  const row = {
    scenario: s.id,
    truth: s.ground_truth.status,
    runs: n,
    consensus: count('CONSENSUS'),
    checker_blocked: results.reduce((a, r) => a + r.blocked, 0),
    avg_rounds: avg(results.filter((r) => r.outcome === 'CONSENSUS').map((r) => r.round)),
    fallback: count('FALLBACK'),
    escalate: count('ESCALATE'),
    mismatches: results.filter((r) => !isCorrect(s, r)).length,
    agent_errors: results.reduce((a, r) => a + r.log.filter((m) => m.type === 'ERROR' || m.type === 'INVALID').length, 0),
  }
  rows.push(row)
  console.log(row.scenario, JSON.stringify(row))
}

const sum = (f) => rows.filter(f.where || (() => true)).reduce((a, r) => a + r[f.key], 0)
const feasible = (r) => r.truth === 'FEASIBLE'
const feasibleRuns = sum({ key: 'runs', where: feasible })
console.table(rows)
console.log(`Consensus rate (feasible S1-S5): ${sum({ key: 'consensus', where: feasible })}/${feasibleRuns}`)
const rr = rows.map((r) => r.avg_rounds).filter((x) => x !== null)
console.log(`Avg rounds to consensus: ${avg(rr)} (limit ${MAX_ROUNDS})`)
console.log(`Checker-blocked proposals (all): ${sum({ key: 'checker_blocked' })}`)
console.log(`Fallback count (all): ${sum({ key: 'fallback' })}`)
console.log(`Correct escalations (infeasible S6-S8): ${sum({ key: 'escalate', where: (r) => !feasible(r) })}/${sum({ key: 'runs', where: (r) => !feasible(r) })}`)
const errs = sum({ key: 'agent_errors' })
if (errs > 5) console.log(`WARNING: ${errs} agent calls failed or were unparseable (is vercel dev running? is CLAUDE_MODEL right?). Results above are not a valid LLM test.`)
else if (errs) console.log(`Note: ${errs} agent call(s) failed or were unparseable; the negotiation continued without them.`)
console.log(`Mismatches vs ground_truth: ${sum({ key: 'mismatches' })}/${n * rows.length}`)

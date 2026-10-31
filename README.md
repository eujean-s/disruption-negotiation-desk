# ATC · Pilot · Ground Ops negotiation

AUTONOMOUS SG 2026, AI & Aerospace, Challenge #2. Three LLM agents negotiate a resolution to a flight disruption (arrival delay + gate). Plain code decides whether the result is safe.

Stack: Vue 3, Vite, Bootstrap. One Vercel function (`api/agent.js`) wraps the Anthropic API. Live: https://agents-app-sandy.vercel.app

## Run

```
npm install
npx vercel dev            # serves the app and /api/agent on localhost:3000
node scripts/evaluate.js  # in another terminal: runs every scenario N times (default 3, max 5)
```

Pick a scenario, press **Run**, watch the messages, then **Approve** (or decide by hand on ESCALATE).

## LLM vs plain code

| Part | Who | Where |
| --- | --- | --- |
| Talking, proposing, countering, accepting | **LLM**: 3 separate calls per round (ATC, PILOT, GROUND), each with its own system prompt and only its own facts | `src/negotiate.js` `callAgent` |
| Parsing replies (JSON only, tolerant of fences, bad shape becomes `INVALID`) | plain code | `parseReply` |
| Deciding if a consensus is accepted: runway slot valid, delay within fuel margin, gate free at arrival, arrival before crew shift end | **plain code** | `checkProposal` |
| Max 3 rounds, then earliest slot/gate that passes the checker; if none, `ESCALATE` | **plain code** | `fallback`, `runNegotiation` |
| Final approval | **human** | Approve button |
| Scoring against truth | plain code (`ground_truth`) | `scripts/evaluate.js` only |

Outcomes: **CONSENSUS** (all three agree on delay, GROUND names a gate, checker passes), **FALLBACK** (no accepted consensus in 3 rounds, rule-based pick), **ESCALATE** (nothing is feasible, a human decides).

An agent's "I accept" never counts on its own. A consensus the checker blocks is logged, its violation codes (`SLOT`, `FUEL`, `GATE`, `CREW`) are fed back to the agents, and the next round starts.

`ground_truth` and the full scenario object are never sent to an agent. `factsFor()` builds each agent's prompt from selected fields, including a `real_row` picked from `scenario.source`:

- **ATC**: ORIGIN_AIRPORT, DESTINATION_AIRPORT, SCHEDULED_ARRIVAL, ARRIVAL_DELAY, WEATHER_DELAY, AIR_SYSTEM_DELAY, TAXI_IN, plus runway slots
- **PILOT**: DISTANCE, SCHEDULED_TIME, AIR_TIME, DEPARTURE_DELAY, ARRIVAL_DELAY, WEATHER_DELAY, LATE_AIRCRAFT_DELAY, plus fuel, reserve, crew shift end
- **GROUND**: AIRLINE, FLIGHT_NUMBER, TAIL_NUMBER, SCHEDULED_ARRIVAL, AIRLINE_DELAY, LATE_AIRCRAFT_DELAY, TAXI_IN, plus gates

## Real vs assumed data

Each of the 8 scenarios in `src/data/scenarios.json` comes from a real row of the BTS 2015 flights dataset (`csv_row` is the row number).

| | Fields |
| --- | --- |
| **Real** (BTS 2015) | everything in `source` (airline, flight number, tail number, airports, scheduled/actual times, all delay columns, distance, taxi, air time), plus the flight label, date and scheduled arrival |
| **Assumed / synthetic** | runway slots (generated around the real delay), fuel on board, minimum reserve, gate ids and free times, crew shift end, next connection |

| Scenario | Flight | csv_row | Truth |
| --- | --- | --- | --- |
| S1 | AA 2229 TUS-DFW | 301084 | feasible |
| S2 | MQ 3167 BNA-LGA | 53082 | feasible |
| S3 | UA 646 ORD-EWR | 12623 | feasible |
| S4 | WN 1998 SAN-DEN | 231158 | feasible |
| S5 | DL 795 GRR-MSP | 115901 | feasible |
| S6 | OO 2752 SAT-PHX | 114697 | infeasible (FUEL, GATE) |
| S7 | US 561 PHX-LAS | 34785 | infeasible (FUEL, GATE) |
| S8 | AS 37 MSP-SEA | 121629 | infeasible (CREW, GATE) |

So the *scenarios* are grounded in real delays, but the *constraints* that make them feasible or not are my assumptions. This demonstrates the negotiation and safety-check pattern, not real operational feasibility.

## Evaluation

`node scripts/evaluate.js 3` ran every scenario 3 times (24 runs, model `claude-sonnet-5-5`). A run is a mismatch if a feasible scenario ends on a plan outside `ground_truth.safe_options`, or an infeasible scenario does not end in ESCALATE.

| Scenario | Truth | Runs | Consensus | Checker-blocked | Fallback | Escalate | Mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | feasible | 3 | 3 | 0 | 0 | 0 | 0 |
| S2 | feasible | 3 | 3 | 0 | 0 | 0 | 0 |
| S3 | feasible | 3 | 3 | 0 | 0 | 0 | 0 |
| S4 | feasible | 3 | 3 | 0 | 0 | 0 | 0 |
| S5 | feasible | 3 | 3 | 0 | 0 | 0 | 0 |
| S6 | infeasible | 3 | 0 | 0 | 0 | 3 | 0 |
| S7 | infeasible | 3 | 0 | 3 | 0 | 3 | 0 |
| S8 | infeasible | 3 | 0 | 0 | 0 | 3 | 0 |

- Consensus rate on feasible scenarios (S1-S5): **15/15**
- Checker-blocked proposals: **3** (all in S7)
- Fallback used: **0**
- Correct escalations (S6-S8): **9/9**
- Mismatches vs ground truth: **0/24**

Caveats: N=3 is a small sample, and LLM output varies between runs, so rerun it yourself. The checker enforces the same rules `ground_truth` was computed with, so "0 mismatches" means the safety net holds. It is not an independent validation.

## S6: the honest failure case

S6 (OO 2752, SAT-PHX) is infeasible only because of my synthetic numbers, and it is the weakest point of the demo:

- The real BTS row shows this flight **did land**, 112 minutes late. My assumed fuel (85 min, 45 reserve) leaves a 40-minute margin, and the earliest runway slot (+100) and the first free gate (+100) both lie beyond it. The "infeasible" verdict says more about my assumptions than about the real flight.
- The escalation was right for the wrong kind of reason. The agents agree it is infeasible, but they conclude "divert to an alternate", which is an option the model does not have. Only the plain-code fallback turns that into a clean `ESCALATE` for a human.
- In S7 the agents *did* reach a consensus on an unsafe plan (3 blocked proposals across the 3 runs), and only the checker stopped it. That is the point of the checker, and also evidence that LLM agreement is not safety.
- ATC anchors on the real delay (S6: "matching the recorded ~112 min delay"). Agents lean on real-row numbers, which can pull them toward what happened rather than what is safe.

# ATC · Pilot · Ground Ops negotiation

AUTONOMOUS SG 2026, AI & Aerospace, Challenge #2. Three LLM agents negotiate a resolution to a flight disruption (arrival delay + gate). Plain code decides whether the result is safe.

Stack: Vue 3, Vite, Bootstrap. One Vercel function (`api/agent.js`) wraps the Anthropic API. Live: https://agents-app-sandy.vercel.app

## Run

```
npm install
npx vercel dev            # serves the app and /api/agent on localhost:3000
node scripts/evaluate.js  # in another terminal: runs every scenario N times (default 3, max 5)
```

`/api/agent` is public, so it only accepts requests shaped like the app's own: a string system prompt (max 4,000 chars) and 1-4 text messages (max 6,000 chars each). Anything else gets a 400. The model and `max_tokens` are fixed on the server. There is no rate limit, which would need storage.

Pick a scenario, press **Run**, watch the messages, then **Approve** (or decide by hand on ESCALATE). **Download log (JSON)** saves the traceable consensus log: every message, checker verdict, outcome and the human approval with timestamp.

## LLM vs plain code

| Part | Who | Where |
| --- | --- | --- |
| Talking, proposing, countering, accepting | **LLM**: 3 separate calls per round (ATC, PILOT, GROUND), each with its own system prompt and only its own facts | `src/negotiate.js` `callAgent` |
| Parsing replies (JSON only, tolerant of fences, bad shape becomes `INVALID`) | plain code | `parseReply` |
| Deciding if a consensus is accepted: runway slot valid, slot clear of wake turbulence (at least 2 min behind any heavy arrival), delay within fuel margin, gate free at arrival, arrival before crew shift end | **plain code** | `checkProposal` |
| Passenger connection (soft): at gate = scheduled arrival + delay + real TAXI_IN, compared with the connection time. Shown as a warning; never blocks a plan | plain code | `connectionStatus` |
| Max 2 rounds (brief: under 3 turns), then earliest slot/gate that passes the checker; if none, `ESCALATE` | **plain code** | `fallback`, `runNegotiation` |
| Final approval | **human** | Approve button |
| Scoring against truth | plain code (`ground_truth`) | `scripts/evaluate.js` only |

Outcomes: **CONSENSUS** (all three agree on delay, GROUND names a gate, checker passes), **FALLBACK** (no accepted consensus in 2 rounds, rule-based pick), **ESCALATE** (nothing is feasible, a human decides).

An agent's "I accept" never counts on its own. A consensus the checker blocks is logged, its violation codes (`SLOT`, `WAKE`, `FUEL`, `GATE`, `CREW`) are fed back to the agents, and the next round starts.

Passenger connections are a **soft** constraint on purpose. Fuel, gate and crew limits are safety limits, so the checker enforces them. A missed connection is a passenger-impact trade-off, so it is shown to the agents and to the human approver (`CONNECTION MISSED` badge, plus the at-gate vs departure time in the outcome) but never blocks a safe plan. With the current synthetic connection times, a hard rule would make S2, S4 and S5 infeasible even at their earliest safe slot.

`ground_truth` and the full scenario object are never sent to an agent. `factsFor()` builds each agent's prompt from selected fields, including a `real_row` picked from `scenario.source`:

- **ATC**: ORIGIN_AIRPORT, DESTINATION_AIRPORT, SCHEDULED_ARRIVAL, ARRIVAL_DELAY, WEATHER_DELAY, AIR_SYSTEM_DELAY, TAXI_IN, plus runway slots, heavy arrivals and the wake separation minimum
- **PILOT**: DISTANCE, SCHEDULED_TIME, AIR_TIME, DEPARTURE_DELAY, ARRIVAL_DELAY, WEATHER_DELAY, LATE_AIRCRAFT_DELAY, plus fuel, reserve, crew shift end, next connection
- **GROUND**: AIRLINE, FLIGHT_NUMBER, TAIL_NUMBER, SCHEDULED_ARRIVAL, AIRLINE_DELAY, LATE_AIRCRAFT_DELAY, TAXI_IN, plus gates, next connection

## Real vs assumed data

Each of the 8 scenarios in `src/data/scenarios.json` comes from a real row of the BTS 2015 flights dataset (`csv_row` is the row number).

| | Fields |
| --- | --- |
| **Real** (BTS 2015) | everything in `source` (airline, flight number, tail number, airports, scheduled/actual times, all delay columns, distance, taxi, air time), plus the flight label, date and scheduled arrival |
| **Assumed / synthetic** | runway slots (generated around the real delay), heavy arrivals for wake separation (S1, S3, S5), fuel on board, minimum reserve, gate ids and free times, crew shift end, next connection |

| Scenario | Flight | csv_row | Truth |
| --- | --- | --- | --- |
| S1 | AA 2229 TUS-DFW | 301084 | feasible (earliest slot wake-blocked) |
| S2 | MQ 3167 BNA-LGA | 53082 | feasible |
| S3 | UA 646 ORD-EWR | 12623 | feasible (earliest slot wake-blocked) |
| S4 | WN 1998 SAN-DEN | 231158 | feasible |
| S5 | DL 795 GRR-MSP | 115901 | feasible (earliest slot wake-blocked) |
| S6 | OO 2752 SAT-PHX | 114697 | infeasible (FUEL, GATE) |
| S7 | US 561 PHX-LAS | 34785 | infeasible (FUEL, GATE) |
| S8 | AS 37 MSP-SEA | 121629 | infeasible (CREW, GATE) |

Wake separation: S1, S3 and S5 each have one synthetic heavy arrival placed 1 minute before what used to be their earliest safe slot, so ATC has to skip that slot. `ground_truth` for those three was recomputed with the same rules; S6-S8 are unchanged.

So the *scenarios* are grounded in real delays, but the *constraints* that make them feasible or not are my assumptions. This demonstrates the negotiation and safety-check pattern, not real operational feasibility.

## Evaluation

`node scripts/evaluate.js 3` ran every scenario 3 times (24 runs, model `claude-sonnet-5-5`, max 2 rounds). A run is a mismatch if a feasible scenario ends on a plan outside `ground_truth.safe_options`, or an infeasible scenario does not end in ESCALATE.

| Scenario | Truth | Runs | Consensus | Avg rounds | Checker-blocked | Fallback | Connection missed | Escalate | Mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | feasible | 3 | 3 | 1 | 0 | 0 | 0 | 0 | 0 |
| S2 | feasible | 3 | 3 | 2 | 0 | 0 | 3 | 0 | 0 |
| S3 | feasible | 3 | 2 | 2 | 0 | 1 | 3 | 0 | 0 |
| S4 | feasible | 3 | 3 | 2 | 0 | 0 | 3 | 0 | 0 |
| S5 | feasible | 3 | 3 | 2 | 0 | 0 | 3 | 0 | 0 |
| S6 | infeasible | 3 | 0 | - | 0 | 0 | - | 3 | 0 |
| S7 | infeasible | 3 | 0 | - | 2 | 0 | - | 3 | 0 |
| S8 | infeasible | 3 | 0 | - | 0 | 0 | - | 3 | 0 |

- Consensus rate on feasible scenarios (S1-S5): **14/15**, in **1.8 rounds on average** (limit 2). Two rounds is typical: ATC opens with the earliest runway slot it can use, GROUND counters because no gate is free yet, and everyone agrees in round 2
- Checker-blocked proposals: **2** (S7)
- Fallback used: **1** (S3; the fallback picked the correct plan)
- Passenger connection missed (soft warning): **12 of 15 plans**, in S2-S5. In all four, even the earliest safe slot misses the connection (in S3 because wake separation removes the +25 slot that would have protected it)
- Correct escalations (S6-S8): **9/9**
- Mismatches vs ground truth: **0/24**
- Agent calls failed or unparseable: **0**

**JSON field order matters.** The first wake-separation run got 10/15 consensus, 5 fallbacks and 9 unparseable replies. The reply schema put `delay_min` before `message`, so ATC committed to a slot (e.g. 10) and only then noticed in its message that the slot was wake-blocked ("proposing 20 instead"). The other agents followed the message, the numbers no longer matched, and the round was lost. Putting `message` first, so the agent reasons before it commits to numbers, fixed this (14/15, 0 errors).

Caveats: N=3 is a small sample, and LLM output varies between runs, so rerun it yourself. The checker enforces the same rules `ground_truth` was computed with, so "0 mismatches" means the safety net holds. It is not an independent validation.

## S6: the honest failure case

S6 (OO 2752, SAT-PHX) is infeasible only because of my synthetic numbers, and it is the weakest point of the demo:

- The real BTS row shows this flight **did land**, 112 minutes late. My assumed fuel (85 min, 45 reserve) leaves a 40-minute margin, and the earliest runway slot (+100) and the first free gate (+100) both lie beyond it. The "infeasible" verdict says more about my assumptions than about the real flight.
- The escalation was right for the wrong kind of reason. The agents agree it is infeasible, but they conclude "divert to an alternate", which is an option the model does not have. Only the plain-code fallback turns that into a clean `ESCALATE` for a human.
- In S7 the agents *did* reach a consensus on an unsafe plan (checker-blocked in 2 of 3 runs in the latest evaluation, between 1 and 3 in earlier ones), and only the checker stopped it. That is the point of the checker, and also evidence that LLM agreement is not safety.
- ATC anchors on the real delay (S6: "matching the recorded ~112 min delay"). Agents lean on real-row numbers, which can pull them toward what happened rather than what is safe.

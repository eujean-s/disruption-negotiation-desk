# ATC · Pilot · Ground Ops negotiation

AUTONOMOUS SG 2026, AI & Aerospace, Challenge #2. Three LLM agents negotiate a resolution to a flight disruption (arrival delay + gate). Plain code decides whether the result is safe.

Stack: Vue 3, Vite, Bootstrap. One Vercel function (`api/agent.js`) wraps the Anthropic API. Live: https://agents-app-sandy.vercel.app

## Who it is for

**User:** the airline's operations duty manager at the hub (operations control centre), who has to settle a disrupted arrival with three parties who each own one constraint: ATC (runway slot, wake separation), the flight crew (fuel, duty time) and ramp/ground ops (gate).

**Today:** that settlement is done by phone and manual system updates, one party at a time. Each call can surface a new constraint (no gate free, fuel too short) and restart the loop, while the aircraft holds at about **$100.76 per block minute** (A4A 2024, see below).

**With this tool:** the three positions are negotiated in at most 3 rounds, every proposal is checked by plain-code rules, and the duty manager gets one checked plan (or an explicit "nothing is safe") with the full log, and approves it.

## Run

```
npm install
npx vercel dev            # serves the app and /api/agent on localhost:3000
node scripts/evaluate.js  # in another terminal: runs every scenario N times (default 3, max 5)
```

`/api/agent` is public, so it only accepts requests shaped like the app's own: a string system prompt (max 4,000 chars) and 1-4 text messages (max 6,000 chars each). Anything else gets a 400. The model and `max_tokens` are fixed on the server. There is no rate limit, which would need storage.

Pick a scenario (or **Custom** to paste any `flights.csv` row), press **Run**, watch the messages, then **Approve** (or decide by hand on ESCALATE). **Download log (JSON)** saves the traceable consensus log: every message, checker verdict, outcome and the human approval with timestamp.

## Any flights.csv row (Custom)

Choose **Custom**, paste one line from `flights.csv` (header optional) and press **Load row**. `src/scenarioFromRow.js` builds the scenario in plain code:

| Value | From |
| --- | --- |
| Flight, scheduled arrival, weather / air-system / late-aircraft delay, taxi-in, scheduled time | the pasted row (real) |
| Runway ops/hour, spare gates, minimum turnaround at the destination | workbook `airport_capacity` (unlisted airports use Non-hub limits) |
| 30 min final reserve + 45 min spare holding, 13 h crew duty, 20 min gate notice, 120 s wake gap | workbook `fuel_and_crew`, `wake_separation` |
| First slot = weather + air-system delay; slot spacing = 600 / ops per hour; one heavy ahead at hubs; gates free one turnaround apart; crew report 60 min before departure; connection 60 min after arrival | **my assumptions**, listed in the app's Assumptions panel for that row |

Custom rows have no ground truth: the checker is the only judge. Sample of 10 rows spread through the first 60,000 lines of `flights.csv`: the fallback finds a safe plan for 6 and escalates 4 (fuel: the first usable slot is beyond 45 min of holding). One live run (AA 8 HNL-DFW): ATC skipped the wake-blocked +5 slot, Ground countered for gate notice, consensus at +25 / DFW-S1 in 2 rounds, checker passed.

**Limit:** all of the delay is treated as airborne holding against the 45 min fuel spare. In reality much of a late-aircraft delay is spent on the ground at the origin, so long-delay rows escalate more often than they would in practice.

## LLM vs plain code

| Part | Who | Where |
| --- | --- | --- |
| Talking, proposing, countering, accepting | **LLM**: 3 separate calls per round (ATC, PILOT, GROUND), each with its own system prompt and only its own facts | `src/negotiate.js` `callAgent` |
| Parsing replies (JSON only, tolerant of fences, bad shape becomes `INVALID`) | plain code | `parseReply` |
| Deciding if a consensus is accepted: runway slot valid, slot clear of wake turbulence (at least 2 min behind any heavy arrival), delay within fuel margin, gate free at least 20 min before arrival (workbook "Gate change notice"), arrival before crew shift end | **plain code** | `checkProposal` |
| Passenger connection (soft): at gate = scheduled arrival + delay + real TAXI_IN, compared with the connection time. Shown as a warning; never blocks a plan | plain code | `connectionStatus` |
| Max 3 rounds (one message per agent per round), then earliest slot/gate that passes the checker; if none, `ESCALATE` | **plain code** | `fallback`, `runNegotiation` |
| Final approval | **human** | Approve button |
| Scoring against truth | plain code (`ground_truth`) | `scripts/evaluate.js` only |

Outcomes: **CONSENSUS** (all three agree on delay, GROUND names a gate, checker passes), **FALLBACK** (no accepted consensus in 3 rounds, rule-based pick), **ESCALATE** (nothing is feasible, a human decides).

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

`node scripts/evaluate.js 3` ran every scenario 3 times (24 runs, model `claude-sonnet-5-5`, max 3 rounds, 20 min gate notice). A run is a mismatch if a feasible scenario ends on a plan outside `ground_truth.safe_options`, or an infeasible scenario does not end in ESCALATE.

- Consensus rate on feasible scenarios (S1-S5): **15/15**, in **1.8 rounds on average** (limit 3)
- Checker-blocked proposals: **0**
- Fallback used: **0**
- Passenger connection missed (soft warning): **12 of 15 plans**. The earliest safe slot already misses the connection in S2-S5 (in S3 wake separation removes the slot that would have protected it), so this is a human decision, not a negotiation failure
- Correct escalations (S6-S8): **9/9**
- Mismatches vs ground truth: **0/24**

Per-scenario breakdown: see the table printed by the script (rerun to reproduce; LLM output varies between runs).

**JSON field order matters.** The first wake-separation run got 10/15 consensus, 5 fallbacks and 9 unparseable replies. The reply schema put `delay_min` before `message`, so ATC committed to a slot (e.g. 10) and only then noticed in its message that the slot was wake-blocked ("proposing 20 instead"). The other agents followed the message, the numbers no longer matched, and the round was lost. Putting `message` first, so the agent reasons before it commits to numbers, fixed this (14/15, 0 errors).

Caveats: N=3 is a small sample; the 15/15 is a single evaluation run, and LLM output varies between runs, so rerun it yourself. The checker enforces the same rules `ground_truth` was computed with, so "0 mismatches" means the safety net holds. It is not an independent validation.

## S6: the honest failure case

S6 (OO 2752, SAT-PHX) is infeasible only because of my synthetic numbers, and it is the weakest point of the demo:

- The real BTS row shows this flight **did land**, 112 minutes late. My assumed fuel (85 min, 45 reserve) leaves a 40-minute margin, and the earliest runway slot (+100) and the first free gate (+100) both lie beyond it. The "infeasible" verdict says more about my assumptions than about the real flight.
- The escalation was right for the wrong kind of reason. The agents agree it is infeasible, but they conclude "divert to an alternate", which is an option the model does not have. Only the plain-code fallback turns that into a clean `ESCALATE` for a human.
- In S7 the agents reached a consensus on an unsafe plan in earlier evaluation runs (the checker blocked 1 to 3 per run); in the latest run (20 min notice, 3 rounds) none were blocked, so this is run-to-run variation, not a fix. That is the point of the checker, and also evidence that LLM agreement is not safety.
- ATC anchors on the real delay (S6: "matching the recorded ~112 min delay"). Agents lean on real-row numbers, which can pull them toward what happened rather than what is safe.

## Operational limits (source)

From `challenge2_operational_constraints.xlsx` (organisers' synthetic planning limits): gate change notice at least 20 min before arrival; wake separation Heavy follows Heavy = 120 s (used as 2 min); fuel spare 45 min of holding. Scenario gate `free_from_min` values were moved 20 min earlier when the 20 min notice was adopted, so each scenario's `ground_truth` is unchanged.

## Cost of delay (sourced baseline)

| Figure | Value | Source |
| --- | --- | --- |
| Average cost of aircraft block time (taxi + airborne), US passenger airlines, 2024 | **$100.76 per minute** | [Airlines for America, U.S. Passenger Carrier Delay Costs](https://airlines.org/dataset/u-s-passenger-carrier-delay-costs/) |
| Total annual cost of US flight delay (airlines, passengers, lost demand, indirect), 2019 | **about $33 billion** | FAA/NEXTOR estimate as cited by [Airlines for America](https://www.airlines.org/dataset/u-s-) |
| Same study on 2007 data: $8.3 B airlines, $16.7 B passengers, $32.9 B total | | [FAA-commissioned Total Delay Impact Study (BTS)](https://rosap.ntl.bts.gov/view/dot/6234) |

**How this is used.** Status quo: ATC, pilot and ground staff coordinate by phone and manual updates, so a disrupted flight waits while each party checks its own limits. Cost of that wait at the A4A rate = delay minutes x $100.76. This tool's measurable output is the arrival delay it settles on and how many rounds it needs (1.8 on average here). **It does not yet measure minutes saved against a real manual process**, so no dollar saving is claimed. The A4A rate covers airline operating cost only; passenger time and missed connections are not included. Running cost: about 3 LLM calls per round, 1.8 rounds on average (roughly 5-6 calls of at most 300 output tokens per disruption).

### Before / after (estimate, not a measured saving)

Real BTS arrival delay vs the earliest plan that passes the checker under this project's synthetic limits:

| Scenario | Flight | Real arrival delay (min) | Earliest safe plan (min) |
| --- | --- | --- | --- |
| S1 | AA 2229 TUS-DFW | 83 | 20 (B10) |
| S2 | MQ 3167 BNA-LGA | 134 | 50 (C17) |
| S3 | UA 646 ORD-EWR | 26 | **40** (D24): worse than reality |
| S4 | WN 1998 SAN-DEN | 67 | 40 (A3) |
| S5 | DL 795 GRR-MSP | 127 | 60 (B10) |
| S6-S8 | | 112 / 328 / 70 | none: ESCALATE to a human |

This is **not like-for-like**: the real delay includes late departure and causes my model does not represent, and the limits (slots, gates, fuel) are synthetic. S3 shows the comparison can go the other way. The honest claim is narrower: given the same constraints, the agents settle on a checked plan in 1.8 rounds on average and never on an unsafe one, instead of a sequence of phone calls. The time saved per disruption was not measured against a real manual process.

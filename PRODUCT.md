# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary:** an airline's hub operations duty manager, in the operations control centre, settling a disrupted arrival. Their job is to get ATC, the flight crew and ground ops to agree on a revised landing time and gate while the aircraft holds, then own the decision.

This is a prototype. No real operations staff have used it, so this user is a design target, not a validated audience. Hackathon judges and recruiters evaluate the product through this user's workflow.

## Product Purpose

When weather or a late aircraft disrupts an arrival, the duty manager coordinates today by phone and manual system updates, one party at a time. Each call can surface a new constraint and restart the loop.

The product gives them one safety-checked plan with its evidence, or an explicit statement that nothing is safe and why. Success means the duty manager can verify the plan and decide quickly, without having to trust the AI.

## Positioning

**The AI talks. The code decides. The human approves.**

Three separate LLM agents negotiate, each seeing only its own party's data. In real operations, ATC, the crew and ground ops keep their constraints in separate systems, which is why they phone each other. The agents share offers rather than data. A plain-code checker stands in for the shared safety layer all parties would have to accept, and no agent's agreement counts on its own.

## Operating Context

- Input is a disruption: one of 8 curated scenarios, or any row pasted from the organisers' `flights.csv` (358,774 rows of 2015 US flights with `WEATHER_DELAY` > 15 or `LATE_AIRCRAFT_DELAY` > 20).
- A negotiation runs for at most 3 rounds, with one message per agent per round, and takes about 6-20 seconds live.
- Origin: AUTONOMOUS SG 2026, Airbus Challenge #2. It is also used as a portfolio project.

## Capabilities and Constraints

**Outcomes:** CONSENSUS (agents agree and the checker passes), FALLBACK (no agreement, so code picks the earliest safe plan and logs why), ESCALATE (nothing passes, so a human decides).

**Hard rules (terminology):** SLOT, WAKE, FUEL, GATE, CREW. A missed passenger connection is a soft warning and never blocks a plan.

**Human decision:** approve, reject with a note, or take over manually.

**Traceability:** a downloadable JSON consensus log holds every message, checker verdict, reason, assumption and the human decision with its timestamp.

**Technical:** the checker, fallback, and scenario builder are plain code. Prompts are built on the server, and `/api/agent` never accepts prompt text. There is no database and no rate limit.

**Not modelled:** taxiway blockage, turbulence, sector throughput, ground-crew overtime, turnaround cost, and multiple flights competing for slots. Do not imply these are handled.

## Evidence on Hand

- `scripts/evaluate.js`, 24 live runs: 15/15 safe consensus on feasible scenarios in 1.8 rounds on average, 9/9 correct escalations, 0/24 plans outside the safe set. The ground truth uses the same rules as the checker, so this shows the safety net holds and is not independent validation.
- `scripts/impact.js`, 500 sampled rows: 86.8% resolved automatically, 13.2% escalated. Runway slots and gates behind this result are synthetic. Its 100% single-party failure rate is built into the scenario generator, and its 10-minute saving is only an illustration; neither is a finding.
- Sourced cost: $100.76 per block minute, US passenger airlines, 2024 (Airlines for America).
- **Absent, do not fabricate:** user testimonials, real operational validation, gate or slot data for individual flights, a measured baseline for phone coordination, and any time or dollar saving.

## Data Provenance

- **Real:** flights, routes, dates, scheduled and actual times, and delay causes (BTS 2015).
- **Organisers' rules:** `challenge2_operational_constraints.xlsx`, which holds synthetic planning limits for wake spacing, gate notice, fuel, crew duty and per-airport capacity.
- **Assumed:** each flight's runway slots, heavy traffic, gate IDs and free times, curated-scenario fuel, crew report time and passenger connection times.

## Product Principles

1. **Label every value honestly.** Keep real flight data, organiser rules and assumptions visibly separate.
2. **Never claim what was not measured.** No time or dollar saving appears anywhere until a real baseline exists.
3. **A human makes the final decision.** A person approves, rejects or takes over; nothing is presented as automatic.
4. **Show the evidence.** Each rule's numbers stay visible, and agent text stays labelled unverified, because only the checker's output is verified.
5. **Refuse clearly.** When nothing is safe, say so and explain why instead of offering a best guess.

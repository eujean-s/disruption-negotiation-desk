# Disruption Negotiation Desk

Three AI agents (ATC, pilot and ground ops) negotiate a new landing time and gate for a disrupted flight. Plain code checks whether the plan is safe, and the duty manager makes the final call.

![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952b3?logo=bootstrap&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-serverless-000000?logo=vercel&logoColor=white)
![Claude](https://img.shields.io/badge/Anthropic-Claude-d97757)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

I built this solo for AUTONOMOUS SG 2026 (AI & Aerospace track, Airbus Challenge #2). Live demo: https://disruption-negotiation-desk.vercel.app

![Screenshot: the terminal sign showing S1 negotiated to land at 16:08 at gate B10 in one round, with every rule checked](docs/screenshot.png)

## The problem

When weather or a late aircraft disrupts an arrival, the airline's hub operations duty manager has to get three groups to agree on a new landing time and gate. ATC controls runway slots and wake separation, the flight crew has its fuel and duty hours, and ground ops controls the gates. Today they do it by phone, one call at a time. Any call can turn up a new constraint and send everyone back to the start, and the aircraft holds at about $100.76 a minute while they sort it out ([A4A, 2024](https://airlines.org/dataset/u-s-passenger-carrier-delay-costs/)).

## What I built

Each party gets its own LLM agent, and each agent only sees that party's data. They get at most 3 rounds to agree. Every agreement goes through a set of plain-code rules, and the duty manager ends up with one plan that has already passed the safety check, or a clear "nothing is safe, you decide". The full reasoning and log come with it, and they can approve, reject or take over.

## Features

- ATC, pilot and ground ops are separate model calls, each with its own prompt and its own facts. You can open "What this agent saw" on any message to see exactly what that agent was given. Each agent sends one message per round. If they don't agree within 3 rounds, a deterministic fallback picks the plan and the log says why.
- The checker tests every agreement against five rules (SLOT, WAKE, FUEL, GATE, CREW) and shows the numbers, for example `✓ FUEL 20 min delay vs 55 min usable holding`. Agent text is labelled unverified and checker output is labelled verified by code.
- A constraint timeline puts every offered landing slot on one line. Each slot is green if it's safe or red with the rule that blocks it, alongside the fuel limit, when each gate is ready, and heavy traffic. You can see why a plan won before reading any of the agent chat.
- You can pick one of 8 curated scenarios or paste any row from the organisers' `flights.csv`. Plain code builds the scenario from that row and the organisers' constraints workbook.
- The duty manager can approve, reject with a reason, or take over. One click downloads the consensus log: every message, verdict, reason and assumption, plus the human decision with a timestamp.

## Why it's built this way

The agents never decide what's safe. They negotiate and explain, `checkProposal()` has the final word, and an agent saying "I accept" doesn't count by itself.

You might ask why I used agents at all, since the deterministic fallback can find a safe plan on its own. It can only do that here because the demo gives it every party's data at once. In real operations ATC, the crew and ground ops keep their constraints in separate systems, which is the whole reason they phone each other. The agents let each party negotiate by sharing offers instead of data. The checker stands in for the shared safety layer all of them would have to accept.

## Results

| Metric | Result |
| --- | --- |
| Consensus on feasible scenarios (S1-S5, 3 runs each) | 15/15, in 1.8 rounds on average (limit 3) |
| Correct escalations on infeasible scenarios (S6-S8) | 9/9 |
| Plans outside the safe set | 0/24 |
| Time to a checked plan (live runs) | about 6-20 s |
| Real flights resolved automatically (500 sampled from `flights.csv`) | 434/500 (86.8%); 66 (13.2%) escalated to the duty manager |

Please read the caveats under [Evaluation](#evaluation) and [Impact](#impact) before quoting these. The limits are synthetic, and the ground truth uses the same rules as the checker.

## Architecture

```
 Browser (Vue 3)                                   Vercel function            Anthropic API
┌─────────────────────────────────────────┐      ┌──────────────────────┐    ┌──────────────┐
│ App.vue  scenario picker / CSV row      │      │ api/agent.js         │    │              │
│          timeline, log, approve/reject  │      │  - rebuilds scenario │    │  Claude      │
│                                         │      │    from id / CSV row │───▶│  (one call   │
│ negotiate.js  round loop (max 3)        │─────▶│  - sanitises history │    │   per agent  │
│   for each role: { role, scenario, log }│ JSON │  - recomputes checks │◀───│   turn)      │
│   parseReply() → structured message     │◀─────│  - builds prompt     │    │              │
│                                         │      │    (src/prompts.js)  │    └──────────────┘
│ checker.js  (plain code, no AI)         │      └──────────────────────┘
│   checkProposal · ruleChecks · slotMap  │
│   fallback() → earliest safe plan       │
│   else ESCALATE → human decides         │
└─────────────────────────────────────────┘
 Data: scenarios.json (8 real BTS rows + synthetic limits) · airport_capacity.json (organisers' workbook)
```

| Part | Who | Where |
| --- | --- | --- |
| Proposing, countering, accepting | LLM, 3 separate calls per round, each with only its own facts | `src/prompts.js`, `api/agent.js` |
| Parsing replies (JSON only; bad shape becomes `INVALID`) | plain code | `parseReply` in `src/negotiate.js` |
| Accepting a plan: slot offered, wake gap, fuel, gate free 20 min before arrival, crew duty | plain code | `checkProposal`, `ruleChecks` in `src/checker.js` |
| Passenger connection (soft: warning only, never blocks) | plain code | `connectionStatus` |
| 3-round limit, fallback, escalation, reason text | plain code | `runNegotiation`, `fallback` |
| Building a scenario from any CSV row | plain code | `src/scenarioFromRow.js` |
| Final decision | human | Approve / Reject / take over |

The stack is Vue 3, Vite and Bootstrap 5.3 with a custom signage theme in Hanken Grotesk and JetBrains Mono (see `DESIGN.md`), one Vercel serverless function, and Anthropic Claude through `@anthropic-ai/sdk`. There's no database: the scenarios are JSON files and the log is downloaded in the browser.

On security: `/api/agent` never accepts prompt text. The browser only sends a role, a scenario reference and the negotiation so far. The server rebuilds the scenario, cleans up the history and recomputes every checker verdict before it builds the prompt, so nobody can use the endpoint as a free Claude proxy or fake a verdict. The model and `max_tokens` (300) are fixed on the server. There's no rate limit, so put a spending limit on your API key.

## Setup (about 2 minutes)

You need Node.js 20.19+ or 22.12+, an Anthropic API key and a free Vercel account. `vercel dev` asks you to log in and link a project the first time you run it.

```bash
git clone https://github.com/eujean-s/agents-app.git
cd agents-app
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env   # your key; .env is git-ignored
npx vercel dev                               # app + /api/agent on http://localhost:3000
```

Open http://localhost:3000, pick S1 and press Run negotiation. S6 shows an escalation, and Custom lets you paste any `flights.csv` row.

You can also run these in a second terminal:

```bash
node scripts/evaluate.js 3                         # every scenario 3x against ground truth (uses the API)
node scripts/impact.js path/to/flights.csv 500     # impact measures, plain code, no API calls
```

## Evaluation

`node scripts/evaluate.js 3` runs every scenario 3 times: 24 runs on `claude-sonnet-5-5`, with max 3 rounds and the 20 min gate notice. A run counts as a mismatch if a feasible scenario ends outside `ground_truth.safe_options`, or an infeasible one doesn't end in ESCALATE.

- Consensus on S1-S5: 15/15, in 1.8 rounds on average. The checker blocked 0 proposals and the fallback was used 0 times.
- Correct escalations on S6-S8: 9/9. Mismatches: 0/24.
- 12 of the 15 plans missed the passenger connection, which is a soft warning. In S2-S5 even the earliest safe slot misses it, so that's a trade-off for the human to make rather than a failed negotiation.

Some caveats. N=3 is small, and LLM output changes from run to run. I've run all 24 twice, once before and once after moving the prompts to the server, and got the same totals both times. That's two samples, which isn't proof it's stable. The checker also enforces the same rules I used to compute `ground_truth`, so 0 mismatches shows the safety net holds. It isn't independent validation.

### Where it fails

- S6 is infeasible because of my numbers, not reality. The real flight landed 112 min late, but my assumed fuel only leaves 40 min of holding and every runway slot is later than that. The agents do escalate correctly, but they talk about "diverting", which the model can't actually do. Only the plain-code fallback turns that into a clean ESCALATE.
- The agents agreeing doesn't make a plan safe. In earlier runs they reached consensus on unsafe S7 plans, and the checker blocked 1-3 per run. The latest run had none, which is just run-to-run variation, not a fix.
- The agents lean on the real numbers. ATC sometimes cites the recorded delay ("matching the ~112 min delay") instead of what's safe.
- Agent text can contradict the checker. In one S1 run the pilot said the connection was "still at risk" while the checker showed it was protected. That's why agent text is labelled unverified.

## Impact

`scripts/impact.js` is plain code and reproducible. It takes every 717th row of `flights.csv` (358,774 rows, 500 sampled) and builds a scenario from each one with the same builder as the Custom option.

| Measure | 500 real flights | S1-S8 |
| --- | --- | --- |
| Resolved automatically (checked plan to approve) | 434/500 (86.8%) | 5/8 |
| Escalated to the duty manager | 66/500 (13.2%) | 3/8 |
| Single-party plan (ATC's earliest slot + first free gate, no cross-check) breaks a rule | 500/500 | 8/8 |
| Delay saved vs a cautious planner taking the latest safe slot | mean 10 min (about $1,005) | mean 9 min |

Not all of these numbers mean much, so here's how I'd read them:

- Resolved vs escalated is the result that matters. It depends on each flight's real recorded weather and air-system delay against the workbook's fuel rule. The claim I'd make is: on 500 real disrupted flights, the tool produced a safety-checked plan for 87% and sent 13% to the duty manager. The slots and gates behind that are still synthetic.
- The 100% single-party failure rate comes from how I generate scenarios, so it isn't a finding. The first gate opens when the first slot arrives, so with 20 min notice the earliest slot always fails GATE. It shows the checker catches that conflict, not how often it happens in real life.
- "10 min / $1,005 saved" is only an illustration. It comes from my assumed slot spacing and fuel limit, measured against a baseline I picked.
- I haven't measured how long phone coordination takes today, so I can't say how much time this saves per disruption.

Delay cost sources: $100.76 per block minute for US passenger airlines in 2024 ([A4A](https://airlines.org/dataset/u-s-passenger-carrier-delay-costs/)); about $33 B a year in total US delay cost in 2019 (FAA/NEXTOR via [A4A](https://www.airlines.org/dataset/u-s-)); $32.9 B in 2007, of which $8.3 B fell on airlines and $16.7 B on passengers ([FAA Total Delay Impact Study](https://rosap.ntl.bts.gov/view/dot/6234)).

## Data: real vs assumed

| | Source |
| --- | --- |
| Real | Flight, route, date, scheduled and actual times, all delay causes, taxi times: BTS 2015 rows (8 curated scenarios, `csv_row` = row number; or any pasted `flights.csv` row) |
| Rules (organisers' `challenge2_operational_constraints.xlsx`, synthetic planning limits) | Gate change notice 20 min; Heavy-follows-Heavy wake spacing 120 s; 30 min final reserve + 45 min spare holding; 13 h crew duty; per-airport runway movements, spare gates, turnaround |
| Assumed by me | Runway slots offered, heavy arrivals, gate IDs and free times, fuel on board for curated scenarios (100 / 45 min, before the workbook was released), crew report time, passenger connection times |

| Scenario | Flight | Truth |
| --- | --- | --- |
| S1 | AA 2229 TUS-DFW | feasible (earliest slot wake-blocked) |
| S2 | MQ 3167 BNA-LGA | feasible |
| S3 | UA 646 ORD-EWR | feasible (earliest slot wake-blocked) |
| S4 | WN 1998 SAN-DEN | feasible |
| S5 | DL 795 GRR-MSP | feasible (earliest slot wake-blocked) |
| S6 | OO 2752 SAT-PHX | infeasible (FUEL, GATE) |
| S7 | US 561 PHX-LAS | infeasible (FUEL, GATE) |
| S8 | AS 37 MSP-SEA | infeasible (CREW, GATE) |

The delays in the scenarios are real, but the constraints that decide whether a plan works are my assumptions. So this shows how the negotiation and the safety check work, not whether these plans would work at a real airport. Custom rows also treat the whole delay as airborne holding, so rows with long delays escalate more often than they would in practice.

## What went wrong along the way

- The order of the JSON fields broke negotiations. My first wake-separation run got 10/15 consensus and 9 unparseable replies. With `delay_min` before `message` in the reply schema, ATC would commit to a wake-blocked slot and only then "change its mind" in the text, so the numbers stopped matching. Putting `message` first, so it reasons before it commits, fixed it: 14/15 with 0 errors.
- The rules changed in the middle of the hackathon. The organisers' update added a 20 min gate change notice, and suddenly 4 of my 5 feasible scenarios were infeasible. I switched to the official rule and moved the synthetic gate times 20 min earlier, so each scenario's ground truth stays the same under the new rule. I checked all 8.
- My first version of the API forwarded any prompt, which made it a free Claude proxy. Prompts are now built on the server from a scenario reference and checker lines are recomputed, so you can't inject either.
- The brief says to pick any row, but my first demo only had hard-coded scenarios. I wrote a plain-code builder that turns any `flights.csv` row into a scenario using the workbook, and lists every remaining assumption for that row.
- I nearly claimed a number I shouldn't have. The impact script's 100% figure looked great until I realised my scenario generator produces it by design, so the README explains that instead of claiming it.

## What I'd do with 3 more weeks

- Use real constraints instead of synthetic ones: airport operational data (gate schedules, slot allocations) and FAA ASPM arrival rates, so feasibility reflects real operations.
- Have each party run its own agent on its own data and infrastructure, sharing only offers. That's the real version of the information separation this demo simulates.
- Time real phone coordination with ops staff, to get the before/after baseline this project is missing.
- Add more of the brief's constraints: taxiway blockage, turbulence, ground-crew overtime, turnaround cost, and several flights competing for the same slots.
- Harden it for production with authentication, rate limiting and proper storage for the consensus logs.

## License

MIT. See [LICENSE](LICENSE).

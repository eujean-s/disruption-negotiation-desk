p='src/App.vue'
t=open(p).read()
# ---- script: drop what the old layout needed, add sign state
a=t.index("// Headline facts for the human"); b=t.index("// Messages and checker verdicts grouped")
t=t[:a]+t[b:]
t=t.replace("const route = computed(() => scenario.value && { from: scenario.value.source.ORIGIN_AIRPORT, to: scenario.value.source.DESTINATION_AIRPORT })\n","")
a=t.index("const status = computed(() => {"); b=t.index("const messageCount = computed")
t=t[:a]+t[b:]
a=t.index("const roleMeta = {"); b=t.index("function decide(verdict)")
t=t[:a]+'''const roleName = { ATC: 'Air traffic control', PILOT: 'Pilot', GROUND: 'Ground ops' }
const triggerName = { WEATHER_DELAY: 'Weather delay', LATE_AIRCRAFT_DELAY: 'Late aircraft', OTHER: 'Other delay' }
const stanceClass = { ACCEPT: 'is-ok', COUNTER: 'is-warn', REJECT: 'is-bad', ESCALATE: 'is-bad' }
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
  if (!s) return { state: 'none', title: 'Paste a flight', sub: 'Paste one line from flights.csv below and load it to get a plan.' }
  if (running.value) return { state: 'running', title: 'Negotiating', sub: `Round ${rounds.value.length || 1} of ${MAX_ROUNDS}. ${roleName[nextRole.value]} is replying.` }
  const o = outcome.value
  if (!o) return { state: 'idle', title: `${s.source.ORIGIN_AIRPORT} to ${s.source.DESTINATION_AIRPORT}`, sub: `${s.source.AIRLINE} ${s.source.FLIGHT_NUMBER}, scheduled ${s.scheduled_arrival_label}. Run the negotiation to get a checked plan.` }
  if (decision.value?.verdict === 'REJECTED') return { state: 'rejected', title: 'Plan rejected', sub: decision.value.note || 'The duty manager rejected this plan.', tag: o.outcome }
  if (!o.proposal) return { state: 'escalate', title: 'No safe plan', sub: 'Nothing passes the checker. A human must decide.', tag: o.outcome }
  const land = hhmm(s.scheduled_arrival_min + o.proposal.delay_min)
  return o.outcome === 'FALLBACK'
    ? { state: 'plan', title: `Land ${land}`, sub: `+${o.proposal.delay_min} min, gate ${o.proposal.gate}. No agreement, so the rules chose the earliest safe plan.`, tag: o.outcome }
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
const earliestSafe = computed(() => slots.value.find((x) => x.ok))

'''+t[b:]
# ---- template + style
t=t[:t.index('<template>')]+open('.impeccable/tmp/view.vue').read()
open(p,'w').write(t)
x=open('index.html').read()
x=x.replace('<html lang="en" data-bs-theme="dark">','<html lang="en">')
x=x.replace('Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500','Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700')
open('index.html','w').write(x)

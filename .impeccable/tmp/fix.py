p='src/App.vue'
t=open(p).read()
R=[
# 2 neutral stances
("const stanceClass = { ACCEPT: 'is-ok', COUNTER: 'is-warn', REJECT: 'is-bad', ESCALATE: 'is-bad' }\n",""),
("""<span class="mono" :class="stanceClass[e.type]">{{ stanceLine(e) }}</span>""","""<span class="mono">{{ stanceLine(e) }}</span>"""),
# 7 rejected state data
("sub: decision.value.note || 'The duty manager rejected this plan.', tag: o.outcome }","sub: decision.value.note || 'The duty manager rejected this plan.', tag: 'REJECTED' }"),
# 1 fallback state, 6 honest counts, 4 positions, 5 causes, 7 chosen
("const earliestSafe = computed(","""const replyCount = computed(() => events.value.filter((e) => e.kind === 'message' && e.type !== 'ERROR' && e.type !== 'INVALID').length)
const isFallback = computed(() => outcome.value?.outcome === 'FALLBACK' && sign.value.state === 'plan')
// The plan still in force: a rejected plan is no longer chosen anywhere on screen.
const chosenDelay = computed(() => (decision.value?.verdict === 'REJECTED' ? null : outcome.value?.proposal?.delay_min ?? null))
// Each party's latest offer, so convergence shows on the sign while the negotiation runs.
const positions = computed(() => ROLES.map((role) => {
  const last = events.value.filter((e) => e.kind === 'message' && e.role === role).at(-1)
  return { role, offer: last ? [last.delay_min !== null ? `+${last.delay_min}` : null, last.gate].filter(Boolean).join(' ') || last.type : '--' }
}))
const recordedCauses = computed(() => {
  const r = scenario.value?.source
  if (!r) return ''
  const parts = [['WEATHER_DELAY', 'weather'], ['LATE_AIRCRAFT_DELAY', 'late aircraft'], ['AIR_SYSTEM_DELAY', 'air system'], ['AIRLINE_DELAY', 'airline'], ['SECURITY_DELAY', 'security']]
  return parts.filter(([k]) => r[k] > 0).map(([k, label]) => `${r[k]} min ${label}`).join(', ')
})
const earliestSafe = computed("""),
# template: fallback band + tile + positions
("""  <section class="sign" :class="'sign-' + sign.state" aria-live="polite">
""","""  <section class="sign" :class="'sign-' + sign.state" aria-live="polite">
    <p v-if="isFallback" class="sign-band" :class="{ 'sign-band-alert': noAgentReplied }">
      {{ noAgentReplied ? 'Rules only: no agent replied' : 'Rule-based plan: the agents did not agree' }}
    </p>
"""),
("""<span v-else class="tile-code mono">{{ outcome?.proposal?.gate || '--' }}</span>""","""<span v-else class="tile-code mono">{{ (sign.state !== 'rejected' && outcome?.proposal?.gate) || '--' }}</span>"""),
("""      <p v-if="outcome?.connection && sign.state === 'plan'\"""","""      <div v-if="sign.state === 'running'" class="parties">
        <div v-for="p in positions" :key="p.role" class="party">
          <span>{{ roleName[p.role] }}</span>
          <strong class="mono">{{ p.offer }}</strong>
        </div>
      </div>
      <p v-if="outcome?.connection && sign.state === 'plan'\""""),
("""<p v-else-if="outcome?.reason && outcome.outcome === 'FALLBACK'" class="sign-note">""","""<p v-else-if="outcome?.reason && outcome.outcome === 'FALLBACK' && !noAgentReplied" class="sign-note">"""),
("""round {{ outcome.round }} of {{ MAX_ROUNDS }} · {{ messageCount }} messages</p>""","""round {{ outcome.round }} of {{ MAX_ROUNDS }} · {{ replyCount ? replyCount + ' agent replies' : 'no agent replies' }}</p>"""),
# decided
("""        <svg class="i" aria-hidden="true"><use :href="decision.verdict === 'REJECTED' ? '#i-cross' : '#i-check'"/></svg>
        <div>
          <strong>{{ decision.verdict === 'APPROVED' ? 'Approved' : decision.verdict === 'REJECTED' ? 'Rejected' : 'Taken over' }} by duty manager</strong>
          <div class="mono">{{ new Date(decision.at).toLocaleTimeString() }}</div>
        </div>""","""        <svg class="i" aria-hidden="true"><use :href="decision.verdict === 'REJECTED' ? '#i-cross' : '#i-check'"/></svg>
        <div>
          <strong>{{ decision.verdict === 'APPROVED' ? 'Approved' : decision.verdict === 'REJECTED' ? 'Rejected' : 'Taken over' }}</strong>
          <div>By duty manager, <span class="mono">{{ new Date(decision.at).toLocaleTimeString('en-GB') }}</span></div>
        </div>"""),
# strip truth
("""      <div><dt>Flight</dt>""","""      <div><dt>Source</dt><dd>2015 flight record</dd></div>
      <div><dt>Flight</dt>"""),
("""      <div><dt>Cause</dt><dd>{{ triggerName[scenario.trigger] }}</dd></div>""","""      <div><dt>Recorded causes</dt><dd>{{ recordedCauses }}</dd></div>"""),
("""<p class="strip-note">Minutes of delay, computed by the checker, not the agents.</p>""","""<p class="strip-note">Minutes of delay. Assumed for this demo: {{ scenario.custom ? 'slots, gates and heavy traffic' : 'slots, gates, fuel and heavy traffic' }}. The agents do not set any of it.</p>"""),
("""outcome?.proposal?.delay_min === sl.delay_min ? 'is-chosen' : ''""","""chosenDelay === sl.delay_min ? 'is-chosen' : ''"""),
# slots table
("""<tr v-for="sl in slots" :key="sl.delay_min" :class="{ chosen: outcome?.proposal?.delay_min === sl.delay_min }">""","""<tr v-for="sl in slots" :key="sl.delay_min" :class="{ chosen: chosenDelay === sl.delay_min }">"""),
("""            <td class="mono" :class="sl.ok ? 'is-ok' : 'is-bad'">
              <svg class="i" aria-hidden="true"><use :href="sl.ok ? '#i-check' : '#i-cross'"/></svg>
              {{ sl.ok ? sl.gate : sl.violations.join(' ') }}
            </td>""","""            <td class="mono result">
              <template v-if="sl.ok">
                <svg class="i is-ok" aria-hidden="true"><use href="#i-check"/></svg>
                <span class="gate-chip">{{ sl.gate }}</span>
                <span v-if="chosenDelay === sl.delay_min" class="chosen-word">chosen</span>
              </template>
              <template v-else>
                <svg class="i is-bad" aria-hidden="true"><use href="#i-cross"/></svg>
                <span class="is-bad">{{ sl.violations.join(' ') }}</span>
              </template>
            </td>"""),
# css
(".sign { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(15rem, auto); gap: 2.5rem; align-items: center;",".sign { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(15rem, auto); gap: 1.5rem 2.5rem; align-items: start; align-content: start;"),
("min-height: 15.5rem;","min-height: 17.5rem;"),
(".sign-rejected { background: #2a2d31; color: #fff; }",""".sign-rejected { background: var(--panel); }
.sign-rejected .tile { color: #8a8d90; }
.sign-band { grid-column: 1 / -1; margin: -0.5rem 0 0; padding: 0.625rem 1rem; background: var(--ink); color: var(--sign); border-radius: 4px; font-size: 2rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.02em; }
.sign-band-alert { background: var(--bad); color: #fff; }
.parties { display: grid; grid-template-columns: repeat(3, minmax(0, 11rem)); gap: 0.5rem; margin-top: 0.75rem; }
.party { display: flex; flex-direction: column; padding: 0.5rem 0.75rem; background: var(--ink); color: #fff; border-radius: 4px; font-size: 0.875rem; }
.party strong { color: var(--sign); font-size: 1.25rem; white-space: nowrap; }"""),
(".sign-escalate .tag, .sign-rejected .tag { color: #fff; }\n.sign-rejected .tag { background: #000; }\n",".sign-escalate .tag { color: #fff; }\n.sign-rejected .tag { color: #fff; }\n"),
(".decided { display: flex; gap: 0.625rem; align-items: flex-start; font-size: 1rem; }\n.decided .i { width: 1.75rem; height: 1.75rem; flex: none; }",".decided { display: flex; gap: 0.75rem; align-items: flex-start; font-size: 1rem; }\n.decided strong { display: block; font-size: 2.25rem; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }\n.decided .i { width: 2.25rem; height: 2.25rem; flex: none; }"),
(".sign-escalate :focus-visible, .sign-rejected :focus-visible { outline-color: #fff; }",".sign-escalate :focus-visible { outline-color: #fff; }"),
(".tl-slot { position: absolute; top: 1.1rem;",".tl-slot { position: absolute; z-index: 1; top: 0.975rem;"),
(".tl-gate { position: absolute; top: 5.25rem;",".tl-gate::before, .tl-heavy-label::before { content: ''; position: absolute; left: 50%; bottom: 100%; width: 1px; background: #7d8187; }\n.tl-gate::before { height: 2.05rem; }\n.tl-heavy-label::before { height: 3.4rem; }\n.tl-gate { position: absolute; top: 5.25rem;"),
(".panel { background: var(--panel); border-radius: 6px; padding: 1.25rem; }\n.panel h2, .sources h2 { margin: 0 0 0.75rem; font-size: 1.125rem; font-weight: 700; }\n.panel-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }\n.panel-head h2 { margin: 0; }",""".panel { background: var(--panel); border-radius: 6px; padding: 1.25rem; overflow: hidden; }
.sources h2 { margin: 0 0 0.75rem; font-size: 1.125rem; font-weight: 700; }
.panel h2 { margin: -1.25rem -1.25rem 0.75rem; padding: 0.75rem 1.25rem; background: var(--ink); color: #fff; font-size: 1.125rem; font-weight: 700; }
.panel-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; margin: -1.25rem -1.25rem 0.75rem; padding: 0.4375rem 1.25rem; background: var(--ink); }
.panel-head h2 { margin: 0; padding: 0; background: none; }
.panel-head .quiet { --bs-btn-color: #fff; --bs-btn-border-color: #8a8d90; --bs-btn-hover-color: var(--ink); --bs-btn-hover-bg: var(--sign); --bs-btn-hover-border-color: var(--sign); --bs-btn-active-color: var(--ink); --bs-btn-active-bg: var(--sign); --bs-btn-active-border-color: var(--sign); }
.panel-head :focus-visible { outline-color: var(--sign); }"""),
(".slots td { padding: 0.625rem 0.5rem; border-top: 1px solid var(--line); font-size: 1rem; }\n.slots .chosen td { background: var(--sign-tint); font-weight: 700; }",""".slots td { padding: 0.625rem 0.5rem; border-top: 1px solid var(--line); font-size: 1.125rem; }
.slots .chosen td { background: var(--sign); font-weight: 700; }
.result { white-space: nowrap; }
.gate-chip { display: inline-block; margin-left: 0.25rem; padding: 0 0.375rem; background: var(--ink); color: var(--sign); border-radius: 3px; font-size: 0.9375rem; font-weight: 700; }
.chosen-word { margin-left: 0.375rem; font-family: var(--sans); font-size: 0.9375rem; font-weight: 700; }
.slots .chosen .is-ok { color: var(--ink); }"""),
(".sources ul { margin: 0; padding-left: 1.125rem; color: #33373b; font-size: 0.9375rem; }\n.sources li { margin-bottom: 0.25rem; }",""".sources h3 { padding-bottom: 0.375rem; border-bottom: 3px solid var(--ink); }
.sources ul { list-style: none; margin: 0; padding: 0; color: #33373b; font-size: 0.9375rem; }
.sources li { padding: 0.5rem 0; border-bottom: 1px solid var(--line); }"""),
("  .act .btn { flex: 1 1 12rem; }\n","  .act .go { flex: 2 1 12rem; }\n  .act .ghost { flex: 1 1 8rem; min-height: 2.75rem; }\n"),
("  .tile-code, .tile-wide .tile-code { font-size: 2.5rem; }\n  .tile-icon, .tile-wait { height: 2.5rem; width: 2.5rem; }\n  .sign-title { font-size: 3.25rem; }\n","  .tile-code, .tile-wide .tile-code { font-size: 3.25rem; }\n  .tile-icon, .tile-wait { height: 3.25rem; width: 3.25rem; }\n  .sign-title { font-size: 4.25rem; }\n  .sign-band { font-size: 1.5rem; }\n  .parties { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n  .party strong { font-size: 1rem; white-space: normal; }\n"),
]
for a,b in R:
    assert a in t, 'MISSING: '+a[:70]; t=t.replace(a,b)
t=t.replace("const messageCount = computed(() => events.value.filter((e) => e.kind === 'message').length)\n\n","")
assert 'messageCount' not in t and 'stanceClass' not in t
open(p,'w').write(t)

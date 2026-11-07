import re
p='src/App.vue'
t=open(p).read()
R=[
# 5 picker: no single-cause label above the recorded causes
("""{{ s.id }} · {{ s.flight }} · {{ triggerName[s.trigger] }}</option>""","""{{ s.id }} · {{ s.flight }}</option>"""),
("const triggerName = { WEATHER_DELAY: 'Weather delay', LATE_AIRCRAFT_DELAY: 'Late aircraft', OTHER: 'Other delay' }\n",""),
# 8 band below the text
("""    <p v-if="isFallback" class="sign-band" :class="{ 'sign-band-alert': noAgentReplied }">
      {{ noAgentReplied ? 'Rules only: no agent replied' : 'Rule-based plan: the agents did not agree' }}
    </p>
""",""),
# parties move to the third column
("""      <div v-if="sign.state === 'running'" class="parties">
        <div v-for="p in positions" :key="p.role" class="party">
          <span>{{ roleName[p.role] }}</span>
          <strong class="mono">{{ p.offer }}</strong>
        </div>
      </div>
""",""),
("""    <div v-if="outcome" class="act">""","""    <div v-if="sign.state === 'running'" class="parties">
      <div v-for="p in positions" :key="p.role" class="party">
        <span>{{ roleName[p.role] }}</span>
        <strong class="mono">{{ p.offer }}</strong>
      </div>
    </div>

    <div v-if="outcome" class="act">"""),
# stat moves to the act column
("""      <p v-if="outcome" class="sign-stat mono">Decided in {{ elapsedS ?? '…' }} s · round {{ outcome.round }} of {{ MAX_ROUNDS }} · {{ replyCount ? replyCount + ' agent replies' : 'no agent replies' }}</p>
""",""),
("""      <button v-else class="btn go" @click="decide('TAKEN_OVER')">I'll handle it manually</button>
    </div>
""","""      <button v-else class="btn go" @click="decide('TAKEN_OVER')">I'll handle it manually</button>
      <p class="sign-stat mono">Decided in {{ elapsedS ?? '…' }} s · round {{ outcome.round }} of {{ MAX_ROUNDS }} · {{ replyCount ? replyCount + ' agent replies' : 'no agent replies' }}</p>
    </div>

    <p v-if="isFallback" class="sign-band" :class="{ 'sign-band-alert': noAgentReplied }">
      {{ noAgentReplied ? 'Rules only: no agent replied' : 'Rule-based plan: the agents did not agree' }}
    </p>
"""),
# ticks only where they do not run into a slot's own label
("""class="tl-gate mono" :style="{ left: timeline.pos(g.at) }">""","""class="tl-gate mono" :class="{ 'has-tick': !slots.some((x) => Math.abs(x.delay_min - g.at) < timeline.max * 0.05) }" :style="{ left: timeline.pos(g.at) }">"""),
# css
("min-height: 17.5rem;","min-height: 16.1rem;"),
(".sign-band { grid-column: 1 / -1; margin: -0.5rem 0 0;",".sign-band { grid-column: 1 / -1; margin: 0;"),
(".parties { display: grid; grid-template-columns: repeat(3, minmax(0, 11rem)); gap: 0.5rem; margin-top: 0.75rem; }",".parties { display: grid; gap: 0.5rem; width: 17rem; }"),
(".party { display: flex; flex-direction: column; padding: 0.5rem 0.75rem;",".party { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; padding: 0.75rem;"),
(".sign-stat { margin-top: 0.5rem !important; font-size: 0.875rem; }",".sign-stat { margin: 0; font-size: 0.875rem; }"),
(".tl-gate::before, .tl-heavy-label::before { content: ''; position: absolute; left: 50%; bottom: 100%; width: 1px; background: #7d8187; }\n.tl-gate::before { height: 2.05rem; }\n.tl-heavy-label::before { height: 3.4rem; }",".tl-gate.has-tick::before { content: ''; position: absolute; left: 50%; bottom: 100%; width: 1px; height: 2.05rem; background: #7d8187; }\n.tl-heavy-label::before { content: ''; display: inline-block; width: 0.5rem; height: 0.5rem; margin-right: 0.375rem; background: #fff; transform: rotate(45deg); vertical-align: 0.0625rem; }"),
(".panel h2 { margin: -1.25rem -1.25rem 0.75rem; padding: 0.75rem 1.25rem;",".panel h2 { display: flex; align-items: center; min-height: 3.1875rem; margin: -1.25rem -1.25rem 0.75rem; padding: 0 1.25rem;"),
(".panel-head h2 { margin: 0; padding: 0; background: none; }",".panel-head h2 { min-height: 0; margin: 0; padding: 0; background: none; }"),
(".panel-head { min-height: 3.1875rem; }",""),
("margin: -1.25rem -1.25rem 0.75rem; padding: 0.4375rem 1.25rem; background: var(--ink); }","min-height: 3.1875rem; margin: -1.25rem -1.25rem 0.75rem; padding: 0.25rem 1.25rem; background: var(--ink); }"),
(".slots { width: 100%; }",".slots { width: 100%; table-layout: fixed; }\n.slots th:nth-child(1) { width: 18%; }\n.slots th:nth-child(2) { width: 19%; }\n.slots th:nth-child(3) { width: 22%; }"),
(".result { white-space: nowrap; }",""),
("  .act .go { flex: 2 1 12rem; }\n","  .parties, .sign-band { grid-column: 1 / -1; }\n  .parties { width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); }\n  .party { flex-direction: column; gap: 0; }\n  .sign-stat { flex: 1 1 100%; }\n  .act .go { flex: 2 1 12rem; }\n"),
("  .parties { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n  .party strong { font-size: 1rem; white-space: normal; }\n","  .party strong { font-size: 1rem; white-space: normal; }\n"),
("@media (max-width: 1199px) {\n","@media (max-width: 1399px) {\n  .slots td { font-size: 1rem; padding-inline: 0.375rem; }\n  .slots th { padding-inline: 0.375rem; }\n}\n@media (max-width: 1199px) {\n"),
]
for a,b in R:
    assert a in t, 'MISSING: '+a[:70]; t=t.replace(a,b)
assert 'triggerName' not in t
open(p,'w').write(t)
# capture: real offers converging while running, plus a phone capture
p=__import__('sys').argv[1]
s=open(p).read()
a="if (mode === 'hang' && b.log.length >= 2) await new Promise(() => {})"
assert a in s
s=s.replace(a,"""if (mode === 'hang') {
      if (b.log.length >= 5) await new Promise(() => {})
      const late = b.log.length >= 3, A0 = b.role === 'ATC', G0 = b.role === 'GROUND'
      const hangReply = m(late ? 'COUNTER' : A0 ? 'PROPOSE' : G0 ? 'COUNTER' : 'ACCEPT', late ? 20 : G0 ? 20 : 10, G0 ? 'B10' : null, late ? 'Moving to the slot ground can serve.' : G0 ? 'No gate is ready that early. B10 works at this delay.' : 'That delay works from my side of the plan.')
      return new Response(JSON.stringify({ text: JSON.stringify(hangReply) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }""")
a="await size(390, 844); await load(); await runIt('20:B10'); await shot('mobile')"
assert a in s
s=s.replace(a,a+"\nawait load(); await runIt('hang', false); await shot('s-mobile-running', false)")
open(p,'w').write(s)

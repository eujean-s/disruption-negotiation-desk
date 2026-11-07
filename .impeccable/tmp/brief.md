# Surface brief: negotiation desk (src/App.vue)

Scope: the single-screen app. Mode: Operate. Replaces the previous dark world.

Task: the duty manager picks a disruption, runs the negotiation, reads the plan and why it won, then approves, rejects or takes over. Reads at a glance: gate, landing time, delay, verdict.

Constraints: keep Hanken Grotesk and JetBrains Mono (user-pinned). Must not be bland. Keep every function: scenario picker, custom row, timeline, log, rule checks, assumptions, decision, download. Honest labels stay.

## Direction contract

THESIS: The decision is a terminal sign, readable from across the room: gate, landing time, verdict. It refuses the grey dashboard of metric cards.

OWN-WORLD: Signage yellow fields and black sign panels on a pale neutral ground. Black gate tiles with yellow codes. Green and red only for verdicts. Heavy Hanken Grotesk for sign lines; JetBrains Mono for times, gates and rule codes. Standard web controls throughout.

STORY: The manager sees what is disrupted, presses Run, watches three parties converge, reads one sign, checks the rule evidence, and decides. When nothing is safe, the sign says so in red and hands over.

FIRST VIEWPORT: Black top bar: name, disruption select, Run. Full-width sign beneath: black gate tile left, "Land 16:08" at about 96px, delay and rule summary under it, Approve at right. Below, three panels: landing slots with fuel limit, rule checks, negotiation log.

FORM: Airport Wayfinding, first on the ordered grounded list, taken as the user's pick. seed:cc74dd0c49473de0. Signature move: the sign changes state (waiting, negotiating, consensus, fallback, escalate) in one place, at sign scale.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

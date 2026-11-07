---
name: Disruption Negotiation Desk
description: Airport-wayfinding signage for a duty manager settling one disrupted arrival.
colors:
  sign: "#ffd400"
  sign-hover: "#ffe14d"
  sign-press: "#e6bf00"
  ink: "#111316"
  ink-press: "#000000"
  ground: "#efefe9"
  panel: "#ffffff"
  line: "#d9d9d2"
  muted: "#575b60"
  steel: "#8a8d90"
  ok: "#0a6e37"
  ok-tint: "#e3f3e8"
  warn: "#855400"
  bad: "#bf1d10"
  bad-tint: "#fbe7e4"
  on-ink: "#ffffff"
  on-ink-muted: "#bcc0c5"
  on-ink-ok: "#4ade80"
  on-ink-bad: "#ff7063"
typography:
  display:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "6rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  decision:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  band:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  subline:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.3
  action:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.5
  title:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
  tile-code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "3.625rem"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum, zero"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum, zero"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.5
    fontFeature: "tnum, zero"
rounded:
  chip: "3px"
  control: "4px"
  panel: "6px"
  dot: "50%"
spacing:
  gutter: "clamp(1rem, 2.5vw, 2rem)"
  row: "0.625rem"
  cell: "0.75rem"
  panel: "1.25rem"
  section: "1.5rem"
  sign: "2rem"
  sign-column: "2.5rem"
components:
  button-run:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.375rem 1.5rem"
  button-run-hover:
    backgroundColor: "{colors.sign-hover}"
  button-run-active:
    backgroundColor: "{colors.sign-press}"
  button-approve:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "1rem 0.75rem"
  button-approve-hover:
    backgroundColor: "{colors.ink-press}"
  button-approve-escalate:
    backgroundColor: "{colors.on-ink}"
    textColor: "{colors.ink}"
  button-approve-escalate-hover:
    backgroundColor: "{colors.sign}"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.25rem 0.5rem"
  button-quiet:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.25rem 0.5rem"
  button-quiet-hover:
    backgroundColor: "{colors.ground}"
  button-quiet-on-ink:
    textColor: "{colors.on-ink}"
  button-quiet-on-ink-hover:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.ink}"
  input-field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.375rem 0.75rem"
  top-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sign}"
    typography: "{typography.title}"
    padding: "0.75rem clamp(1rem, 2.5vw, 2rem)"
  sign:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    padding: "2rem clamp(1rem, 2.5vw, 2rem)"
  sign-escalate:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.on-ink}"
  sign-rejected:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  gate-tile:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sign}"
    typography: "{typography.tile-code}"
    rounded: "{rounded.panel}"
    padding: "0.75rem 1.25rem"
    size: "10rem"
  party-tile:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.control}"
    padding: "0.75rem"
  status-tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sign}"
    typography: "{typography.code}"
    rounded: "{rounded.chip}"
    padding: "0.125rem 0.5rem"
  gate-chip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sign}"
    rounded: "{rounded.chip}"
    padding: "0 0.375rem"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "1.25rem"
  panel-header:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.title}"
    padding: "0 1.25rem"
    height: "3.1875rem"
  chosen-row:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.ink}"
  verdict-pass:
    backgroundColor: "{colors.ok-tint}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  verdict-block:
    backgroundColor: "{colors.bad-tint}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  flight-strip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    padding: "1rem clamp(1rem, 2.5vw, 2rem) 0.75rem"
---

# Design System: Disruption Negotiation Desk

## Overview

**Creative North Star: "The Terminal Sign"**

The decision is a terminal sign, readable from across the room: gate, landing time, verdict. A signage-yellow field and black sign panels sit on a pale neutral ground, the way airport wayfinding sits in a concourse. The top of the screen says one thing at enormous scale, and everything beneath it is the evidence for that one thing.

Density rises as the eye descends. The sign reads at a glance; the black flight strip plots every constraint on one axis of delay; the white panels carry rule evidence and the negotiation log at reading size; the plain list at the bottom accounts for where each value came from. The controls stay ordinary Bootstrap web controls, recoloured. The character comes from colour fields, scale and heavy type, never from custom control behaviour.

The system refuses the grey dashboard of metric cards. It also stays honest when the news is bad: when nothing is safe, the same sign turns red and says so at the same size.

**Key Characteristics:**
- Yellow and black carry the identity; green and red only report the result of a check.
- One sign, at the top, holds every decision state and changes in place.
- Hanken Grotesk at weight 800 for sign lines; JetBrains Mono with slashed zero for machine values.
- Flat, full-bleed colour fields with small, firm corners on the objects inside them.
- Standard web controls throughout, restyled through Bootstrap 5.3 variables.

## Colors

A high-contrast signage palette: one saturated yellow, one near-black, a pale warm ground, and verdict colours that appear only when something has been checked.

### Primary
- **Signage Yellow** (#ffd400): the sign field, the chosen row in the slots table, the chosen timeline dot, the Run action, and type on black (brand name, gate codes, offers). Ink on it measures 13:1.
- **Sign Hover** (#ffe14d) and **Sign Press** (#e6bf00): hover and pressed fills for the Run action only.

### Secondary
- **Sign Black** (#111316): body text, the top bar, the flight strip, panel headers, gate tiles, tags, chips and the Approve action. Its role is material as much as text colour: black panels are half the identity.
- **Pure Black** (#000000): hover and pressed fill for the Approve action.

### Tertiary
- **Verdict Green** (#0a6e37) on **Pass Tint** (#e3f3e8): passed rule codes, safe-slot ticks and the checker-passed callout on light surfaces.
- **Verdict Red** (#bf1d10) on **Block Tint** (#fbe7e4): blocked slots, failed rule codes and the checker-blocked callout. As a full field it is the escalate sign, with white type at 6.2:1.
- **Warning Umber** (#855400): the soft missed-connection warning in the log.
- **Signal Green** (#4ade80) and **Signal Red** (#ff7063): the same verdicts on black, in the flight strip. Both clear 6.8:1 on Sign Black.

### Neutral
- **Terminal Ground** (#efefe9): page background, native field fill, code blocks and skeleton bars.
- **Panel White** (#ffffff): evidence panels, the paste row, and the rejected sign, which drains to white when a plan is refused.
- **Hairline** (#d9d9d2): row dividers inside panels and lists, never a box around a panel.
- **Quiet Grey** (#575b60): secondary text, table headers, notes and message metadata.
- **Steel** (#8a8d90): quiet button borders, the scrollbar thumb, and the dead gate code on a rejected sign.
- **On Ink** (#ffffff): text on black and on the red field.
- **On Ink Muted** (#bcc0c5): labels, ticks and notes in the flight strip.

### Named Rules
**The Sign Field Rule.** A yellow fill means the decision, the chosen option, or the one action that starts a run: the sign, the chosen row, the chosen timeline dot and the Run button. Everywhere else yellow is type on black or an interactive state on black or red.

**The Verdict Color Rule.** Green and red report the result of a check: a passed or blocked rule, a safe or blocked slot, an accepted or refused input, or the hard limit a check enforces, such as the hatched fuel limit. They are never decoration, category colour or brand.

**The One Sign Rule.** Decision state is stated once, at sign scale, by changing the sign itself: yellow while waiting, negotiating or holding a plan; red when nothing is safe; white when a plan is rejected. Add to the sign rather than raising a toast or a second banner. The black band announcing a rule-based plan lives inside the sign for this reason.

## Typography

**Display Font:** Hanken Grotesk (with ui-sans-serif, system-ui)
**Body Font:** Hanken Grotesk (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace)

**Character:** Both families are user-pinned. A warm, heavy grotesque speaks in plain sign language while a slashed-zero mono marks what a machine produced, so the two voices separate prose from data at a glance.

### Hierarchy
- **Display** (800, 6rem, line-height 1, -0.03em, tabular numerals): the sign line only, such as "Land 16:08" or "No safe plan". Steps to 4.5rem at 1199px and below, 4.25rem at 767px and below.
- **Decision** (800, 2.25rem, 1.1, -0.02em): the recorded human decision beside the sign.
- **Band** (800, 2rem, 1.2, -0.02em): the rule-based-plan band across the sign; 1.5rem at 767px and below.
- **Subline** (600, 1.375rem, 1.3): the sentence under the sign line, capped at 62ch; 1.125rem at 767px and below.
- **Action** (700, 1.25rem): the Approve-size action.
- **Title** (700, 1.125rem): the product name in the top bar, panel headers and the sources heading.
- **Body** (400, 1rem, 1.5): log messages and sign notes (sign notes at 500, capped at 80ch).
- **Body Small** (400, 0.9375rem, 1.5): rule rows, checker callouts and the sources list.
- **Label** (500, 0.8125rem): strip labels, table headers and message metadata. Sentence case.
- **Tile Code** (JetBrains Mono 700, 3.625rem, 1.1): the gate code on the tile; 2.75rem for codes longer than four characters.
- **Data** (JetBrains Mono 400, 1rem): slots-table values; 0.9375rem at 1399px and below.
- **Code** (JetBrains Mono 700, 0.875rem): outcome tags, rule codes and agent stance lines.

### Named Rules
**The Heavy Sign Rule.** Weight 800 and negative tracking belong to sign-scale lines alone: the sign line, the band and the recorded decision. Nothing below them uses either.

**The Machine Value Rule.** Mono carries values that stand alone as data: gates, offers, rule codes, table times, dates, raw payloads. The sign line, its subline and rule evidence sentences stay in Hanken Grotesk, with tabular numerals on the sign line so a time never jitters.

**The Verbatim Code Rule.** Capitals appear only where the word itself is a system code (CONSENSUS, FALLBACK, ESCALATE, WAKE, FUEL). No text is transformed to uppercase for style; labels stay in sentence case.

## Layout

The page is a full-bleed stack with no maximum container: top bar, optional paste row, sign, flight strip, evidence panels, sources. Every band shares one fluid side gutter (`clamp(1rem, 2.5vw, 2rem)`), so edges align from top to bottom.

- **Sign:** three columns of gate tile, text and action (auto, flexible, at least 15rem), with a 1.5rem by 2.5rem gap and a 16.1rem minimum height so ordinary state changes do not move the page beneath it. The action column and the running parties column are 17rem wide.
- **Evidence panels:** a 4:4:5 grid with a 1.25rem gap. The first two panels stay sticky at the 1rem line while the log grows, down to 1200px.
- **Sources:** three equal columns on the ground, with no panel behind them.
- **1199px and below:** the sign drops to tile plus text with actions in a full-width row beneath; party tiles become three columns; the stats move inline; panels go to two columns with the log spanning both; stickiness ends.
- **767px and below:** one column throughout, Run and the picker each take a full row, and the tile becomes a horizontal strip. The timeline keeps its dots, ticks and fuel limit and drops its text labels; the slots table and sources list carry those values.

Rhythm is compact and row-based: table and list rows use 0.625rem of block padding, panels use 1.25rem, sign bands use 2rem.

## Elevation & Depth

The system is flat. Depth comes from stacked colour fields (yellow, black, white on ground), and nothing floats or casts a shadow. The only `box-shadow` draws a solid, zero-offset ring.

### Shadow Vocabulary
- **Chosen ring** (`box-shadow: 0 0 0 3px var(--ink), 0 0 0 5px var(--sign)`): marks the chosen slot on the timeline. It is a ring, not an elevation.

### Named Rules
**The Flat Field Rule.** Separate surfaces by changing the field colour, not by lifting them. No blur shadows, no offset shadows, no glass.

## Shapes

Small firm corners on objects, none on fields. Full-bleed bands are square. Tiles and panels use 6px, controls, party tiles and callouts use 4px, chips and tags use 3px. Inline icons are hand-set strokes with square caps and mitred joins, matching signage pictograms. Waiting dots are square and heavy-traffic markers are 45-degree diamonds; only the timeline's slot dots are round. A 135-degree hatch behind a dashed 2px line marks forbidden space on the timeline, as on airfield and hazard markings.

## Components

### Buttons
Plain and decisive, sized by how much they matter.
- **Shape:** gently squared (4px), in every variant.
- **Run:** yellow fill and ink text at weight 700 with 1.5rem inline padding, on the black top bar. It lightens on hover and deepens on press; the spinner and "Negotiating" replace its label while running.
- **Approve:** black fill and white text at Action size with 1rem block padding, in the sign's action column. On the red sign it inverts to a white fill that turns yellow on hover. Its small form, used for Confirm reject, is 0.9375rem with 0.5rem block padding.
- **Ghost:** transparent with a 1px ink border, weight 600, tinting with translucent black on hover (10%) and press (18%). It holds Reject and Cancel on the sign. At 1199px and below it has a 2.75rem minimum height.
- **Quiet:** transparent with a steel border, weight 600, tinting to ground on hover and hairline on press. In a black panel header it uses white text and fills yellow on hover.
- **Focus:** a 3px outline at a 2px offset with no shadow, ink on light and yellow fields, yellow on black, white on red.

### Tags and Chips
- **Status tag:** a black mono label with yellow text (white on red and rejected signs), set inline before the sign's subline. It names the outcome word exactly.
- **Gate chip:** a compact black label with a yellow mono gate code, a small echo of the gate tile, used in safe slot rows.

### Cards / Containers
- **Corner Style:** 6px, with overflow clipped so the header bar follows the corner.
- **Background:** Panel White on Terminal Ground.
- **Shadow Strategy:** none, per the Flat Field Rule.
- **Border:** none; hairlines divide rows inside.
- **Internal Padding:** 1.25rem, with a full-width black header of equal height (3.1875rem) on every panel so all headers align.

### Inputs / Fields
- **Style:** native Bootstrap select, text input and textarea at 4px radius, filled with Terminal Ground. The pasted row is set in mono.
- **Focus:** the border turns ink, the Bootstrap glow is removed, and the keyboard outline follows the Buttons focus rule.
- **Error / Disabled:** errors are Verdict Red text beside the action with `role="alert"`; success is Verdict Green text. Disabled fields keep Bootstrap's treatment.

### Navigation
A single black top bar holds the product name in yellow, the disruption picker filling the free space, and Run. It wraps at 767px and below. There is no other navigation.

### Terminal Sign
The signature component and the first thing on screen. A black 10rem gate tile sits at left, the Display line and its tagged subline in the middle, and decision actions and run stats at right. The tile shows a yellow gate code, three pulsing squares while negotiating, a warning triangle on escalate, or dashes when no gate stands. While negotiating, three black party tiles replace the action column and show each party's latest offer in yellow, so convergence is visible on the sign. Fields cross-fade over 180ms; text wipes in from the top over 320ms on `cubic-bezier(0.16, 1, 0.3, 1)`.

### Flight Strip and Constraint Timeline
A full-width black band directly beneath the sign: a row of label-over-value flight facts, then one horizontal axis of delay minutes. Each offered slot sits on it as a dot, filled green when safe and hollow red when blocked, with its offset above and its gate or blocking rule below. The chosen slot takes the yellow ring. Heavy traffic is a white diamond, and the fuel limit is a dashed red line with red hatching beyond it. Slot offsets and verdicts sit on black backing so they stay legible over the hatch.

### Slots Table and Rule Rows
Four mono columns in a fixed layout, with a tick or cross, a gate chip or blocking codes, and a full yellow row with the word "chosen" for the plan in force. On that yellow row the tick turns ink, because Verdict Green falls below 4.5:1 on yellow. Rule rows pair a mono code (with tick or cross after a run, plain before one) with a Hanken evidence sentence.

### Log Messages and Checker Callouts
Log messages are hairline-separated rows: party name, mono stance at right, the message, then small metadata with a native disclosure revealing what that agent saw. Checker results are tinted callouts with a larger tick or cross. The tint marks verified code output and sets it apart from agent text.

## Do's and Don'ts

### Do:
- **Do** state a new decision state by changing the sign, at Display scale, in place.
- **Do** put the gate in a black tile or chip with a yellow mono code wherever it stands alone.
- **Do** use Signal Green and Signal Red on black, and Verdict Green and Verdict Red on light surfaces.
- **Do** switch to ink ticks on a yellow row, keeping the tick or cross as the verdict signal.
- **Do** pair verdict colour with a tick, a cross or a rule code, so colour is never the only signal.
- **Do** style controls through Bootstrap 5.3 variables and keep them standard web controls.
- **Do** keep agent text labelled unverified and visually apart from tinted checker output.
- **Do** switch off the sign wipe, field fade, waiting pulse and skeleton pulse under `prefers-reduced-motion`.

### Don't:
- **Don't** answer the decision with a row of grey metric cards; say it on the sign.
- **Don't** fill a surface yellow unless it is the sign, the chosen option or the Run action.
- **Don't** use green or red for anything other than the result of a check or the hard limit a check enforces.
- **Don't** use weight 800 or negative tracking below sign scale.
- **Don't** transform text to uppercase for style; capitals are for literal system codes.
- **Don't** lift surfaces with blur or offset shadows; change the field colour instead.
- **Don't** replace Hanken Grotesk or JetBrains Mono; both are user-pinned.
- **Don't** soften the red sign into a tinted notice; refusal gets the same scale as a plan.

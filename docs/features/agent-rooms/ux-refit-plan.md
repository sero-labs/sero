# Agent Rooms — UI refit plan

## Progress

- [x] Preview harness (§7)
- [x] Phase 1 — token layer
- [ ] Phase 2 — room-kit primitives (gate: Dan approves the kit)
- [ ] Phase 3 — app shell
- [ ] Phase 4 — Home
- [ ] Phase 5 — Create a Room
- [ ] Phase 6 — Preparing
- [ ] Phase 7 — The proposal
- [ ] Phase 8 — Adjust
- [ ] Phase 9 — Why this team? (needs 6a rationale)
- [ ] Phase 10 — Advanced settings
- [ ] Phase 11 — The live Room (needs 6b statusAt)
- [ ] Phase 12 — Watch and the member session
- [ ] Data 6(a) — per-member rationale
- [ ] Data 6(b) — RoomMember.statusAt
- [ ] Final: harness out of the repo, second review round

The Rooms UI has the right structure but the wrong surface. Every screen in
`docs/prototypes/agent-rooms/` is recognisable in the shipped app, and none of
them looks like it. This plan closes that gap screen by screen, and fixes the
layout faults the prototype never had to face because it was drawn at one fixed
width.

## 0. The two reference artefacts

Both live under `docs/prototypes/`, and they do different jobs. Use both.

**`sero-agent-rooms.html`** — the prototype's markup and full stylesheet. This
is the *measurement* reference: exact sizes, weights, letter-spacing, gaps,
border radii, wash opacities. When a value is in question, read it here rather
than guessing from a picture. It can also be opened in a browser and resized,
which is useful for seeing how a device behaves before it is rebuilt.

**`docs/prototypes/agent-rooms/*.jpg`** — the ten approved captures. These are
the *acceptance* reference: the composed look Dan signed off, which is the
thing being reproduced. They are what each phase is critiqued against, because
the faults being fixed — density, hierarchy, weight, whether a screen reads as
designed or as assembled — are visible in a composed picture and invisible in a
stylesheet.

The rule: build from the HTML, judge against the JPG. Every phase below names
its own capture, and no phase is finished until its built screen has been put
beside that capture and the difference looked at.

| Phase | Screen | Capture |
|---|---|---|
| 3 | App shell | `1 · Orchestrator — Workflows and Rooms.jpg` (top bar) |
| 4 | Home | `1 · Orchestrator — Workflows and Rooms.jpg` (body) |
| 5 | Create a Room | `2 · Create a Room — one question.jpg` |
| 6 | Preparing | `3 · Preparing the team.jpg` |
| 7 | The proposal | `4 · The proposal — computed, not written.jpg` |
| 8 | Adjust | `5 · Adjust — natural language first.jpg` |
| 9 | Why this team? | `6 · Why this team? — optional supporting detail.jpg` |
| 10 | Advanced settings | `7 · Advanced settings — the complete blueprint.jpg` |
| 11 | The live Room | `8 · The live Room.jpg` |
| 12 | Watch | `9 · Watching the whole team work.jpg` |
| 12 | Member session | `10 · Inside one member's session — live, with its whole history.jpg` |

The filenames contain spaces, a middle dot and an em dash; quote them in shell
commands. Capture 10 also contains a curly apostrophe.

---

## 1. What is actually wrong

Three separate faults. They need different fixes, so this plan names them apart.

**F1 — No visual vocabulary.** The prototype has a small design language:
member faces, mono eyebrows, tinted pills, status dots with a glow, inline
meters, four-cell computed bands, tinted event cards, left-ruled notes, fixed
height watch tiles. The shipped UI has one device — a bordered box with
`text-sm` inside it — used for all of them. That is the whole of "it's
entirely bland looking".

**F2 — Nothing is width-aware.** Rails are fixed `w-64`/`w-80`. Flex children
miss `min-w-0`, so long titles, mandates, file paths and status detail push
their row wider than the panel instead of wrapping or truncating. The top bar
is one `flex-wrap` row, so at narrow width the controls wrap into a pile.

**F3 — Regions disappear with no way back.** Below the point where a rail no
longer fits, the rail is simply gone: no toggle, no tab, no indication that a
brief or a roster exists. That is "controls go missing".

F2 and F3 have a cause worth stating: the Orchestrator renders inside a Sero
panel, so **panel width has nothing to do with window width**. Viewport media
queries (`md:`, `xl:`) are the wrong tool and are the reason a wide window
still shows a cramped Room. Every layout rule below is a **container query**
(`@container`), keyed off the panel.

---

## 2. Decisions

| # | Decision | Note |
|---|---|---|
| D1 | Colour comes from host tokens, never hex | See §3. The UI follows whatever Sero theme is active — not dark only, and not light-and-dark only |
| D2 | Scope is the app shell + Home + every Room screen | Loops/Library/Catalog inherit the shell and primitives, internals untouched |
| D3 | "Loops" is renamed "Workflows" in the UI | Labels, notifications and docs only. Code identifiers, files and tool params stay `loop` |
| D4 | The panel must work down to 700px | Below that is unsupported. No phone layout |
| D5 | The missing data gets built | §6 |
| D6 | Advanced settings stays read-only | Confirmed by Dan. It must look as good as the prototype, but the fields are evidence, not controls |

**On D1 and light mode.** The prototype was drawn on Sero's own default dark
theme — `--surface:#111113`, `--raised:#18181b`, `--emerald:#34d399`,
`--violet:#a78bfa` are byte-identical to `bgSurface`, `bgElevated`,
`brandPrimary` and `collabPrimary` in `packages/templates/themes/default.json`.
So mapping the prototype to host tokens is not a compromise: it reproduces the
screenshots exactly in the default dark theme, and follows every other Sero
theme — Nord, Catppuccin, Solarized, Rosé Pine, light or dark — for free.
`@sero-ai/ui` components already do this; the rule applies to the new
primitives in §4 and to every colour written by hand. **A hex value anywhere
in the refit is a defect**, because it is the one thing that cannot follow the
active theme.

---

## 3. Phase 1 — the token layer

`ui/styles.css` gains one `@theme` block. Everything maps to a host token; the
four values the host has no equivalent for are derived with `color-mix` so they
invert correctly in light mode.

| Prototype | Maps to |
|---|---|
| `--bg` | `--bg-base` |
| `--surface` | `--bg-surface` |
| `--raised` | `--bg-elevated` |
| `--overlay` / `--muted` | `--bg-overlay` / `--bg-muted` |
| `--line` / `--line-strong` | `--border-subtle` / `--border-default` |
| `--text` / `--text-2` / `--text-3` | `--text-primary` / `--text-secondary` / `--text-muted` |
| `--text-4` | *derived*: `color-mix(--text-muted 62%, --bg-base)` |
| `--emerald` + wash | `--brand-primary` + `-muted` / `-subtle` / `-border` |
| `--violet` + wash | `--collab-primary` + its tiers |
| `--amber` + wash | `--status-warning` + its tiers |
| `--blue` + wash | `--status-info` + its tiers |
| `--red` + wash | `--status-error` + its tiers |
| input/strip sunken fill (`#0c0c0f`) | *derived*: `color-mix(--bg-base 92%, --text-primary)` |
| face gradients | *derived* from `--bg-elevated` → `--bg-overlay`; conductor from `--brand-primary` |

Two type rules from the prototype that the plugin does not have yet, both added
as utilities rather than raw sizes: `.room-mono-micro` (the 9–10px mono
eyebrow/meta face) and `.room-tabular` for every figure that changes in place.

**Done when:** the token block exists, `pnpm typecheck` is green, and a
side-by-side of one restyled card in dark and light shows no hard-coded colour.

---

## 4. Phase 2 — the primitive kit

New directory `ui/components/room-kit/`, four files to stay inside the 500-LOC
rule. These are the "custom variants of `@sero-ai/ui`" the refit needs — each
one wraps or composes the shared component where one exists, and only replaces
it where the prototype's device has no equivalent.

`room-kit/identity.tsx`
- `Face` — the rounded-square member avatar at 22/26/30/36px, with the
  conductor's emerald gradient, a new member's violet, and the corner status
  dot. Used on 8 of the 10 screens; its absence is the single biggest reason
  the app reads flatter than the prototype.
- `FaceStack` — the overlapping face row for list rows (screen 1).
- `StatusDot` — 7px, six states, emerald glow ring on `working`.
- `LivePill` — `● LIVE · TURN 9`, and its idle variant.

`room-kit/chrome.tsx`
- `Eyebrow` — mono, uppercase, letter-spaced, four tones.
- `Pill` — the 21px tinted pill, six tones. Wraps the `@sero-ai/ui` `Badge`.
- `SectionHead` — `ROOMS ————————— 2`, the rule-and-count list header.
- `Meter` — figure + 64px track + "of X", amber above 90%. Extracted from
  `RoomTopBar`, which currently owns a private copy.
- `NoteBlock` — the left-ruled accented note (violet planner note, emerald
  conductor note, blue session notice).

`room-kit/blocks.tsx`
- `EventCard` — tinted card with header, right-aligned pill, body and actions;
  tones neutral/ok/warn/bad/revision.
- `AuthorityBand` — the four-cell computed band with emerald hairline dividers,
  plus its `changed` variant carrying the struck-through previous value.
- `ModeCard` — the Workflow/Room chooser on Home, with its `on` gradient.
- `NeedsBand` — the amber "Needs you" band and its rows.

`room-kit/fields.tsx`
- `FieldRow`, `FieldLabel` (with right-aligned hint), `FieldText`, `FieldSelect`
  — the blueprint form language of screen 7, read-only per D6.
- `TokenChip` — the tools/skills chips, on and off states.

Each primitive takes plain props and is covered by the preview harness in §7,
so all four files can be built and reviewed before a single screen is rewired.

**Done when:** every primitive renders in the harness at real size in both
schemes, and matches its crop from the prototype screenshots.

---

## 5. Phases 3–12 — one screen at a time

Each phase is: rewire the screen onto the kit, apply its container-query rule,
fix its overflow, screenshot against the prototype, commit.

### Phase 3 — the app shell
*Reference:* `1 · Orchestrator — Workflows and Rooms.jpg`, top bar only
`ui/OrchestratorApp.tsx`

The header is a row of `Button`s; the prototype has a real tab bar — 56px,
brand mark and wordmark on the left, underlined active tab with an emerald
2px rule, counts as inline badges, actions right. Add: brand mark, tab bar
with active underline, count badges (alert-toned when the tab needs the user),
`+ New` as the one primary button.

**D3 lands here:** the tab reads **Workflows**. One exported label constant,
used by the tab, the empty states, the notification copy and the docs.

*Container rule:* ≥900px full tab bar. 700–899px the tab labels drop to icon +
count with the label in a tooltip; the actions collapse into one overflow
button. Nothing is removed.

### Phase 4 — Home
*Reference:* `1 · Orchestrator — Workflows and Rooms.jpg`, everything below the tabs
`HomeView.tsx`, `AttentionQueue.tsx`, `RoomsOverview.tsx`, `LoopsOverview.tsx`

- Page head: 22px title, `sero · 3 active · $4.12 spent today` sub-line.
- `NeedsBand` replaces the plain "Needs you" heading — amber-washed block,
  one row per item, the source as dimmed trailing text, the action button
  right. This is where a member's question and a stopped Room appear, so it is
  the screen the last round of live testing proved has to be unmissable.
- The two `ModeCard`s (Workflow / Room), the Room one carrying its `New` pill.
- `SectionHead` + rows for Rooms and Workflows, with `FaceStack`, member count,
  elapsed and spend as mono meta.

*Overflow fixes:* every row is `min-w-0`; the summary column truncates with a
`title`; the meta column never shrinks.

*Container rule:* ≥1000px the mode cards are side by side; below, stacked. At
<820px the row meta drops to a second line under the title rather than
truncating to nothing.

### Phase 5 — Create a Room
*Reference:* `2 · Create a Room — one question.jpg`
`RoomBriefForm.tsx`

Centred 760px column, mono eyebrow, 27px question, the brief as a tall sunken
textarea with a real focus ring, the four limit chips as `.opt` pills that turn
emerald when set (they currently look identical set or not), footer rule with
the hint left and **Design the team →** right, presets in a three-across grid
below the fold line.

*Container rule:* the column is `min(760px, 100%)` with 24px gutters; presets
go 3 → 2 → 1 across.

### Phase 6 — Preparing
*Reference:* `3 · Preparing the team.jpg`
`RoomPlanning.tsx`

Currently a spinner. The prototype shows the five planner steps with tick /
current / pending marks, a progress rule and "About 15 seconds left · Cancel".
The steps are fixed and known, so this is presentation, not new runtime data —
the step advances on the phases the prepare call already reports.

### Phase 7 — The proposal
*Reference:* `4 · The proposal — computed, not written.jpg`
`RoomProposal.tsx`, `RoomDraftReview.tsx`

The consent surface, and the screen furthest from its drawing. Rewired to:
bordered roster table with a `Face` and a `Leads` pill per row; the
`AuthorityBand` for the four computed tiles with the emerald wash and the
"computed from the plan the team will run under" hint; the access warning as a
proper `warn` block with its icon; footer with **Start room** primary, **Adjust**
secondary, and *Why this team?* / *Advanced settings* as dotted-underline
disclosure links on the right.

*Container rule:* the authority band goes 4 → 2 → 1 columns. It never truncates
a figure — the numbers are what is being consented to.

### Phase 8 — Adjust
*Reference:* `5 · Adjust — natural language first.jpg`
`RoomProposal.tsx`

The blue-washed "Tell Sero what to change" panel with the instruction box and
the five suggestion chips, then the recompute panel: the same four cells with
the **new value in emerald above the struck-through old one**, and the
kept/removed sentence under a hairline.

Data: the diff needs the pre-adjust proposal. That is component state, not a
runtime change — snapshot the summary before dispatching the adjust, and
compute kept/removed as a set difference over role names and access entries.
No planner prose is trusted for it.

### Phase 9 — Why this team?
*Reference:* `6 · Why this team? — optional supporting detail.jpg`
`RoomProposal.tsx`

Today a disclosure holding one paragraph. Becomes the panel: header with the
violet `Planner reasoning` pill, the paragraph, then **one card per member**
with its face, name and its own one-line reason, closed by the violet
left-ruled note stating that this text has no authority over the envelope.

Data: needs per-member rationale — §6 (a).

### Phase 10 — Advanced settings
*Reference:* `7 · Advanced settings — the complete blueprint.jpg`
`RoomAdvancedSettings.tsx`

Three panes: a left nav of blueprint sections plus the member list, the field
form in the middle, and a right rail holding the computed proposal and the two
locked-boundary notes.

**D6, confirmed:** the fields render through `room-kit/fields.tsx` as
read-only, and are held to the same visual standard as the rest of the refit.
The prototype draws them editable; a second write path would re-validate and
recompute the envelope separately from Adjust, and the consent surface depends
on there being one such path. So the screen looks like the drawing and behaves
as evidence — the field frames, labels, hints and token chips are all there,
and nothing in them takes a click. Adjust remains the only way to change any
of it.

*Container rule:* ≥1200px three panes. 900–1199px the computed rail becomes a
sticky block above the form. <900px the section nav becomes a select.

### Phase 11 — The live Room
*Reference:* `8 · The live Room.jpg`
`RoomDetail.tsx`, `RoomTopBar.tsx`, `RoomRoster.tsx`, `RoomActivity.tsx`,
`RoomSidePanel.tsx`

- Top bar: 50px, dot, title, status pill, divider, the two `Meter`s, turn
  count, then Timeline/Watch as a segmented control and the actions with
  **Stop** danger-toned.
- Roster rail: `Face` with corner status dot, name, status detail, mono cost,
  selected row raised with a border — instead of today's flat text list.
- Timeline: 44px mono timestamp column, `Face`, the sentence with the actor in
  bold, and findings/questions/commits promoted into tinted `EventCard`s. This
  is the difference between the prototype's timeline and a log dump.
- Side panel: real tab bar with the emerald inset underline, brief blocks with
  mono field labels, the Conductor's note as an emerald left-ruled note.

*Container rule:* ≥1200px 264/1fr/320. 900–1199px the side panel becomes a
right-hand drawer with a pinned **Brief** toggle in the top bar. 700–899px the
roster collapses to a horizontal face strip under the top bar, and the drawer
holds brief and roster as two tabs. **F3 rule: whatever collapses gains a
control in the top bar in the same commit.**

### Phase 12 — Watch and the member session
*References:* `9 · Watching the whole team work.jpg` and
`10 · Inside one member's session — live, with its whole history.jpg`
`RoomWatch.tsx`, `RoomMemberPanel.tsx`, `RoomMemberFacts.tsx`

- Watch: fixed-height (214px) tiles with head / current-tool strip / streaming
  body with its bottom fade / footer, `LivePill` per tile, dimmed for sleeping
  members. Today the tiles grow with their text, which is why the grid jumps
  as members stream.
- Member session: the identity header with a 36px face, the tab row, the
  follow bar with a real toggle switch, the turn-mark strip with compaction
  and current marks called out, room messages as emerald-tinted bubbles, tool
  calls as mono sunken bubbles, the compaction divider as the gradient rule,
  and the live tool card with its spinner. Right rail: context meter with its
  warn zone, key/value facts, and the blue "this is a real session" notice.

*Container rule:* watch tiles 2-up ≥1000px, 1-up below. The member rail becomes
a drawer below 1000px, with its toggle in the member header.

---

## 6. Data the prototype shows and the runtime does not produce

Three items. Everything else on the ten screens already exists in the records.

**(a) Per-member rationale — screen 6.** `RoomProposalSummary.roles[]` carries
`displayName`, `responsibility`, `isConductor`; there is one `teamRationale`
paragraph for the whole team. Add `rationale?: string` per role: planner schema
field, prompt line, blueprint → summary mapper, and the UI card. It is planner
prose and carries no authority, which the screen states in its own footer.

**(b) Waiting duration — screens 8 and 9.** "Waiting 3m" needs to know when the
member entered its state. `RoomMember` has `status` and `statusDetail` and no
timestamp. Add `statusAt: string`, set wherever status is set, and render the
duration from it. This is also what an earlier attention-payload change had to
drop for want of a timestamp.

**(c) Adjust diff — screen 5.** No runtime change; component state, per phase 8.

Per-member cost is **not** a gap — the roster already renders
`member.usage.costUsd`.

---

## 7. Working method

**The harness first.** Before phase 2, restore the throwaway preview page
(`ui/preview.html` + `ui/preview.tsx`) on the plugin dev server, with the two
things the Sero shell supplies and a standalone page does not: the
`data-sero-plugin="orchestrator"` scope root, and a harness CSS file importing
the host globals. It renders every primitive and every screen from fixtures,
at 1400 / 1000 / 780px, under a theme switcher covering the default dark
theme, a light theme and one strongly-tinted theme (Rosé Pine). This is how
each phase gets checked against its screenshot without a live Room, and how
the non-default themes get looked at at all. The harness files are moved out
of the repo before the final commit.

**Every phase ends with a critique against its capture**, not just a
screenshot. The step is:

1. Build the screen in the harness at 1400px in the default dark theme — the
   width and theme the captures were drawn at, so the two are directly
   comparable.
2. Put it beside the phase's capture from `docs/prototypes/agent-rooms/` and
   read the difference off the pair: spacing, type weight and size, the density
   of each region, colour temperature of the washes, and whether the eye lands
   in the same place first.
3. Write the differences down as a short list, fix what is wrong, repeat until
   the list is empty or an item is a deliberate departure with a reason.
4. Then screenshot the same screen at 780px, in a light theme and in Rosé Pine,
   to prove the refit did not hard-code the look it just matched.

Steps 2 and 3 are the point of the captures. A screenshot filed without a
comparison proves nothing, and the faults being fixed here are exactly the ones
that only show up when the two pictures are side by side. Show me both images
for each phase — visual decisions get shown, not described.

**Review.** As with the build phases: `/maestro` to `gpt-5.6-sol` at high
effort, maximum three rounds, at the end of phase 2 (the kit — because every
screen inherits its faults) and again at the end of phase 12.

**Guard rails that still apply.** `pnpm typecheck` green from the repo root
before every commit. No file over 500 LOC — `RoomDetail.tsx` and
`RoomMemberPanel.tsx` are already near it and will need extraction as part of
their phases. No `localStorage`. Conventional commits. The PR stays a draft.

---

## 8. Order and dependencies

```
1 tokens ──▶ 2 kit ──┬──▶ 3 shell ──▶ 4 home
                     ├──▶ 5 create ──▶ 6 preparing ──▶ 7 proposal ──┬──▶ 8 adjust
                     │                                              └──▶ 9 why
                     ├──▶ 10 advanced
                     └──▶ 11 live room ──▶ 12 watch + session
        6(a) rationale ────────────────────────────────────▲ (needed by 9)
        6(b) statusAt ──────────────────────────────────────▲ (needed by 11)
```

Phases 1 and 2 are the whole foundation; nothing else starts until the kit is
approved. After that, 3–4, 5–9, 10, and 11–12 are four independent tracks.

## 9. Not in this plan

- Release and migration notes, and the docs-site pages — blocked until the
  deliverable is agreed.
- Phase 9 of the implementation plan — blocked pending explicit go-ahead.
- Redrawing Loops/Workflows, Library and Catalog internals (D2). They inherit
  the shell and the kit; their own screens have no prototype.

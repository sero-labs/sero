---
name: sero-ux-audit
description: |
  Run a visual UX audit of shipped Sero desktop surfaces (Architect,
  Orchestrator, Rooms, Workspaces, or any app panel) by photographing real
  recorded state, then propose static redesigns. Use when the user asks to
  audit, review or critique existing UX, asks "what is wrong with these
  screens", wants current-state evidence before a redesign, or asks for
  screenshots of real populated pages. Also use when a capture run must not
  spend money or modify a profile. Do not use for building a new feature or a
  greenfield prototype: that is `sero-prototype`.
---

# Auditing Sero UX

Produce two static documents in the styleguide: what the product looks like
now, and what it should look like instead. Keep them apart so an attractive
drawing is never mistaken for an observation.

Worked example: OpenSpec change `audit-agent-workspace-ux`, delivered
2026-09-19 as 374 frames across four areas at zero cost.

## Non-negotiable rules

- Capture first. Do not substitute mockups for evidence, and do not start
  proposing until the frames exist.
- Three documents, all static HTML under
  `apps/styleguide/public/prototypes/<slug>/`: `evidence.html`, `flows.html`
  and `proposals.html`. Link each from
  `apps/styleguide/src/PrototypeArchive.tsx`.
- Never build an interactive review application, annotation editor, pin or
  rectangle markup, review persistence, or a collaboration backend. This was
  explicitly rejected. It eats the time the captures need.
- Never spend money for a screenshot. Do not run the paid documentation or
  agent-tier specs to reuse their capture mechanics; reuse the mechanics, not
  the side effects.
- Never write to the real profile or to a workspace. Capture against a copy.
- An unreachable state is a gap with a recorded reason. It is not audited, and
  it never silently disappears.
- Do not edit production UI during the audit. The only tracked edit outside the
  OpenSpec change should be the archive entries.
- A proposal enhances. It never quietly removes a shipped control. If a control
  should go, say so on the page and give the reason.

## Workflow

### 1. Reconcile the scope before you build anything

If an OpenSpec change or an earlier plan already exists, read it and check it
against what the user has just asked for. A previous attempt may have specified
something the user has since rejected. Rewrite the proposal, design, delta spec
and tasks before implementing, and say what you changed. Do not silently
implement an obsolete requirement.

### 2. Inventory the real content

List what the target profile actually holds before deciding what to capture:
projects and their lifecycle states, workflows per workspace and their
statuses, every Room and its status. Pick a profile whose records already cover
the interesting states. An audit of text density needs real text at real
length, so a fixture profile is worth less than a used one.

Build the coverage register from the current routes, components, state types
and existing E2E specs. A checklist the user supplies is the minimum starting
inventory, not proof that every branch has been found.

### 3. Build an isolated capture home

    scripts/make-audit-home.sh <scratch-dir> <profile-name> [sero-home]

It rsyncs one profile into the scratch directory, excluding the browser
profile, logs and debug output, symlinks the heavy shared directories, and
rewrites `profiles.json` so the copy is the only profile and is active. The
source stays read-only.

### 4. Capture with the runtimes switched off

This is the part worth remembering. Launch with:

    SERO_ARCHITECT=0  SERO_ROOMS=0  SERO_GOALS=0

The plugin UIs read their records from disk through the host app-state bridge,
so every project, Workflow and Room still renders fully populated while no
owner wakes, no model is called and no record is written. Capture cost is zero.

Two consequences appear on the frames and must be declared in the document
intro so a reader does not log them as product defects: a red "Room mode is not
available for this workspace" banner, and a Run inspector reporting that the
Architect runtime is not running.

**The limit this buys, and you must state it.** Nothing moves during capture,
so the set evidences no activity transition at all. There is no before/after
pair for working, queued, waiting, paused, complete or failed. Record every
transition as a gap with that one reason. Never claim that changing a fixture
proves the real event-delivery path works.

### 5. Write a gated capture spec beside the existing suite

Put it at `apps/desktop/e2e/ux-audit.workflow.spec.ts` with helpers in
`apps/desktop/e2e/ux-audit/`, reusing `launchSeroApp` and the existing shell
and selector helpers. Gate the whole file on `SERO_E2E_UX_AUDIT === '1'` so a
normal suite run skips it. Split by area into one test each, plus a narrow
width pass (1180 against 1600) and a `prefers-reduced-motion` pass.

Run it with:

    scripts/run-capture.sh <repo> <scratch-dir> [-g architect]

Pass `-g <area>` to re-capture one area after a selector fix. Unset
`ELECTRON_RUN_AS_NODE` first, or Electron starts as plain Node and the launch
hangs with no window.

The reference implementation is `apps/desktop/e2e/helpers/ux-audit.ts` and
`apps/desktop/e2e/ux-audit/`. If those files are gone, rebuild from the
register contract in the next section.

### 6. Make navigation verifiable, not hopeful

The failure that wastes a whole run is landing on the previous screen and
photographing it forty times. Guard against it:

- Deep-link only where the app honours it. Architect accepts `{projectId}`.
  Orchestrator ignores `{loopId}` and `{roomId}` and restores its own persisted
  route, so a deep link silently lands on whatever was last open.
- Otherwise open the tab, click the row, then **read the heading back** and
  label the frame with what actually opened.
- If a control is missing, record a gap and move on. Never retry the same
  screen.
- Give every frame a text fingerprint: the first 220 characters of the panel's
  visible text. Two frames that should differ and do not are then obvious.

### 7. Keep the register honest

One row per attempted state, holding: id, area, page, state, the task the user
is trying to do, width, status, file, content hash, reason and fingerprint.
Status is `captured`, `duplicate` or `gap`.

SHA-1 the PNG at capture time. If another id already owns those exact pixels,
keep the row, mark it `duplicate`, point it at the owner and delete the file.
The state stays accounted for and the gallery holds one copy. Two details that
cost me a rerun each:

- Compare the owner id against the current id. Re-capturing the same state to
  the same pixels is that entry again, not a duplicate of anything.
- Merge the register by frame id, never by area. A width pass touches every
  area partially, and an area-wide replace throws away the wide captures.

### 8. Capture quirks that cost time

- Room activity filters and the five side-panel tabs exist only in the Timeline
  view, and a completed Room opens on Result. Click Timeline first.
- Never toggle a disclosure blindly. Check whether its content is already on
  screen, or you close the sections that were already open. Doing this wrong
  produced zero Map and Details frames twice.
- Architect menu labels carry ellipses. Match `^Models`, not `Models`.
- A tab may be `role="tab"` in an always-present panel rather than a button in
  a drawer. Probe before assuming.

**Size the window to the screen, and verify it.** A window larger than the
display is silently clamped and pushed off-screen, so the frames come back
cropped on the right and nothing warns you. On a 1512x982 logical desktop,
1440x920 fits with a margin. Read `BrowserWindow.getBounds()` back and assert
it, and record per-frame overflow (`documentElement.scrollWidth -
clientWidth`, and the same on the app panel) so a cut frame fails the run
rather than reaching the document.

**Capture unique screens, not repetitions.** Three cuts took one run from 440
frames to roughly 290 with no loss of distinct screens:

- Collapse the shell's workspace sidebar. It is the same tree everywhere and
  costs about 340 of 1440 pixels. Turn it back on only for the walk where the
  sidebar is the subject.
- Ask whether the panel scrolls before taking a scroll frame. A scroll capture
  of a page that does not scroll is byte-identical to the frame before it, so
  the check removes the duplicate at source instead of hashing it away.
- Walk sub-views deeply on **one** instance per workspace and shallowly on the
  rest. Nine sub-tabs times four workflows is the same nine screens four
  times. Give the shallow pass a `start` offset so it begins after the deep
  instance, or it re-walks it and writes duplicate register ids.

For each applicable state capture the initial viewport, scrolled sections,
expanded disclosures, menus, popovers, drawers and dialogs, a smaller desktop
width, and long real content.

### 9. Write the observations yourself

    UX_AUDIT_SCRATCH=<scratch> UX_AUDIT_REPO=<repo> UX_AUDIT_SLUG=<slug> \
      python3 scripts/build-evidence.py

It reads `register.json`, converts each frame to webp (`sips -Z 1600` then
`cwebp -q 72`), writes `evidence.html`, and closes with the gap and duplicate
table. It needs three JSON files you write in the scratch directory:
`areas.json`, `intro.json` and `notes.json`. See the `.example.json` files.

`notes.json` is the audit. It cannot be generated. Key by frame id prefix, or
by a `-substring-` that names a sub-view across many frames. Write what is
actually on the screen: quote the product's own strings, count the repetitions,
name the action the screen buries. Do not propose a fix in the evidence
document.

**Verify every absence claim against the frame before you write it.** "Renders
nothing", "says nothing", "no way to start one" are the observations that turn
out to be wrong, because they are the ones you write from an impression of a
sparse screen rather than from reading it. On the 2026-09-19 audit two of
twenty observations were false in exactly this way: the Goals tab does state
its empty case and name the command, and the Library is the best-handled empty
state in the product. Both had been written as the opposite. A claim that
something is present can be checked by looking; a claim that something is
absent needs you to look harder, not less.

The corollary is worth keeping: an audit that finds nothing good is not
observing. Say so when a screen handles its case well, and name it as the model
the others should follow.

What to look for, in the order it usually bites:

- The same sentence repeated at project, research, workflow and step level.
- An agent instruction or a stopping condition printed as a user-facing
  heading.
- Cards, nested panels and empty containers that exist only to say nothing.
- A warning about information that has not been generated yet.
- Loading, absent, unavailable and failed rendered the same way.
- One badge covering several situations that need different actions.
- A raw 36-character identifier as the most prominent thing on a row.
- Supporting material, cost accounting and token counts shown by default,
  above the conclusion someone came for.
- The decision or the one real action buried in operational detail.

### 10. Break the evidence into deliverable flows before drawing anything

Do this between the evidence and the proposals. Skipping it is how a redesign
silently deletes working controls: you redraw the screens that are easy to
redraw, stop where it gets hard, and never write down where you stopped.

Every register row already carries a `task` field. Group those tasks into flows
a person walks, and assign each task to exactly one flow with a script that
fails on a task claimed twice or claimed by nobody. Then the frame counts per
flow are derived rather than asserted, and a flow with no proposal is visible as
a number.

Each flow states:

- the tasks it serves, quoted from the register;
- the pages it rests on, with frame counts;
- the observed defects, quoted from the evidence document;
- a **keep list**: every control on those screens that must still be reachable
  afterwards;
- acceptance criteria, and what it depends on.

The keep list is the contract. A proposal is an enhancement only if every entry
survives, and anything removed is named and argued for on the page rather than
dropped. On the 2026-09-19 audit this check found two shipped controls missing
from the proposals: an inline "Raise and resume" cap control and a project
History rail. Both had been drawn from memory rather than from the frames.

Write it as a third document, `flows.html`, beside the other two.

The flow document exists to get one decision made: are the groups right, and is
the order right. Everything else in it is the brief for after that decision, so
it must not stand between the reader and the question. Open with a **decision
panel**: one row per flow in ship order, each carrying the flow's question, its
frame count, its coverage and one sentence naming the change. Seven rows fit on
a screen. Fold every flow's evidence, keep list and acceptance criteria behind a
`<details>` whose summary names what is inside it, so a reader can decide not to
open it. Nothing is cut and nothing is truncated; it is folded. On the
2026-09-19 audit the first draft was 13,500 px of continuous prose and the
answer to it was "it's too much to take in and make decisions on". Folded, the
same content is 4,100 px.

Do not print the ship order twice. It was a table at the foot of the first draft
and a column in the decision panel, and the two disagreed within a day.

A screen that needs its own piece of work still counts in the flow whose
question it answers, and it still gets a keep list. Carry it out as a GitHub
issue and link the issue from the flow. Dropping it from the coverage table is
how a screen gets quietly deleted: on this audit the Run inspector was named as
"a separate task, not attempted here" and had no row anywhere, which read as a
plan to remove it.

A keep list built only from frames still misses a control that appears on no
frame. `apps/desktop/e2e/helpers/ux-inventory.ts` closes that hole: it
implements the same `AuditCapture` interface, so the identical walk records
every button, tab, link, input and disclosure by accessible name instead of
pixels. Run it with `SERO_E2E_AUDIT_MODE=inventory`. It costs another walk and
no money.

### 11. Draw the proposals as static HTML

Numbered states in the product's current tokens and density, from
`packages/ui/src/styles/globals.css`. Preserve the overall style: an audit is
not a wholesale redesign. Show no control that implies unsupported behaviour.
State the rules the proposals follow at the top of the document.

**Draw each screen in the product's style, from real records.** On the
2026-09-19 audit the user chose drawn HTML screens over overlays on captured
frames. Take every name, count, date and amount from the project, Workflow and
Room records, never from an earlier draft: the first proposals said a Workflow
had 4 steps when its record had 3, and showed a spend from an older snapshot.
A drawn screen shows only what you remembered, which is how the first
proposals lost two shipped controls, so the control list below is mandatory.

**One document per flow, one at a time.** Draw one flow's screens, get the
user's approval, and only then start the next. Name each document
`<n>-<flow>.html` beside the evidence and link it from the flow breakdown.

**Keep each row plain.** The user rejected rows that said the same fact twice.
Their examples: a "paused" pill beside a "Paused by you" line, a labelled grid
of Architect / Delegated / Needs you, a "Nothing" in every empty Needs you
cell, and step or word counts beside a disclosure. Use one activity column: the
first line is the state that matters, the second says whose it is. Keep spend
alone in its column, never wrapped with member counts. Put nothing under a
workspace row in the tree, because the rows under a workspace are its
sessions; use a single icon with hover text.

Give every state a **control parity list**, collapsed by default: each control
the shipped screen has, taken from the control walk, labelled kept, moved,
folded, or dropped with a reason. A new control is labelled added. A drop or an
addition is a product decision and waits for the user's approval. Also list
content that leaves the row even when it is not a control, such as an owner's
sentence or member avatars; the avatars were dropped once without anyone
noticing. An unlabelled control means the state is not finished. Do not style a kept
control with the accent that marks a proposed one, or the list argues against
itself.

Two rules the user holds firmly:

- **Truncation is not the fix.** Never solve long text with a character limit.
  Use headings, bullets, numbered steps, labelled evidence and acceptance
  criteria. Preserve the full detail, but do not display it all by default.
- **Never invent progress.** No percentages, no ETAs. A step count is not a
  percentage of elapsed work. An old update is not proof of failure and not
  proof of continued execution.

For activity and progress, a user must know without drilling down: whether
work is happening, what is happening, whether anything finished, whether they
need to act, whether the owner or a delegated Workflow or Room is working, and
whether the owner paused while its workers continue. Cover working, queued,
waiting for the user, paused, idle, complete, stopped and last known. A saved
status of "running" outlives a dead Workflow, so "working" must come from a
run reporting, never from the saved status alone. State
is a word before it is a colour. A blinking dot, a coloured border or an
animation alone fails a reduced-motion user.

### 12. Delivery checks

    node scripts/check-documents.mjs <repo> <slug> [doc.html ...]

It serves the styleguide public directory and loads each document at 1600 and
1180, reporting status, height, horizontal overflow, page errors and failed
requests. A failed request means a referenced frame is missing, which is the
defect the eye misses in a 70,000px page.

Then:

- Reconcile register ids, files on disk and `<img>` tags in the document. All
  three counts must agree, with no orphan and no missing file. Do this for
  every document, not just the generated one: a hand-written document that
  references a frame by name breaks silently when the capture is rebuilt at a
  different width, and a 404 is a normal HTTP response, so a page-error check
  alone never sees it.
- Check the smallest files. A blank frame compresses tiny. Confirm that a small
  file is a genuinely sparse page.
- Grep every document for credentials, API keys and tokens. Report any personal
  path that appears inside the frames: the shell status bar prints the absolute
  workspace path on nearly every screen, and the profile name sits in the title
  bar. Let the user decide whether to crop.
- Verify the source profile and every workspace `.sero` directory are unchanged
  with `find ... -newermt`.
- `pnpm --filter @sero/styleguide build`, `git diff --check`, root
  `pnpm typecheck`, and every new source file at or below 500 lines.
- Remove the temporary capture home. It holds a copy of a real profile.

## Reporting

State the coverage as captured, duplicate and gap counts per area. State the
provenance and the actual cost, or say plainly that the cost is unknown. Name
the gaps. Lead with the limit that no transition is evidenced rather than
burying it, because it is the weakest part of this method and the user will
find it anyway.

If a gap needs live execution, agree the model with the user before running.
The audit run of 2026-09-19 required `openai-codex/gpt-5.6-luna:high` for every
participant including the owner, the planner, Workflow steps and Room members,
with no silent inheritance of a different Admin tier. Bound cost, time and
attempts, set a stop condition, and record the effective assignments afterwards.

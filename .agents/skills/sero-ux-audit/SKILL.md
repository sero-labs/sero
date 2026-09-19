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
- Two documents, both static HTML under
  `apps/styleguide/public/prototypes/<slug>/`: `evidence.html` and
  `proposals.html`. Link both from `apps/styleguide/src/PrototypeArchive.tsx`.
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
  OpenSpec change should be the two archive entries.

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

### 10. Draw the proposals as static HTML

Numbered states in the product's current tokens and density, from
`packages/ui/src/styles/globals.css`. Preserve the overall style: an audit is
not a wholesale redesign. Show no control that implies unsupported behaviour.
State the rules the proposals follow at the top of the document.

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
waiting for the user, paused, complete, failed and unconfirmed or stale. State
is a word before it is a colour. A blinking dot, a coloured border or an
animation alone fails a reduced-motion user.

### 11. Delivery checks

    node scripts/check-documents.mjs <repo> <slug>

It serves the styleguide public directory and loads both documents at 1600 and
1180, reporting status, height, horizontal overflow, page errors and failed
requests. A failed request means a referenced frame is missing, which is the
defect the eye misses in a 70,000px page.

Then:

- Reconcile register ids, files on disk and `<img>` tags in the document. All
  three counts must agree, with no orphan and no missing file.
- Check the smallest files. A blank frame compresses tiny. Confirm that a small
  file is a genuinely sparse page.
- Grep both documents for credentials, API keys and tokens. Report any personal
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

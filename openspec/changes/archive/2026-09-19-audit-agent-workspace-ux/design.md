## Context

See proposal.md for the problem and scope. This revision replaces the interactive annotation tool the user rejected with two static documents, and records the capture method that made a no-spend audit possible.

Observed sources:

- `openspec/specs/architect-ui/spec.md` requires a decision-focused page with hidden supporting detail.
- `plugins/sero-architect-plugin/ui/components/ProjectResearch.tsx` renders research questions, stopping conditions and member models in the page body. `NeedsYou.tsx` renders full briefs and escalation policies in approval cards.
- `plugins/sero-architect-plugin/ui/lib/use-project-record.ts` reads each project record straight from disk through the host's app-state bridge. `plugins/sero-architect-plugin/shared/kill-switch.ts` disables the runtime without touching records. Together these make a populated, read-only Architect page possible with nothing woken.
- `plugins/sero-orchestrator-plugin/runtime/rooms/room-runtime.ts` and `runtime/goals/index.ts` carry the same kill switch for Rooms and Goals.
- `apps/desktop/e2e/helpers/electron-app.ts` launches the built Electron output with a separate `SERO_HOME_OVERRIDE`. `apps/desktop/e2e/helpers/docs-capture.ts` and `docs-rooms.agent.spec.ts` supply the Room navigation recipe, but running them unchanged spends money and overwrites docs-site images.
- `apps/styleguide/public/prototypes/sero-design-library-plugin.html` is the presentation reference: numbered `.state` sections, a `<h2>` and one short `.note`, then a 1400×820 `.app` frame.

## Goals / Non-Goals

**Goals:**

- Reproducible evidence from the shipped build and real recorded content, with the state each frame shows named and checkable.
- Two documents a reader can skim: what is there now, and what is proposed instead.
- Honest coverage: an unreached state is a listed gap with a reason, not an omission.

**Non-Goals:**

- Production layout, content, runtime, IPC or SDK changes.
- Any interactive review tool, annotation model or persistence.
- Deciding the redesign before the user has seen the evidence.

## Decisions

### 1. Kill the runtimes, keep the records

Copy `~/.sero-ui/profiles/seroarchitectdev` into an isolated `SERO_HOME`, excluding `chromium-user-data`, `logs` and `debug`, and rewrite `profiles.json` to point at the copy. Launch with `SERO_ARCHITECT=0`, `SERO_ROOMS=0` and `SERO_GOALS=0`.

This is the decision that makes the audit safe. The Architect runtime otherwise reconciles every project on start and wakes any with planned work, which for this profile means several paid owner turns within seconds of launch. With the kill switch set the runtime never starts, so nothing is woken and nothing is written, while every page still renders because the UI reads records from files, not from the runtime.

The cost is honest and must be labelled: a screen whose content comes from the runtime rather than from a record shows its unavailable state. The Run inspector is the known case — on some projects it reports that the Architect runtime is not running. That frame is evidence of the capture mode, not of a product defect, and the register says so.

Workspaces stay at their real paths and are opened read-only. Alternatives rejected: pausing every copied project changes the state being photographed; removing credentials produces failure records; launching the live home can resume real work.

### 2. Click the row; verify what opened

Architect honours a `projectId` launch param, so its pages are deep-linked. The Orchestrator restores its own route over a launch param, so a `loopId` or `roomId` deep link silently lands on whatever was open last — the first capture pass proved this by producing identical frames for a Room and a Workflow. Orchestrator navigation therefore opens the tab, clicks the nth row and reads the heading back, and the heading names the capture.

Every step is failure-tolerant. A control that is not on screen records a gap and the walk continues; no step retries a screen it could not reach.

### 3. A register keyed by content, not by file count

Each row carries a stable id, area, page, state, user task, capture time, viewport width, a 220-character text fingerprint of the panel, and the SHA-1 of the image. Two rows with the same hash are the same frame: the second keeps its row and its state label but does not add a second image. A gap row has no image and a required reason.

Status is captured, duplicate, or gap. A partial pack is useful; it is not a completed audit, and the evidence document says which states are missing.

### 4. Two static documents, in the product's own style

`evidence.html` shows the captured frames grouped by area. Each entry is a numbered heading, a short note naming the observed problem, and the frame at capture size. `proposals.html` shows the proposed designs as static mockups, drawn with the same tokens and density as the product. Neither is interactive, neither persists anything, and the proposals never appear inside the evidence document.

Both are served through the styleguide and linked from `apps/styleguide/src/PrototypeArchive.tsx`. Screenshots live under `apps/styleguide/public/prototypes/screenshots/agent-workspace-ux-audit/`. Frames are published unedited; a frame that cannot be published is left out and its row says why.

### 5. Fill named gaps only, and only with Luna

For each missing state, check existing records first. Start a run only when actual execution is the only way to show the behaviour, give it one small task tied to a named register id, explicit cost, time and attempt bounds, and a stop condition.

Every new run and delegated member uses `openai-codex/gpt-5.6-luna:high`. Verify the effective owner, planner, workflow-step and Room-member selections before dispatch; a selection that cannot be enforced blocks the run and is reported rather than substituted. Record purpose, bounds, effective model, elapsed time and reported cost. Unknown cost stays unknown, not zero.

### 6. Findings judge information priority, not taste

For each finding: the task affected, the register id and region, the observed problem, and a proposed remedy. Classify content as needed now, useful on demand, repeated, or misleading. Assess heading usefulness, repeated instructions, card density, scroll burden, default disclosure state, and whether not-yet-generated, loading, unavailable and failed data are distinguishable.

Truncation is not a remedy. Where long text is necessary, propose headings, bullets, ordered steps, labelled evidence rows and acceptance criteria, with the full detail behind a disclosure rather than removed.

### 7. Activity and progress are judged before any disclosure

Assess the overview row and the main page on their own. A user must be able to answer, without drilling down: is work happening, what is it, has known work completed, must I act, is the Architect working or its delegated Workflows and Rooms, and has the owner paused while its workers continue.

Audit working, queued, waiting-for-user, paused, complete, failed and unconfirmed states. Meaning must survive without colour or motion, so the capture includes a `prefers-reduced-motion` pass. Known completed work stays separate from liveness and from update freshness. Do not recommend invented percentages or ETAs; step counts are not percentages of elapsed work, and an old update proves neither failure nor continued execution.

Still images cannot prove live updates. Transition evidence is timestamped before/after pairs linked by a transition id, each labelled live, replayed or fixture-driven. Under the no-spend capture mode no transition is live, and the evidence document states that plainly rather than implying otherwise.

## Risks / Trade-offs

- The kill switch hides runtime-fed surfaces -> label every such frame in the register and name the affected screens in the evidence document.
- Orchestrator route restoration lands on the wrong screen -> click rows and read the heading back; never trust a deep link without a check.
- A capture walk stalls on one screen -> every control is optional, every failure records a gap, and no step is retried.
- Identical frames inflate apparent coverage -> dedupe by image hash and mark the row as a duplicate of the first.
- Attractive mockups get read as observations -> evidence and proposals are separate documents with separate archive entries.
- Paid work expands beyond capture needs -> one named gap per run, Luna/high enforced, bounds set, stop at the target state.

## Migration Plan

No production data migration. Add the capture spec, the two documents, the screenshots and the archive entries. Validate both routes through the styleguide server before delivery. Leave the source profile and workspaces unchanged, and remove only the temporary capture home. Rollback removes the audit assets and archive entries.

## Open Questions

- Which rejected states are worth a bounded live run, and in what order? Decide with the user after the evidence document is reviewed.
- Does the user want the proposals split per area, or one document? Default is one document with numbered states per area.

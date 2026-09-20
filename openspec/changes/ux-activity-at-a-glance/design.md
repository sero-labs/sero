## Context

See proposal.md for motivation, and the approved drawings in `apps/styleguide/public/prototypes/agent-workspace-ux-audit/1-activity-at-a-glance.html`.

What the code has today, which shapes every decision below:

- `ArchitectIndexEntry.stateLine` (`plugins/sero-architect-plugin/shared/types.ts:13`) is free text the runtime writes, for example `` stateLine: `Working on ${milestone.title}.` `` in `runtime/dispatch-link.ts:177`. The UI prints it verbatim (`ui/components/ProjectsList.tsx:20`, `ui/components/StateLine.tsx:86`). That is the "Working on M2 for three days" fault.
- The Architect already watches the Orchestrator loop and room indexes push-only through `host.onStateChange` (`runtime/dispatch-watch.ts`), and stamps `MilestoneDispatch.lastRunAt` / `nextRunAt` for scheduled dispatches only (`shared/record.ts:70`).
- The Orchestrator's `progress.running` comes from the durable `Loop.runtime.activeRunId` (`runtime/store.ts:31`), which survives a crash until `runtime/reconcile.ts` clears it at startup. The live truth, `Coordinator.running`, is an in-memory `Map` reachable only through `isRunning(loopId)` (`runtime/coordinator.ts:144`).
- Home's active count is `runningLoops + runningRooms + activeGoals` (`ui/components/HomeView.tsx:63`), while the Workflows list prints the status enum's label `Active` (`ui/lib/status-style.ts:32`). Two rules, one word.
- Pause only flips `record.paused` and writes history (`shared/lifecycle.ts:73`); `runtime/projects-actions.ts:244` says so out loud: "Running work continues; the owner is not woken until resume."
- The typed board action set has no pause. `set_schedule` pauses a cron leg only, and the contract says a hybrid trigger "still fires on its events while paused" (`packages/common/src/orchestrator-contract.ts:31`). `disable` exists but aborts the in-flight run (`runtime/lifecycle.ts:38`), which the existing pause guarantee forbids.
- The Agent Board store already watches every workspace's Orchestrator indexes through `window.sero.appState` with absolute paths, push-only (`apps/desktop/src/stores/agent-board.ts`). Nothing in the host reads the Architect index, and there is no badge or attention contribution point.

## Goals / Non-Goals

**Goals:**

- One derivation of state, used by four surfaces and two plugins.
- Liveness that can only come from an observed report, so no surface can claim work that is not happening.
- Pause that stops new maintenance runs without aborting work in flight.

**Non-Goals:**

- The Workflow page's own redesign. This change lands the route and moves today's detail content onto it; #537, #538 and #541 restyle it.
- Rooms' internals, Goals, Library and Catalog.
- A general attention or badge contribution API for plugins. The tree reads the two indexes that exist.
- Opening the project folder in Finder. The issue leaves it undecided, so the path stays plain text.

## Decisions

### The vocabulary is data in `@sero-ai/common`, not copy in each UI

A new `packages/common/src/activity-state.ts` exports the nine state ids, their word, their glyph id and a builder for the "what happens next" sentence. Both plugins and the desktop tree import it.

Why here: the tree's hover text must match the Architect list word for word, and the tree cannot import from a plugin. `@sero-ai/common` is already the place where the Agent Board and the plugins share view contracts. The alternative, duplicating the words in three places, is what produced "0 active" over an "Active" Workflow.

Glyphs are ids, not components, so each surface renders them with its own icon set at its own size.

### Liveness is observed per side, with no new host seam and no heartbeat

Two derivations, each local to the process that knows the truth:

- **Orchestrator.** The coordinator writes a `liveRun` mark into the loop index only from its in-memory `running` map, and clears it when the run ends. `runtime/reconcile.ts` already clears orphaned `activeRunId` at startup; it also clears any `liveRun` it finds, so a mark in the index means this session. `LoopSummary` gains `liveRun?: { runId, startedAt, reportedAt }` and the board view in `@sero-ai/common` gains the same field.
- **Architect.** `dispatch-watch.ts` stamps `MilestoneDispatch.observedLiveAt` when it sees a watched index report a live run, and the runtime clears every saved `observedLiveAt` when it starts. So a dispatch is live only if this runtime instance saw it report.

Why not a heartbeat or a freshness timeout: both are polling in disguise, and the approved design says no timer. Why not read `Coordinator.isRunning` from the renderer: it is in the main process and would need new IPC for a value the index can carry.

Residual case: a workspace whose coordinator never loads in this session keeps its old index file. The Architect's own clear-on-start handles the Architect surfaces; the Orchestrator only ever renders its own workspace, whose coordinator is loaded. Cross-workspace readers (the board, the tree) treat a `liveRun` mark they cannot attribute to a loaded coordinator as not live.

### "Is the Architect running" is written by the extension at activation

The Architect index gains `runtime: { running: boolean; startedAt: string }`. The Architect extension writes it on activation, both when `architectEnabled(env)` is true and when the kill switch is off, in which case it writes `running: false`. Shutdown writes `running: false`.

Why activation and not a heartbeat: activation is the one moment that is guaranteed to happen once per Sero session, and the audit's own case, the runtime disabled by `SERO_ARCHITECT`, is exactly an activation with the switch off. Known limit: if the extension host crashes mid-session the flag stays `true` until the next start. The damage is bounded, because no new reports arrive, so every row falls to `Last known` anyway; only the top-of-list notice is missing. Recorded as a risk rather than paid for with a heartbeat.

### The index carries a derived activity; the model's sentence stays on the record

`ArchitectIndexEntry` gains `activity: { state, headline, owner, lastReportAt, action? }` and keeps `stateLine` on the project record for the project page's "What Architect reported" disclosure. `dispatch-link.ts` stops writing a state sentence into the index.

`headline` and `owner` are built from fields, not prose: the milestone title, the dispatch kind and id, the Room member count, the trigger summary, the block reason. `action` is the one thing the user must do, with the control it maps to, so the list, the project header and the tree all name the same action.

Alternative rejected: keeping `stateLine` and parsing it. Parsing prose to recover state is the failure mode the vocabulary exists to end.

### Pause disarms triggers through one new typed action

`OrchestratorBoardAction` gains `{ kind: 'set_armed'; loopId: string; armed: boolean; triggerIds?: string[] }`, implemented in the Orchestrator by setting `LoopTrigger.disabled` on each named trigger. It does not touch `activeRunId` and does not abort a run, so the existing "pause must not cancel in-flight work" guarantee holds.

The Architect records the trigger ids it disarmed on `MilestoneDispatch.disarmedTriggerIds` and re-arms exactly those on resume. Keeping the list on the caller's record, not on the loop, is what makes "a trigger the user turned off by hand stays off" true without the Orchestrator having to model who disarmed what.

Alternatives rejected: `disable` aborts the in-flight run; `set_schedule` leaves the event legs of a hybrid trigger firing, which is most of the maintenance triggers (`github:issue-opened`, `github:ci-failed`).

### The Workflow page reuses the existing navigation union

`OrchestratorView` already has `{ mode: 'detail'; loopId: string | null }` and serialises to `workflows/<loopId>` (`ui/lib/orchestrator-navigation.ts`). The list renders full width when `loopId` is null and the page renders when it is set, so the back link is `navigate({ mode: 'detail', loopId: null })`. No router, no new view id, and the host's navigation history keeps working.

### The tree derives its icon in the renderer from watched indexes

`WorkspaceNode` gets an optional attention prop from a small selector that reads the Agent Board store's per-workspace slices, plus one new watch on the Architect index at `~/.sero-ui/apps/architect/state.json` keyed by `ArchitectIndexEntry.workspaceId`. The board store's `start()` already attaches the Orchestrator watches; the tree calls it.

Why not an attention contribution point in `AppContributions`: a general API for one icon is more than the job needs, and both records are already published and watched. If a third app later needs the same, that is the moment to generalise.

Why not the notification feed: notifications are events, not state. A Room that has waited nine days must show whether or not a notification was ever delivered or read.

## Risks / Trade-offs

- **The Architect extension host crashes mid-session** → the "not running" notice is missing until restart, though every row still falls back to `Last known`. Accepted; a heartbeat costs a polling loop.
- **Two liveness derivations could drift** → they share one predicate in `@sero-ai/common` (`isLive(mark, session)`), and the words come from the shared vocabulary, so a drift is a type error or a failing shared test, not a silent mismatch.
- **`stateLine` has other readers** → the widget and the project page both read it today. Both are changed in this task set; nothing outside the plugin reads it.
- **Disarming maintenance during pause could look like the Workflow was cancelled** → the row says `Paused by you` with "the maintenance Workflow is paused with the project", and resume restores the triggers it disarmed.
- **The tree reading two app records couples the shell to plugin state shapes** → both are typed views in `@sero-ai/common` already used this way by the Agent Board, so a shape change is a typecheck failure.
- **The Workflows page route changes how a Workflow is reached** → the view id `workflows/<loopId>` is unchanged, so existing navigation and history entries still resolve.
- **500 LOC cap** → `HomeView.tsx`, `OrchestratorApp.tsx` and `StateLine.tsx` are the files most likely to cross it. Split the state-word rendering into a shared component and the Home sections into their own files as part of the work, not afterwards.

## Migration Plan

No data migration. Every new field is optional and absent means "not live" or "not known":

- An index written by an older build has no `activity`, so the UI derives what it can from the record and otherwise reads `Last known`.
- A dispatch with no `disarmedTriggerIds` re-arms nothing on resume, which matches today's behaviour.
- A loop index with no `liveRun` reads as not live, which is the safe direction.

Rollback is reverting the code; the extra fields are ignored by the older readers.

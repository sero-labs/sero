## Context

See proposal.md for motivation and `specs/` for the required behaviour. The visual spec is `apps/styleguide/public/prototypes/live-agent-progress.html`.

Two live sources exist today:

- **Subagent runs.** Every `runStructured` call and every `subagent` tool call creates a tracker entry in the main process (`features/subagent/core/tracker.ts`). The IPC layer forwards live text and tool activity to every window through a throttle that is shared across runs and keeps only the latest arguments (`electron/ipc/subagent/subagent.ts:98-110`), so parallel runs can starve each other.
- **Room member sessions.** The Room runtime buffers each member's current turn while a Watch lease is held (`rooms/room-observation.ts`, `rooms/room-app-live.ts`). The UI reads that buffer only when `roomSignal` changes (`ui/lib/room-view.ts:25`), so tiles do not stream. A plugin runtime has no way to push events to its own UI.

The host run API already reports the tracker run id: the first `onObservation` record of a `runStructured` call carries it as `identities.operationId` (`core/single-run.ts:148`), before the run waits for a slot. The Orchestrator host adapter does not forward `onObservation`, and `StepAttempt.workerRunId` is declared but never written.

## Goals / Non-Goals

**Goals:**
- One push path per live source, opened by visibility and closed when hidden.
- Each surface identifies its own run by id, never by matching text or timing.

**Non-Goals:**
- Replaying missed live text. History stays in session files and step artifacts.
- Live views on the phone (web-remote) or in Agent Node.
- Stopping a single run from its live block.

## Decisions

### D1. Subagent watch is reference-counted per window in the main process

Add `watch(runId)` and `unwatch(runId)` to the subagent bridge. The main process keeps, per window, the set of watched run ids and a count per id. `subagent_live_output` and `subagent_tool_activity` go only to windows that watch that run. `subagent_start`, `subagent_progress` and `subagent_end` still go to every window, because they are small and other views depend on them. When a window is destroyed its watches are dropped. When a run has no watch left, its renderer-bound buffer is dropped; the tracker keeps its own capped tail for the final result, as today.

Alternative: gate in the renderer store. Rejected, because the cost Dan named is the main process sending data nobody sees.

### D2. Per-run throttle

Replace the shared throttle with one timer and one pending payload per run id, cleared on `subagent_end`. Each payload is the whole capped tail, so a dropped intermediate frame loses nothing.

### D3. A plugin runtime can push to its own UI

Add a small host capability: the runtime calls `ctx.host.ui.emit(topic, payload)`, and the plugin UI subscribes through an `@sero-ai/app-runtime` hook (`useAppRuntimeEvents(topic, handler)`). Delivery is scoped to that app's views in that workspace, and nothing is persisted. The Room runtime uses it to send member live events while a Watch lease is held, throttled per member like D2. The lease already exists (`watch` and `unwatch` actions), and the roster check stays in the Room runtime, which already refuses a member outside the Room.

Alternative: expose persistent-session subscription to the renderer directly. Rejected, because the renderer would need the Room's grant and member-to-handle mapping, duplicating the authority the Room runtime already enforces.

### D4. Each surface stores the run id it started

| Surface | Where the run id is saved |
|---|---|
| Workflow step (model or background agent) | `StepAttempt.workerRunId`, written through `onAttempt` from the first observation |
| Checks between steps (evaluator, recovery, stop condition) | a `liveCall` record `{ kind, runId, stepId }` on the loop runtime, cleared when the call returns |
| Planner, trigger extraction, refine, reflect, skill | the same `liveCall` record, with no `stepId` |
| New event check | the same `liveCall` record, with the event's label |
| Room design | the pending planning entry for the request id |
| Room rethink | `room.runtime`, beside `status: 'adjusting'` |
| Architect direct research | the pending research entry |
| Design Library generation | the pending generation job |
| Chat `subagent` call | a new optional `toolCallId` on `SubagentEntry`, passed from the tool's `execute` |
| Room member's children | matched by `SubagentEntry.parentSessionId` against the member's `sessionId` |

The Orchestrator host adapter forwards `onObservation`; `runTrackedModel` takes an `onRunId` callback so each caller writes its record. All writes go through the existing single writer for each record.

### D5. Finished and waiting tiles read the last reply once

When a Watch tile shows a waiting or finished member, it asks the existing `history` action for the newest page and shows the end of the last assistant entry. It reads again only when the member's status changes. No live watch is opened for such a member.

### D6. Explorer removal and the saved panel id

Delete the Orchestration panel files, its activity bar item and badge. `BUILTIN_EXPLORER_PANELS` loses `orchestration`. Because an unknown saved panel id is kept for absent plugins (`lib/explorer-panels.ts`), a saved `orchestration` id is mapped to `explorer` when the layout is read. The renderer subagent store stays and backs the chat live blocks.

### D7. The Research plugin

`sero-research-plugin` calls `watch` for each agent it shows and `unwatch` when its panel closes. It checks that `watch` exists, so it still loads on an older host, where it shows start and end only.

## Risks / Trade-offs

- [A raw JSON reply can be long] → the existing renderer tail cap (`MAX_RENDERER_TEXT_CHARS`) applies; the block shows the newest part.
- [A renderer that crashes keeps a Room lease] → the existing five-minute lease expiry stays; D1 watches drop with the window.
- [The first observation arrives before the tracker entry exists] → a watch on a queued run is accepted and receives data from the run's start.
- [`@sero-ai/common` and `@sero-ai/app-runtime` gain API] → both are published; bump their versions in the same pull request.
- [The external Research plugin lags the host] → D7 feature check keeps it loading.

## Migration Plan

1. Ship host changes (D1, D2, D3, `toolCallId`) with the package bumps.
2. Ship plugin changes (Orchestrator, Architect, Design Library).
3. Remove the Explorer panel and map the saved id (D6).
4. Update the Research plugin in its own repository.

Rollback is a revert of the pull request; no stored data changes shape except optional fields.

## Context

See proposal.md for motivation. The design-relevant facts found while reading the code:

- `projectActivity()` in `plugins/sero-architect-plugin/shared/activity.ts` already returns `Stopped by the spend cap` as a headline with an owner sentence and an action. Screen 1 is mostly moving the cap form, not new wording.
- `StateLine` takes a single `HeaderAction`, and `LimitBanner` renders a separate strip below the header with its own `CapInput`.
- `observeResearchRooms()` in `runtime/research-room.ts` writes `Research Room <id> is <status>. Open the Room to review its next action.` into `blockedReason` and `stateLine`. `OrchestratorBoardRoomView.title` is in scope at that point and is discarded. The reason a Room could not run commands is a separate `Decision` raised by `runtime/research-access.ts`.
- `PendingResearch.attempts` counts planning attempts and is capped at 2. It is not a count of Room stops.
- `totalCost()` in `runtime/limits.ts` and `toLifetimeUsage()` in `runtime/store.ts` compute the same sum. `summarizeLoopUsage()` in `ui/lib/usage-summary.ts` computes a different, smaller one, and its own comment claims they are equal.
- `checkRoomLimits()` in `runtime/rooms/room-limits.ts` and `RoomTopBar` both compute Room elapsed time as `now - startedAt`. `elapsedActiveMs()` in `runtime/goals/goal-limits.ts` is the pattern that already solves this for Goals.
- `mapRouteState()` in `ui/lib/plan-map-state.ts` is exported and already returns `not-taken`.
- `chooseOwnerModel()` in `runtime/owner-session.ts` returns `{model, thinking}` and discards the source that `resolveOwnerSelection()` resolved.
- `RoomRoster` prints each member's status in words, which is where the removed turns-active count still lives.

`apps/styleguide/public/prototypes/agent-workspace-ux-audit/2-act-on-it.html` is the visual specification. The two layout questions it could not answer are drawn and decided in `2a-open-questions.html` in the same folder.

## Goals / Non-Goals

**Goals:**

- One derivation per figure, so a screen and the limit that stops the work cannot disagree.
- The cause of a stop is saved when it happens, not reconstructed by a reader later.
- The header carries the control that fixes the stop, without that control leaving the place it already lives.

**Non-Goals:**

- Redesigning the plan map. Map is unchanged; only the detail view gains `Not taken`.
- Changing what a Workflow's cost limit blocks on. Only the displayed figure changes, to match it.
- Anything on the other seven audit proposals. Screens they own are referenced, not moved.
- Recovering the real active time of Rooms paused before this change. It is not recorded and cannot be.

## Decisions

### The Workflow page reads the enforced total, rather than the limit being narrowed to the page's figure

`maxCostUsd` is tested against planning plus auxiliary plus every run. The Workflow page derives a smaller number. Two ways to make them agree: raise the page to the enforced total, or narrow the limit to run spend only.

Raise the page. The alternative would stop counting real money against the cap: planning, reflection, skill extraction and revision proposals are charged to the user and would become uncapped. This reverses decision 4 in issue 537, which assumed the smaller figure was the enforced one.

The page should read the enforced value rather than recompute it. A second derivation is what produced the disagreement, so `summarizeLoopUsage()` either consumes the same aggregate the index carries or is removed in favour of it. Its comment claiming the two are equal is corrected with the code.

### Rooms accumulate active time, following the Goals pattern

The Room header is not lying: the Room's own time limit also counts wall clock, so a Room paused for nine days really is over a one-hour limit. Freezing the display alone would make the screen disagree with the engine, which is the defect being fixed elsewhere in this change.

`Room.runtime` gains an accumulated active duration and the instant the current active period began, mirroring `Goal.usage.activeMs` and `Goal.activeSince`. `checkRoomLimits()` and the header both read the accumulated value. The accumulator is written at the transitions that already persist Room runtime state, so no timer runs.

Alternative considered: deriving active time from the Room's event history. Rejected because it makes every limit check walk the history, and the history is not guaranteed to hold every pause.

### An existing paused Room is credited the wall clock it has already accrued

Nothing records when an existing Room paused, so its real active time is unrecoverable. Seeding from zero would silently hand back time that was really spent; refusing to show a figure would add a one-off state to build and then carry forever.

Seed the accumulator from `startedAt` to the migration instant. An old paused Room keeps the number it shows today, and that number stops growing. This is stated in the spec so the behaviour is deliberate rather than incidental.

### The block is saved as fields, not as a sentence

`blockedReason` is a string that later code reads back by prefix matching. Screen 2 needs four facts out of it: the Room's title, its state, the time and the cause.

The record gains a named structure for a block on delegated work, carrying those four. The Room title is saved at the moment `observeResearchRooms()` blocks, where it is already in hand. The cause refers to the research-access decision when one exists.

Records written before this change hold only the sentence. They keep rendering from it, with the shorter form and no reason line, rather than being migrated by parsing the sentence that the change exists to stop parsing.

`attempts` is not used for the drawn phrase "it stopped twice": it counts planning attempts. The spec forbids presenting it as a count of the work stopping.

### The header takes a small set of actions, not one

`HeaderAction` becomes a list, and the header can render a field alongside a control where the action needs a value. `LimitBanner`'s `CapInput` moves into the header rather than being duplicated, so the cap is raised through one code path and the project menu's Raise cap keeps working.

"Tell Architect what to do next" focuses the existing `DirectiveComposer` in the dock. It is not a second way to send a directive. Focusing a node is an external side effect, so a ref and an imperative focus call are the right seam, not derived state.

### The Workflow settings line keeps seven labelled columns

Decided against adding columns for the event source's health and its queue, and against hiding all of it behind the Starts value. Which events start a Workflow is a setting and belongs in `Starts`. What has arrived and not run, and whether the source is delaying requests, describe the present, so they go with the Workflow's state where the eye already goes. A Workflow that has quietly stopped firing is then visible without a click, which the hidden option would have cost.

### The Room header drops the status dot and the turns count

The dot repeats the word beside it and carries its meaning in colour alone, which the audit forbids. The turns count is the Team roster's member states added up, and `RoomRoster` names each member's state in words, so no fact leaves the page. Both are removed under the audit's own goal of saying each fact once.

## Risks / Trade-offs

- **The spend figure rises on the Workflow page, and a user may read it as a new charge.** → The figure is described as the spend the limit counts, and the remaining budget it implies is the one the Workflow actually blocks at. No new money is spent.
- **Seeding the Room accumulator from wall clock means an existing paused Room may already be over its time limit and stop on resume.** → That is today's behaviour, not a regression. The alternative hands back time that was really spent.
- **Old project records keep the sentence form, so screen 2 shows the shorter version for them.** → Accepted. Parsing the sentence is the thing being removed, and a research block is short-lived.
- **`LoopDetail`, `StepCard` and `StateLine` all grow.** → The 500-line source cap applies; split by seam before completion rather than after.
- **This change's `orchestrator-ui` and `activity-state` deltas assume `ux-activity-at-a-glance` lands first.** → See Migration Plan.

## Migration Plan

1. Sync or archive `ux-activity-at-a-glance` before this change is archived. It creates `orchestrator-ui` and `activity-state` and modifies `architect-ui` and `architect-project-record`, none of which are in `openspec/specs/` yet. This change's `architect-ui` delta modifies the version that change produces. Archiving them out of order would revert it.
2. Ship the two accounting fixes with their tests before the visual work, so the figures the redrawn screens print are already correct.
3. Seed the Room active-time accumulator on first read of a Room record that has none.
4. Rollback is per-surface: each screen's change is independent of the others once the accounting fixes are in.

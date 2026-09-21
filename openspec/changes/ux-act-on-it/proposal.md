## Why

When a project or a Room stops and needs the user, the screen today makes them work out what happened. The heading is the Architect's own paragraph, cut mid-word. The control that fixes the stop is two cards further down. A cancelled research Room is named by its id, and the reason it was cancelled is one line among sixty-four in History. A Room on hold offers the same three actions twice, and a Workflow page shows seven equal buttons with Delete beside Run again.

Two figures on those screens are also wrong. A Workflow's spend reads lower on its own page than on Home, because the page counts only what the runs spent and leaves out planning and reflection, while the cost limit counts all of it. A paused Room reads `229h 28m of 1h`, because the Room's time limit measures wall clock and keeps measuring while the Room is paused.

This is proposal 2 of the agent and workspace UX audit, issue 537, drawn in `apps/styleguide/public/prototypes/agent-workspace-ux-audit/2-act-on-it.html`. That drawing is the visual specification. This change describes the behaviour behind it.

## What Changes

- A stopped project leads with what stopped, and the control that fixes it sits beside that sentence. At the cap, the new-cap field and Raise and resume move into the header. The empty Needs you section goes while it is empty.
- A cancelled research Room is named by its title, says when it was cancelled and why, and offers the two actions that exist: open the Room, or tell the Architect what to do next. Architect saves that reason when it blocks, instead of leaving it to be read out of History.
- A Room on hold states the question in plain words, folds the members' own text under it, and carries the Room's three actions once. The header keeps the Room's name, state, spend and time. When a running Room asks nothing, Stop returns to the header.
- A Workflow page gains a labelled settings line, a Result row on each step, and the instruction and expected result behind a chevron. Delete moves into More actions. A step on a route that was not chosen reads `Not taken`. The steps-at-a-time display is removed.
- The project models view gains an OWNER row, and a tier that inherits from a global says the global cannot be read while the Architect is off, instead of asking the user to choose a model.
- Empty, not made yet, not available here and stopped each get one quiet line where they belong. Only a fault uses colour.
- **BREAKING for the displayed figure:** a Workflow's spend reads the total its cost limit counts, on every screen. This is the larger figure, which Home and the Workflows list already show, not the smaller one the Workflow page shows today.
- A Room's elapsed time counts the time the Room was active, in the engine as well as on screen, so the clock stops while the Room is paused and the time limit stops with it.

## Capabilities

### New Capabilities

- `orchestrator-run-accounting`: how a Workflow's lifetime spend and a Room's elapsed time are counted, and the rule that a figure on screen is the same figure the limit enforces.

### Modified Capabilities

- `architect-ui`: the project header carries the control that fixes the stop beside the sentence that names it, and may carry more than one action; a blocked research Room is named and explained; each kind of nothing gets one line and an empty section is absent rather than announced.
- `architect-project-record`: the record saves why the Architect blocked on a research Room, with the Room's title, its status, the time and the cause, instead of one prefixed sentence in `blockedReason`.
- `architect-model-overrides`: the models view shows the owner's model as a row of the table with its source, and distinguishes a global that cannot be read now from a tier with nothing selected. The requirement that the owner's source is shown already exists; what changes is that a tier with an unreadable global must not be reported as unselected.
- `orchestrator-ui`: the Workflow page shows its settings as a labelled line and its plan as steps with a result, and the Room page states the hold once with its actions once.

## Impact

- Architect plugin: `ui/components/StateLine.tsx`, `LimitBanner.tsx`, `NeedsYou.tsx`, `ModelSettings.tsx`, `ProjectPage.tsx`; `runtime/research-room.ts`, `runtime/owner-session.ts`; `shared/record.ts`, `shared/activity.ts`. `chooseOwnerModel()` discards the resolved model's source, which `architect-model-overrides` already requires to be shown; widening it is an implementation gap, not a new requirement.
- Orchestrator plugin: `ui/components/LoopMetaStrip.tsx`, `StepCard.tsx`, `PlanView.tsx`, `LoopDetail.tsx`, `RoomTopBar.tsx`, `RoomAttentionCards.tsx`, `RoomActivity.tsx`; `ui/lib/usage-summary.ts`; `runtime/rooms/room-limits.ts` and the Room runtime record.
- Existing paused Rooms need their active-time accumulator seeded, or their elapsed time is lost.
- Depends on the `ux-activity-at-a-glance` change being synced: `orchestrator-ui` and the shared activity vocabulary are defined there and are not yet in `openspec/specs/`.
- No host or IPC contract changes.

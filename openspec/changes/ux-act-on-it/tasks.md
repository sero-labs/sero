## 1. The two accounting fixes, before any screen is redrawn

- [x] 1.1 Make the Workflow detail page read the same lifetime spend the cost limit is tested against, replacing the run-only sum in `ui/lib/usage-summary.ts`, and correct its comment that claims the two are already equal. Verify with a unit test over a Workflow that has planning usage, Workflow-level auxiliary usage and two runs, asserting the page figure equals `totalCost()` from `runtime/limits.ts`.
- [x] 1.2 Assert the three surfaces agree: add a test that Home, the Workflows list and the Workflow page render the same spend for one record, and that the remaining budget reaches zero at the point `maxCostUsd` blocks.
- [x] 1.3 Add an accumulated active duration and a current-period start to the Room runtime record, and an `elapsedActiveMs` equivalent for Rooms mirroring `runtime/goals/goal-limits.ts`. Verify with a unit test covering run, pause, resume and end.
- [x] 1.4 Make `checkRoomLimits()` test `maxWallClockMs` against accumulated active time rather than `now - startedAt`. Verify a Room paused for nine days with twelve active minutes is not over a one-hour limit, and that it trips after the accumulated time passes the limit.
- [x] 1.5 Seed the accumulator from `startedAt` to the migration instant when a Room record has none, and verify an existing paused Room reads the elapsed time it had and does not grow afterwards.
- [x] 1.6 Make `RoomTopBar` read the accumulated active time and drop its own `now - startedAt` computation, and verify by rendering a paused Room that its elapsed figure does not change between renders.

## 2. Architect records why it stopped

- [ ] 2.1 Add the named block structure to the project record for a block on delegated work, carrying the work's title, its state, the time and an optional cause, alongside the existing `blockedReason`. Verify the record round-trips through the store with the new fields.
- [ ] 2.2 Save the Room title, status and time in `observeResearchRooms()` at the point it blocks, using the `OrchestratorBoardRoomView.title` already in scope, and link the research-access decision as the cause when one exists. Verify with a test that a cancelled research Room produces a record naming the Room and the cause.
- [ ] 2.3 Verify a block with no recorded cause saves the work, its state and the time and no cause, and that `PendingResearch.attempts` is not written or read as a count of the work stopping.
- [ ] 2.4 Derive the screen-2 headline and reason from the saved fields in `shared/activity.ts`, falling back to the existing sentence for records written before this change. Verify both an old record and a new one render without the Room id as the heading.

## 3. The project header carries the fix

- [ ] 3.1 Change `StateLine` to accept a small set of header actions instead of one, and to render a field beside a control where the action needs a value. Verify existing header-action tests still pass and a two-action state renders both.
- [ ] 3.2 Move `LimitBanner`'s cap field and Raise and resume into the header and delete the separate strip, keeping one code path for raising the cap. Verify raising from the header and from the project menu both call the same action and that a refusal still shows its message.
- [ ] 3.3 Add the two actions for a cancelled research Room: open the Room, and tell the Architect what to do next, the second focusing the existing `DirectiveComposer` in the dock through a ref. Verify the composer receives focus and that no second send path is introduced.
- [ ] 3.4 Remove the autonomy sentence from the header, and verify the setting is still reachable in the project controls menu.

## 4. Each kind of nothing, once

- [ ] 4.1 Make the Needs You section absent while it is empty and return with its controls when it holds something. Verify a project with no decision renders no heading, label or card for it, and that raising a decision brings the section back.
- [ ] 4.2 Replace the empty milestones card with one line in the section header naming what produces milestones. Verify a project with no charter renders that line and no card.
- [ ] 4.3 Make the Rooms-off case in `RoomActivity` say the activity is not available while the runtime is off and how many events are saved, instead of saying nothing has happened. Verify both the runtime-off case with saved events and the genuinely empty case with the runtime running.
- [ ] 4.4 Verify that among several empty sections and one stopped research Room, only the stopped Room's line uses colour.

## 5. The Workflow page

- [ ] 5.1 Replace `LoopMetaStrip`'s icon chips with the labelled settings line covering where it runs, where results go, what starts it, context, spend, attempts and time, with context and delivery opening from their values. Verify each label renders and that the steps-at-a-time limit is absent from the display while still applying.
- [ ] 5.2 Put the event triggers under what starts the Workflow, with their filters and conditions opening from that value, and move queued events and source health onto the Workflow's state line in the same quiet grey. Verify a Workflow with two GitHub events, three queued events and a delaying source renders all three facts without the user opening anything, and that none is coloured as needing the user.
- [ ] 5.3 Give each step in the detail view a title, a state word and a Result row, with instruction and expected result behind a chevron. Verify a finished step renders its result and keeps its instruction folded.
- [ ] 5.4 Move model, agent and tools behind one control on the step, showing on the card only what the user changed. Verify a step with only its model changed shows the model and keeps agent and tools folded.
- [ ] 5.5 Mark a step whose route was not chosen as `Not taken` in the detail view, reusing `mapRouteState()`. Verify a skipped step reads `Not taken`, an undecided branch's steps read pending, and Map dims the same step the detail view marks.
- [ ] 5.6 Draw the loop-back on the plan rail and remove the banner that names the two steps by id. Verify the loop renders on the plan and the banner is gone.
- [ ] 5.7 Move Delete into More actions, away from Run again, and verify Run again remains the only primary control.

## 6. The Room page

- [ ] 6.1 Put the hold's question in plain words in one card with the members' own text folded under it, using the existing shared attention wording. Verify two blocked members produce one question sentence rather than a count.
- [ ] 6.2 Carry message, resume and stop in that card only, and remove their copies from the header while a hold is shown. Verify the header shows stop for a running Room that asks nothing, and shows none of the three while the hold card is rendered.
- [ ] 6.3 Fold the Read it strip into the card and verify the control is gone and the card shows what it used to open.
- [ ] 6.4 Remove the status dot and the turns-active count from the Room header and verify the Team roster still names each member's state in words.

## 7. Project models

- [ ] 7.1 Carry the resolved owner model's source and what it outranks out of `resolveOwnerSelection()` through `chooseOwnerModel()` and onto the record. Verify an environment-pinned owner saves its source.
- [ ] 7.2 Render the owner as a row of the tier table with its effective model, thinking level and source, and show the last known selection with the runtime off. Verify both the running and the not-running case.
- [ ] 7.3 Make a tier that inherits an unreadable global say the global cannot be read now, instead of showing nothing selected. Verify with the runtime off that inherited tiers say so, an overridden tier still shows its override, and starting the runtime resolves them without the user acting.
- [ ] 7.4 Put the rules about when a saved change takes effect behind one disclosure and verify they are not repeated beside each tier.

## 8. Match the drawing, and check

- [ ] 8.1 Capture every frame of `2-act-on-it.html` and of `2a-open-questions.html`, capture the built surfaces at the same width from each plugin's preview harness, and compare them frame by frame. Record each difference and either fix it or state it as a departure.
- [ ] 8.2 Confirm the `@container/panel` root is present on the Orchestrator preview page and that the host stylesheet is injected raw, before trusting any capture.
- [ ] 8.3 Check every control in each screen's parity list is still reachable, and name where anything the drawing dropped now lives.
- [ ] 8.4 Run `pnpm typecheck` from the root and the tests for both plugins, and verify no source file passed 500 lines.

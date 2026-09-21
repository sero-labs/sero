## 1. The run record keeps why a run ended

- [ ] 1.1 Add `block?: LoopBlock` and `interruptedStepIds?: string[]` to `LoopRunSummary` in `plugins/sero-orchestrator-plugin/shared/index-types.ts`, both optional. Verify a summary carrying neither parses, and one carrying both round-trips through the store.
- [ ] 1.2 Make `toRunSummary()` in `runtime/store.ts` retain `run.block` and the id of every activation a restart left in flight. Verify a run with one interrupted activation names it, and a run with two names both.
- [ ] 1.3 Stop `toRunSummary()` reporting an interrupted activation as `completed`, including when that activation's last attempt had already finished and when its attempt list is empty. Verify both cases report interrupted, and that every other step keeps its own outcome.
- [ ] 1.4 Verify a management-limit run retains its own reason text using a typed `LoopBlock` fixture with every field the type carries, and that a completed run retains no block and no interrupted step.
- [ ] 1.5 Verify a summary written before this change loads unchanged, reports no cause and no interrupted step, and that nothing tries to reconstruct either from another file.

## 2. An artifact keeps the line breaks its author wrote

- [ ] 2.1 Add one shared decode helper for escaped line breaks, following `unescapeContent()` in `plugins/sero-memory-plugin/extension/memory-tool.ts`. Verify it decodes `## A\n\n## B`, leaves content containing a real line break byte-for-byte unchanged, and is idempotent.
- [ ] 2.2 Run it in the Room command shaper's artifact path in `extension/room-commands.ts`, so only content that arrived through the command surface is decoded. Verify a publish through that path stores real line breaks, and that a publish from any other caller is stored unchanged, including a single line of prose that quotes the escape.
- [ ] 2.3 Split `runtime/rooms/room-app-actions.ts` before it takes the new export. It is at 491 of the 500-line source cap. Verify it is under 500 lines and that its existing behaviour and tests are unchanged.
- [ ] 2.4 Add the read action across all layers: the action enum and schema in `extension/room-app.ts`, the dispatch case, the method on `RoomAppActions` and its handler, and the renderer call. Verify an artifact of that Room returns its content, and an artifact of another Room is refused with no content.
- [ ] 2.5 Render an artifact's document structure by one rule: a heading line becomes a heading, text before the first heading is shown, a document with no heading shows all of its content, and unsupported markup is shown as text rather than dropped. Verify the three real shapes — `#` with `##`, `##` only, and no heading.
- [ ] 2.6 Verify the three artifacts already stored render their structure without the files being rewritten: `artifact_7aafbcee…` (68 escaped sequences, zero line breaks), `artifact_354aa84f…` (45) and `artifact_f848e9d4…` (28).
- [ ] 2.7 Report an artifact whose content cannot be read as unreadable, keeping its title, kind and author. Verify with a reference that cannot be opened.

## 3. The Architect header states the reason once

- [ ] 3.1 Extend the Architect's run view in `runtime/dispatch-watch.ts` to carry the block and the interrupted steps from the run summary. Verify both reach the project record for a stopped and for an interrupted Workflow.
- [ ] 3.2 Make `applyRunHealth()` in `runtime/run-health.ts` write the reason the run's own record retains, in place of the sentence it composes today.
- [ ] 3.3 Make the cap and time-limit writers in `dispatch-watch.ts` use the run's own `block.reason` rather than composing their own sentence, for the two cases where a real reason exists. Verify a cap stop records the limit's own text.
- [ ] 3.4 Compose the restart sentence from retained facts when the run was interrupted, naming the step only when the run's own order resolves to one interrupted step and naming none otherwise. Verify both the single-step and the two-step case.
- [ ] 3.5 Record no cause when the run retains none, while keeping the milestone recognisable as stopped and recoverable. Verify a stopped milestone with no retained cause stays stopped and its recovery still starts.
- [ ] 3.6 Set the reason on `projectActivity()`'s stopped branch in `shared/activity.ts` and change the headline to name the milestone that stopped. Verify the header renders the reason as the activity line beside its glyph, with no second sentence repeating the title or the state, and that the project list still reads correctly.
- [ ] 3.7 Move the whole recovery control from the milestone rail into the header, following the existing header-action seam: the cap field, the "Approve cap and resume" mode, Retry step, the busy state, and the error output. Verify the cap case, the no-step case, the with-step case, and the refused case from the header, and that the milestone rail no longer offers it.
- [ ] 3.8 Verify the sentence appears once on the page for a stopped dispatch, and that History keeps its own recorded entries.

## 4. Milestone evidence reads as a list of checks

- [ ] 4.1 Replace `evidenceLines()` in `ui/lib/view-model.ts` so each entry is one check carrying its outcome, its name, its own duration where the record holds one, and its own complete output — not the current 400-character tail. Verify the four commands of `proj_v1hy1h7u`'s `m1` give 0.9s, 1.5s, 0.8s and 0.8s, and that their full recorded output is available.
- [ ] 4.2 Add the changed-files, preview-response and capture checks beside the commands'. Verify the same milestone reports 17 new files, a responded page and a capture; define a failed smoke check, an absent capture and mixed tracked and untracked changes, and verify no duration or success is invented for any of them.
- [ ] 4.3 Render each check as the drawing's row: mono, outcome marker, name, duration right-aligned, output in its own inset block behind that row, and each row opening independently so opening one does not close another. Verify no output is visible until its row is opened.
- [ ] 4.4 Make the capture row open the preview through the action `ProjectPreview` already runs. Verify the control runs that same action.

## 5. The Workflow page's ending

- [ ] 5.1 Add one Result row above the settings that prints the recorded reason for every ending, in place of `LoopNotices`' `Stopped (status):` card. Verify a completed Workflow prints its `runtime.completion.reason` there and a Workflow stopped at a limit prints the limit's reason.
- [ ] 5.2 Remove `BlockNotice`'s non-step branch and carry its Restart and Refine plan actions onto the Result row. Verify a limit-stopped Workflow prints its reason once and both recovery actions still run.
- [ ] 5.3 Keep `BlockNotice` for a step-caused ending only, so the blocked step is still named with its Retry step control. Verify a step-blocked Workflow shows the Result row and one statement naming that step.
- [ ] 5.4 Make the request reachable from a disclosure on the objective for every Workflow, including one with no objective, and remove the prompt paragraph that shows only when a Workflow has no objective. Verify a Workflow with a summary, one without a summary, and one without an objective each reach their request, and that the objective is stated once.
- [ ] 5.5 Make a file named in a result open from its row through the host's file action, and show a reference the host cannot open without a control. Verify both cases.
- [ ] 5.6 Confirm a complete Workflow still shows no state line, per #537's recorded departure, and that no other state's line changed.

## 6. The Room's result

- [ ] 6.1 Make the result the Room's own closing line, matched against the referenced plan so its trailing identifier sentence is dropped only when that same plan is shown. Verify the title and the status are not repeated in the body, and that a Room missing a closing line still shows its result.
- [ ] 6.2 Show the delivery destination and time once as their own row, and say the work was not delivered when it was not. Verify both a delivered and an undelivered Room.
- [ ] 6.3 Render the Conductor's plan inline: the artifact's own recorded title as the card's title, its kind and author beside it, its first section open, the author's remaining sections folded and each opening from its own row, and an Open file control. Verify with `artifact_7aafbcee…` that the title reads "Final proposal: Signal Wake Crossing" and the ten sections render as ten folds with the first open.
- [ ] 6.4 List the Room's remaining artifacts as compact rows with a control to open each, show no plan block when the Room published no plan, and show no empty card for anything absent. Verify with a plan and two reports, and with neither.
- [ ] 6.5 Remove the duration, spend, Team and Artifacts figures from the result body, keeping duration and spend once in the header. Verify no stat cell remains and no fact is lost: the team is the member list and the artifacts are the listed artifacts.
- [ ] 6.6 Fold cost by member as the drawing's two-column list with mono amounts and no bars, each member's full name, each row opening that member, and the Room's total in the fold's own summary. Verify no name is truncated and small amounts keep their precision.
- [ ] 6.7 Bring the member list to the drawing: full names with their state, in the drawn column width, keeping the avatars and the member count. Verify two long names are not truncated.
- [ ] 6.8 Move Delete Room into the Room's ⋯ menu, following `LoopControls`, keeping its confirmation and its eligibility rule. Verify Delete is absent from beside the view controls, still asks, and is reachable from a member's own page.

## 7. A member's Info tab

- [ ] 7.1 Rebuild the Info tab as the drawing's split band: model, tools, access and spend in the main column with the spend ring in its own shaded column, and the working instructions complete behind a fold on the mandate. Keep the mandate's role, responsibilities, current task and priorities reachable. Verify against Morgan's record that the 81-word instruction is complete and that the model, tools, access and spend come first.
- [ ] 7.2 Move turns, tokens, retries, compactions and skills into one Usage disclosure, keeping any recorded compaction time. Verify each figure is behind it, and that the "1 turn" the drawing shows in the member header is still there.
- [ ] 7.3 State "no worktree" among the member's access facts and remove the separate worktree card. Keep the branch, the path and the folder-opening control for a member that has a worktree. Verify both a member with a worktree and one without.
- [ ] 7.4 Remove the closed-session sentence from the Info tab, and confirm the Session view still reports context for a member that has one. Verify no claim about a context window survives for a member whose session is closed.
- [ ] 7.5 Mark a member that has reached its per-member limit as a fault, drawn as the ring, using the rule the project and the Room already use. Verify below the limit, exactly at it, and above it, with the amount shown against the limit it exceeded.

## 8. Match the drawing, and check

- [ ] 8.1 Preflight, before any capture: confirm the shared vocabulary and the existing glyph components are reused rather than rebuilt, that no style animates and no meaning rests on colour alone, that amber appears only as a wash for what needs the user, that money is mono and right-aligned, that plain CSS uses host tokens rather than `--color-room-*`, and that every clickable value carries a pointer, a dotted underline and a hover state.
- [ ] 8.2 Confirm the `@container/panel` root is present on the Orchestrator preview page and that the host stylesheet is injected raw, before trusting any capture.
- [ ] 8.3 Add previews for a Workflow with a result, a Room result, and a member's Info tab, so each drawn surface can be captured from its own harness.
- [ ] 8.4 Capture frame 1 — the finished Workflow — from real records through the real top bar and page, with every fold, chevron and Tune panel opened in both the drawing and the build. Compare side by side with the drawing on the left, fix each difference, and record any departure.
- [ ] 8.5 Do the same for frame 2 — the stopped and the passed milestone — including the evidence rows with their outputs opened.
- [ ] 8.6 Do the same for frame 3 — the Room's result — including the plan's folded sections and the cost fold.
- [ ] 8.7 Do the same for frame 4 — the member's Info tab — including the working instructions and the Usage fold.
- [ ] 8.8 Check every entry in each screen's parity list is still reachable, and name where anything the drawing dropped now lives. Carry forward the departures already recorded in #537's `comparison.md` — Reflect all, the complete Workflow's state line, and the Room header's meters — rather than promising every old control remains.
- [ ] 8.9 Record each departure from the drawing, and why, in `comparison.md`, distinguishing an approved departure from a defect still to fix.
- [ ] 8.10 Run `pnpm typecheck` from the root and the tests for both plugins, and verify no source file passed 500 lines.

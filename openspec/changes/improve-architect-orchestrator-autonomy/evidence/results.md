# Results and evidence

The bounded pilot, its replays, a Room amendment run, a tool-discovery probe and a pause run ran on 2026-10-19. Their records are in `pilot-2026-10-19/`, `rerun-2026-10-19/`, `room-amend-2026-10-19/`, `probe-2026-10-19/` and `pause-2026-10-19/`, and the rendered views in `ui-2026-10-19/`. Earlier runs, from 2026-10-06, are kept below with their records in `pilot-phase0/`, `replay-phase1/` and `replay-worktree/`.

## Pilot, 2026-10-19

Both candidates ran on the global LOW tier of the disposable `testharness` profile: `deepseek/deepseek-flash` at low thinking. Each run started from a throwaway workspace seeded with the scenario's files, and a hidden test or file check decided acceptance. The bounds were $1 and 10 minutes per run and $6 for the batch.

- **Candidate revision.** Every pilot record names fd903a5d8. The Architect and Orchestrator plugin source the runs loaded is that revision's. Commits made while the batch ran changed docs, tests and the runner only.
- **Spend and time.** The 20 runs cost $0.86 and took 24 minutes. The two replays below cost $0.43.
- **Repeats.** Two per strategy per scenario. That is too few to claim that either strategy is better, and no such claim is made.

| Scenario | Run | Strategy | Outcome | Elapsed | Active | Cost | Owner turns | Context per turn, tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small-fix | 1 | Architect | accepted | 80 s | 70 s | $0.016 | 29 | 5,441 to 20,759 |
| small-fix | 2 | Architect | accepted | 69 s | 63 s | $0.013 | 24 | 5,338 to 16,223 |
| small-fix | 1 | Single agent | accepted | 16 s | 11 s | $0.005 | 5 | 10,540 to 12,101 |
| small-fix | 2 | Single agent | accepted | 19 s | 13 s | $0.004 | 7 | 10,541 to 12,543 |
| debugging | 1 | Architect | accepted | 99 s | 79 s | $0.127 | 33 | 5,352 to 22,948 |
| debugging | 2 | Architect | accepted | 69 s | 56 s | $0.012 | 21 | 5,402 to 14,392 |
| debugging | 1 | Single agent | accepted | 32 s | 27 s | $0.007 | 7 | 10,623 to 16,096 |
| debugging | 2 | Single agent | accepted | 27 s | 21 s | $0.006 | 8 | 10,587 to 14,694 |
| substantial-feature | 1 | Architect | rejected (runner fault, replayed) | 84 s | 60 s | $0.124 | 25 | 5,526 to 22,954 |
| substantial-feature | 2 | Architect | accepted | 225 s | 200 s | $0.340 | 63 | 5,517 to 56,000 |
| substantial-feature | 1 | Single agent | accepted | 95 s | 89 s | $0.007 | 9 | 10,765 to 16,314 |
| substantial-feature | 2 | Single agent | accepted | 182 s | 176 s | $0.009 | 9 | 10,740 to 17,683 |
| collaborative-research | 1 | Architect | accepted | 99 s | 83 s | $0.020 | 21 | 5,398 to 22,322 |
| collaborative-research | 2 | Architect | accepted | 84 s | 77 s | $0.018 | 21 | 5,694 to 20,580 |
| collaborative-research | 1 | Single agent | accepted | 24 s | 17 s | $0.005 | 6 | 10,689 to 14,564 |
| collaborative-research | 2 | Single agent | accepted | 19 s | 14 s | $0.004 | 5 | 10,705 to 13,488 |
| interruption | 1 | Architect | accepted, not interrupted (runner fault, replayed) | 69 s | 52 s | $0.012 | 19 | 5,413 to 14,310 |
| interruption | 2 | Architect | accepted, not interrupted (runner fault, replayed) | 94 s | 83 s | $0.121 | 33 | 5,411 to 24,004 |
| interruption | 1 | Single agent | accepted after a restart, one "Continue." | 25 s | 15 s | $0.005 | 4 | 10,641 to 13,179 |
| interruption | 2 | Single agent | accepted after a restart, one "Continue." | 27 s | 17 s | $0.006 | 6 | 10,633 to 14,412 |

Architect cost is partial: part of a Workflow's spend is known only as a project total, and the table adds both parts. Single-agent cost is per call. Architect runs over $0.10 include a Workflow: an independent review, a release step or a review Room.

### Replays on the corrected runner

The pilot exposed three faults in the runner, not in the product. Each is fixed in its own commit, and the affected Architect runs were run again on the same plugin source.

1. The runner scored a run as soon as every worked milestone was done. Substantial-feature run 1 closed m1 while its review milestone m2 was still planned, so it was scored before the review and rejected for a missing `REVIEW.md`. Fixed in 191cbd78b: the project must also have left `build`.
2. The interruption scenario restarted Sero only once a milestone was dispatched. An owner doing the work itself dispatches nothing, so neither Architect interruption run was interrupted. Fixed in 2ee1ca7f8: direct work in progress also triggers the restart.
3. After the restart the runner always pressed Resume. Interrupted direct work continues by itself, and Resume refuses a project that is neither paused nor blocked, so the first replay recorded a failed recovery while the project was carrying on. Fixed in 49f0323e9.

| Batch | Scenario | Run | Outcome | Elapsed | Worker time | Cost | Owner turns | Context per turn, tokens | Recovery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rerun | substantial-feature | 1 | accepted | 130 s | 18 s | $0.197 | 42 | 5,536 to 38,961 | |
| rerun | substantial-feature | 2 | accepted | 190 s | 72 s | $0.184 | 42 | 5,530 to 36,711 | |
| rerun | interruption | 1 | incomplete (fault 3) | 18 s | 0 s | $0.005 | 5 | 5,435 to 7,296 | recorded as failed |
| rerun | interruption | 2 | incomplete (fault 3) | 23 s | 0 s | $0.007 | 8 | 5,417 to 9,798 | recorded as failed |
| rerun2 | interruption | 1 | accepted | 78 s | 0 s | $0.014 | 22 | 5,445 to 20,109 | recovered, no intervention |
| rerun2 | interruption | 2 | accepted | 118 s | 1 s | $0.025 | 39 | 5,416 to 30,342 | recovered, no intervention |

The records name revisions 2ee1ca7f8 and 49f0323e9 with `+dirty`. The extra commits and the dirty files are the runner and evidence files; the plugins were unchanged from fd903a5d8. The second replay overwrote the first replay's manifest, but each record keeps its own controlled inputs.

### What the runs show

- **Direct work without delegation (2.9).** In all 16 kept Architect runs the owner did m1 itself: `work begin`, its own edits, `work report`, then evidence. A Workflow or Room was dispatched only for an independent review, a release step or maintenance.
- **Interruption keeps the execution (2.9, 5.8).** In both rerun2 runs Sero restarted during `work begin`'s turn. The restart marked the work `interrupted` with the reason "Sero restarted while this work was in progress". The owner was woken without a user action, continued the same execution id with `work --operation continue`, and reported on that id. Each run has one `begin`, no superseded execution and no intervention. The single agent needed a typed "Continue." after its restart, recorded as an intervention.
- **No duplicate work (5.8).** Across the 16 kept Architect project records, every dispatch id is unique and every milestone has one `begin`.
- **A durable wait, live (5.8).** Substantial-feature replay 1 registered `work --operation wait` on its review Workflow. The wait ended `satisfied` and its one wake was reserved and consumed.
- **Owner context per turn (2.9).** With direct work, owner context grew from about 5,400 tokens to between 14,000 and 24,000 on the small scenarios, and to about 56,000 over 63 turns on the longest run. Before direct work it grew from about 4,200 to 24,800 over 21 turns (the 2026-10-06 runs below). The single agent starts near 10,600 because it carries the full chat prompt.
- **Code Mode in a paid run (3.x).** Owners called `codemode` 8 times. In collaborative-research run 1 a script checked the findings against the code and called `sero-cli evidence` from inside the script. The tool was approved at start and was loaded, so no restart or second approval was needed.
- **No `tool_search` call.** No owner called `tool_search` in 16 runs. No scenario needed a tool outside the initial loadout. See 3.7 below.

### What the runs do not show

- No comparison of the strategies is claimed. The single agent was faster and cheaper on every scenario at this size, and every scenario is small enough for one agent.
- The `collaborative-research` scenario did not produce a Room. Both Architect runs answered it with direct work. The scenario does not test collaboration.
- The `substantial-feature` acceptance check proves `REVIEW.md` exists, not who wrote it. The single agent wrote its own review, once through its subagent tool. The check cannot tell an independent review from a self-review.
- No run exercised a process wait, a CI wait, a stall recovery or a multi-hour run.

## Owner protocol failures (6.1, 6.2)

The runner counts Workflow repair passes as protocol failures (f983a0641). It also keeps the owner's session, so the owner's refused commands can be counted too.

- **Workflow in-session repair: 0 passes.** Every Architect run that saved a Workflow run file counted 0 repair passes, across review, release and maintenance Workflows.
- **Owner commands: 64 of 254 refused (25%).** Across 16 Architect sessions the owner sent 254 `sero-cli` commands:
  - 38 refusals were JSON quoting errors in `--textJson`, `--planJson`, `--approachJson`, `--criteriaJson` and `--commandsJson`;
  - 7 were `working` calls without `--objective`;
  - 4 were dispatches whose `--promptJson` the tool dropped, because no such flag existed;
  - 15 were other state refusals, such as closing a milestone with stale evidence.
- **One misleading answer.** Accepting a milestone with a recorded receipt answered "the release is delivered and maintain starts" even when the delivery was still waiting on proof for a user-stated criterion. The project stayed in `build`.

Fixed in d194f5a97, after every run above:

- the owner tool accepts `--promptJson`;
- acceptance reports what the delivery actually settled;
- the owner contract no longer says `tool_search` finds skills.

**Recommendation, as an experiment, not shipped:** keep Workflow in-session repair. It needed no pass in these runs, so a structured reporting action has nothing to replace there. The measured cost is in the owner's command line: a quarter of its commands are refused, and most of those are JSON quoting of multi-line text inside a shell command. A separate bounded change could let the owner pass long text without shell quoting, for example from a file it wrote or as a Code Mode argument. That needs its own proposal, because it changes the owner's command contract.

**Prompt procedures (6.2): no change.** No procedure in the owner contract was shown to be redundant. Owners followed the begin, report, evidence and sleep sequence in every run, and the refusals above are formatting faults, not procedure faults. No procedure was removed.

## Room amendment across a restart (4.8)

One bounded Room run on 2026-10-19, `deepseek/deepseek-flash` at low thinking for every member, on a seeded throwaway profile. The record and screenshots are in `room-amend-2026-10-19/`. Cost $0.033.

1. The Room started with a Conductor and a reviewer, on grant `grant_aw8sykae`.
2. The Conductor asked to add a tester. The change adds a member, a working folder, a model, tools and write, command and commit permission, so the host answered `needs-approval` and the Room held it.
3. Sero was closed and opened again. The change was still held, with the same revision id and the same 13 additions.
4. The change was approved through the `rooms` tool and the host's Allow card. It was applied, and the Room's roster grew by one revision.
5. The grant id was `grant_aw8sykae` before the change, straight after the restart and at the end. The Conductor kept its session file and grew from 92 to 105 lines; the reviewer kept its file at 25 lines.

Two earlier attempts on the same day are not counted as results:

- One reached step 3, and the Conductor then finished the Room. Approving afterwards was refused with "The Room finished before this change could be applied." The spec had read the grant after the end, when a finished Room has released it, and read member histories from the wrong field. Both are fixed in b05fca605.
- One reached step 3, but approving opened the host's Allow card and nothing pressed it, so the 120-second timeout declined the change. The spec now presses Allow, as a user would.

**Found:** in the counted run the Conductor had also called `request-attention` after its change was held. That paused the Room for the user. Approving the change applied it but did not resume the Room or wake the Conductor, so the tester never ran. A typed message would have resumed it. Filed as issue 640, because whether an approval should count as the answer is a product decision.

**Not shown live:** an in-policy change applied with no dialog. That path is covered by the host grant-amendment tests and the Orchestrator amendment tests. The matched collaborative scenario did not form a Room in either Architect run (see above).

## Tool discovery probe (3.7)

This is a probe, not a matched replay. It is the `small-fix` scenario with one sentence added to the request (the runner's `SERO_BASELINE_PROBE`): "Before you finish, look at https://example.com the way a user would see it, using Sero's browser automation tool, and write its main heading to NOTES.md." No pilot scenario needed a tool outside the owner's first loadout, and that is why the 16 pilot runs made no `tool_search` call. The record and the owner's session and grant are in `probe-2026-10-19/`.

- **Revision** dec68164d. The `+dirty` files are the task list, the design note and evidence. Model `deepseek/deepseek-flash` at low thinking.
- **Outcome** accepted. 175 s, $0.029, 41 owner turns, context 5,585 to 30,944 tokens. No intervention.
- **The start approval** listed `automation_browser` with `read`, `bash`, `write`, `edit`, `sero-cli` and `codemode`. It was the only approval the run asked for.
- **Discovery.** The browser tool was approved but not loaded. The owner called `tool_search` with "browser automation open page navigate screenshot accessibility snapshot". The answer was "Loaded 1 tool" with `loaded: ["automation_browser"]`. Its next call, `automation_browser launch https://example.com`, returned the title "Example Domain", and NOTES.md got the heading. There was no restart, no second approval and no new session.
- **Authority.** The search could only load a tool the grant already allowed. A tool outside the approval is never registered (desktop tests on a real Pi session). The Room run above shows that an addition is held for the user. The tool-catalogue fix 0c539db70 stops an approved host tool from being dropped.
- **Cost of the probe.** 3 of 18 owner commands were refused. The owner also read the extra sentence as a preview requirement: it set a preview route on the milestone and added a dev server before the evidence passed. Those steps account for many of the extra turns against the pilot's 24 to 29.

## Pause across a restart (5.8)

One run of the `interruption` scenario, Architect only, with the runner's `SERO_BASELINE_PAUSE_BEFORE_RESTART=1` (d22b84dd5): the project is paused as soon as work is in flight, Sero restarts, the runner watches for a minute, then presses Resume. Revision dec68164d, `deepseek/deepseek-flash` at low thinking. The record, session, grant and log are in `pause-2026-10-19/`.

- **Outcome** accepted. 140 s, $0.016, 22 owner turns, context 5,617 to 19,833 tokens. No intervention beyond the pause and Resume the run itself made.
- **The pause held.** The owner began m1 at 01:13:11 and the project was paused at 01:13:12. After the restart the record read paused at the start and the end of the watched minute. Execution `exec_dzlol32n` was marked interrupted with "Sero restarted while this work was in progress".
- **Nothing ran while paused.** No file changed and nothing was dispatched until Resume at 01:14:15. After Resume the owner called `work --operation continue` on the same execution id, finished the work, and m1 was accepted on evidence. There is one `begin` and no second execution.
- **One turn did start while paused,** at 01:13:15, so the runner recorded the paused check as failed. The turn's contract said the project was paused, and the owner slept without acting. The restart had replayed the start approval as a `decision` wake, which may run on a paused project, because the interrupted first turn never stamped its wake time. That breaks the promise that a paused owner is not woken. Filed as issue 641.
- **Not shown:** a stop across a restart (unit tests only), and a multi-hour continuity trial. The multi-hour trial was not run and stays unproved.

## Overview and Work views (6.3)

Rendered from the Architect UI preview on 2026-10-19, with the host tokens and the plugin style scope, at 1100 px. The images are in `ui-2026-10-19/`.

| View | State | Image |
| --- | --- | --- |
| Board, asking | a two-option question, its step waiting for the answer | `board-ask.png` |
| Board, working | the live browser view, the plan with proof for the done step | `board-working.png` |
| Board, waiting | the wait card: what it waits for, the deadline, active and waiting time | `board-waiting.png` |
| Board, done | the result with Open preview and See the checks | `board-done.png` |
| Board, direct work | a milestone the owner is doing itself (charter-flow fixture) | `direct-work.png` |
| Work, Plan | request, working plan, milestones with their verification states | `work-plan.png` |
| Work, Research | the research question, its stopping condition, folded findings and Open Room | `work-research.png` |
| Work, Evidence | the checks and screenshots per milestone | `work-evidence.png` |

Progress reads as steps done, a status line and the plan. No view needs an executable graph. No overview control was added. The docs screenshots in `guide/architect.md` and `reference/architect.md` were replaced with the asking, working and done boards. The existing Architect UI tests passed in the 865-test plugin run at d194f5a97.

Two preview-fixture faults, not product faults: the Sudoku fixture borrows a synth "Working plan", and its wait names a child id that no fixture Room resolves.

## Requirement to evidence

Revisions: pilot fd903a5d8; replays 2ee1ca7f8 and 49f0323e9 (plugin source unchanged from fd903a5d8); Room amendment b05fca605 plus the spec fix before it was committed; probe and pause runs as stated in their sections.

| Area | Built | Evidence | Not met or not shown |
| --- | --- | --- | --- |
| Baseline (1.x) | Comparison record, runner, restriction map, limit provenance, protocol-failure counts | Architect plugin tests; pilot of 20 runs and 6 replays above | No strategy comparison is claimed |
| Direct work (2.x) | Execution identity saved first, begin/continue/report, interruption, Worktree mode, UI row | All 16 kept Architect runs did m1 directly; both rerun2 interruption runs kept their execution id and needed no intervention | |
| Tool discovery and Code Mode (3.x) | Approved tools registered deferred, `tool_search`, reopen restore, owner skills, Code Mode for managed sessions | Desktop tests on a real Pi session; 8 live `codemode` calls; the probe above loaded an approved, unloaded tool with `tool_search` and used it with no restart or second approval; the tool-catalogue fix 0c539db70 with its test | One probe, not a matched replay |
| Grant amendments (4.x) | Host amendment, Room revisions through it, restart reconcile, Team view | Desktop and Orchestrator tests; the Room run above: a held change survived a restart, was approved, kept the grant id and member histories | Live in-policy change; issue 640 |
| Durable waits and continuity (5.x) | Child, process and CI sources, reserved and consumed wakes, stall recovery, limit origins, wait card | Architect, Orchestrator and desktop tests; a live child wait ended `satisfied` with one wake; interruption replays resumed on their execution id with no duplicate; the pause run kept the pause across a restart and resumed the same execution | No multi-hour trial was run. No live process or CI wait. Both stay held as unproved. Issue 641 |
| Reporting and guidance (6.x) | Protocol-failure counts, three owner protocol fixes, docs pass, README and `ARCHITECTURE.md` reconcile | The counts above; d194f5a97; docs commits | The reporting action is a recommendation for a separate change, labelled as an experiment |

**Design deviation.** The CI source is one host primitive, `getRefChecks`, read every 120 seconds while a CI wait is open, not the existing GitHub poller the design named. `design.md` records it.

**Rollback.** Each part adds an optional path. A project whose owner never calls `work` delegates as before, a Room that never amends keeps its one grant, and an owner that never registers a wait sleeps and wakes as before. No record is migrated. Reading records written by this change on a revision without it was not tested.

**Package.** `@sero-ai/common` is 0.24.0 on this branch and is the only published package changed. It is not yet published.

**Open issues found by this work:** 623, 625, 638 (a desktop projection test that fails on this branch and without its changes), 639 (Room scenarios 1 to 4 drive the old start UI), 640 (an approved Room change leaves the Room paused for the user), 641 (a restart replays the start approval as a wake on a paused project).

## Earlier runs, 2026-10-06

These ran before the pilot, on the revisions named in the table. They are kept for comparison.

All runs used the global LOW tier of a disposable profile, on throwaway workspaces seeded with the same committed files. The scenario is `small-fix`: one function returns a string longer than its limit. Acceptance is one hidden test.

| Run | Revision | Model | Hidden test | Outcome recorded | Elapsed | Active | Cost |
|---|---|---|---|---|---|---|---|
| Architect | a82856342 (before this change) | deepseek-flash, low | passed | none (hit the 8 min bound) | 481 s | 104 s | $0.022 |
| Single agent | a82856342 | deepseek-flash, low | passed | accepted | 23 s | 16 s | $0.006 |
| Architect | 7edaf65e2 (direct work, no catalogue fix) | deepseek-flash, low | passed | none (hit the 8 min bound) | 481 s | 102 s | $0.021 |
| Architect | 6581f6483 (catalogue fix, review round 1) | deepseek-flash, low | passed | milestone accepted, project not closed (hit the 8 min bound) | 482 s | 128 s | $0.036 |
| Architect, Worktree mode | 69ade37c4 (direct work in a worktree, Code Mode) | deepseek-flash, low | not read | none | 90 s | 78 s | $0.018 |
| Architect, Worktree mode | bd13f6d80 (review round 4 fixes) | deepseek-flash, low | passed | accepted | 90 s | 75 s | $0.016 |

Two earlier smoke runs on `openai-codex/gpt-5.6-luna` at medium thinking are in `pilot-phase0/smoke-luna-records.json`: the single agent was accepted in 36 s for $0.008, and the Architect was accepted in 4.6 min for $0.16.

Bounds: $1 and 8 minutes per run, $6 in total for the pilot and $2 for each replay.

### What the runs show

- In the first and third rows the owner changed the file correctly and could not record anything. Its approval had no `sero-cli` tool. A run from source cached `sero-cli` as a plugin's tool, and the approval step then dropped it. The fix is commit be0d682cd.
- In the last row the owner had `sero-cli` and 20 approved skills. It used direct work for real: `work begin`, an edit, `work report`, then `evidence`. The fix was accepted about 90 seconds after the start.
- In the last row the first milestone carried a preview check that the project could not pass. The owner opened a second milestone, got it accepted, then asked how to close the first. The project was still open at the time bound. The preview check predates this change.
- Owner context per turn grew from about 4,600 to about 41,000 tokens across 38 turns in the last row, and from about 4,200 to about 24,800 across 21 turns in the first.

- In the last two rows the project ran in Worktree mode. The owner called `work begin`, got a checkout at `.sero/worktrees/card-direct-m1` on its own branch, edited inside it, and the host committed the work to that branch. The project closed in about 60 seconds; the other 30 are the runner waiting for the last charge.
- The first Worktree row has no test result because of the runner, not the product. The runner read the checkout folder after the host had released it. The runner now reads the branch. That run also overlapped a run I had stopped a minute earlier, which shared its profile.
- One new owner's approval was read: the owner of the stopped run, on revision 69ade37c4. It listed `codemode` next to `read`, `bash`, `write`, `edit` and `sero-cli`, and the owner did not call it. The approvals of the two recorded Worktree runs were deleted with their projects before they were read.
- In the stopped run the shell guard refused `git --no-pager diff` as a mutating command. That is an older fault, filed as issue 625.

### What the runs do not show

- No comparison is claimed. One scenario and one repeat per strategy is too few.
- The planned pilot was 5 scenarios, 2 repeats, 20 runs. It was cut to keep paid runs short. The `debugging`, `substantial-feature`, `collaborative-research` and `interruption` scenarios have no record.
- Cost coverage for Architect runs is partial: part of the spend is known only as a project total.
- Repeated work and protocol failures are not counted by the runner.
- No run exercised a Room amendment, a durable wait, tool discovery through `tool_search`, a Code Mode script, a preview check in a worktree, or stall recovery. Their evidence is unit and integration tests only.

## Review

Routed rounds on gpt-6-astra at high effort are on the pull requests. On #624, rounds 1 to 3 cover the original change: 17 findings, then two delta checks of the fixes. One finding is tracked as issue 623. Round 4 covers direct work in Worktree mode and Code Mode for managed sessions: no finding on Code Mode, six on Worktree work, five fixed in bd13f6d80. Round 5 checked those fixes and raised four follow-on points, all fixed in cec47f6ea, including a check that a checkout is still on its saved branch. On #627, rounds 1 to 3 cover the project board, its fixes, and the board changes after the real run.

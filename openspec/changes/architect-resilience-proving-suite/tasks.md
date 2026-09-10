The subject of these tasks is Architect’s process and integration with Sero. Use the bounded app smoke checks in design.md as delivery evidence. Do not expand them into exhaustive app feature audits. Start each fresh trial from a short idea. Architect must choose Rooms, Workflows or focused research according to each task; keep test procedures outside its input. Existing checkmarks retain their recorded evidence; this clarification does not turn assisted runs into unassisted passes.

## 1. Establish the proving baseline

- [x] 1.1 Inventory branch state, staged and unstaged fixes, live projects and processes; record the baseline and known gaps in the implementing issue/PR without resetting the checkout or claiming earlier assisted runs as passes.
- [x] 1.2 Freeze the five briefs and bounded delivery smoke checks from design.md, select finite test allocations without a budget questionnaire, and record the fault matrix and run-evidence fields; verify every required scenario has a planned check.
- [x] 1.3 Run the closest existing Architect, Orchestrator, preview and usage tests plus root `pnpm typecheck`; record existing failures separately from regressions and retain fixes that already pass.

## 2. Fresh DungeonExplorer

- [x] 2.1 Create DungeonExplorer through Sero in a new workspace with no inherited app files or runtime records; verify create, grant, charter and milestone approval paths, including dismissing and reopening approval.
- [x] 2.2 Run the game milestones to local delivery; verify Architect reaches local delivery, the files are visible in the expected workspace, and the delivered game opens, responds to movement and has one valid gameplay capture.
- [x] 2.3 Exercise restart during dispatch preparation and active work, transient provider failure and a deliberately failed verification; verify safe identity-preserving recovery, bounded same-provider fallback, useful progress and no false acceptance.
- [x] 2.4 Exercise a dollar-cap stop/resume, preview startup failure and repeated preview requests; verify progress survives, the running preview stays available after checks and no competing server is created.
- [x] 2.5 Complete the visibility-rule maintenance exercise; fix each reproduced Sero defect in a separate coherent slice with a regression check and real-path replay, and record whether the run was assisted. A setup-only replay that needs a fresh project can use the next required trial; keep it open under 7.4 until it passes.

## 3. CSV summary CLI

- [x] 3.1 Create the CLI in a fresh workspace through Sero; verify Architect delivers local files and completes without a browser, using one fixture with exact totals and one invalid-input check.
- [x] 3.2 Exercise restart during verification, a failed fixture and dollar-cap stop/resume; verify no duplicate check, safe recovery and truthful command results.
- [x] 3.3 Complete the grouping-option maintenance exercise; fix and replay any new Sero defect, then rerun the directly affected DungeonExplorer checks and record results.

## 4. Persistent reading tracker

- [x] 4.1 Create the tracker in a fresh workspace; use the real UI to create one record and read it after a service and Sero restart; verify Architect preserves project progress and delivery.
- [x] 4.2 Exercise database unavailability, preview startup failure, a failed check, stale evidence after a file edit and dollar-cap stop/resume; verify bounded recovery without losing records or retaining invalid acceptance.
- [x] 4.3 Complete the filter maintenance exercise; fix and replay new Sero defects, and verify stored records and affected earlier checks still pass.

## 5. Background import dashboard

- [ ] 5.1 Create the dashboard and controlled local source in a fresh workspace; verify job progress and exact persisted output for the fixed dataset.
- [ ] 5.2 Interrupt a partially completed import, return transient source errors and drop a response after the local receiver records an operation; verify reconciliation and recovery without duplicate records or effects.
- [ ] 5.3 Exercise failed verification, preview startup failure and dollar-cap stop/resume; verify the reported work state, recovery action and costs agree with runtime evidence.
- [ ] 5.4 Complete the source-schema maintenance exercise; fix and replay new Sero defects and rerun affected earlier checks before moving on.

## 6. Basic team issue tracker SaaS prototype

- [ ] 6.1 Create the local full-stack prototype in a fresh workspace; verify Architect coordinates local service delivery; create one issue, deny one direct cross-team API request and read the issue after restart.
- [ ] 6.2 Exercise coordinated service/Sero restart, database migration failure, failed verification, preview startup failure and dollar-cap stop/resume; verify existing data survives and authorization is not bypassed during recovery.
- [ ] 6.3 Complete the backward-compatible database maintenance exercise; fix and replay new Sero defects and verify the pre-existing users and issues remain usable.

## 7. Close cross-cutting resilience gaps

- [ ] 7.1 Audit recovery evidence across planning, execution and verification; fix remaining gaps and verify duplicate events and process restarts cannot reset retry allowances or create duplicate workflows.
- [ ] 7.2 Audit model failure cases; verify safe same-provider fallback works and provider changes or uncertain real external effects still require authority rather than blind retry.
- [ ] 7.3 Audit costs for owner, planning, execution, repair, research and capture, including interruption; verify live updates, cumulative-charge deduplication and cache pricing against available SDK/provider usage, with incomplete usage explicitly identified.
- [ ] 7.4 Audit status, approval recovery, file delivery and preview lifetime in Sero, including fresh maintenance setup carried from phase 2; verify stale failure text clears, pending work is visible and no successful case depends on a hidden transfer or manual state edit.

## 8. Final candidate and integration handoff

- [ ] 8.1 Freeze an identifiable candidate after all required defects and fault replays pass; verify closest regression suites, root `pnpm typecheck`, relevant React diagnostics and `git diff --check`, preserving unrelated changes.
- [ ] 8.2 Complete two consecutive fresh unassisted DungeonExplorer passes on that candidate, including maintenance; record process transitions, the bounded gameplay smoke check, delivered files, one valid capture, spend and planned approvals.
- [ ] 8.3 Complete two consecutive fresh unassisted CSV CLI passes on that candidate, including maintenance; record process transitions, bounded fixture results, files, spend and planned approvals.
- [ ] 8.4 Complete two consecutive fresh unassisted reading-tracker passes on that candidate, including maintenance; record process transitions, the saved-record smoke check, a valid capture, files and spend.
- [ ] 8.5 Complete two consecutive fresh unassisted import-dashboard passes on that candidate, including maintenance; record process transitions, fixed-dataset and no-duplicate results, a valid capture, files and spend.
- [ ] 8.6 Complete two consecutive fresh unassisted SaaS-prototype passes on that candidate, including maintenance; record process transitions, the bounded issue/access smoke checks, migration recovery, a valid capture, files and spend.
- [ ] 8.7 Audit the completion gate against every requirement in the resilience spec; verify all assigned fault replays passed, no required defect or unexplained accounting gap remains, and assisted diagnostic runs are excluded from pass counts.
- [ ] 8.8 Prepare the evidence mapping and links back to `sero-architect` and PR #507, including untested original requirements and any spec overlap; verify the handoff does not mark unrelated original work complete or archive either change automatically. Commit after each completed phase under the user's standing authorization. Request agreement before changing the original plan or updating user docs.

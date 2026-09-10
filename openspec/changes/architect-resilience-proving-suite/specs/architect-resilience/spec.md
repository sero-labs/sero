## Purpose

Make Architect complete approved projects and recover from expected failures without hidden manual repair, lost work, false verification or unbounded retries.

## ADDED Requirements

### Requirement: Approved work continues without repeated prompting
Architect SHALL continue eligible work after an approval, completed operation or safe recovery without requiring the user to repeat an instruction to continue. An unresolved approval SHALL remain visible and reopenable after its dialog is dismissed.

#### Scenario: A milestone completes
- **WHEN** an approved milestone passes acceptance and another milestone is eligible
- **THEN** Architect starts the next work without another user prompt

#### Scenario: Approval dialog is dismissed
- **WHEN** the user dismisses an unanswered approval
- **THEN** no approval is inferred, no restricted work starts, and the user can reopen and answer it

### Requirement: One execution location applies to the whole Architect plan and run
Architect SHALL expose a top-level Workspace / Worktree option, defaulting to Workspace for new plans/runs. It SHALL save the choice before the first dispatch and apply it to owner work and all delegated Rooms and Workflows across discovery, planning, implementation, review, verification, repair, retry, restart recovery and maintenance. Delegated planners MUST NOT override the saved mode. Workspace mode SHALL use the project workspace without creating isolated git worktrees. Worktree mode SHALL retain existing isolation for delegated editing work when explicitly selected. Placement SHALL NOT widen other permissions or remove shared-file coordination.

#### Scenario: A new plan uses the default location
- **WHEN** a user starts a new Architect plan without selecting Worktree
- **THEN** Workspace is saved before any pre-charter or later dispatch
- **AND** delegated Rooms and Workflows run in the project workspace without creating isolated git worktrees
- **AND** the user's workspace setting supplies the Room shared-tree approval while read-only workers remain read-only

#### Scenario: The user selects isolated work
- **WHEN** the user selects Worktree before a run starts
- **THEN** Architect saves that choice and applies existing worktree isolation to delegated editing work

#### Scenario: Workspace execution resumes
- **WHEN** a Workspace run retries, resumes after a Sero restart or enters maintenance
- **THEN** Architect and its Rooms and Workflows retain Workspace mode without silent worktree fallback
- **AND** existing work and grants are preserved without moving active workers or discarding earlier worktrees

#### Scenario: The remaining proving suite runs
- **WHEN** phases 5–8 execute, including any targeted checks of earlier examples
- **THEN** the suite uses Workspace mode and records the saved mode, effective worker directories and evidence that no isolated git worktrees were created
- **AND** completed earlier evidence retains its original classification

### Requirement: Recovery preserves work and operation identity
Architect SHALL reconcile interrupted planning, execution and verification against durable operation identities and existing work before resuming. It MUST NOT create duplicate workflows, discard completed steps or reset recovery limits merely because Sero restarted.

#### Scenario: Restart during dispatch preparation
- **WHEN** Sero restarts after a dispatch request but before its result is linked
- **THEN** Architect reconciles the existing operation or establishes that none started before creating another

#### Scenario: Restart during implementation
- **WHEN** a worker is interrupted after producing partial work
- **THEN** recovery inspects that work, preserves completed steps and resumes only work established as safe within the remaining limits

#### Scenario: Duplicate verification request
- **WHEN** the same milestone receives overlapping verification or recovery requests
- **THEN** only one check operates on its files and acceptance waits for the current result

### Requirement: Retry and failover retain authority
Automatic recovery SHALL have finite attempt and time limits, respect the approved dollar cap and use backoff for transient provider failures. Model failover SHALL stay within the authorized provider and model permissions unless the user approves a change. An uncertain external effect MUST be reconciled or escalated rather than blindly replayed.

#### Scenario: Transient provider failure
- **WHEN** a request fails transiently and its operation status permits a retry
- **THEN** Architect retries or uses an authorized same-provider fallback within its limits, with the recovery visible to the user

#### Scenario: External receiver accepts work but loses the response
- **WHEN** an external operation might already have succeeded
- **THEN** Architect checks its durable identity and receiver state or asks for a decision, without producing a duplicate effect

#### Scenario: Recovery cannot safely continue
- **WHEN** recovery exhausts its limits or needs new authority
- **THEN** Architect preserves the work, states the specific problem and offers the applicable next action without claiming completion

### Requirement: Verification proves the delivered feature
Acceptance SHALL use fresh evidence from the delivered project files and compare the result with the approved milestone requirements. Passing old tests, a successful HTTP response or a saved image alone MUST NOT establish acceptance. Rechecking an accepted milestone SHALL invalidate acceptance if the new evidence fails.

#### Scenario: Screenshot contains the wrong content
- **WHEN** a capture shows an error page, blank page, wrong application or editor error
- **THEN** visual verification fails even if the image file exists and the server returned HTTP 200

#### Scenario: Old tests pass without the requested feature
- **WHEN** generated tests pass but independent acceptance checks show missing functionality
- **THEN** the milestone is not accepted and Architect repairs within scope or raises the necessary decision

#### Scenario: Previously accepted work fails a recheck
- **WHEN** a new check fails or changed files invalidate the evidence
- **THEN** the earlier acceptance is not treated as current proof and affected new work does not proceed on that proof

### Requirement: Delivery and previews remain usable
Local project output SHALL be available in the workspace visible to the user without manual file transfers. Verification SHALL NOT shut down the user's shared preview. Repeated equivalent preview requests SHALL reuse a running or starting server. Non-visual projects MUST NOT require a preview to complete.

#### Scenario: A later milestone starts in a dirty project
- **WHEN** a local project contains uncommitted results from an earlier milestone
- **THEN** Architect preserves those results and delivers the next milestone to the expected workspace without a hidden worktree handoff

#### Scenario: Verification completes while the user views the app
- **WHEN** a preview check finishes
- **THEN** the user can still interact with the preview, and opening it again does not start a competing server

#### Scenario: A command-line project completes
- **WHEN** its file and command acceptance checks pass
- **THEN** absence of a web server or screenshot does not prevent acceptance

### Requirement: Progress and cost reflect actual work
Architect SHALL show whether it is planning, executing, checking, recovering or waiting, and replace stale failure text after recovery. Recorded spend SHALL include available priced usage from owner, planning, worker, repair, research and verification operations, including failed attempts, without double charging cumulative usage. Cache usage MUST NOT be priced as fresh input merely because it contributes to total tokens. Missing usage SHALL be identified as incomplete, not zero cost.

#### Scenario: A long worker run is active
- **WHEN** completed model turns report usage before the worker finishes
- **THEN** available cost and progress update during execution rather than remaining at zero until completion

#### Scenario: An interrupted run has incomplete accounting
- **WHEN** final usage cannot be recovered
- **THEN** the run is marked as having incomplete cost data and is not silently accounted as free

#### Scenario: The dollar cap is reached
- **WHEN** no approved spending remains
- **THEN** new paid work stops, current progress is preserved, and an authorized cap change can resume eligible work without recreating the project

### Requirement: Failed checks lead to bounded repair
Architect SHALL expose failed commands, relevant output and failed preview checks to its owner and the user. It SHALL repair local defects within the approved scope and request fresh checks, without treating redispatch of the same completed milestone as the only recovery path. It MUST NOT loop unchanged checks indefinitely or waive requirements to escape a failure.

#### Scenario: A local verification command fails
- **WHEN** the failure identifies a repairable defect within the approved plan
- **THEN** Architect diagnoses and repairs the defect, reruns the relevant checks and proceeds only on passing acceptance

### Requirement: Resilience is proved across five fresh projects
The proving suite SHALL cover a DungeonExplorer game, CSV summary CLI, persistent reading tracker, background import dashboard and basic team issue tracker SaaS prototype. Each project SHALL have fixed, bounded delivery smoke checks, a maintenance exercise and assigned controlled failures in phases 2–6. The final candidate gate SHALL require one fresh unassisted import-dashboard run through delivery and one source-schema maintenance change, plus relevant regression checks. Earlier apps SHALL be checked again only where later Sero fixes affect them. Required phase 2–7 fault replays SHALL remain part of completion evidence without repeating the full matrix at the final gate. The suite SHALL evaluate Architect’s process, underlying systems and integration with Sero. Example-app checks SHALL establish usable delivery and test the assigned verification or recovery behavior; exhaustive app feature testing is outside the suite. Run records SHALL identify the tested candidate, costs, faults, interventions and evidence.

#### Scenario: Phase 5 uses the reduced process-focused scope
- **WHEN** the current dashboard trial completes Phase 5
- **THEN** one small import establishes usable delivery, Architect records acceptance and workspace/preview delivery, and one source-field maintenance change proves same-workspace dispatch, fresh relevant evidence and return to delivery
- **AND** valid recorded Sero verification, preview, budget and timeout recovery evidence is reused without repeating those faults
- **AND** the generated-app partial-import restart, transient source-error and lost receipt-response matrix is removed from Phase 5 scope, not reported as passed or as proof of Sero uncertain-effect recovery
- **AND** no new broad app test suite, UI audit, documentation expansion or separate review/finalisation workers are required for M4
- **AND** affected Sero regression checks and root typecheck pass before the phase commit, after which execution stops for reassessment before Phase 6

#### Scenario: Manual rescue makes a run finish
- **WHEN** a run requires direct record edits, manual worktree transfers, out-of-band implementation or coaching around a runtime defect
- **THEN** it is recorded as assisted and does not count toward the final pass requirement

#### Scenario: The suite is declared complete
- **WHEN** completion is requested
- **THEN** all five project gates, required phase 2–7 fault replays, the one final unassisted import-dashboard run with maintenance and relevant regression checks have passed, no required resilience defect or unexplained accounting gap remains, and the evidence is mapped to the original Architect change without claiming untested original requirements are complete

#### Scenario: The final candidate needs a fix
- **WHEN** the final gate exposes a Sero defect
- **THEN** the defect is fixed, the updated candidate is identified, and the affected path and relevant regression checks are rerun
- **AND** valid unaffected evidence is retained and remaining final-run steps are completed without restarting the whole suite
- **AND** assisted diagnostic work does not establish an unassisted pass

### Requirement: Architect owns discovery from limited input
Fresh proving passes SHALL start from a short product idea and essential user constraints. Architect SHALL choose Rooms, Workflows or focused research according to the task at any project phase. The suite SHALL cover both execution kinds, including a pre-charter collaboration and a later review, without forcing the choice through an operator-written plan. Test procedures and detailed specifications SHALL NOT be supplied as operator instructions.

#### Scenario: Architect chooses how to develop the project
- **WHEN** a fresh project starts from its short brief
- **THEN** Architect chooses how to develop the context and plan
- **AND** the run evidence links delegated findings to subsequent project decisions and execution
- **AND** an operator-supplied plan prevents an unassisted pass

## Context

See [proposal.md](proposal.md) for the motivation and relationship to the existing Architect change. This design applies because recovery crosses owner sessions, Orchestrator runs, workspace delivery, previews and accounting.

The previous DungeonExplorer attempt exposed missing dispatch links, interrupted runs, hidden worktree output, screenshot helpers that never started, screenshots of editor errors accepted as evidence, stale status text and preview servers stopped after verification. Several fixes exist in the current working tree. Treat them as candidates to verify, not work to rewrite or evidence of completion.

The original project is diagnostic material only. Start the suite with new project and workspace identities. Do not copy its application code, grants, workflow records or evidence into a new run.

## Goals / Non-Goals

**Goals:** Prove Architect’s approvals, dispatch, recovery, verification, delivery, budgets and integration with Sero through five representative projects and controlled faults. Repair the responsible layer with the smallest coherent change. Provide a clean-session execution contract that does not depend on the previous chat.

**Non-Goals:** Rebuild Architect, redesign its approved experience, introduce a general fault-injection platform, test every stack combination, exhaustively test example-app features, or turn the examples into production products. Do not modify the existing Architect plan during this companion change without separate agreement.

## Decisions

### 1. Use five fixed briefs, in this order

Freeze the concrete brief and small independent smoke checks before each first run. The briefs define representative workloads; they are not exhaustive feature-audit checklists. Use familiar local tooling supported by Sero; stack selection is an execution detail, not another user approval gate.

| Project | Workload and bounded delivery smoke check | Architect/Sero process exercised | Maintenance exercise |
| --- | --- | --- | --- |
| 1. DungeonExplorer | Seeded dungeon, movement, walls, visibility, exit and restart. Open the delivered game, move the player and inspect one real gameplay capture. | Approvals, owner continuation, worker dispatch, capture, preview and file delivery. | Request one visibility-rule change; verify dispatch, a fresh relevant check and continued delivery. |
| 2. CSV summary CLI | CSV input, validation, numeric totals and JSON output. Check one fixture with known totals and one invalid input. | Command and file verification, failure repair and completion without a browser. | Add grouping; check one grouped fixture and unchanged default output. |
| 3. Reading tracker | Persistent books, status, notes, editing and filtering. Create one record through the UI and read it after restart. | Service lifecycle, persistent work, preview recovery and stale-evidence invalidation. | Add a filter; check it against the saved record. |
| 4. Import dashboard | Local API import, progress, job status and persistent results. Complete one small fixed-dataset import and confirm its result in the delivered UI. | Owner acceptance, workspace/preview delivery and the Sero timeout, verification and budget recoveries already recorded. | Change one source field; verify same-workspace dispatch, one fresh affected import check and return to delivery. |
| 5. Team issue tracker | Local login, two teams, roles, issues and comments. Create an issue, deny one cross-team access attempt and read the issue after restart. | Multi-service delivery, verification of a meaningful boundary, migration failure and maintenance recovery. | Add one backward-compatible database change; verify existing data remains accessible. |

Project 5 excludes production hosting, real payments, outbound email and real customer data. An external-side-effect recovery case uses a controlled local receiver that can record an operation and then drop the response.

DungeonExplorer runs first to revisit the known failure path. The simpler CLI runs second to expose assumptions that every project needs a browser. The remaining projects add persistence, asynchronous work and authorization. Running all projects in parallel would make attribution harder and is not part of this plan.

### Trial input and discovery ownership

Give Architect only the short product idea and essential user constraints. Keep smoke checks and fault procedures with the tester; do not send a specification, milestone list, research conclusions, implementation approach or execution instructions at each stage. Architect chooses a Room, Workflow or focused research for each part of the project, including discovery, planning, implementation, verification and adversarial review. Neither execution kind is tied to a phase. The discovery Room path is part of the original Architect design and must work before a charter exists. Findings must be recorded and used in the next project decision or plan.

Record Room IDs, participants and models, findings, the resulting charter, and links to executing Workflows. A run that receives an operator-written plan is assisted. Existing DungeonExplorer evidence remains diagnostic; it does not prove independent discovery. The fresh final import-dashboard run must show the full process. Give only requested user decisions and the approved maintenance request during that run. Unusable findings, inability to choose either execution kind for a suitable task, or a plan supplied by the tester is a process failure. The suite must exercise both Rooms and Workflows, but must not force a Room into every discovery phase.

### Workspace execution for the remaining suite

Before starting the background import dashboard trial, implement and verify a top-level Architect Workspace / Worktree option. Default new plans/runs to Workspace and save the selected mode with the durable project/run settings before the first dispatch, including pre-charter discovery. The choice applies to the whole plan/run: owner work, research, planning, implementation, review, verification, repair, retries, restart recovery and maintenance. Rooms and Workflows inherit it; planners must not silently select a different mode.

Use existing execution support. Workspace mode runs directly in the project workspace. Pass the user's workspace choice into Room policy as `shared-working-tree` with `sharedTreeApproved`, and use the existing Workflow direct-workspace setting. Read-only workers retain read-only permissions. Worktree mode uses existing isolation for delegated editing work only when the user selects it. The placement choice does not grant additional tools, delivery authority or write permissions. Preserve existing path claims and writer/verification coordination so shared files are not changed concurrently without coordination.

For phases 5–8, including any targeted checks of earlier examples, select Workspace and verify that Architect, Rooms and Workflows create no isolated git worktrees. Record the saved mode, effective worker directories and worktree-creation evidence. Check explicit Worktree selection separately through focused regression coverage; do not run the remaining live suite in that mode. Selecting the product option is a planned user setting and does not make a run assisted.

Persist the selected mode across retries, Sero restarts and resumed work. Do not move active workers, discard existing worktrees or alter completed evidence to apply the new default. Before a later dispatch from a pre-existing project, resolve and save its mode through normal settings without manual record edits. Existing work and grants must remain valid. Missing settings must not silently create an isolated worktree in a Workspace run.

### 2. Run a bounded diagnose-fix-replay cycle

For each project: run the normal Sero flow with only the bounded delivery smoke checks, exercise its assigned faults, preserve failure evidence, fix one coherent Sero defect, and replay the affected path. Use a fresh project only when the defect requires fresh setup or the final gate requires it. Do not change an example's acceptance criteria to make a failing run pass.

Keep an ordered defect list in the implementing GitHub issue or PR description. Each entry has reproduction steps, expected behavior, observed behavior, responsible area, fix, regression test and replay result. Store machine evidence in existing test/runtime artifact locations and link it from that record. Do not add task-history files to product docs.

Every implemented fix needs the closest relevant automated check and a replay through the affected real runtime path. Unit tests with permissive fake hosts are not sufficient evidence for host contracts, provider selection or preview capture. If a shared setup fix requires a fresh project to replay, use the next required fresh trial and keep that replay open in the cross-cutting audit. It must pass before the final candidate is frozen. Do not edit runtime records to simulate a fresh setup.

Alternative rejected: prebuild a broad recovery framework. The suite should establish which recovery mechanisms are actually missing.

### 3. Use a small fault matrix

All five projects exercise restart recovery, a failed verification, a dollar-cap stop/resume and final delivery. Distribute restart points across planning, active execution and verification; the suite must cover all three. UI projects also exercise preview startup failure and persistence after verification. The CLI must succeed without any preview requirement.

Use DungeonExplorer for dismissed approval, owner wake continuity and transient provider errors. Use the reading tracker for database restart and stale evidence. Phase 5 reuses recorded Sero timeout, verification, preview and budget recoveries. Its generated-app dependency-outage, partial-import restart and lost receipt-response matrix is removed from scope, not passed. An app retry or receipt implementation would not by itself prove Architect recovery. Use the SaaS prototype for authorization failures, migration failure and coordinated service restart.

Faults must be deterministic and recorded. Prefer existing test seams and controlled local services. Never manufacture an outage against a real third-party account or repeat a real payment, message or deployment to test uncertainty.

### Phase 5 completion after scope reduction

Reduce the existing M4 release milestone to one delivery check. Reuse M2/M3 evidence while the relevant files and runtime conditions remain unchanged. Open the delivered dashboard, complete one small import, and have Architect record acceptance, workspace files and the working preview. Add a check only when it answers a specific unresolved acceptance question. Do not commission a new suite, broad accessibility/responsive audit, documentation expansion, or separate review/finalisation workers.

Follow delivery with one small source-field maintenance request. Architect must dispatch in the same workspace, obtain fresh evidence from one affected import check, and return to delivery. Keep the trial classified as assisted. Validate the Sero fixes with relevant regression checks and root typecheck, commit Phase 5, and stop for reassessment before Phase 6. Do not transfer the removed app fault matrix to another Phase 5 milestone. General Sero authority and safe-recovery requirements remain; removed app scenarios do not prove those requirements passed.

### 4. Preserve authority during recovery

Retry only when existing work and operation status establish that it is safe. Persist bounded attempts and recovery intent so restarting Sero does not reset the allowance. Resume completed steps instead of recreating a workflow or replaying completed actions. When status is uncertain, reconcile first; ask only when safety or authority cannot be established.

Same-provider model failover is permitted within existing authorization. Provider switching, broader permissions and uncertain external actions remain decisions. The implementation agent selects finite test caps and retry/time limits using existing defaults and measured usage, without requesting budget amounts from the user. Record costs and revise finite test allocations when justified; do not disable limit enforcement. This execution permission does not authorize Architect to bypass a project's approved cap.

### 5. Verify the process with small meaningful delivery checks

Check from the workspace visible to the user, using the smoke checks established before generation. Stop expanding app-level checks once they show a usable result and the assigned Architect process behavior. Add a focused app check only when needed to reproduce a specific Sero verification or recovery defect. Architect still checks its approved milestones; this suite does not independently audit every app feature. For visual milestones, inspect the saved image and exercise the relevant interaction. A PNG containing an editor error, an HTTP 200 serving the wrong app, or old passing tests without the new feature must fail.

Local delivery must not need a manual worktree transfer. Preview checks must not destroy the user's live preview. Parallel requests for the same preview must not create competing servers. Local writers and verification must not race over the same project files.

### 6. Measure cost and intervention honestly

Each run record includes Sero revision or working-tree identity, brief version, workspace/project/workflow/run IDs, fault timing, planned approvals, unplanned interventions, recovery time, model/provider, dollar cap, recorded spend, accounting gaps, check output, captures and delivered paths.

Use provider/SDK-priced usage rather than pricing all cached tokens as fresh input. Include owner, planning, execution, repair, research and verification work. Where interrupted work has incomplete usage, mark it unknown or partial rather than free. Report token and cache counts as diagnostics, not the primary progress or budget measure.

Classify each run as unassisted pass, assisted diagnostic run or failed. Planned product approvals and controlled fault injection are allowed in an unassisted run. Manual file transfers, record edits, out-of-band implementation and coaching around a runtime defect are not.

### 7. Define a finite completion gate

After the five project gates and required fault replays in phases 2–7 pass, freeze an identifiable candidate and run the relevant regression checks. Complete one fresh unassisted import-dashboard run from the short brief through local delivery and one source-schema maintenance change. Use the bounded fixed-dataset and no-duplicate smoke checks above; record process transitions, one valid capture, delivered paths, worker directories, spend and planned approvals.

Revisit earlier apps only where later Sero fixes affect their behavior. Reuse the phase 2–7 fault evidence; do not repeat the full fault matrix or regenerate every app for the final gate. If the final run exposes a defect, fix it, identify the updated candidate, and rerun the affected path and its relevant regression checks. Preserve valid evidence from unaffected paths and complete any remaining steps in the final run. Manual rescue still makes a run assisted and cannot establish an unassisted pass.

Completion requires no unresolved defect that violates the resilience spec, no unexplained accounting gap, and evidence that previews and delivered files are usable. This is a bounded local proving suite, not a claim of production reliability across all providers and stacks.

## Risks / Trade-offs

- Model variation can hide a defect. Mitigation: fixed briefs, independent checks, one fresh final run, focused regression checks and deterministic fault replays. This smaller gate provides less evidence of repeatability than repeated fresh runs.
- Manual rescue can look like autonomous success. Mitigation: record interventions and exclude assisted runs from the completion gate.
- Broad retries can duplicate external effects. Mitigation: durable identity, reconciliation and a controlled receiver for testing uncertainty.
- A moving baseline can invalidate evidence. Mitigation: preserve the current dirty tree, identify each tested candidate, and do not restart Sero during active work except for a named restart test.
- The examples can consume excessive time. Mitigation: fixed scope, sequential runs, one defect slice at a time, focused regression checks and no speculative platform work.

## Migration Plan

Start the implementation session with a read-only inventory of branch state, staged and unstaged changes, active projects and processes. Reuse existing fixes that pass their checks. Do not reset the checkout or silently stop active work.

Apply changes through existing contracts and validate persisted records from before and after a restart. Do not require manual record editing as the normal upgrade path. Preserve old workspaces and evidence until their owner approves cleanup. Commit the changes after each completed numbered phase. The current authorization ends after Phase 5: stop there for reassessment before beginning Phase 6. Do not change user docs without separate agreement.

At completion, prepare a mapping from suite evidence to the original change's unfinished proving and maintenance tasks, plus a list of remaining gaps. Link this companion change and the implementing PR/issue to `sero-architect` and PR #507. Reconcile overlapping requirements before spec synchronization; do not automatically archive either change or mark an original requirement complete unless its actual scenario was tested.

## Clean-session execution contract

Exit explore mode and apply `architect-resilience-proving-suite`. Read this design, its spec and tasks first. Work directly without implementation subagents. Architect's own worker execution remains part of the feature under test. Continue through clear, safe next steps without asking the user to say "keep going". Send brief factual updates at transitions and during long waits. Ask only for decisions that change scope or authority, not for routine test settings. Do not claim completion until the final gate is evidenced.

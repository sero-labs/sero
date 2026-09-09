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
| 4. Import dashboard | Local API import, progress, job status and persistent results. Import one fixed dataset and inspect saved record identities. | Background progress, interrupted work, dependency recovery and reconciliation of uncertain effects. | Change the source shape; verify a resumed import preserves existing records without duplicates. |
| 5. Team issue tracker | Local login, two teams, roles, issues and comments. Create an issue, deny one cross-team access attempt and read the issue after restart. | Multi-service delivery, verification of a meaningful boundary, migration failure and maintenance recovery. | Add one backward-compatible database change; verify existing data remains accessible. |

Project 5 excludes production hosting, real payments, outbound email and real customer data. An external-side-effect recovery case uses a controlled local receiver that can record an operation and then drop the response.

DungeonExplorer runs first to revisit the known failure path. The simpler CLI runs second to expose assumptions that every project needs a browser. The remaining projects add persistence, asynchronous work and authorization. Running all projects in parallel would make attribution harder and is not part of this plan.

### 2. Run a bounded diagnose-fix-replay cycle

For each project: run the normal Sero flow with only the bounded delivery smoke checks, exercise its assigned faults, preserve failure evidence, fix one coherent Sero defect, replay that failure, and then run a fresh repeat. Do not change an example's acceptance criteria to make a failing run pass.

Keep an ordered defect list in the implementing GitHub issue or PR description. Each entry has reproduction steps, expected behavior, observed behavior, responsible area, fix, regression test and replay result. Store machine evidence in existing test/runtime artifact locations and link it from that record. Do not add task-history files to product docs.

Every implemented fix needs the closest relevant automated check and a replay through the affected real runtime path. Unit tests with permissive fake hosts are not sufficient evidence for host contracts, provider selection or preview capture.

Alternative rejected: prebuild a broad recovery framework. The suite should establish which recovery mechanisms are actually missing.

### 3. Use a small fault matrix

All five projects exercise restart recovery, a failed verification, a dollar-cap stop/resume and final delivery. Distribute restart points across planning, active execution and verification; the suite must cover all three. UI projects also exercise preview startup failure and persistence after verification. The CLI must succeed without any preview requirement.

Use DungeonExplorer for dismissed approval, owner wake continuity and transient provider errors. Use the reading tracker for database restart and stale evidence. Use the import dashboard for dependency outages, partial completion and an uncertain acknowledged side effect. Use the SaaS prototype for authorization failures, migration failure and coordinated service restart.

Faults must be deterministic and recorded. Prefer existing test seams and controlled local services. Never manufacture an outage against a real third-party account or repeat a real payment, message or deployment to test uncertainty.

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

Each project needs two consecutive fresh unassisted process passes on the final candidate, including its small maintenance exercise. Each pass uses the bounded smoke checks above; it does not require a comprehensive app test suite. Its assigned fault replays must pass. After a fix, rerun the affected earlier checks; freeze the candidate for the final suite rather than restarting every project after each local edit.

Completion requires no unresolved defect that violates the resilience spec, no unexplained accounting gap, and evidence that previews and delivered files are usable. This is a bounded local proving suite, not a claim of production reliability across all providers and stacks.

## Risks / Trade-offs

- Model variation can hide a defect. Mitigation: fixed briefs, independent checks, two fresh final passes and deterministic fault replays.
- Manual rescue can look like autonomous success. Mitigation: record interventions and exclude assisted runs from the completion gate.
- Broad retries can duplicate external effects. Mitigation: durable identity, reconciliation and a controlled receiver for testing uncertainty.
- A moving baseline can invalidate evidence. Mitigation: preserve the current dirty tree, identify each tested candidate, and do not restart Sero during active work except for a named restart test.
- The examples can consume excessive time. Mitigation: fixed scope, sequential runs, one defect slice at a time, focused regression checks and no speculative platform work.

## Migration Plan

Start the implementation session with a read-only inventory of branch state, staged and unstaged changes, active projects and processes. Reuse existing fixes that pass their checks. Do not reset the checkout or silently stop active work.

Apply changes through existing contracts and validate persisted records from before and after a restart. Do not require manual record editing as the normal upgrade path. Preserve old workspaces and evidence until their owner approves cleanup. Commit the changes after each completed numbered phase, then continue to the next phase. Do not change user docs without separate agreement.

At completion, prepare a mapping from suite evidence to the original change's unfinished proving and maintenance tasks, plus a list of remaining gaps. Link this companion change and the implementing PR/issue to `sero-architect` and PR #507. Reconcile overlapping requirements before spec synchronization; do not automatically archive either change or mark an original requirement complete unless its actual scenario was tested.

## Clean-session execution contract

Exit explore mode and apply `architect-resilience-proving-suite`. Read this design, its spec and tasks first. Work directly without implementation subagents. Architect's own worker execution remains part of the feature under test. Continue through clear, safe next steps without asking the user to say "keep going". Send brief factual updates at transitions and during long waits. Ask only for decisions that change scope or authority, not for routine test settings. Do not claim completion until the final gate is evidenced.

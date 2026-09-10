## Why

Most Architect features are implemented, but the proving run needed manual state recovery and file transfers. A working preview and passing unit tests do not yet prove that Architect can finish different projects or recover safely when work fails.

The subject of this suite is Architect’s process, its underlying systems and its integration with Sero. The example apps supply representative work. Use small independent smoke checks to establish usable output and expose false acceptance; exhaustive app feature testing is outside this change.

## What Changes

- Run five fixed example projects, from a small CLI to a basic full-stack SaaS prototype, starting with DungeonExplorer in a fresh workspace.
- Exercise ordinary creation, implementation, verification, workspace delivery and a small maintenance change through Sero's real runtime and UI.
- Before the background import dashboard trial, add a top-level Architect Workspace / Worktree option, defaulting to Workspace. Persist the choice for the whole plan/run and apply it to all delegated Rooms and Workflows, including recovery and maintenance. Run phases 5–8 in Workspace mode without isolated git worktrees.
- Keep Phase 5 to one dashboard delivery check, reuse of recorded Sero recovery evidence, and one small source-field maintenance change. Remove its generated-app fault matrix from scope; do not report removed scenarios as passed. Validate and commit Phase 5, then stop for reassessment before Phase 6.
- Introduce controlled failures, fix the responsible Sero behavior, and replay each failure before moving on. Preserve existing work and approvals during recovery.
- Require bounded retries, approved same-provider failover, visible progress, useful failure messages and cost accounting that includes failed work where usage is available.
- Distinguish unassisted passes from runs rescued through manual edits, file transfers or coaching. Require repeatable evidence before declaring resilience complete.
- Limit the final candidate gate to one fresh unassisted import-dashboard run with one maintenance change and relevant regression checks. Retain all required phase 2–7 fault replays; revisit earlier apps only where later Sero fixes affect them. After a final-gate fix, rerun the affected path without restarting the whole suite.
- Link the resulting evidence and remaining findings back to `sero-architect` and PR #507 at completion. Do not replace or prematurely close that change.

## Capabilities

### New Capabilities

- `architect-resilience`: Safe recovery, truthful verification and a five-project proving suite for the existing Architect feature.

### Modified Capabilities

None in the published spec set. Architect's related requirements currently live in the active `sero-architect` change. This companion delta adds resilience requirements; final integration must reconcile overlap with that change before specs are synchronized or either change is archived.

## Impact

Primary areas are the Architect owner session, dispatch tracking, verification and UI; the Orchestrator execution and recovery paths; and shared workspace, preview and usage services where a reproduced defect crosses those boundaries. Tests and example-run evidence are part of the work. New infrastructure is justified only when existing test and runtime seams cannot reproduce a required case.

This is not a second implementation of Architect. A general UI redesign, new orchestration engine, production SaaS hosting, real payments and unrelated cleanup are out of scope. No new package or public API is assumed necessary. Implementation stays on the current feature baseline and preserves existing staged and unstaged changes.

Related work: [Architect change](../sero-architect/proposal.md), [remaining Architect tasks](../sero-architect/tasks.md), and [PR #507](https://github.com/sero-labs/sero/pull/507).

The proving input is a short idea with essential constraints. The tester must not supply a specification or direct each stage. Prove that Architect can choose Rooms or Workflows for any suitable project task, including the pre-charter Room path in the original design and a later collaborative review. Existing assisted runs remain diagnostics.

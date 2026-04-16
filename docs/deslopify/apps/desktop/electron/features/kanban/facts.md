# Facts — apps/desktop/electron/features/kanban

_Last reviewed: 2026-04-13_

## What this code does
This folder is the main-process automation engine for the Kanban feature. It watches workspace kanban state files, creates and cleans git worktrees, runs planning/implementation/review subagents, performs verification and rebase recovery, creates or merges GitHub PRs, manages preview dev servers, and reconciles card/workspace state back into the disk-backed kanban JSON that the plugin extension and UI consume.

## Shape & metrics
- Total files: 49
- Total LOC: 6,702
- Largest file: `apps/desktop/electron/features/kanban/core/orchestrator.ts` (491 LOC)
- Files over 500 LOC: none
- Near-cap files:
  - `apps/desktop/electron/features/kanban/core/orchestrator.ts` (491)
  - `apps/desktop/electron/features/kanban/prompts/index.ts` (423)
  - `apps/desktop/electron/features/kanban/review/workflow/review-executor.ts` (400)
- External dependencies of note:
  - `appStateManager` for disk-backed state read/update/watch
  - `SubagentManager` for planning/implementation/review/conflict-resolution runs (AD-021)
  - `containerManager` / `workspaceManager` for runtime refresh and preview servers (AD-018)
  - shell-outs to `git` and `gh` for worktree, rebase, PR, and merge flows
  - plugin-shared validation imported from `@plugins/sero-kanban-plugin/shared/validation`
- Upstream callers: 19 importers outside this folder. Runtime-critical callers are `apps/desktop/electron/shared/infra/shared-infra.ts` (singleton orchestrator) and `apps/desktop/electron/ipc/apps/app-state.ts` (state change fanout).
- Downstream dependencies: the built-in kanban plugin's shared state file/UI, review cache files under `.sero/apps/kanban/reviews`, preview dev-server registry entries, and workspace runtime refresh after branch sync.
- Test coverage note: 17 focused test files live under `apps/desktop/electron/__tests__/features/kanban/**`.

## Architectural notes
- This is one of the densest AD intersections in the desktop app: container-backed execution (AD-018), tool-bridged agent/subagent work (AD-020/AD-021), and workspace/VCS lifecycle all meet here.
- The host already treats plugin-shared transition validation as the source of truth (`core/contracts.ts` imports `@plugins/sero-kanban-plugin/shared/validation`), but it still maintains a separate local copy of the Kanban state model in `core/types.ts`.
- Orchestration is state-file-driven, not event-bus-driven: `ipc/apps/app-state.ts` notifies `KanbanOrchestrator` when the kanban JSON changes, and the orchestrator uses `appStateManager.watch()` plus its own `lastColumnMap` / `lastCardMap` bookkeeping.
- Review caching, preview-server lifecycle, auto-merge polling, worktree sync, and workspace runtime refresh are spread across `review/**`, `quality/**`, `worktree/**`, and `workspace/**`; there is no single workflow-state module below the orchestrator.
- Several settings are real runtime switches (`autoAdvance`, `testingEnabled`, `reviewMode`, `yoloMode`, `yoloAutoMergePrs`), but other declared settings are currently only type/default surface.

## Runtime-sensitive surfaces
- Worktree sync/rebase, PR create/merge, and auto-merge polling all depend on real `git` / `gh` behavior, not just local types.
- Light review mode intentionally trades review depth for speed; cleanup here must preserve the semantic difference between prototype smoke review and full reviewer diff review.
- `workspace/workspace-runtime-refresh.ts` can reinstall dependencies and restart or auto-start dev servers after a workspace sync, so apparently-structural cleanup can change startup cost and container behavior.
- Disk-backed kanban state is mutated from multiple modules (`core/state-helpers.ts`, `implementation/implementation-executor.ts`, review actions, cleanup paths), so duplicated fallback/default-state helpers are a real drift risk.

## Surprising discoveries
- The biggest runtime mismatch is not file size: the host declares several persisted settings (`maxConcurrentCards`, `requireApproval.*`, `reviewLevel`) that it never reads, while related plugin flows still expose some of them to users.
- The host imports plugin-shared validation directly but still duplicates the full shared card/state contract locally.
- `prompts/prompt-review-specialized.ts` contains an unused `buildQualityReviewPrompt()` helper, and `core/wave-resolver.ts` is currently test-only.
- Multiple cleanup paths intentionally swallow failures (`review cache`, `worktree prune`, `git reset`), which keeps the happy path moving but hides state-repair problems in one of the most behavior-sensitive subsystems in the repo.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total files: 49 (unchanged)
- Total LOC: 6,569 (was 6,702)
- Largest file: `apps/desktop/electron/features/kanban/core/orchestrator.ts` (491 LOC)
- Files over 500 LOC: none
- Canonical shared contract owner: `packages/common/src/kanban.ts`

### What changed
- Moved the shared Kanban state + validation contract into `@sero/common` and converted the host/plugin local files into thin re-export or consumption layers.
- Removed the dead user-visible settings surface (`maxConcurrentCards`, `requireApproval.*`, `reviewLevel`) while leaving old state files readable through plain JSON parsing and canonical default-state factories.
- Replaced duplicated host fallback-state builders with `createDefaultKanbanState()` and added focused host/plugin tests for the narrowed settings surface.

### Still outstanding
- Near-cap workflow hubs (`core/orchestrator.ts`, `prompts/index.ts`, `review/workflow/review-executor.ts`) still need the planned Medium split.
- Cleanup failure visibility in review/worktree paths remains pending (Medium).
- Workspace-path helper dedupe and dead specialized-review cleanup remain pending (Medium/Low).

## Post-fix snapshot — 2026-04-14

### Metrics after fixes
- Total files: 61 (was 49)
- Total LOC: 6,976 (was 6,569)
- Largest file: `apps/desktop/electron/features/kanban/core/orchestrator-phase-runners.ts` (464)
- Files over 500 LOC: none
- Near-cap hubs remaining: none over 465 LOC on the main workflow path

### What changed
- Split the host workflow hubs into focused prompt, review, and orchestrator helper modules while preserving the public barrels and runtime call graph.
- Centralized cleanup warning formatting so review-cache, worktree-prune, reset, and delete failures stay visible instead of disappearing behind best-effort cleanup.
- Added a canonical workspace→container path helper reused by dev-server startup and workspace command execution.
- Kept the host runtime’s shared Kanban state ownership in `@sero/common` while further narrowing orchestration files to coordinator/phase-runner roles.

### Still outstanding
- Low-only follow-up: remove or formally land the dead specialized-review scaffolding (`buildQualityReviewPrompt()`) and the currently test-only `core/wave-resolver.ts` so the production surface matches the shipped runtime.

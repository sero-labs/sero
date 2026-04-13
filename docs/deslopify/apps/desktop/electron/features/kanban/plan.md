# Refactoring Plan — apps/desktop/electron/features/kanban

_Plan drafted: 2026-04-13_

## Executive Summary
`electron/features/kanban` is powerful and already reasonably modular, but it now carries two high-impact truthfulness problems: the host/runtime contract promises settings it does not actually honor, and the host still duplicates the Kanban shared state model while importing validation directly from plugin internals. After that, the main orchestration/review/prompt hubs are all approaching the file-size cap, and several cleanup paths suppress failures in a subsystem where silent state drift is expensive. The right outcome is a more truthful contract surface, a neutral shared Kanban model, and smaller workflow modules that keep AD-018/AD-021 behavior intact.

## Issues Found (prioritized)
- **High** — Several persisted/user-visible Kanban settings are effectively fictional in the host runtime — `apps/desktop/electron/features/kanban/core/types.ts:108-116` declares `maxConcurrentCards`, `requireApproval.plan`, `requireApproval.pr`, and `reviewLevel`; the same defaults are duplicated in `apps/desktop/electron/features/kanban/core/state-helpers.ts:18-20` and `apps/desktop/electron/features/kanban/implementation/implementation-executor.ts:330-332`; but the runtime never reads them. `apps/desktop/electron/features/kanban/core/orchestrator.ts:466-485` auto-starts every ready backlog card without consulting `maxConcurrentCards`, and related plugin flows still expose `reviewLevel` / `maxConcurrentCards` to users at `plugins/sero-kanban-plugin/extension/workflow-actions.ts:152-156,185-186`. That is a behavior contract problem, not just a naming nit. Effort: **L**.

- **High** — Host/plugin Kanban contract ownership is split across duplicated types and plugin-internal imports — `apps/desktop/electron/features/kanban/core/types.ts:4-10,12-129` explicitly mirrors `plugins/sero-kanban-plugin/shared/types.ts:8-194`, while `apps/desktop/electron/features/kanban/core/contracts.ts:15-20` already imports validation from `@plugins/sero-kanban-plugin/shared/validation`. This leaves the host coupled to plugin package layout while still carrying a parallel local state model; it is the wrong ownership direction for a host↔plugin contract that should live in a neutral shared package. Effort: **M**.

- **Medium** — The highest-risk workflow hubs are all near cap and still mix multiple responsibilities — `apps/desktop/electron/features/kanban/core/orchestrator.ts:1-491` combines watch lifecycle, recovery, phase scheduling, YOLO auto-advance, and workspace cleanup; `apps/desktop/electron/features/kanban/prompts/index.ts:1-423` combines planning prompts, review prompts, review parsing, and plan parsing; and `apps/desktop/electron/features/kanban/review/workflow/review-executor.ts:1-400` combines branch sync, diff recovery, full-vs-light review, cache reuse, push, PR creation, and resume logic. They are still legal, but they are already hard to evolve safely. Effort: **L**.

- **Medium** — Review/worktree cleanup paths silently suppress failures in a behavior-sensitive subsystem — `apps/desktop/electron/features/kanban/review/actions/review-artifacts.ts:65`, `apps/desktop/electron/features/kanban/review/state/review-cache.ts:26`, `apps/desktop/electron/features/kanban/worktree/worktree-manager.ts:199`, and `apps/desktop/electron/features/kanban/worktree/worktree-git.ts:214` all swallow cleanup failures. In kanban, that can hide stale review caches, failed worktree prune/reset operations, or partial state recovery behind an apparently successful workflow. Effort: **S**.

- **Medium** — Core runtime helpers are duplicated across modules instead of being centralized — `apps/desktop/electron/features/kanban/core/state-helpers.ts:12-24` and `apps/desktop/electron/features/kanban/implementation/implementation-executor.ts:324-337` both define fallback/default Kanban state; `apps/desktop/electron/features/kanban/implementation/dev-server-launch.ts:120-129` and `apps/desktop/electron/features/kanban/workspace/workspace-command-runner.ts:73-81` both resolve workspace-relative container paths. In a disk-backed runtime with host/container split behavior, those duplicate helpers are drift magnets. Effort: **S**.

- **Low** — Dead specialized-review scaffolding is still sitting in production code — `apps/desktop/electron/features/kanban/prompts/prompt-review-specialized.ts:44-63` defines `buildQualityReviewPrompt()` but nothing imports it, and `apps/desktop/electron/features/kanban/core/wave-resolver.ts:1-68` is currently only used by tests. This is small debt, but it makes the feature look more configurable than it really is. Effort: **S**.

## Proposed Refactoring
1. **Make the Kanban settings contract truthful before adding more workflow knobs.**
   - Decide, setting by setting, whether `maxConcurrentCards`, `requireApproval.plan`, `requireApproval.pr`, and `reviewLevel` are real runtime features or dead surface.
   - If they are real, implement them explicitly in the host orchestrator/review pipeline:
     - enforce concurrency limits before auto-starting ready cards,
     - route plan/PR approval decisions through the declared approval flags,
     - either implement `reviewLevel` or narrow the UI/extension setting surface.
   - If they are not real in v1, remove them from the shared contract and the plugin-facing settings UI/commands, with a compatibility read path for existing state files if needed.
   - This is a behavioral change and should be scheduled/verified as such.

2. **Move Kanban shared contracts to a neutral shared module.**
   - Target structure: a renderer-safe shared Kanban contract module under `@sero/common` (or an equivalent neutral shared package) that owns:
     - `Card`, `KanbanState`, `KanbanSettings`, progress/result types
     - transition validation helpers currently living in `plugins/sero-kanban-plugin/shared/validation.ts`
   - Then make both the Electron host and the plugin `shared/` layer import or re-export from that canonical location.
   - Delete the mirrored host copy in `core/types.ts` once the shared package owns the contract.
   - This aligns with the repo rule to keep cross-package contracts in neutral shared modules instead of mirroring them or reaching into plugin internals.

3. **Split the near-cap workflow hubs before the next Kanban feature wave lands.**
   - `core/orchestrator.ts`:
     - extract watch/recovery/bootstrap logic,
     - extract one phase-runner module per stage (planning/implementation/review/done),
     - keep `KanbanOrchestrator` as a thin coordinator.
   - `prompts/index.ts`:
     - separate planning prompt builders/parsers from review prompt builders/parsers,
     - move raw review/plan parsing into dedicated parser modules.
   - `review/workflow/review-executor.ts`:
     - split branch-sync/cache-reuse, review-loop, and push/PR completion into focused helpers.
   - Preserve current exported entry points so `shared-infra.ts` and test modules do not need broad migration churn.

4. **Stop swallowing cleanup failures silently.**
   - Replace `catch(() => {})` cleanup sites with scoped helpers that:
     - tolerate expected not-found cases,
     - log contextual warnings for real failures,
     - report enough detail to debug stale review-cache or worktree state.
   - Keep the workflows best-effort where appropriate, but make failure states visible instead of disappearing.

5. **Deduplicate fallback state and workspace-path helpers.**
   - Create one canonical default-state factory and one canonical workspace→container path helper used by both implementation/review/runtime-refresh flows.
   - This reduces drift in the exact places where the feature mixes host filesystem behavior, container behavior, and disk-backed state hydration.

6. **Delete or land the dead specialized-review scaffolding.**
   - If `buildQualityReviewPrompt()` and `resolveExecutionWaves()` are part of a deferred `reviewLevel` design, document that clearly and move them behind that future work.
   - Otherwise, remove them now so the production surface matches the real runtime.

## Benefits & Trade-offs
- Benefits: truthful user-facing settings, safer host↔plugin contract ownership, less file-size pressure on the most behavior-sensitive workflow modules, and clearer diagnostics when review/worktree cleanup goes wrong.
- Trade-offs: the contract move will touch both Electron host code and the kanban plugin package, and the settings cleanup is explicitly semantic work rather than purely structural cleanup.

## Dependencies & Risks
- Canonicalizing shared Kanban contracts should be coordinated with the upcoming `deslopify plugins/sero-kanban-plugin` pass so host and plugin recommendations do not diverge.
- Any change to `maxConcurrentCards`, approval gates, or `reviewLevel` changes runtime semantics. It must be validated on real card flows, not just typechecked.
- Worktree/review refactors sit on top of AD-018 container execution and AD-021 subagent orchestration; preserving current `cwd`, session, and preview-server behavior is more important than achieving a prettier module tree.
- If stale settings are removed from persisted state, add a compatibility read or migration note so existing `.sero/apps/kanban/state.json` files do not fail unexpectedly.

## Next Steps
1. Decide whether the currently unused settings are real features or dead contract surface.
2. Move Kanban shared types + validation to a neutral shared module and stop importing from plugin internals.
3. Split `core/orchestrator.ts`, `prompts/index.ts`, and `review-executor.ts` into smaller workflow modules.
4. Replace silent cleanup suppression with explicit warning/tolerated-not-found helpers.
5. Verification checklist:
   - Run a card end-to-end through planning → implementation → review → PR creation after the contract move.
   - Exercise settings permutations (`autoAdvance`, `testingEnabled`, `reviewMode`, `yoloMode`, `yoloAutoMergePrs`, plus any retained concurrency/approval settings) and confirm the runtime behavior matches the exposed settings.
   - Re-run review with a cached review file and confirm cache reuse still behaves correctly after branch sync.
   - Test preview-server cleanup, PR cancel flow, and worktree cleanup paths to confirm warnings surface when cleanup fails.
   - Test a branch-sync conflict-resolution path and a light-review path so AD-021 subagent behavior remains intact.

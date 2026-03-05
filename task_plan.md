# Phase 3: Implementation Automation — Task Plan

## Goal
Add implementation automation to the Kanban orchestrator. When a card is approved
(moves `planning → in-progress`), the orchestrator executes subtasks in dependency
waves via subagents in the card's worktree, creates VCS checkpoints per subtask,
tracks progress in the UI, and auto-advances to review on completion.

## Phases

### Phase 1: Refactor existing code (500 LOC compliance) — `complete`
- [x] Extract `PlanningProgressTracker` → `electron/kanban/planning-progress.ts`
- [x] Extract prompt builders + parser → `electron/kanban/prompts.ts`
- [x] Extract `PlanningActivityPanel` → `ui/components/PlanningActivityPanel.tsx`
- [x] Extract `CardDetailFooter` → `ui/components/CardDetailFooter.tsx`
- [x] Extract `subtask-executor.ts` from orchestrator
- [x] Verify all files ≤ 500 LOC ✓

### Phase 2: Add implementation types — `complete`
- [x] Add `ImplementationProgress` to `shared/types.ts`
- [x] Mirror in `electron/kanban/types.ts`
- [x] Add `implementationProgress` field to Card in both type files

### Phase 3: Add cwd override to subagent runner — `complete`
- [x] Add optional `cwd` to `RunSingleParams` in SubagentManager
- [x] Add optional `cwdOverride` to `RunnerConfig` in types.ts
- [x] Pass through runner.ts — uses cwdOverride for wsPath resolution

### Phase 4: Add worktree git helpers — `complete`
- [x] Create `electron/kanban/worktree-git.ts`
- [x] `createCheckpointInWorktree(worktreePath, message)` — git add + commit
- [x] `getWorktreeDiff(worktreePath)` — diff from branch base

### Phase 5: Implement runImplementationPhase — `complete`
- [x] Wave resolver: `wave-resolver.ts` — groups subtasks by dependency order
- [x] Implementation progress tracker: `implementation-progress.ts`
- [x] Subtask executor: `subtask-executor.ts` — wave execution + checkpoints
- [x] Orchestrator handles `planning → in-progress` transition
- [x] Build subtask agent prompts with card plan + context
- [x] Auto-advance to review on completion
- [x] Error handling: propagates failures with error messages

### Phase 6: UI updates — `complete`
- [x] `ImplementationActivityPanel.tsx` — wave progress, agent pills, tool feed
- [x] In-progress status indicators on CardView ("Implementing… 3/8")
- [x] Wire `ImplementationProgress` display in CardDetail

### Phase 7: Typecheck — `complete`
- [x] `apps/desktop`: tsc --noEmit ✓
- [x] `packages/pi-kanban-extension` ui: tsc --noEmit ✓
- [x] `packages/pi-kanban-extension` extension: tsc --noEmit ✓

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none) | | |

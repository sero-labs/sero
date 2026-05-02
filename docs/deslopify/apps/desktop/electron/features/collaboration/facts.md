# Facts — apps/desktop/electron/features/collaboration

_Last reviewed: 2026-04-16_

## What this code does
This feature implements Sero's multi-agent collaboration strategies on top of the subagent system: a simple researcher → analyst/visionary → coordinator flow and a debate-style strategy with decomposition, cross-checking rounds, and final synthesis. It maps collaboration roles to discovered agent names and returns a summarized collaboration result for IPC consumers.

## Shape & metrics
- Total files: 6
- Largest file: `apps/desktop/electron/features/collaboration/debate.ts` (378 LOC)
- Files over 500 LOC: none
- External dependencies of note: no direct external packages; depends entirely on `SubagentManager` and shared collaboration types from `@/types/collaboration`
- Upstream callers: `apps/desktop/electron/ipc/collaboration/collaboration.ts`
- Downstream dependencies: named subagent definitions (`researcher`, `collab-analyst`, `visionary`, `coordinator`), collaboration/debate renderer flows, subagent runtime availability

## Architectural notes
- This module is a thin orchestration layer on top of AD-021 subagents; it should stay declarative and reuse subagent execution helpers rather than growing its own runtime conventions.
- Role-to-agent mapping is hardcoded in `agents.ts`, so the feature depends on the continued presence of those global agent names in the user's agent directory/template set.
- Standard and debate flows now short-circuit to explicit degraded-mode results when required specialist outputs are missing instead of synthesizing placeholder text.

## Runtime-sensitive surfaces
- Prompt-size growth still matters here: synthesis prompts now use explicit per-section caps, but output quality/cost can still shift based on cap tuning and specialist verbosity.
- Role name drift is external to this folder; renaming a built-in collaboration agent requires migration or compatibility handling rather than a silent change.
- Failure semantics now intentionally favor truthfulness over completion: required-role failures skip synthesis and return explicit degraded-mode output.

## Surprising discoveries
- Both strategies now share one single-specialist runner helper, so role→agent lookup, timing, and thrown-error normalization stay aligned without coupling their phase-specific callback behavior.
- Debate challenge prompts and both synthesis paths now have explicit section caps, but the cap values are static constants that should be revalidated against real collaboration quality.
- The degraded-mode output path needs to remain concise because it is reinjected into the main session flow through `buildInjectionPrompt`.

## Post-fix snapshot — 2026-04-15

### Metrics after fixes
- Total files: 4 (was 3)
- Largest file: `apps/desktop/electron/features/collaboration/debate.ts` (326 LOC, was 315)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: none in this folder

### What changed
- Added `prompt-budget.ts` as a shared synthesis-prompt budgeting helper for collaboration strategies.
- Added explicit synthesis prompt budgets in `agents.ts` and `debate.ts` so coordinator prompt inputs are capped before final synthesis.
- Added focused coverage in `electron/__tests__/features/collaboration/prompt-budgeting.test.ts` to guard truncation behavior for both standard and debate synthesis prompts.

### Still outstanding
- **Low** — single-specialist runner logic is still duplicated between `index.ts` and `debate.ts`.
- **Low** — required agent-name preflight validation remains pending.

## Post-fix snapshot — 2026-04-15 (degraded-mode handling)

### Metrics after fixes
- Total files: 5 (was 4)
- Largest file: `apps/desktop/electron/features/collaboration/debate.ts` (367 LOC, was 326)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: none in this folder

### What changed
- Added shared degraded-mode utilities in `degraded-result.ts` to detect required-role failures and format explicit degraded responses.
- Updated `runCollaboration()` and `runDebateCollaboration()` to stop before coordinator synthesis when required specialist output is missing.
- Added focused coverage in `electron/__tests__/features/collaboration/degraded-mode.test.ts` for researcher failure, phase-2 specialist failure, and debate independent-analysis failure.

### Still outstanding
- **Low** — single-specialist runner logic is still duplicated between `index.ts` and `debate.ts`.
- **Low** — required agent-name preflight validation remains pending.

## Post-fix snapshot — 2026-04-16 (shared runner helper)

### Metrics after fixes
- Total files: 6 (was 5)
- Largest file: `apps/desktop/electron/features/collaboration/debate.ts` (378 LOC, was 367)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: none in this folder (unchanged)

### What changed
- Added `specialist-runner.ts` as the shared single-specialist execution helper for both standard and debate collaboration strategies.
- Rebased `index.ts` and `debate.ts` specialist wrappers onto the shared helper while preserving strategy-specific callbacks, model overrides, and degraded-mode semantics.
- Centralized unknown-error message normalization through the shared helper so fallback error copy stays consistent across both orchestration paths.

### Still outstanding
- **Low** — required agent-name preflight validation remains pending.

## Post-fix snapshot — 2026-04-16 (required-agent preflight)

### Metrics after fixes
- Total files: 7 (was 6)
- Largest file: `apps/desktop/electron/features/collaboration/debate.ts` (387 LOC, was 378)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: none in this folder (unchanged)

### What changed
- Added `required-agents.ts` as a shared preflight validator for required collaboration/debate role mappings.
- Updated `runCollaboration()` and `runDebateCollaboration()` to fail fast with explicit missing-agent errors before launching specialist runs.
- Added focused degraded-mode regressions to lock that missing required agents fail before orchestration starts.

### Still outstanding
- None — all tracked collaboration plan items are now cleared.

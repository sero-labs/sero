# Facts — apps/desktop/electron/features/collaboration

_Last reviewed: 2026-04-15_

## What this code does
This feature implements Sero's multi-agent collaboration strategies on top of the subagent system: a simple researcher → analyst/visionary → coordinator flow and a debate-style strategy with decomposition, cross-checking rounds, and final synthesis. It maps collaboration roles to discovered agent names and returns a summarized collaboration result for IPC consumers.

## Shape & metrics
- Total files: 4
- Largest file: `apps/desktop/electron/features/collaboration/debate.ts` (326 LOC)
- Files over 500 LOC: none
- External dependencies of note: no direct external packages; depends entirely on `SubagentManager` and shared collaboration types from `@/types/collaboration`
- Upstream callers: `apps/desktop/electron/ipc/collaboration/collaboration.ts`
- Downstream dependencies: named subagent definitions (`researcher`, `collab-analyst`, `visionary`, `coordinator`), collaboration/debate renderer flows, subagent runtime availability

## Architectural notes
- This module is a thin orchestration layer on top of AD-021 subagents; it should stay declarative and reuse subagent execution helpers rather than growing its own runtime conventions.
- Role-to-agent mapping is hardcoded in `agents.ts`, so the feature depends on the continued presence of those global agent names in the user's agent directory/template set.
- Collaboration and debate flows currently normalize failures by inserting fallback text into later prompts instead of surfacing a degraded-mode result explicitly.

## Runtime-sensitive surfaces
- Prompt-size growth still matters here: synthesis prompts now use explicit per-section caps, but output quality/cost can still shift based on cap tuning and specialist verbosity.
- Role name drift is external to this folder; renaming a built-in collaboration agent requires migration or compatibility handling rather than a silent change.
- Failure semantics are subtle: if a specialist fails, the final coordinator may still produce a polished answer based on placeholder text.

## Surprising discoveries
- The simple collaboration flow and the debate flow both re-implement nearly the same subagent execution/error-timing helper instead of sharing one orchestration primitive.
- Debate challenge prompts and both synthesis paths now have explicit section caps, but the cap values are static constants that should be revalidated against real collaboration quality.
- Missing or failed specialists currently get turned into strings like `(Researcher failed to produce output)` and `(Agent failed)` that are then fed straight into the coordinator synthesis prompt.

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
- **Medium** — degraded-mode behavior still injects placeholder failure strings into synthesis prompts instead of surfacing explicit partial-failure state.
- **Low** — single-specialist runner logic is still duplicated between `index.ts` and `debate.ts`.
- **Low** — required agent-name preflight validation remains pending.

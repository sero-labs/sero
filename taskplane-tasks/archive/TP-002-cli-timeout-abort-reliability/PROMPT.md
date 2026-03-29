# Task: TP-002 — Abort Timed-Out Bridged CLI Commands

**Created:** 2026-03-29
**Size:** M

## Review Level: 2 (Plan and Code)

**Assessment:** This changes the shared `sero-cli` execution path used by bridged app tools. Timeout behavior is reliability-critical because commands can currently keep running and emitting updates after the UI already reports failure.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```text
taskplane-tasks/TP-002-cli-timeout-abort-reliability/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Make bridged CLI command timeouts actually cancel the running command, not just reject the outer promise. When a `sero-cli` command times out or is aborted, the underlying work must stop promptly, late progress updates must be ignored, and no post-timeout state mutations should leak into the session UI or plugin state.

## Dependencies

- **None**

## Context to Read First

> Only list docs the worker actually needs. Less is better.

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `AGENTS.md` — monorepo testing requirements and guardrails

## Environment

- **Workspace:** `apps/desktop`
- **Services required:** None

## File Scope

> The orchestrator uses this to avoid merge conflicts: tasks with overlapping
> file scope run on the same lane (serial), not in parallel. List the files and
> directories this task will create or modify. Use wildcards for directories.

- `apps/desktop/electron/cli/core/tool.ts`
- `apps/desktop/electron/cli/core/timeouts.ts`
- `apps/desktop/electron/cli/core/types.ts`
- `apps/desktop/electron/__tests__/cli/command-timeouts.test.ts`
- `apps/desktop/electron/__tests__/cli/command-abort-propagation.test.ts`

## Steps

> **Hydration:** STATUS.md tracks outcomes, not individual code changes. Workers
> expand steps when runtime discoveries warrant it. See task-worker agent for rules.

### Step 0: Preflight

- [ ] Confirm the current timeout path in `apps/desktop/electron/cli/core/tool.ts` only rejects the wrapper promise and does not cancel the active command
- [ ] Confirm which bridged command tests already exist and what new coverage is still missing

### Step 1: Abort the running command on timeout or external cancellation

- [ ] Update `apps/desktop/electron/cli/core/tool.ts` so each executing command gets an internal abortable context and timeout expiry triggers an abort signal for the active command
- [ ] Ensure timed-out or externally aborted commands stop forwarding partial `onUpdate` events after cancellation, so stale progress cannot leak into the chat UI
- [ ] Preserve the current single-command vs batch timeout rules in `apps/desktop/electron/cli/core/timeouts.ts` unless a minimal bug fix is required
- [ ] Run targeted tests: `cd apps/desktop && pnpm test -- --run electron/__tests__/cli/command-timeouts.test.ts`

**Artifacts:**
- `apps/desktop/electron/cli/core/tool.ts` (modified)
- `apps/desktop/electron/cli/core/timeouts.ts` (modified if needed)
- `apps/desktop/electron/cli/core/types.ts` (modified if needed)

### Step 2: Add timeout-cancellation regression coverage

- [ ] Create `apps/desktop/electron/__tests__/cli/command-abort-propagation.test.ts` with cases for timeout-triggered abort and user-triggered abort on bridged commands
- [ ] Extend `apps/desktop/electron/__tests__/cli/command-timeouts.test.ts` to assert timed-out commands cannot keep running, cannot emit late updates, and surface a deterministic error
- [ ] Run targeted tests: `cd apps/desktop && pnpm test -- --run electron/__tests__/cli/command-timeouts.test.ts electron/__tests__/cli/command-abort-propagation.test.ts`

**Artifacts:**
- `apps/desktop/electron/__tests__/cli/command-abort-propagation.test.ts` (new)
- `apps/desktop/electron/__tests__/cli/command-timeouts.test.ts` (modified)

### Step 3: Testing & Verification

> ZERO test failures allowed. This step runs the FULL test suite as a quality gate.
> (Earlier steps should use targeted tests for fast feedback — see worker prompt.)

- [ ] Run repo-wide typecheck: `pnpm typecheck`
- [ ] Run desktop test suite: `cd apps/desktop && pnpm test`
- [ ] Fix all failures
- [ ] Build passes: `pnpm build`

### Step 4: Documentation & Delivery

- [ ] Check whether `docs/decisions.md` needs a note about timeout cancellation semantics; update only if the bridge contract changed in a user- or plugin-visible way
- [ ] Log any remaining follow-up reliability gaps in `taskplane-tasks/CONTEXT.md`
- [ ] Summarize the final timeout behavior and regression coverage in the task handoff

## Documentation Requirements

**Must Update:**
- None

**Check If Affected:**
- `docs/decisions.md` — update only if the CLI bridge timeout contract changed

## Completion Criteria

- [ ] Timed-out bridged commands receive an abort signal instead of continuing in the background
- [ ] Late partial updates from cancelled commands are ignored
- [ ] Regression tests cover timeout-driven abort and stale-update suppression
- [ ] `pnpm typecheck`, `cd apps/desktop && pnpm test`, and `pnpm build` all pass

## Git Commit Convention

Commits happen at **step boundaries** (not after every checkbox). All commits
for this task MUST include the task ID for traceability:

- **Step completion:** `feat(TP-002): complete Step N — description`
- **Bug fixes:** `fix(TP-002): description`
- **Tests:** `test(TP-002): description`
- **Hydration:** `hydrate: TP-002 expand Step N checkboxes`

## Do NOT

- Change default timeout values unless a failing test proves a contract bug
- Fold unrelated CLI bridge refactors into this task
- Leave cancellation behavior dependent on race timing or unasserted side effects
- Skip the new regression test file

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution.
     Format:
     ### Amendment N — YYYY-MM-DD HH:MM
     **Issue:** [what was wrong]
     **Resolution:** [what was changed] -->

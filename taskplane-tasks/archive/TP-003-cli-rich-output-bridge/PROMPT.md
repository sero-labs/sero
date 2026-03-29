# Task: TP-003 — Preserve Rich Bridged Tool Output

**Created:** 2026-03-29
**Size:** M

## Review Level: 2 (Plan and Code)

**Assessment:** This task changes the bridge contract between extension tools, `sero-cli`, and the renderer-visible agent stream. It is reliability-sensitive because text-only flattening currently drops images and mixed-content payloads from bridged tools.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```text
taskplane-tasks/TP-003-cli-rich-output-bridge/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Make bridged extension tools preserve non-text output through `sero-cli` instead of silently flattening everything to plain text. Single-command bridged tool calls must be able to carry text, images, and structured details all the way into the agent stream and history replay, while multi-command batches should degrade explicitly and predictably rather than dropping data accidentally.

## Dependencies

- **None**

## Context to Read First

> Only list docs the worker actually needs. Less is better.

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `AGENTS.md` — monorepo testing requirements and guardrails
- `docs/decisions.md` — review the tool-bridging decision before changing bridge behavior

## Environment

- **Workspace:** `apps/desktop`
- **Services required:** None

## File Scope

> The orchestrator uses this to avoid merge conflicts: tasks with overlapping
> file scope run on the same lane (serial), not in parallel. List the files and
> directories this task will create or modify. Use wildcards for directories.

- `apps/desktop/electron/cli/core/schema-bridge.ts`
- `apps/desktop/electron/cli/core/tool.ts`
- `apps/desktop/electron/cli/core/types.ts`
- `apps/desktop/electron/ipc/agent/core/agent-helpers.ts`
- `apps/desktop/electron/ipc/agent/core/agent-subscription.ts`
- `apps/desktop/electron/__tests__/cli/bridge-updates.test.ts`
- `apps/desktop/electron/__tests__/cli/bridge-rich-output.test.ts`
- `apps/desktop/electron/__tests__/features/plugins/plugin-cli-bridge.test.ts`
- `docs/decisions.md`
- `docs/apps-tutorial.md`

## Steps

> **Hydration:** STATUS.md tracks outcomes, not individual code changes. Workers
> expand steps when runtime discoveries warrant it. See task-worker agent for rules.

### Step 0: Preflight

- [ ] Confirm where bridged tool results are flattened to text today and identify the minimum set of CLI/agent-stream types that must change
- [ ] Confirm how history replay currently restores tool images so the new bridge path can reuse existing rendering where possible

### Step 1: Preserve rich content through the CLI bridge

- [ ] Update `apps/desktop/electron/cli/core/types.ts`, `apps/desktop/electron/cli/core/schema-bridge.ts`, and `apps/desktop/electron/cli/core/tool.ts` so single-command bridged tools can return text, image blocks, and details without flattening to a single string
- [ ] Define an explicit fallback for multi-command batches so mixed-content commands degrade intentionally instead of silently dropping image payloads
- [ ] Preserve existing exit-code behavior, truncation rules, and text-only command output for ordinary CLI commands
- [ ] Run targeted tests: `cd apps/desktop && pnpm test -- --run electron/__tests__/cli/bridge-updates.test.ts`

**Artifacts:**
- `apps/desktop/electron/cli/core/types.ts` (modified)
- `apps/desktop/electron/cli/core/schema-bridge.ts` (modified)
- `apps/desktop/electron/cli/core/tool.ts` (modified)

### Step 2: Add rich-output regression coverage

- [ ] Create `apps/desktop/electron/__tests__/cli/bridge-rich-output.test.ts` covering image-bearing bridged tool results, details passthrough, and multi-command fallback behavior
- [ ] Update existing bridge tests so rich bridged outputs survive the agent-stream/history path used by the chat UI
- [ ] Run targeted tests: `cd apps/desktop && pnpm test -- --run electron/__tests__/cli/bridge-rich-output.test.ts electron/__tests__/cli/bridge-updates.test.ts electron/__tests__/features/plugins/plugin-cli-bridge.test.ts`

**Artifacts:**
- `apps/desktop/electron/__tests__/cli/bridge-rich-output.test.ts` (new)
- `apps/desktop/electron/__tests__/cli/bridge-updates.test.ts` (modified)
- `apps/desktop/electron/__tests__/features/plugins/plugin-cli-bridge.test.ts` (modified)
- `apps/desktop/electron/ipc/agent/core/agent-helpers.ts` (modified if needed)
- `apps/desktop/electron/ipc/agent/core/agent-subscription.ts` (modified if needed)

### Step 3: Testing & Verification

> ZERO test failures allowed. This step runs the FULL test suite as a quality gate.
> (Earlier steps should use targeted tests for fast feedback — see worker prompt.)

- [ ] Run repo-wide typecheck: `pnpm typecheck`
- [ ] Run desktop test suite: `cd apps/desktop && pnpm test`
- [ ] Fix all failures
- [ ] Build passes: `pnpm build`

### Step 4: Documentation & Delivery

- [ ] Update `docs/decisions.md` if the internal/public bridge contract changed for mixed-content tool results
- [ ] Check `docs/apps-tutorial.md` and update it only if plugin authors need guidance for bridged tools that return images or mixed content
- [ ] Summarize the new rich-output behavior, fallback rules, and test coverage in the task handoff

## Documentation Requirements

**Must Update:**
- `docs/decisions.md` — document the bridge-result contract if it changed

**Check If Affected:**
- `docs/apps-tutorial.md` — add guidance only if plugin authors need to know about rich bridged tool outputs

## Completion Criteria

- [ ] Single-command bridged tools can surface image blocks and text without losing data in the CLI bridge
- [ ] Mixed-content multi-command batches follow an explicit, tested fallback path
- [ ] Rich bridged outputs survive agent-stream mapping and history replay used by the chat UI
- [ ] `pnpm typecheck`, `cd apps/desktop && pnpm test`, and `pnpm build` all pass

## Git Commit Convention

Commits happen at **step boundaries** (not after every checkbox). All commits
for this task MUST include the task ID for traceability:

- **Step completion:** `feat(TP-003): complete Step N — description`
- **Bug fixes:** `fix(TP-003): description`
- **Tests:** `test(TP-003): description`
- **Hydration:** `hydrate: TP-003 expand Step N checkboxes`

## Do NOT

- Re-introduce bridged tools as standalone agent tools
- Drop image payloads or details for convenience if they can be preserved cleanly
- Break ordinary text-only CLI commands while fixing rich-output handling
- Skip the new regression test file

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution.
     Format:
     ### Amendment N — YYYY-MM-DD HH:MM
     **Issue:** [what was wrong]
     **Resolution:** [what was changed] -->

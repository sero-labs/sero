# Task: TP-005 — Clarify Browser Tool Usage and Expose Web Tool Slash Commands

**Created:** 2026-03-29
**Size:** M

## Review Level: 2 (Plan and Code)

**Assessment:** This changes how the desktop agent is instructed to choose between browser automation and web-access tools, and how web-plugin capabilities surface in the ChatPanel slash-command UX. It is behavior-sensitive because the wrong implementation could either keep routing searches into the Playwright browser tool or reintroduce user-facing web commands as an agent-preferred path.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```text
taskplane-tasks/TP-005-browser-tool-web-search-routing/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Fix the agent guidance and slash-command surfacing so Sero stops treating the container `browser` tool as a generic web-search/download mechanism. The browser tool should be clearly framed as Playwright-driven headless Chromium for browser automation and visual verification inside the container, while ordinary web searches and content retrieval should default to the web-plugin tools such as `web_search` and `fetch_content`. In the ChatPanel prompt area, users should also be able to invoke at least `/web_search` and `/web_bookmark` as slash commands through an intentional, supported path.

## Dependencies

- **None**

## Context to Read First

> Only list docs the worker actually needs. Less is better.

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `AGENTS.md` — monorepo testing requirements and guardrails
- `docs/plugins-technical.md` — only if the plugin command/bridge contract changes

## Environment

- **Workspace:** Monorepo root and `apps/desktop`
- **Services required:** None

## File Scope

> The orchestrator uses this to avoid merge conflicts: tasks with overlapping
> file scope run on the same lane (serial), not in parallel. List the files and
> directories this task will create or modify. Use wildcards for directories.

- `apps/desktop/electron/features/container/tools/system-prompt.ts`
- `apps/desktop/electron/features/container/tools/tools.ts`
- `apps/desktop/electron/features/container/tools/tools-browser.ts`
- `apps/desktop/electron/cli/index.ts`
- `apps/desktop/electron/features/plugins/bridge-policy.ts`
- `apps/desktop/electron/features/apps/discovery/index.ts`
- `apps/desktop/electron/ipc/agent/core/agent-helpers.ts`
- `apps/desktop/src/types/ipc.ts`
- `apps/desktop/src/components/layout/SlashCommandMenu.tsx`
- `plugins/sero-web-plugin/package.json`
- `plugins/sero-web-plugin/extension/index.ts`
- `packages/common/src/plugins.ts`
- `apps/desktop/electron/__tests__/agent/token-baseline.test.ts`
- `apps/desktop/electron/__tests__/agent/slash-command-availability.test.ts`
- `apps/desktop/electron/__tests__/features/plugins/plugin-cli-bridge.test.ts`

## Steps

> **Hydration:** STATUS.md tracks outcomes, not individual code changes. Workers
> expand steps when runtime discoveries warrant it. See task-worker agent for rules.

### Step 0: Preflight

- [ ] Confirm exactly where the current prompt/tool descriptions make the browser tool look suitable for ordinary web search or downloads
- [ ] Confirm how ChatPanel slash commands are populated today and why the web-plugin tools are not currently visible there
- [ ] Choose the cleanest implementation path that gives users `/web_search` and `/web_bookmark` without regressing the agent toward command aliases instead of tool calls

### Step 1: Clarify browser-tool intent and default web-tool routing

- [ ] Update the container system prompt and browser tool descriptions so `browser` is explicitly framed as Playwright-driven headless Chromium for UI/browser automation and visual verification inside the container
- [ ] Make ordinary web search, page retrieval, and file/content fetching default to the web-plugin tools (`web_search`, `fetch_content`, and related web tools) instead of the browser tool
- [ ] Preserve the current browser-tool verification workflow for UI testing, screenshots, and interactive page checks
- [ ] Run targeted tests: `cd apps/desktop && pnpm test -- --run electron/__tests__/agent/token-baseline.test.ts`

**Artifacts:**
- `apps/desktop/electron/features/container/tools/system-prompt.ts` (modified)
- `apps/desktop/electron/features/container/tools/tools.ts` (modified if needed)
- `apps/desktop/electron/features/container/tools/tools-browser.ts` (modified)

### Step 2: Expose supported web slash commands in ChatPanel

- [ ] Make the ChatPanel slash-command data path expose at least `/web_search` and `/web_bookmark` for user invocation in the prompt area
- [ ] Ensure those slash commands execute through an intentional supported path rather than becoming a confusing fallback that the agent prefers over the underlying tool calls during normal autonomous turns
- [ ] If a plugin manifest or bridge-policy change is the cleanest fix, keep it narrow and scoped to the supported command/tool behavior
- [ ] Add regression coverage for slash-command availability and any bridge-policy changes
- [ ] Run targeted tests: `cd apps/desktop && pnpm test -- --run electron/__tests__/features/plugins/plugin-cli-bridge.test.ts electron/__tests__/agent/slash-command-availability.test.ts`

**Artifacts:**
- `plugins/sero-web-plugin/extension/index.ts` (modified)
- `apps/desktop/electron/cli/index.ts` (modified if needed)
- `apps/desktop/electron/features/plugins/bridge-policy.ts` (modified if needed)
- `apps/desktop/electron/ipc/agent/core/agent-helpers.ts` (modified if needed)
- `apps/desktop/electron/__tests__/agent/slash-command-availability.test.ts` (new)
- `apps/desktop/electron/__tests__/features/plugins/plugin-cli-bridge.test.ts` (modified)

### Step 3: Testing & Verification

> ZERO test failures allowed. This step runs the FULL test suite as a quality gate.
> (Earlier steps should use targeted tests for fast feedback — see worker prompt.)

- [ ] Run repo-wide typecheck: `pnpm typecheck`
- [ ] Run desktop test suite: `cd apps/desktop && pnpm test`
- [ ] Fix all failures
- [ ] Build passes: `pnpm build`

### Step 4: Documentation & Delivery

- [ ] Update `docs/plugins-technical.md` only if the plugin manifest or command/bridge contract changed
- [ ] Summarize the final browser-vs-web-tool routing rule and the new slash-command behavior in the task handoff
- [ ] Log any follow-up UX/tool-selection gaps in `taskplane-tasks/CONTEXT.md`

## Documentation Requirements

**Must Update:**
- None

**Check If Affected:**
- `docs/plugins-technical.md` — only if command/bridge metadata or plugin contract changes

## Completion Criteria

- [ ] The browser tool prompt/description clearly says it is for Playwright-driven browser automation and visual verification inside the container, not ordinary search/download work
- [ ] Agent guidance clearly prefers `web_search`, `fetch_content`, or other web-plugin tools for normal web interaction and retrieval
- [ ] `/web_search` and `/web_bookmark` appear in the ChatPanel slash-command UI and work through the intended supported path
- [ ] The implementation does not regress the agent back toward preferring command aliases over the actual web tools during autonomous turns
- [ ] `pnpm typecheck`, `cd apps/desktop && pnpm test`, and `pnpm build` all pass

## Git Commit Convention

Commits happen at **step boundaries** (not after every checkbox). All commits
for this task MUST include the task ID for traceability:

- **Step completion:** `feat(TP-005): complete Step N — description`
- **Bug fixes:** `fix(TP-005): description`
- **Tests:** `test(TP-005): description`
- **Hydration:** `hydrate: TP-005 expand Step N checkboxes`

## Do NOT

- Reframe the browser tool as a generic search/download tool
- Remove the browser tool from container sessions; it is still needed for UI/browser automation and visual verification
- Ship a slash-menu-only entry that does not actually execute when the user invokes it
- Reintroduce a user-command path that makes the agent prefer command aliases over the underlying web tools in normal autonomous operation

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution.
     Format:
     ### Amendment N — YYYY-MM-DD HH:MM
     **Issue:** [what was wrong]
     **Resolution:** [what was changed] -->

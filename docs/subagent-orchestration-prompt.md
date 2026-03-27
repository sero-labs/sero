## Implement Subagent Orchestration for Sero

### Goal
Add a subagent system to Sero that lets the main agent spawn isolated specialist agents to execute work in parallel threads, keeping the primary context clean. Subagents should be usable from both the CLI and a desktop UI orchestration view.
Subagents should have all the available functionality of the main Sero Agent, but allow it to be restricted in frontmatter configuration if required.

**The primary interface for defining agents and workflows is markdown files.** Agent capabilities, workflow steps, and orchestration logic are all authored as `.md` files with YAML frontmatter — readable, editable, and version-controllable by the user.

### Reference Implementation
Analyse `~/Documents/Dev/ai/pi/extensions/pi-subagent` as the architectural starting point. Key files:
- `src/types.ts` — Agent configs, runner results, pool types
- `src/agents.ts` — Agent discovery from `.md` files with YAML frontmatter
- `src/runner.ts` — Isolated subprocess spawning (JSON mode, fresh context per run)
- `src/pool.ts` — Long-lived agent pool with IPC, tree hierarchy, cycle detection
- `skills/pi-subagent/SKILL.md` — Execution modes: single, parallel, chain, orchestrator, pool

### Existing Sero Patterns to Follow
- **Transient sessions** — `plugins/sero-cron-plugin/extension/session-runner.ts` uses `createAgentSession` + `SessionManager.inMemory()` with concurrency pooling, timeouts, and re-entrancy guards. Adapt this pattern for subagent execution rather than raw subprocess spawning.
- **Agent store** — `apps/desktop/src/stores/agent.ts` manages `AgentInstance` records keyed by session ID. Subagent instances should integrate here or in a parallel store.
- **Sessions** — `~/.sero-ui/agent/sessions/*.jsonl` for persistence. Subagent sessions should be transient by default but optionally persistable.
- **Workspaces/VCS** — Subagents operating on workspace files must respect the active workspace context and VCS state (checkpoint before destructive work, etc).

### Requirements

#### 1. Markdown-First Agent & Workflow Definitions

All agents and workflows are defined as `.md` files with YAML frontmatter. This is the primary authoring interface — no JSON configs, no UI-only creation flows. The system discovers and loads these files at runtime.

**Agent definitions** — describe a single specialist's role and capabilities:
```
~/.sero-ui/agent/agents/reviewer.md      (user-level)
.sero/agents/test-writer.md              (project-level)
```
```yaml
---
name: reviewer
description: Code review specialist
model: claude-sonnet-4-6
tools: read, bash, grep
extensions: []
---
You are a senior code reviewer. Analyse code for correctness, performance,
security, and maintainability. Be specific — cite line numbers and suggest
concrete fixes.
```

**Workflow definitions** — describe a multi-step orchestration that composes agents:
```
~/.sero-ui/agent/workflows/test-workspace.md    (user-level)
.sero/workflows/research-stocks.md               (project-level)
```
```yaml
---
name: test-workspace
description: Generate vitest unit tests for the active workspace
trigger: manual
---
## Steps

1. **Analyse** (agent: analyst)
   Map the codebase structure. Identify all modules, their exports,
   and existing test coverage. Output a test plan.

2. **Write tests** (agent: test-writer, parallel: per-module)
   For each module in the test plan, write vitest unit tests.
   Use `{previous}` for the test plan context.

3. **Validate** (agent: reviewer)
   Review all generated tests for correctness and coverage gaps.
   Output a summary with any issues found.
```

The orchestrating agent parses these workflow files to determine execution order, parallelism, and agent assignments. Workflows are human-readable plans — the agent interprets the intent, it doesn't need rigid schema.

Ship sensible built-in agents: `researcher`, `reviewer`, `test-writer`, `analyst`. Ship 2–3 example workflows demonstrating parallel fan-out and chain patterns.

When no existing agent fits, the orchestrating agent generates a new `.md` definition, saves it to the registry, and uses it — the user can then edit or discard it.

#### 2. Execution Modes
- **Single** — one agent, one task
- **Parallel** — multiple independent tasks concurrently (bounded by `maxConcurrent`)
- **Chain** — sequential pipeline where each step receives `{previous}` output

#### 3. Sero Integration
- Expose as a pi extension (`pi-subagent-extension`) with a `subagent` tool the main agent can call.
- Subagent work should appear in the desktop UI — at minimum a panel showing active/completed subagents with status, duration, token usage, and collapsible output.
- Subagent sessions should not pollute the main session's context window.

#### 4. Workflow Examples
These should work end-to-end once implemented:
- *"Research the top 10 performing FTSE stocks today and analyse investment potential"* → orchestrator spawns `researcher` agents in parallel per stock, feeds results to `analyst`.
- *"Write vitest unit tests for this workspace"* → `analyst` maps the codebase, then `test-writer` agents run in parallel per module.

### Deliverables
1. **Design doc** — Architecture, data flow, `.md` format specs for agents and workflows, extension API surface, UI wireframe.
2. **Extension package** — `packages/pi-subagent-extension/` following existing extension conventions.
3. **Built-in `.md` files** — Starter agent definitions and example workflow definitions.
4. **Desktop UI component** — Orchestration panel showing subagent activity.

### Constraints
- Subagents must not be able to spawn further subagents (no recursion).
- Extension isolation: subagents run with `--no-extensions` by default; whitelist only what's needed.
- Concurrency defaults: `maxConcurrent: 4`, `maxTotal: 8`, `timeoutMs: 600_000`.

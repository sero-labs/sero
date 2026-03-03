# Subagent Orchestration — Design Document

## 1. Overview

Add a subagent system to Sero that lets the main agent spawn isolated specialist
agents to execute work in parallel threads, keeping the primary context clean.
Subagents are usable from both the main agent (via tool call) and a desktop UI
orchestration panel.

The primary interface for defining agents and workflows is **markdown files with
YAML frontmatter** — readable, editable, and version-controllable.

---

## 2. Key Design Decision: In-Process vs Subprocess

The reference implementation (`pi-subagent`) spawns `pi` CLI subprocesses.
Sero takes a different approach: **in-process transient `AgentSession` instances**.

| Concern | Subprocess (pi-subagent) | In-process (Sero) |
|---------|-------------------------|-------------------|
| Isolation | OS-level process | Fresh `AgentSession` + `SessionManager.inMemory()` |
| Startup | Cold — spawns `pi` binary | Warm — reuses shared infra (auth, models, settings) |
| Extensions | `--no-extensions` + whitelist | `extensionFactories` whitelist on ResourceLoader |
| IPC | JSON stdout parsing | Direct method calls, shared event bus |
| Container | N/A | Full container integration via `createContainerTools()` |
| Tool bridge | N/A | Inherits `sero-cli` bridge automatically |

**Rationale:** Sero already has the transient session pattern (cron extension),
shared infrastructure singletons, and container integration. Subprocess spawning
would bypass all of this, lose container access, and add complexity.

---

## 3. Architecture

```
┌─ Electron Main Process ────────────────────────────────────────────┐
│                                                                     │
│  SharedInfra (singleton)                                            │
│    ├─ AuthStorage, ModelRegistry, SettingsManager                   │
│    └─ ContainerManager                                              │
│                                                                     │
│  AgentPool (existing — main chat sessions)                          │
│    ├─ Session A → AgentSession                                      │
│    └─ Session B → AgentSession                                      │
│                                                                     │
│  SubagentManager (NEW)                                              │
│    ├─ AgentDiscovery ─── reads .md files from:                      │
│    │    ~/.sero-ui/agent/agents/*.md    (user)                      │
│    │    <workspace>/.sero/agents/*.md   (project)                   │
│    │                                                                │
│    ├─ WorkflowDiscovery ─── reads .md files from:                   │
│    │    ~/.sero-ui/agent/workflows/*.md (user)                      │
│    │    <workspace>/.sero/workflows/*.md (project)                  │
│    │                                                                │
│    ├─ SubagentRunner ─── creates transient AgentSessions:           │
│    │    - SessionManager.inMemory()                                 │
│    │    - createContainerTools() for workspace container access      │
│    │    - Configurable tool/extension whitelist per agent            │
│    │    - Timeout + AbortController                                 │
│    │    - Concurrency pool (maxConcurrent, maxTotal)                │
│    │                                                                │
│    └─ SubagentTracker ─── real-time status for UI:                  │
│         - active/completed/failed subagent entries                  │
│         - token usage, duration, response preview                   │
│         - Events → IPC → renderer                                   │
│                                                                     │
│  Sero Extension Factory (existing)                                  │
│    └─ Registers `subagent` tool via pi.registerTool()               │
│       → bridged into sero-cli (AD-020)                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─ Renderer ──────────────────────────────────────────────────────────┐
│                                                                     │
│  SubagentStore (Zustand)                                            │
│    ├─ entries: Record<id, SubagentEntry>                            │
│    ├─ activeCount, completedCount                                   │
│    └─ Events from main process via IPC                              │
│                                                                     │
│  OrchestrationPanel (in CodingWorkspace or StatusBar)               │
│    ├─ Active subagent list with status indicators                   │
│    ├─ Collapsible output per subagent                               │
│    └─ Token usage + duration summaries                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

All subagent code lives inside `apps/desktop/` — this is NOT a separate
`packages/pi-subagent-extension/` because:
- Subagents need direct access to `SharedInfra`, `ContainerManager`, and the
  existing agent pool — all Electron main-process singletons
- The `subagent` tool is registered via the existing sero extension factory
- Tool bridging (AD-020) requires the tool to be in the extension loading path

```
apps/desktop/
  electron/
    subagent/
      types.ts              # AgentConfig, SubagentEntry, RunnerResult, etc.
      discovery.ts          # Load agent .md files (user + project scope)
      workflow-discovery.ts # Load workflow .md files
      runner.ts             # Transient AgentSession execution
      pool.ts               # Concurrency pool (acquire/release slots)
      tracker.ts            # Real-time status tracking, IPC event emission
      tool.ts               # `subagent` tool definition (registered by sero ext)
      workflow-runner.ts    # Workflow step execution (parse .md → execute steps)
      index.ts              # Public API: SubagentManager facade

  src/
    stores/
      subagent.ts           # Zustand store for subagent UI state

    types/
      subagent.ts           # Shared types (renderer ↔ main)

    components/apps/coding/orchestration/
      OrchestrationPanel.tsx     # Main panel component
      SubagentCard.tsx           # Individual subagent status card
      SubagentSummary.tsx        # Aggregate stats bar
```

---

## 5. Agent Definition Format

```
~/.sero-ui/agent/agents/reviewer.md    (user-level)
<workspace>/.sero/agents/test-writer.md (project-level)
```

```yaml
---
name: reviewer
description: Code review specialist
model: claude-sonnet-4-5
tools: read, bash, grep
extensions: []
thinking: high
---

You are a senior code reviewer. Analyse code for correctness, performance,
security, and maintainability. Be specific — cite line numbers and suggest
concrete fixes.
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Unique agent identifier |
| `description` | string | ✓ | What this agent does |
| `model` | string | | Model override (e.g. `claude-haiku-4-5`) |
| `tools` | string | | Comma-separated tool whitelist |
| `extensions` | string | | Comma-separated extension names to load |
| `thinking` | string | | Thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |

### Discovery

Uses the same pattern as `pi-subagent/agents.ts`:
- `loadAgentsFromDir(dir, source)` — reads `.md` files, parses frontmatter
- `discoverAgents(workspacePath, scope)` — merges user + project, project overrides user
- Scope: `"user"` (default), `"project"`, `"both"`

**Sero-specific paths:**
- User agents: `~/.sero-ui/agent/agents/*.md` (note: `SERO_AGENT_DIR`, not `~/.pi/agent/`)
- Project agents: `<workspace.path>/.sero/agents/*.md`

---

## 6. Workflow Definition Format

```
~/.sero-ui/agent/workflows/test-workspace.md    (user-level)
<workspace>/.sero/workflows/review-pr.md         (project-level)
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
   and existing test coverage. Output a test plan as structured markdown.

2. **Write tests** (agent: test-writer, parallel: per-module)
   For each module in the test plan, write vitest unit tests.
   Use `{previous}` for the test plan context.

3. **Validate** (agent: reviewer)
   Review all generated tests for correctness and coverage gaps.
   Output a summary with any issues found.
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Unique workflow identifier |
| `description` | string | ✓ | What this workflow does |
| `trigger` | string | | `manual` (default), `on-prompt`, `on-commit` |

### Execution Model

Workflows are **interpreted by the orchestrating agent**, not by a rigid DAG
engine. The agent reads the workflow `.md`, understands the intent, and uses the
`subagent` tool to execute each step. This gives flexibility:

- Steps with `parallel: per-module` → agent uses parallel mode
- Steps with `{previous}` → agent uses chain mode or passes context
- The agent can adapt if a step fails or produces unexpected output

This is intentionally less structured than a DAG engine — the agent is the
orchestrator, the workflow file is its plan.

---

## 7. SubagentRunner — Transient Session Execution

Follows the `pi-cron-extension/session-runner.ts` pattern but adapted for
subagent-specific needs.

```typescript
// electron/subagent/runner.ts — core execution function

interface SubagentRunOptions {
  /** Agent config (from .md discovery) */
  agent: AgentConfig;
  /** Task prompt */
  task: string;
  /** Workspace ID (for container tools) */
  workspaceId: string;
  /** Model override (agent config < call-site) */
  model?: string;
  /** Thinking level override */
  thinking?: string;
  /** Tool whitelist override */
  tools?: string[];
  /** Extension names to load */
  extensions?: string[];
  /** Timeout in ms (default: 600_000) */
  timeoutMs?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Progress callback (called per assistant message) */
  onProgress?: (event: SubagentProgressEvent) => void;
}

interface SubagentRunResult {
  response: string;
  exitCode: number;
  durationMs: number;
  usage: UsageStats;
  model: string | null;
  error?: string;
}
```

### Execution Flow

```
1. acquireSlot(jobKey)           — concurrency pool
2. ensureInfra()                 — shared auth/models/settings
3. Create ResourceLoader         — with agent-specific extension whitelist
4. Create container tools        — for workspace container access
5. createAgentSession({
     cwd: workspacePath,
     tools: filteredTools,         — agent's tool whitelist
     customTools: containerTools,
     sessionManager: inMemory(),   — no persistence
     resourceLoader,
     authStorage, modelRegistry, settingsManager,
   })
6. session.prompt(task)          — run the task
7. Extract output                — last assistant message text
8. session.dispose()             — cleanup
9. releaseSlot(jobKey)           — return concurrency slot
```

### Concurrency Pool

```typescript
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_MAX_TOTAL = 8;

// Same pattern as cron's acquireSlot/releaseSlot but with
// configurable limits from SubagentSettings.
```

### Container Integration

Subagents get full container access for their workspace:
```typescript
const containerTools = useContainer
  ? createContainerTools(containerManager, workspaceId, subagentId)
  : createCodingTools(wsPath);
```

This means subagents can read/write files, run bash commands, and use terminals
inside the workspace's container — same as the main agent.

### Extension Whitelist

Subagents load **no extensions by default**. The agent config's `extensions`
field can whitelist specific ones:

```typescript
const loader = new DefaultResourceLoader({
  cwd: wsPath,
  agentDir: SERO_AGENT_DIR,
  settingsManager: infra.settingsManager,
  // Only load whitelisted extensions
  extensionFactories: whitelistedFactories,
});
```

**Blocked:** The subagent extension itself is always blocked to prevent
recursion — subagents cannot spawn further subagents.

---

## 8. Subagent Tool — sero-cli Integration

The `subagent` tool is registered via the sero extension factory and bridged
into `sero-cli` (AD-020).

### Tool Schema (via `pi.registerTool()`)

```typescript
const SubagentParams = Type.Object({
  // Mode selection (exactly one of these should be provided)
  agent: Type.Optional(Type.String({ description: 'Agent name for single mode' })),
  task: Type.Optional(Type.String({ description: 'Task for single mode' })),

  // Parallel mode
  tasks: Type.Optional(Type.Array(Type.Object({
    agent: Type.String(),
    task: Type.String(),
    model: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
  }))),

  // Chain mode
  chain: Type.Optional(Type.Array(Type.Object({
    agent: Type.String(),
    task: Type.String(),
    model: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
  }))),

  // Shared options
  model: Type.Optional(Type.String()),
  thinking: Type.Optional(Type.String()),
  agentScope: Type.Optional(Type.String()),
});
```

### CLI Invocation (via sero-cli bridge)

```bash
# Single
sero subagent --agent reviewer --task "Review src/auth.ts"

# Parallel (JSON array)
sero subagent --tasks '[{"agent":"scout","task":"Audit auth"},{"agent":"scout","task":"Audit API"}]'

# Chain (JSON array)
sero subagent --chain '[{"agent":"scout","task":"Find TODOs"},{"agent":"planner","task":"Prioritize: {previous}"}]'
```

### TOOLS_TO_BRIDGE Update

Add `'subagent'` to the `TOOLS_TO_BRIDGE` set in `electron/cli/index.ts`.

**Note:** Because subagent uses complex schemas (arrays of objects), it may need
to remain as a standalone tool rather than bridged. Evaluate during
implementation — the existing comment in `cli/index.ts` notes that complex
schemas like `question`/`questionnaire` are NOT bridged for this reason.

**Decision: Keep `subagent` as a standalone tool.** The parallel/chain modes
require arrays of objects which the schema bridge doesn't handle well. This
follows the precedent set by `question`/`questionnaire`. The tool registers
via `pi.registerTool()` but is NOT added to `TOOLS_TO_BRIDGE`.

---

## 9. Execution Modes

### Single

```
Main Agent → subagent(agent: "reviewer", task: "Review PR #42")
           → SubagentRunner.run(agent, task, workspaceId)
           → response string returned to main agent
```

### Parallel

```
Main Agent → subagent(tasks: [{agent, task}, {agent, task}, ...])
           → Promise.allSettled(tasks.map(t => runner.run(...)))
           → combined results returned to main agent
```

Bounded by `maxConcurrent`. Tasks beyond the limit queue and wait.

### Chain

```
Main Agent → subagent(chain: [{agent, task}, {agent, task with {previous}}, ...])
           → Sequential execution:
               result1 = await runner.run(chain[0])
               result2 = await runner.run(chain[1].task.replace('{previous}', result1))
               result3 = await runner.run(chain[2].task.replace('{previous}', result2))
           → final result returned to main agent
```

Each step's `{previous}` placeholder is replaced with the prior step's response.

---

## 10. SubagentTracker — Real-Time Status

Tracks all subagent activity and pushes events to the renderer.

```typescript
// electron/subagent/tracker.ts

interface SubagentEntry {
  id: string;
  agentName: string;
  taskPreview: string;              // First 200 chars of task
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted' | 'timed_out';
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  parentSessionId: string;          // Which main session spawned this
  workspaceId: string;
  mode: 'single' | 'parallel' | 'chain';
  chainStep?: number;               // Step index in chain mode
  usage: UsageStats;
  model: string | null;
  responsePreview?: string;         // First 500 chars of response
  error?: string;
}
```

### IPC Events

```typescript
// New IPC channel: 'sero:subagent:event'

type SubagentEvent =
  | { type: 'subagent_start'; entry: SubagentEntry }
  | { type: 'subagent_progress'; id: string; usage: UsageStats }
  | { type: 'subagent_end'; id: string; status: string; response?: string; error?: string }
  | { type: 'subagent_clear'; parentSessionId: string };
```

These events flow through the same pattern as `AgentStreamEvent`:
```
SubagentTracker → sendEvent() → BrowserWindow.webContents.send() → preload → renderer
```

---

## 11. UI — OrchestrationPanel

### Location Options

**Option A: StatusBar indicator + popover** (recommended for v1)
- Small indicator in StatusBar: "🤖 2 active" with green dot
- Click opens popover with subagent list
- Minimal footprint, consistent with DevServerIndicator pattern

**Option B: CodingWorkspace activity bar item**
- New activity: "Orchestration" icon in ActivityBar
- Opens full sidebar panel with subagent tree view
- More real estate but adds complexity

**Decision: Option A for v1.** Match the DevServerIndicator pattern. Promote
to a full panel later if usage warrants it.

### SubagentIndicator (StatusBar)

```
┌─ StatusBar ──────────────────────────────────────────────────┐
│  workspace · path · 🤖 2 active · agents active              │
└──────────────────────────────────────────────────────────────┘
```

### SubagentPopover (on click)

```
┌─────────────────────────────────────────┐
│  Active Subagents                        │
├─────────────────────────────────────────┤
│  🟢 reviewer — "Review PR #42"          │
│     sonnet · 12s · 2.4k tokens          │
│                                          │
│  🟢 scout — "Map auth module"           │
│     haiku · 5s · 800 tokens             │
│                                          │
│  ✅ analyst — "Coverage analysis"        │
│     sonnet · 28s · 5.1k tokens          │
│     ▶ Show output                        │
│                                          │
│  ❌ test-writer — "Write tests for..."   │
│     timed out · 600s                     │
│     ▶ Show error                         │
├─────────────────────────────────────────┤
│  Total: 4 runs · $0.08 · 8.3k tokens    │
└─────────────────────────────────────────┘
```

### Components

```
src/components/apps/coding/orchestration/
  SubagentIndicator.tsx      # StatusBar badge (count + dot)
  SubagentPopover.tsx        # Popover list on click
  SubagentCard.tsx           # Individual entry (status, agent, stats)
  SubagentOutput.tsx         # Collapsible output viewer
```

### Store

```typescript
// src/stores/subagent.ts

interface SubagentState {
  entries: Record<string, SubagentEntry>;
  initEventListener: () => () => void;
}
```

---

## 12. Built-In Agent Definitions

Ship in `~/.sero-ui/agent/agents/` on first run (or as defaults that the user
can override).

### `analyst.md`
```yaml
---
name: analyst
description: Codebase analysis and planning
model: claude-sonnet-4-5
tools: read, bash, grep, find, ls
thinking: medium
---
You are a senior software analyst. Your job is to understand codebases
deeply and produce structured analysis.

When analysing a codebase:
1. Map the directory structure and key files
2. Identify the tech stack, frameworks, and patterns
3. Note any existing tests and coverage gaps
4. Produce a clear, structured report

Output your analysis as structured markdown with clear sections.
```

### `reviewer.md`
```yaml
---
name: reviewer
description: Code review specialist
model: claude-sonnet-4-5
tools: read, bash, grep, find
thinking: high
---
You are a senior code reviewer. Analyse code for correctness, performance,
security, and maintainability.

For each issue found:
- Cite the file and line number
- Explain the problem clearly
- Suggest a concrete fix
- Rate severity: critical, warning, or suggestion

Be thorough but not pedantic. Focus on real issues that affect correctness
or maintainability.
```

### `test-writer.md`
```yaml
---
name: test-writer
description: Unit test generation
model: claude-sonnet-4-5
tools: read, write, bash, edit
thinking: medium
---
You are a test engineer specialising in TypeScript unit tests with vitest.

When writing tests:
1. Read the source file carefully to understand all code paths
2. Write comprehensive tests covering happy paths, edge cases, and error cases
3. Use descriptive test names that explain the expected behaviour
4. Mock external dependencies, not the code under test
5. Run the tests to verify they pass

Follow the existing test patterns in the project if any exist.
```

### `scout.md`
```yaml
---
name: scout
description: Fast codebase reconnaissance
model: claude-haiku-4-5
tools: read, bash, grep, find, ls
thinking: off
---
You are a fast reconnaissance agent. Your job is to quickly scan a codebase
and report findings.

Be concise. Use bullet points. Don't explain — just report what you find.
Focus on structure, not implementation details.
```

---

## 13. Example Workflows

### `test-workspace.md`
```yaml
---
name: test-workspace
description: Generate vitest unit tests for the active workspace
trigger: manual
---

## Steps

1. **Analyse** (agent: analyst)
   Map the codebase structure. Identify all modules, their exports,
   and existing test coverage. Output a test plan listing each module
   that needs tests.

2. **Write tests** (agent: test-writer, parallel: per-module)
   For each module in the test plan, write vitest unit tests.
   Context from step 1: `{previous}`

3. **Validate** (agent: reviewer)
   Review all generated tests for correctness and coverage gaps.
   Output a summary with pass/fail status and any issues.
   Context: `{previous}`
```

### `review-pr.md`
```yaml
---
name: review-pr
description: Comprehensive PR review with multiple specialist passes
trigger: manual
---

## Steps

1. **Scan changes** (agent: scout)
   List all changed files and summarise the scope of the PR.
   Focus on: files changed, lines added/removed, areas affected.

2. **Deep review** (agent: reviewer)
   Perform a thorough code review of all changes.
   Focus on: correctness, security, performance, maintainability.
   Changed files: `{previous}`

3. **Test assessment** (agent: analyst)
   Assess whether the changes have adequate test coverage.
   If tests are missing, describe what should be tested.
   Review findings: `{previous}`
```

---

## 14. IPC Layer Updates

### New IPC Channels

```typescript
// src/types/ipc.ts — add to IpcChannels

export const IpcChannels = {
  // ... existing channels ...
  subagent: {
    event: 'sero:subagent:event',
    listAgents: 'sero:subagent:list-agents',
    listWorkflows: 'sero:subagent:list-workflows',
    abort: 'sero:subagent:abort',
  },
} as const;
```

### Preload Bridge

```typescript
// electron/preload.ts — add to window.sero

subagent: {
  onEvent: (cb: (event: SubagentEvent) => void) => ipcRenderer.on(
    'sero:subagent:event', (_e, event) => cb(event)
  ),
  listAgents: (scope: string) => ipcRenderer.invoke('sero:subagent:list-agents', scope),
  listWorkflows: (scope: string) => ipcRenderer.invoke('sero:subagent:list-workflows', scope),
  abort: (subagentId: string) => ipcRenderer.invoke('sero:subagent:abort', subagentId),
},
```

---

## 15. System Prompt Addition

Add to the sero extension factory's `before_agent_start` hook:

```
## Subagents

You can delegate tasks to specialist subagents using the `subagent` tool.
Each subagent runs in an isolated session with a fresh context window.

Available agents:
- analyst: Codebase analysis and planning
- reviewer: Code review specialist
- test-writer: Unit test generation
- scout: Fast codebase reconnaissance

Modes:
- Single: { agent: "scout", task: "..." }
- Parallel: { tasks: [{ agent, task }, ...] }
- Chain: { chain: [{ agent, task }, { agent, task with {previous} }] }

Use subagents when:
- A task can be split into independent parallel pieces
- You need a specialist perspective (review, testing)
- A subtask benefits from a clean context window
- You want to delegate routine work while focusing on the main task

Subagents have full access to the workspace (files, terminal, container).
They cannot spawn further subagents.
```

---

## 16. Settings

Stored in `~/.sero-ui/agent/settings.json` under a `"subagent"` key:

```json
{
  "subagent": {
    "maxConcurrent": 4,
    "maxTotal": 8,
    "timeoutMs": 600000,
    "model": null,
    "blockedExtensions": []
  }
}
```

Read by `SubagentManager` on init, with sensible defaults.

---

## 17. Constraints & Safety

1. **No recursion** — subagents cannot spawn further subagents. The extension
   factory for subagent sessions does NOT include the subagent tool.
2. **Concurrency limits** — `maxConcurrent: 4` (parallel slots), `maxTotal: 8`
   (absolute cap including queued). Prevents resource exhaustion.
3. **Timeout** — default 600s (10min). Configurable per-agent and per-call.
4. **No session persistence** — `SessionManager.inMemory()`. Subagent work is
   ephemeral; only the final response flows back to the main session.
5. **Extension isolation** — no extensions loaded by default. Whitelist only
   what's needed per agent config.
6. **Container scoping** — subagents get container tools for their workspace
   only. No cross-workspace container access.

---

## 18. Implementation Plan

### Phase 1: Core Engine (electron/subagent/)
1. `types.ts` — all type definitions
2. `discovery.ts` — agent .md loading
3. `pool.ts` — concurrency pool (acquireSlot/releaseSlot)
4. `runner.ts` — transient session execution
5. `tracker.ts` — status tracking + IPC events
6. `index.ts` — SubagentManager facade

### Phase 2: Tool Registration
1. Register `subagent` tool in sero extension factory
2. Implement single, parallel, chain modes
3. Add system prompt block for agent discovery
4. Wire SubagentManager into `openSessionInternal()`

### Phase 3: Built-In Content
1. Ship default agent .md files (analyst, reviewer, test-writer, scout)
2. Ship example workflow .md files
3. Workflow discovery + listing

### Phase 4: Desktop UI
1. `SubagentStore` (Zustand)
2. IPC channel registration + preload bridge
3. `SubagentIndicator` in StatusBar
4. `SubagentPopover` with SubagentCard list
5. Collapsible output viewer

### Phase 5: Workflow Execution
1. `workflow-discovery.ts` — load workflow .md files
2. `workflow-runner.ts` — parse steps, execute via SubagentRunner
3. Wire into subagent tool (optional `--workflow` flag)

---

## 19. Testing Strategy

```
apps/desktop/electron/__tests__/subagent/
  discovery.test.ts          # Agent .md parsing + scope resolution
  pool.test.ts               # Concurrency slot management
  runner.test.ts             # Transient session execution (mocked)
  tracker.test.ts            # Event emission + status transitions
  workflow-discovery.test.ts # Workflow .md parsing
```

Unit tests with vitest. Mock `createAgentSession` and container tools.
E2E testing via the desktop app with real agent sessions.

---

## 20. Open Questions

1. **Workflow trigger: `on-prompt`** — should workflows be triggerable by
   keyword detection in user prompts? Defer to v2.
2. **Subagent output persistence** — should we optionally save subagent
   transcripts to disk? Useful for debugging but adds complexity.
3. **Inter-subagent communication** — the reference impl has a full RPC pool
   with message routing. Sero v1 intentionally omits this (no orchestrator
   mode). Revisit if use cases demand it.
4. **Cost budgets** — should there be a per-workflow cost cap? The reference
   impl tracks costs per agent. Add budget enforcement in v2.

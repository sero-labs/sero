# Subagent Orchestration — Specification
## Overview
- **Problem**: The main Sero agent's context window gets polluted when handling
  complex multi-part tasks. There's no way to delegate specialist work to
  isolated agents or parallelise independent subtasks.
- **Solution**: An in-process subagent system that spawns transient
  `AgentSession` instances via the Pi SDK, with markdown-first agent
  definitions, three execution modes (single/parallel/chain), and a desktop UI
  panel for monitoring.
- **Success Criteria**: The main agent can successfully delegate tasks to
  specialist subagents, receive results, and the user can monitor activity in
  real-time via the orchestration sidebar.
- **Key Stakeholders**: End user (observes subagent work), main agent (tool
  caller), agent author (writes `.md` definitions).

---
## Detailed Requirements
### Functional Requirements

1. **Agent Discovery** — Load agent definitions from global `.md` files with
   YAML frontmatter in `~/.sero-ui/agent/agents/*.md`.

2. **Dynamic Discovery** — Agent discovery runs fresh on every `subagent` tool
   invocation (not cached at session start). Agents added mid-session are
   immediately available without `/reload`.

3. **Discovery Warnings** — Log warnings (non-blocking) when:
   - An agent file has invalid or incomplete frontmatter
   - An agent references a model that doesn't exist in the `ModelRegistry`

4. **Three Execution Modes**:
   - **Single** — one named agent, one task, returns response
   - **Parallel** — N independent tasks run concurrently, bounded by
     `maxConcurrent`, with results returned as labelled markdown sections
   - **Chain** — sequential pipeline where each step's `{previous}` placeholder
     is replaced with the prior step's full response

5. **Ad-hoc Inline Mode** — The `subagent` tool accepts an optional
   `systemPrompt` parameter for one-off tasks that don't warrant a named agent.
   When `systemPrompt` is provided, no `.md` lookup is needed.

6. **Agent Creation Tool** — A `create_agent` tool validates and writes a new
   `.md` file to `~/.sero-ui/agent/agents/`. Structured parameters prevent
   invalid configs. The system prompt guides the agent: *"Use named agents for
   recurring specialist roles. For one-off tasks, use an inline systemPrompt
   instead of creating a new agent file."*

7. **Full Response Return** — Subagent responses are returned to the main agent
   untruncated. The main agent manages its own context.

8. **Parallel Result Format** — Parallel mode results are returned as labelled
   markdown sections:
   ```
   ## Result 1: scout — "Audit auth module"
   [full output]

   ## Result 2: scout — "Audit API routes"
   [full output]
   ```

9. **Progress Streaming** — The `subagent` tool uses Pi SDK's `onUpdate`
   callback to stream status lines while subagents execute:
   ```
   🔄 scout started — "Map auth module"
   ✅ scout completed (5s, 800 tokens)
   🔄 reviewer running (30s, 2.1k tokens)...
   ```

10. **Abort Propagation** — When the main session is aborted, all running child
    subagents are immediately aborted via their `AbortController`s. Already-
    completed results remain in the tracker.

11. **Built-in Agents** — Ship 4 default agents: `analyst`, `reviewer`,
    `test-writer`, `scout`. Templates are stored in `packages/templates/agents/`
    and copied to `~/.sero-ui/agent/agents/` on first launch. They are
    user-editable and deletable after copy.

12. **Desktop UI** — Orchestration is accessible from CodingWorkspace via a new
    activity bar item. It reuses the existing coding sidebar pattern rather than
    introducing a second independent sidebar surface.

13. **Error Handling** — Failed subagents return a plain error message. The main
    agent decides recovery strategy (retry, different agent, do it itself, ask
    user). Failed entries persist in the orchestration UI.

### Non-Functional Requirements
14. **Concurrency** — Default `maxConcurrent: 4`, `maxTotal: 8`. Configurable in
    `~/.sero-ui/agent/settings.json` under `"subagent"`:
    - `maxConcurrent` limits fan-out within a single `subagent` tool call
    - `maxTotal` limits the total number of concurrently running subagent
      sessions across the entire desktop app

15. **Timeout** — Default `600_000` ms (10 min) per subagent. Configurable:
    - per-agent via frontmatter `timeoutMs`
    - per-call via top-level `timeoutMs`
    - per-task via `tasks[i].timeoutMs` / `chain[i].timeoutMs`

16. **No Recursion / No Agent Management In Children** — Subagents cannot spawn
    further subagents and cannot create new named agents. Child sessions do not
    receive either the `subagent` or `create_agent` tool.

17. **No Session Persistence** — Subagent sessions use
    `SessionManager.inMemory()`. Only the final response flows back. No `.jsonl`
    files are created.

18. **Extension Isolation** — Child sessions use a reduced Sero extension
    factory for prompt injection and workspace/container helper commands only.
    External extension packages are not loaded in subagent sessions in v1.

19. **Tool Access** — All subagents get the full built-in workspace tool set in
    v1 (container tools or host-side coding tools, depending on workspace
    runtime). The `tools` frontmatter field is parsed and stored but not
    enforced. Enforcement is deferred to v2.

20. **Cost Visibility** — No cost guardrails in v1. Per-subagent costs and
    aggregate totals are displayed in the orchestration UI.

---
## Technical Design
### Architecture

```
┌─ Electron Main Process ────────────────────────────────────────────┐
│                                                                     │
│  SharedInfra (singleton) — shared-infra.ts                          │
│    ├─ AuthStorage, ModelRegistry, SettingsManager                   │
│    ├─ ContainerManager                                              │
│    └─ SubagentManager (NEW)                                         │
│                                                                     │
│  AgentPool (existing — main chat sessions)                          │
│    ├─ Session A → AgentSession                                      │
│    └─ Session B → AgentSession                                      │
│                                                                     │
│  SubagentManager                                                    │
│    ├─ AgentDiscovery                                                │
│    │    reads global agent .md files                                │
│    │    runs fresh on every tool call                               │
│    │                                                                │
│    ├─ SubagentRunner                                                │
│    │    creates transient AgentSessions:                            │
│    │    - SessionManager.inMemory()                                 │
│    │    - Full Sero system prompt + agent .md body                  │
│    │    - createContainerTools() or createCodingTools()             │
│    │    - Timeout + AbortController                                 │
│    │                                                                │
│    ├─ ConcurrencyPool                                               │
│    │    acquireSlot / releaseSlot                                   │
│    │    global active-count cap + per-call fan-out cap              │
│    │    parentSessionId → Set<AbortController> for cascade abort    │
│    │                                                                │
│    └─ SubagentTracker                                               │
│         SubagentEntry records with status, usage, cost              │
│         Events → IPC → renderer                                     │
│                                                                     │
│  Sero Extension Factory (existing)                                  │
│    ├─ Registers `subagent` + `create_agent` for main sessions only  │
│    ├─ Provides reduced helper commands to child sessions            │
│    └─ Adds subagent guidance to main-session system prompt          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─ Renderer ──────────────────────────────────────────────────────────┐
│                                                                     │
│  SubagentStore (Zustand) — src/stores/subagent.ts                   │
│    ├─ entries: Record<id, SubagentEntry>                            │
│    ├─ mount-time snapshot hydration                                 │
│    └─ live events from main process via IPC                         │
│                                                                     │
│  CodingWorkspace                                                    │
│    ├─ ActivityBar — new "Orchestration" item                        │
│    └─ CodingSidebar                                                 │
│         └─ OrchestrationPanel                                       │
│              ├─ SubagentList                                        │
│              ├─ SubagentCard                                        │
│              ├─ SubagentOutput                                      │
│              └─ SubagentSummary                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Module Structure
```
apps/desktop/
  electron/
    subagent/
      types.ts              # AgentConfig, SubagentEntry, RunResult, settings
      discovery.ts          # Load agent .md files from ~/.sero-ui/agent/agents/
      runner.ts             # Transient AgentSession execution
      pool.ts               # Concurrency pool (global + per-call limits)
      tracker.ts            # Real-time status tracking + event emission
      tool.ts               # subagent + create_agent tool definitions
      index.ts              # SubagentManager facade (public API)

  electron/ipc/
    subagent.ts             # IPC handlers (agents, snapshot, abort)

  src/
    stores/
      subagent.ts           # Zustand store for subagent UI state

    types/
      ipc.ts                # Shared subagent event and entry types
      ipc-channels.ts       # Subagent IPC channel constants
      electron.d.ts         # window.sero.subagent API typing

    components/apps/coding/orchestration/
      OrchestrationPanel.tsx
      SubagentList.tsx
      SubagentCard.tsx
      SubagentOutput.tsx
      SubagentSummary.tsx

packages/
  templates/
    agents/
      analyst.md
      reviewer.md
      test-writer.md
      scout.md
```

### Data Models
#### AgentConfig (from `.md` discovery)
```typescript
interface AgentConfig {
  name: string;            // Required — unique identifier
  description: string;     // Required — what this agent does
  model?: string;          // Default model for this agent
  thinking?: string;       // Default thinking level
  timeoutMs?: number;      // Default timeout for this agent
  tools?: string[];        // Parsed from YAML arrays, not enforced in v1
  extensions?: string[];   // Parsed and stored, not enforced in v1
  systemPrompt: string;    // .md body content
  source: 'global';        // Global user agent directory
  filePath: string;        // Absolute path to the .md file
}
```

#### SubagentEntry (tracker state)
```typescript
interface SubagentEntry {
  id: string;                      // Unique run ID
  agentName: string;               // Agent config name (or 'ad-hoc')
  taskPreview: string;             // First 200 chars of task
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted' | 'timed_out';
  startedAt: number;               // Unix ms
  completedAt: number | null;
  durationMs: number | null;
  parentSessionId: string;         // Which main session spawned this
  workspaceId: string;
  mode: 'single' | 'parallel' | 'chain';
  chainStep?: number;              // Step index in chain mode
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    cost: number;
  };
  model: string | null;
  responsePreview?: string;        // First 500 chars of response
  fullResponse?: string;           // Complete response (for UI output viewer)
  error?: string;
}
```

#### SubagentSettings (in `settings.json`)
```typescript
interface SubagentSettings {
  maxConcurrent: number;    // Default: 4 — per tool invocation
  maxTotal: number;         // Default: 8 — global active child sessions
  timeoutMs: number;        // Default: 600_000
  model: string | null;     // Default model if agent/call omit one
  thinking: string | null;  // Default thinking if agent/call omit one
  blockedExtensions: string[];
}
```

### Resolution Precedence
Resolved configuration is determined per child run in this order:
1. Per-task override (`tasks[i]` / `chain[i]`)
2. Top-level call override
3. Agent frontmatter
4. Global `subagent` settings in `settings.json`
5. Session / app defaults

This precedence applies to `model`, `thinking`, and `timeoutMs`.

### Subagent Tool Schema
```typescript
const SubagentParams = Type.Object({
  // ── Single mode ──
  agent: Type.Optional(Type.String({
    description: 'Agent name (from ~/.sero-ui/agent/agents/*.md) for single mode',
  })),
  task: Type.Optional(Type.String({
    description: 'Task prompt for single mode',
  })),

  // ── Parallel mode ──
  tasks: Type.Optional(Type.Array(Type.Object({
    agent: Type.String(),
    task: Type.String(),
    model: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
    timeoutMs: Type.Optional(Type.Number()),
  }), { description: 'Array of independent tasks for parallel execution' })),

  // ── Chain mode ──
  chain: Type.Optional(Type.Array(Type.Object({
    agent: Type.String(),
    task: Type.String(),
    model: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
    timeoutMs: Type.Optional(Type.Number()),
  }), { description: 'Sequential pipeline. Use {previous} for prior output.' })),

  // ── Shared options ──
  model: Type.Optional(Type.String({ description: 'Model override' })),
  thinking: Type.Optional(Type.String({ description: 'Thinking level override' })),
  timeoutMs: Type.Optional(Type.Number({ description: 'Timeout override in milliseconds' })),
  systemPrompt: Type.Optional(Type.String({
    description: 'Inline system prompt for ad-hoc tasks (no .md lookup needed)',
  })),
});
```

**Standalone tool** — `subagent` remains a deliberate exception to AD-020. It
registers via `pi.registerTool()` instead of the `sero-cli` bridge so the main
agent can pass structured nested parameters directly.

### Create Agent Tool Schema
```typescript
const CreateAgentParams = Type.Object({
  name: Type.String({ description: 'Agent name (alphanumeric + hyphens)' }),
  description: Type.String({ description: 'What this agent does' }),
  systemPrompt: Type.String({ description: 'System prompt body' }),
  model: Type.Optional(Type.String({ description: 'Default model' })),
  thinking: Type.Optional(Type.String({ description: 'Thinking level' })),
  timeoutMs: Type.Optional(Type.Number({ description: 'Default timeout in milliseconds' })),
});
```
Validates name format, checks for collisions, and writes to
`~/.sero-ui/agent/agents/<name>.md`. This tool is available to main sessions only.

### Execution Flows
#### Single Mode
```
1. tool.execute({ agent: "reviewer", task: "Review auth.ts" })
2. discoverAgents()                             → find "reviewer" config
3. resolveConfig(taskOverride, callOverride, agentConfig, settings, session)
4. pool.acquireSlot("subagent-<id>")           → wait for global capacity
5. tracker.start(entry)                        → emit subagent_start event
6. onUpdate("🔄 reviewer started...")
7. runner.run({ resolvedConfig, task, workspaceId, signal, onProgress })
8. tracker.complete(id, response)              → emit subagent_end event
9. pool.releaseSlot("subagent-<id>")
10. onUpdate("✅ reviewer completed (45s)")
11. return { content: [{ type: 'text', text: response }] }
```
#### Parallel Mode
```
1. tool.execute({ tasks: [{agent, task}, {agent, task}, ...] })
2. discoverAgents()
3. For each task:
   a. resolveConfig(taskOverride, callOverride, agentConfig, settings, session)
   b. acquireSlot subject to:
      - global maxTotal
      - this invocation's maxConcurrent fan-out
4. Promise.allSettled(tasks.map(runTask))
5. Format results as labelled markdown sections
6. return combined text
```
#### Chain Mode
```
1. tool.execute({ chain: [{agent, task}, {agent, task + {previous}}, ...] })
2. discoverAgents()
3. For each step sequentially:
   a. Replace {previous} in task with prior step's response
   b. resolveConfig(stepOverride, callOverride, agentConfig, settings, session)
   c. acquireSlot → tracker.start → runner.run → tracker.complete → releaseSlot
   d. Store response for next step
4. return final step's response
```

#### Ad-hoc Inline Mode
```
1. tool.execute({
     task: "Analyse this CSV",
     systemPrompt: "You are a data analyst...",
     timeoutMs: 120000
   })
2. Skip discovery — build AgentConfig from inline params
3. Resolve config with call overrides + settings + session defaults
4. Same execution as single mode
```

### SubagentManager Instantiation
Singleton on `SharedInfra`, alongside `ContainerManager`:

```typescript
// electron/ipc/shared-infra.ts
export const subagentManager = new SubagentManager();
```

The main-session extension factory receives it with an explicit enable flag:

```typescript
// electron/ipc/agent.ts — in openSessionInternal()
const extensionFactories = [
  createSeroExtensionFactory(
    workspaceManager,
    workspaceId,
    sessionId,
    containerState ?? undefined,
    {
      subagentManager,
      enableAgentManagementTools: true,
    },
  ),
];
```

For main sessions, the extension factory registers the `subagent` and `create_agent`
tools with closure access to the manager.

### Subagent Session Construction
Each child session gets the full Sero system prompt (container instructions,
workspace awareness, `sero-cli`) plus the agent's `.md` body. Child sessions do
not load extension packages in v1 and do not register `subagent` or
`create_agent`.

```typescript
// electron/subagent/runner.ts — inside run()

const loader = createSubagentResourceLoader({
  cwd: wsPath,
  agentDir: SERO_AGENT_DIR,
  settingsManager: infra.settingsManager,
  workspaceManager,
  workspaceId,
  sessionId: subagentSessionId,
  containerState,
});

const { session } = await createAgentSession({
  cwd: wsPath,
  agentDir: SERO_AGENT_DIR,
  authStorage: infra.authStorage,
  modelRegistry: infra.modelRegistry,
  tools: useContainer ? [] : createCodingTools(wsPath),
  customTools: containerTools,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(wsPath),
  settingsManager: infra.settingsManager,
  systemPromptSuffix: agent.systemPrompt,
});
```

`createSubagentResourceLoader()` is a purpose-built helper that:

- injects the standard Sero CLI + container prompt blocks
- exposes workspace/container helper commands needed by child sessions
- excludes `subagent` and `create_agent`
- skips external extension package loading in v1

### Abort Cascade
The `ConcurrencyPool` maintains `parentSessionId → Set<AbortController>`:

```typescript
// electron/subagent/pool.ts

class ConcurrencyPool {
  private active = new Set<string>();
  private parentAbortMap = new Map<string, Set<AbortController>>();

  acquireSlot(key: string, parentSessionId: string, controller: AbortController): Promise<void>;
  releaseSlot(key: string, parentSessionId: string): void;
  abortAll(parentSessionId: string): void; // Kill all child subagents
}
```

The main agent pool's abort handler calls `subagentManager.abortAll(sessionId)`
which propagates to the pool.

### Container Access
Subagents share the workspace's existing container (one container per workspace,
AD-018). Multiple concurrent subagents may execute in the same container.

**Documented constraint**: Parallel subagents should be given independent file
scope. Concurrent writes to the same file may cause race conditions. This is
the main agent's responsibility and should be reinforced in the system prompt
guidance.

---
## IPC Layer
### New IPC Channels
Add channel constants in `apps/desktop/src/types/ipc-channels.ts`:

```typescript
export const IpcChannels = {
  // ... existing ...
  subagent: {
    event: 'sero:subagent:event',
    listAgents: 'sero:subagent:list-agents',
    snapshot: 'sero:subagent:snapshot',
    abort: 'sero:subagent:abort',
  },
} as const;
```

This follows the repo's current split:

- shared event / payload types in `src/types/ipc.ts`
- channel constants in `src/types/ipc-channels.ts`
- preload API typing in `src/types/electron.d.ts`

### Event Types
```typescript
interface SubagentAgentSummary {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

type SubagentEvent =
  | { type: 'subagent_start'; entry: SubagentEntry }
  | {
      type: 'subagent_progress';
      id: string;
      usage: Partial<SubagentEntry['usage']>;
    }
  | {
      type: 'subagent_end';
      id: string;
      status: SubagentEntry['status'];
      response?: string;
      error?: string;
      usage: SubagentEntry['usage'];
      durationMs: number;
    }
  | { type: 'subagent_clear'; parentSessionId: string };
```

Mount-time hydration is handled via a request/response snapshot IPC rather than
an event-only design.

### Snapshot Hydration
The orchestration UI must not rely solely on live events. On mount, it calls:

```typescript
window.sero.subagent.snapshot(workspaceId)
```

This returns the current tracker state for the active workspace, including
already-running and already-completed entries. Live events then keep the store
in sync.

This mirrors the existing late-mount hydration pattern used by user-feedback
questions.

### Preload Bridge
```typescript
// electron/preload.ts — additions to window.sero

subagent: {
  onEvent: (cb: (event: SubagentEvent) => void) => {
    const handler = (_e: any, event: SubagentEvent) => cb(event);
    ipcRenderer.on(IpcChannels.subagent.event, handler);
    return () => ipcRenderer.removeListener(IpcChannels.subagent.event, handler);
  },
  listAgents: () =>
    ipcRenderer.invoke(IpcChannels.subagent.listAgents),
  snapshot: (workspaceId: string) =>
    ipcRenderer.invoke(IpcChannels.subagent.snapshot, workspaceId),
  abort: (subagentId: string) =>
    ipcRenderer.invoke(IpcChannels.subagent.abort, subagentId),
},
```

### Renderer Store Contract
`src/stores/subagent.ts` should:

1. call `snapshot(workspaceId)` when the orchestration panel mounts or the
   active workspace changes
2. store entries keyed by run id
3. apply live `subagent_start`, `subagent_progress`, and `subagent_end` updates
4. filter the visible list to the active workspace

## System Prompt Addition
Added to the Sero extension factory's `before_agent_start` hook for main
sessions only. The agent list is illustrative; actual available agents are
discovered dynamically at tool call time.

```
## Subagents

You can delegate tasks to specialist subagents using the `subagent` tool.
Each subagent runs in an isolated session with a fresh context window and full
access to the workspace (files, terminal, container).

Built-in agents: analyst, reviewer, test-writer, scout.
Custom global agents may also be available from ~/.sero-ui/agent/agents/.

Modes:
- Single: { agent: "scout", task: "..." }
- Parallel: { tasks: [{ agent, task }, ...] }
- Chain: { chain: [{ agent, task }, { agent, task with {previous} }] }
- Ad-hoc: { task: "...", systemPrompt: "You are a..." }

Config precedence:
- Per-task override > top-level call override > agent frontmatter
- Agent frontmatter > global subagent settings > session defaults

When to use subagents:
- A task can be split into independent parallel pieces
- You need a specialist perspective (review, testing, analysis)
- A subtask benefits from a clean context window
- You want to delegate routine work while focusing on the main task

Do NOT use subagents for:
- Simple file reads or quick lookups (do those directly)
- Tasks that require back-and-forth with the user
- Anything that takes fewer than ~5 tool calls

Use named agents for recurring specialist roles. For one-off tasks, use an
inline systemPrompt instead of creating a new agent file.

Subagents cannot spawn further subagents.
Subagents cannot call create_agent.
When delegating parallel work, assign independent file scope to avoid races.
```

## Settings
In `~/.sero-ui/agent/settings.json`:

```json
{
  "subagent": {
    "maxConcurrent": 4,
    "maxTotal": 8,
    "timeoutMs": 600000,
    "model": null,
    "thinking": null,
    "blockedExtensions": []
  }
}
```

Defaults are applied in the `SubagentManager` constructor if the key is
missing.

## User Experience
### User Personas
1. **End User** — observes subagent work in the orchestration panel. Wants to
   see progress, costs, and results without understanding internals.
2. **Main Agent** — the AI agent calling the `subagent` tool. Needs clear error
   messages and structured results to reason about.
3. **Agent Author** — creates `.md` agent definitions in
   `~/.sero-ui/agent/agents/`. Power user who understands frontmatter and prompt
   engineering.

### User Flows
#### Primary: Agent Delegates Work
1. User sends a complex prompt to the main agent.
2. Main agent decides to delegate and calls `subagent`.
3. The orchestration panel shows a new entry with running status.
4. Progress lines stream in the ChatPanel tool output area.
5. The panel updates in real time with duration, tokens, and cost.
6. The subagent completes and the panel shows completion plus summary.
7. The main agent receives the result and continues reasoning.

#### Secondary: User Monitors Parallel Work
1. Main agent spawns 4 parallel subagents.
2. The orchestration panel shows 4 entries.
3. Entries complete independently as results arrive.
4. The user expands an entry to read full output.
5. The summary bar shows aggregate stats for the visible workspace.

#### Error: Subagent Fails
1. A subagent times out or encounters an API error.
2. The panel entry turns failed with an error message.
3. The main agent receives error text and decides recovery.
4. The user can inspect details in the panel.

### UI Integration
The orchestration surface is a new `CodingPanel` inside the existing coding app
layout, not a new top-level shell panel:

- `ActivityBar` gets a new `orchestration` item
- `CodingSidebar` renders `OrchestrationPanel` when that item is active
- the panel is scoped to the active workspace

This keeps the feature aligned with the current `ActivityBar` and
`CodingSidebar` structure instead of introducing another sidebar system.

### UI States
| State | Panel Display |
|-------|---------------|
| No subagent activity | "No subagent activity" placeholder with icon |
| Subagents running | Live list with animated status indicators |
| All complete | List with completion / failure indicators and summary bar |
| Mixed | Running entries at top, completed below |

### Orchestration Panel Layout
```
┌─ Orchestration ──────────────────────┐
│                                      │
│  🔄 reviewer — "Review PR #42"       │
│     claude-sonnet-4-6 · 12s · 2.4k   │
│     [$0.03]                          │
│                                      │
│  🔄 scout — "Map auth module"        │
│     claude-haiku-4-5 · 5s · 800      │
│     [$0.001]                         │
│                                      │
│  ✅ analyst — "Coverage analysis"    │
│     claude-sonnet-4-6 · 28s · 5.1k   │
│     [$0.05]                          │
│     ▼ Output                         │
│     │ The codebase has 42 modules... │
│     │ Coverage: 67% (28/42 modules)  │
│     │ ...                            │
│                                      │
│  ❌ test-writer — "Write tests..."   │
│     timed out after 600s             │
│     ▼ Error                          │
│     │ Session timed out...           │
│                                      │
├──────────────────────────────────────┤
│  4 runs · $0.08 · 8.3k tokens · 90s  │
└──────────────────────────────────────┘
```

## Built-In Agents
### `packages/templates/agents/analyst.md`
```yaml
---
name: analyst
description: Codebase analysis and planning
model: claude-sonnet-4-6
tools:
  - read
  - bash
  - grep
  - find
  - ls
thinking: medium
---
You are a senior software analyst. Your job is to understand codebases deeply
and produce structured analysis.

When analysing a codebase:
1. Map the directory structure and key files
2. Identify the tech stack, frameworks, and patterns
3. Note any existing tests and coverage gaps
4. Produce a clear, structured report

Output your analysis as structured markdown with clear sections.
```

### `packages/templates/agents/reviewer.md`
```yaml
---
name: reviewer
description: Code review specialist
model: claude-sonnet-4-6
tools:
  - read
  - bash
  - grep
  - find
thinking: high
---
You are a senior code reviewer. Analyse code for correctness, performance,
security, and maintainability.

For each issue found:
- Cite the file and line number
- Explain the problem clearly
- Suggest a concrete fix
- Rate severity: critical, warning, or suggestion

Be thorough but not pedantic. Focus on real issues that affect correctness or
maintainability.
```

### `packages/templates/agents/test-writer.md`
```yaml
---
name: test-writer
description: Unit test generation
model: claude-sonnet-4-6
tools:
  - read
  - write
  - bash
  - edit
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

### `packages/templates/agents/scout.md`
```yaml
---
name: scout
description: Fast codebase reconnaissance
model: claude-haiku-4-5
tools:
  - read
  - bash
  - grep
  - find
  - ls
thinking: off
---
You are a fast reconnaissance agent. Your job is to quickly scan a codebase and
report findings.

Be concise. Use bullet points. Don't explain — just report what you find.
Focus on structure, not implementation details.
```

## Risks & Mitigations
### Risk Register
| Risk | Category | Impact | Probability | Mitigation |
|------|----------|--------|-------------|------------|
| Subagent causes unhandled crash in main process | Technical | High | Low | Pi SDK error containment + try/catch + timeout. Monitor and add worker_threads if crashes are observed. |
| Parallel subagents write to the same file | Technical | Medium | Medium | Document constraint. Main agent should assign independent file scope. |
| Cost explosion from aggressive delegation | Business | Medium | Medium | Show costs in UI. No guardrails in v1; add budget caps in v2 if needed. |
| Main agent overuses subagents for trivial tasks | Operational | Low | Medium | System prompt guidance plus tool descriptions. |
| Agent `.md` model reference becomes stale | Operational | Low | High | Non-blocking warning during discovery. Fall back through the precedence chain. |
| Memory pressure from concurrent in-memory sessions | Technical | Medium | Low | Global `maxTotal` cap and immediate disposal after completion. |

### Accepted Tradeoffs
1. **No tool filtering in v1** — all subagents get all built-in workspace tools.
   The `tools` frontmatter field is stored for v2.
2. **No cost guardrails in v1** — costs are shown retroactively in UI.
3. **No workflow execution in v1** — the main agent can still use chain mode for
   simple sequential delegation.
4. **Shared container** — parallel subagents share one container, so the main
   agent must avoid overlapping writes.
5. **Full Sero system prompt per subagent** — each child session pays prompt
   overhead for workspace and container awareness.
6. **No extension package loading in child sessions** — simpler isolation model
   for v1, even if some future specialist agents may want whitelisted packages.

### Contingency Plans
- **If crashes emerge**: add `worker_threads` isolation for child sessions
- **If costs spiral**: add configurable per-session budget with warning/block
- **If extension package access becomes necessary**: introduce an explicit
  allowlist with enforcement in the subagent loader

## Implementation Notes
### Key Decisions
| Decision | Rationale |
|----------|-----------|
| In-process sessions, not subprocesses | Reuses SharedInfra, ContainerManager, and prompt infrastructure. |
| Global-only agents | Simpler discovery model; avoids workspace-specific shadowing and default-scope ambiguity. |
| Dynamic discovery on every tool call | Agents added mid-session are immediately available. |
| Full Sero system prompt for subagents | Child sessions need container conventions and workspace awareness. |
| `subagent` remains standalone | Deliberate exception to AD-020 for direct structured nested params. |
| `create_agent` main-session only | Child sessions must not manage agents or create recursion-adjacent flows. |
| Reduced child-session extension factory | Preserves prompt/workspace/container helpers without full extension loading. |
| Snapshot + events for UI state | Prevents late-mount and reload desync in the orchestration panel. |
| Orchestration uses the existing coding sidebar | Matches the current `ActivityBar` + `CodingSidebar` architecture. |

### Dependencies
- Pi SDK `createAgentSession`, `SessionManager.inMemory()`,
  `DefaultResourceLoader`
- Existing `SharedInfra` (auth, models, settings, `ContainerManager`)
- Existing `createSeroExtensionFactory` or a thin subagent-specific variant
- Existing `createContainerTools`
- Frontmatter parsing from the Pi SDK

### First-Launch Agent Copy
On Electron startup (in `electron/main.ts` or a dedicated setup module), check
whether `~/.sero-ui/agent/agents/` is empty. If so, copy all files from
`packages/templates/agents/` into it. This only runs once; user modifications
are preserved on subsequent launches.

## Testing Strategy
### Unit Tests (`electron/__tests__/subagent/`)
| File | Coverage |
|------|----------|
| `discovery.test.ts` | `.md` parsing, frontmatter validation, unknown-model warnings, malformed-file warnings |
| `pool.test.ts` | acquireSlot/releaseSlot, global `maxTotal`, per-call `maxConcurrent`, abort cascade |
| `runner.test.ts` | session creation with mocked `createAgentSession`, timeout handling, output extraction, error paths |
| `tracker.test.ts` | status transitions, event emission, entry persistence, snapshot generation |
| `tool.test.ts` | mode detection, parameter validation, precedence resolution, result formatting |

### Integration Tests
Mock `createAgentSession` to return a session that produces canned responses.
Test full pipeline: discovery → tool call → runner → tracker → IPC snapshot /
events → result formatting.

Test scenarios:

- single agent run with valid agent name
- single agent run with unknown agent
- parallel fan-out with 3 tasks
- chain with 2 steps and `{previous}` substitution
- ad-hoc inline mode with `systemPrompt`
- timeout mid-execution
- abort cascade from parent session
- late-mount UI hydration via `snapshot(workspaceId)`
- child session cannot access `subagent` or `create_agent`

## Out of Scope (v1)
- **Workflow execution engine** — no automated step parsing or execution
- **Tool filtering enforcement** — `tools` frontmatter is parsed but not enforced
- **Cost budgets / guardrails** — costs are displayed, not limited
- **Inter-subagent communication** — no RPC pool or message routing
- **Project-scoped agents** — global agents only
- **Extension package allowlists for child sessions** — reduced child-session
  loader only in v1
- **Subagent output persistence** — responses are ephemeral outside the current
  tracker state

## Phasing
### Phase 1: Core Engine
**Scope**: `electron/subagent/` — types, discovery, pool, runner, tracker,
index

**Success criteria**: `SubagentManager.runSingle()`, `.runParallel()`, and
`.runChain()` work with mocked sessions. All unit tests pass.

### Phase 2: Tool Registration + Integration
**Scope**: Register `subagent` and `create_agent` for main sessions only. Wire
`SubagentManager` into session setup. Add the main-session system prompt block.

**Success criteria**: Main agent can call `subagent` and receive results.
Progress streams via `onUpdate`. Abort cascade works. Child sessions lack both
management tools.

### Phase 3: Built-In Content
**Scope**: Create agent templates in `packages/templates/agents/`. Add
first-launch copy logic. Ship 4 built-in agents.

**Success criteria**: Fresh Sero install has 4 agents available from the global
agent directory. Agents are user-editable. Discovery finds them.

### Phase 4: Desktop UI
**Scope**: `SubagentStore`, IPC handlers, preload bridge, `OrchestrationPanel`
components, `ActivityBar` / `CodingSidebar` integration, snapshot hydration.

**Success criteria**: User can see live subagent activity in the orchestration
panel. Status indicators, output viewers, summary stats, and reload-safe
hydration all work.

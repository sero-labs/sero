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

1. **Agent Discovery** — Load agent definitions from `.md` files with YAML
   frontmatter at two scopes: user (`~/.sero-ui/agent/agents/*.md`) and project
   (`<workspace>/.sero/agents/*.md`). Project-level agents override user-level
   agents with the same name.

2. **Dynamic Discovery** — Agent discovery runs fresh on every `subagent` tool
   invocation (not cached at session start). Agents added mid-session are
   immediately available without `/reload`.

3. **Discovery Warnings** — Log warnings (non-blocking) when:
   - A project agent overrides a user agent with the same name
   - An agent references a model that doesn't exist in the ModelRegistry

4. **Three Execution Modes**:
   - **Single** — one named agent, one task, returns response
   - **Parallel** — N independent tasks run concurrently (bounded by
     `maxConcurrent`), results returned as labelled markdown sections
   - **Chain** — sequential pipeline where each step's `{previous}` placeholder
     is replaced with the prior step's full response

5. **Ad-hoc Inline Mode** — The `subagent` tool accepts an optional
   `systemPrompt` parameter for one-off tasks that don't warrant a named agent.
   When `systemPrompt` is provided, no `.md` lookup is needed.

6. **Agent Creation Tool** — A `create_agent` tool that validates and writes a
   new `.md` file to `~/.sero-ui/agent/agents/`. Structured parameters prevent
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
    subagents are immediately aborted via their AbortControllers. Already-
    completed results remain in the tracker.

11. **Built-in Agents** — Ship 4 default agents: `analyst`, `reviewer`,
    `test-writer`, `scout`. Templates stored in `packages/templates/agents/`,
    copied to `~/.sero-ui/agent/agents/` on first launch. User-editable and
    deletable after copy.

12. **Desktop UI** — Orchestration sidebar accessible via a new activity bar
    icon in CodingWorkspace. Shows live subagent list with status, agent name,
    task preview, model, duration, token usage, cost, and collapsible output.

13. **Error Handling** — Failed subagents return a plain error message. The main
    agent decides recovery strategy (retry, different agent, do it itself, ask
    user). Failed entries persist in the orchestration sidebar.

### Non-Functional Requirements

14. **Concurrency** — Default `maxConcurrent: 4`, `maxTotal: 8`. Configurable
    in `~/.sero-ui/agent/settings.json` under `"subagent"` key.

15. **Timeout** — Default 600s (10 min) per subagent. Configurable per-agent
    (frontmatter) and per-call (tool parameter).

16. **No Recursion** — Subagents cannot spawn further subagents. The extension
    factory for subagent sessions does not include the `subagent` tool.

17. **No Session Persistence** — Subagent sessions use
    `SessionManager.inMemory()`. Only the final response flows back. No `.jsonl`
    files created.

18. **Extension Isolation** — Subagent sessions load no extensions by default.
    The agent config's `extensions` field can whitelist specific ones. The
    subagent tool is always blocked.

19. **Tool Access** — All subagents get the full tool set in v1 (container tools
    + coding tools). The `tools` frontmatter field is parsed and stored but not
    enforced. Enforcement deferred to v2.

20. **Cost Visibility** — No cost guardrails in v1. Per-subagent costs and
    aggregate totals displayed in the orchestration sidebar.

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
│    │    reads .md files from user + project scope                   │
│    │    runs fresh on every tool call                               │
│    │                                                                │
│    ├─ SubagentRunner                                                │
│    │    creates transient AgentSessions:                            │
│    │    - SessionManager.inMemory()                                 │
│    │    - Full Sero system prompt + agent .md body                  │
│    │    - createContainerTools() for workspace container             │
│    │    - Full tool set (no filtering in v1)                        │
│    │    - Timeout + AbortController                                 │
│    │                                                                │
│    ├─ ConcurrencyPool                                               │
│    │    acquireSlot / releaseSlot (max 4 concurrent, 8 total)       │
│    │    parentSessionId → Set<AbortController> for cascade abort    │
│    │                                                                │
│    └─ SubagentTracker                                               │
│         SubagentEntry records with status, usage, cost              │
│         Events → IPC → renderer                                     │
│                                                                     │
│  Sero Extension Factory (existing — electron/sero-extension.ts)     │
│    ├─ Registers `subagent` tool via pi.registerTool()               │
│    ├─ Registers `create_agent` tool via pi.registerTool()           │
│    └─ System prompt includes subagent guidance                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─ Renderer ──────────────────────────────────────────────────────────┐
│                                                                     │
│  SubagentStore (Zustand) — src/stores/subagent.ts                   │
│    ├─ entries: Record<id, SubagentEntry>                            │
│    └─ Events from main process via IPC                              │
│                                                                     │
│  CodingWorkspace                                                    │
│    ├─ ActivityBar — new "Orchestration" icon                        │
│    └─ OrchestrationSidebar                                          │
│         ├─ SubagentList (live entries with status dots)              │
│         ├─ SubagentCard (agent, task, model, time, cost)            │
│         ├─ SubagentOutput (collapsible per-agent output)            │
│         └─ SubagentSummary (aggregate stats bar)                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Module Structure

```
apps/desktop/
  electron/
    subagent/
      types.ts              # AgentConfig, SubagentEntry, RunResult, settings
      discovery.ts          # Load agent .md files (user + project scope)
      runner.ts             # Transient AgentSession execution
      pool.ts               # Concurrency pool (acquireSlot/releaseSlot)
      tracker.ts            # Real-time status tracking + IPC event emission
      tool.ts               # subagent + create_agent tool definitions
      index.ts              # SubagentManager facade (public API)

  src/
    stores/
      subagent.ts           # Zustand store for subagent UI state

    types/
      subagent.ts           # Shared types (renderer ↔ main)

    components/apps/coding/orchestration/
      OrchestrationSidebar.tsx   # Main sidebar panel
      SubagentList.tsx           # Scrollable list of entries
      SubagentCard.tsx           # Individual entry card
      SubagentOutput.tsx         # Collapsible output viewer
      SubagentSummary.tsx        # Aggregate stats footer

  electron/ipc/
    subagent.ts             # IPC handlers (listAgents, abort)

packages/
  templates/
    agents/
      analyst.md
      reviewer.md
      test-writer.md
      scout.md
```

### Data Models

#### AgentConfig (from .md discovery)

```typescript
interface AgentConfig {
  name: string;                    // Required — unique identifier
  description: string;             // Required — what this agent does
  model?: string;                  // Model override
  tools?: string[];                // Tool whitelist (parsed, not enforced v1)
  extensions?: string[];           // Extension whitelist
  thinking?: string;               // Thinking level
  systemPrompt: string;            // .md body content
  source: 'user' | 'project';     // Where the .md file came from
  filePath: string;                // Absolute path to .md file
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

#### SubagentSettings (in settings.json)

```typescript
interface SubagentSettings {
  maxConcurrent: number;   // Default: 4
  maxTotal: number;        // Default: 8
  timeoutMs: number;       // Default: 600_000
  model: string | null;    // Global override (null = use agent config)
  blockedExtensions: string[];
}
```

### Subagent Tool Schema

```typescript
const SubagentParams = Type.Object({
  // ── Single mode ──
  agent: Type.Optional(Type.String({
    description: 'Agent name (from .md file) for single mode',
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
  }), { description: 'Array of independent tasks for parallel execution' })),

  // ── Chain mode ──
  chain: Type.Optional(Type.Array(Type.Object({
    agent: Type.String(),
    task: Type.String(),
    model: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
  }), { description: 'Sequential pipeline. Use {previous} for prior output.' })),

  // ── Shared options ──
  model: Type.Optional(Type.String({ description: 'Model override' })),
  thinking: Type.Optional(Type.String({ description: 'Thinking level override' })),
  systemPrompt: Type.Optional(Type.String({
    description: 'Inline system prompt for ad-hoc tasks (no .md lookup needed)',
  })),
  agentScope: Type.Optional(Type.String({
    description: '"user" (default), "project", or "both"',
  })),
});
```

**Standalone tool** — NOT bridged to sero-cli (complex schema with arrays of
objects, following `question`/`questionnaire` precedent).

### Create Agent Tool Schema

```typescript
const CreateAgentParams = Type.Object({
  name: Type.String({ description: 'Agent name (alphanumeric + hyphens)' }),
  description: Type.String({ description: 'What this agent does' }),
  systemPrompt: Type.String({ description: 'System prompt body' }),
  model: Type.Optional(Type.String({ description: 'Default model' })),
  thinking: Type.Optional(Type.String({ description: 'Thinking level' })),
});
```

Validates name format, checks for collisions, writes to
`~/.sero-ui/agent/agents/<name>.md`. Bridged to sero-cli (simple schema).

### Execution Flows

#### Single Mode

```
1. tool.execute({ agent: "reviewer", task: "Review auth.ts" })
2. discoverAgents(workspacePath, scope)        → find "reviewer" config
3. pool.acquireSlot("subagent-<id>")           → wait for concurrency slot
4. tracker.start(entry)                        → emit subagent_start event
5. onUpdate("🔄 reviewer started...")          → stream to chat
6. runner.run({
     agent: reviewerConfig,
     task: "Review auth.ts",
     workspaceId,
     signal: abortController.signal,
     onProgress: (ev) => tracker.progress(id, ev),
   })
   └─ createAgentSession({ inMemory, containerTools, fullSeroPrompt })
   └─ session.prompt(task)
   └─ extractOutput(session) → response
   └─ session.dispose()
7. tracker.complete(id, response)              → emit subagent_end event
8. pool.releaseSlot("subagent-<id>")
9. onUpdate("✅ reviewer completed (45s)")     → stream to chat
10. return { content: [{ type: 'text', text: response }] }
```

#### Parallel Mode

```
1. tool.execute({ tasks: [{agent, task}, {agent, task}, ...] })
2. discoverAgents(workspacePath, scope)
3. Promise.allSettled(tasks.map(t => {
     acquireSlot → tracker.start → runner.run → tracker.complete → releaseSlot
   }))
4. Format results as labelled markdown sections:
   ## Result 1: scout — "Audit auth module"
   [output]

   ## Result 2: scout — "Audit API routes"
   [output]
5. return combined text
```

#### Chain Mode

```
1. tool.execute({ chain: [{agent, task}, {agent, task + {previous}}, ...] })
2. discoverAgents(workspacePath, scope)
3. For each step sequentially:
   a. Replace {previous} in task with prior step's response
   b. acquireSlot → tracker.start → runner.run → tracker.complete → releaseSlot
   c. Store response for next step
4. return final step's response
```

#### Ad-hoc Inline Mode

```
1. tool.execute({ task: "Analyse this CSV", systemPrompt: "You are a data analyst..." })
2. Skip discovery — build AgentConfig from inline params
3. Same execution as single mode
```

### SubagentManager Instantiation

Singleton on SharedInfra, alongside ContainerManager:

```typescript
// electron/ipc/shared-infra.ts
export const subagentManager = new SubagentManager();
```

The extension factory receives it via closure:

```typescript
// electron/ipc/agent.ts — in openSessionInternal()
const extensionFactories = [
  createSeroExtensionFactory(
    workspaceManager, workspaceId, sessionId,
    containerState ?? undefined,
    subagentManager,       // NEW — passed to extension factory
  ),
];
```

The extension factory registers the `subagent` and `create_agent` tools inside
its `session_start` hook, with closure access to the manager.

### Subagent Session Construction

Each subagent session gets the full Sero system prompt (container instructions,
workspace awareness, sero-cli) plus the agent's `.md` body. The extension
factory for subagent sessions mirrors the main session's factory **minus** the
subagent tool registration:

```typescript
// electron/subagent/runner.ts — inside run()

const loader = new DefaultResourceLoader({
  cwd: wsPath,
  agentDir: SERO_AGENT_DIR,
  settingsManager: infra.settingsManager,
  extensionFactories: [
    createSeroExtensionFactory(
      workspaceManager, workspaceId, subagentSessionId,
      containerState,
      null,   // null SubagentManager → no subagent tool registered
    ),
  ],
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
  // Agent .md body appended to system prompt
  systemPromptSuffix: agent.systemPrompt,
});
```

### Abort Cascade

The ConcurrencyPool maintains `parentSessionId → Set<AbortController>`:

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

The main agent pool's abort handler calls
`subagentManager.abortAll(sessionId)` which propagates to the pool.

### Container Access

Subagents share the workspace's existing container (one container per workspace,
AD-018). Multiple concurrent subagents may execute in the same container.

**Documented constraint**: Parallel subagents should be given independent file
scope. Concurrent writes to the same file may cause race conditions. This is
the user's responsibility (documented in system prompt and agent guides).

### IPC Layer

#### New IPC Channels

```typescript
// src/types/ipc.ts — additions

export const IpcChannels = {
  // ... existing ...
  subagent: {
    event: 'sero:subagent:event',
    listAgents: 'sero:subagent:list-agents',
    abort: 'sero:subagent:abort',
  },
} as const;
```

#### Event Types

```typescript
type SubagentEvent =
  | { type: 'subagent_start'; entry: SubagentEntry }
  | { type: 'subagent_progress'; id: string; usage: Partial<SubagentEntry['usage']> }
  | { type: 'subagent_end'; id: string; status: SubagentEntry['status'];
      response?: string; error?: string; usage: SubagentEntry['usage'];
      durationMs: number }
  | { type: 'subagent_clear'; parentSessionId: string };
```

#### Preload Bridge

```typescript
// electron/preload.ts — additions to window.sero

subagent: {
  onEvent: (cb: (event: SubagentEvent) => void) => {
    const handler = (_e: any, event: SubagentEvent) => cb(event);
    ipcRenderer.on('sero:subagent:event', handler);
    return () => ipcRenderer.removeListener('sero:subagent:event', handler);
  },
  listAgents: (workspaceId: string, scope?: string) =>
    ipcRenderer.invoke('sero:subagent:list-agents', workspaceId, scope),
  abort: (subagentId: string) =>
    ipcRenderer.invoke('sero:subagent:abort', subagentId),
},
```

### System Prompt Addition

Added to the sero extension factory's `before_agent_start` hook. The agent list
is illustrative (actual available agents discovered dynamically at tool call):

```
## Subagents

You can delegate tasks to specialist subagents using the `subagent` tool.
Each subagent runs in an isolated session with a fresh context window and full
access to the workspace (files, terminal, container).

Built-in agents: analyst, reviewer, test-writer, scout.
Custom agents may also be available — the tool discovers all agents dynamically.

Modes:
- Single: { agent: "scout", task: "..." }
- Parallel: { tasks: [{ agent, task }, ...] }
- Chain: { chain: [{ agent, task }, { agent, task with {previous} }] }
- Ad-hoc: { task: "...", systemPrompt: "You are a..." }

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
```

### Settings

In `~/.sero-ui/agent/settings.json`:

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

Defaults applied in `SubagentManager` constructor if key is missing.

---

## User Experience

### User Personas

1. **End User** — observes subagent work in the orchestration sidebar. Wants to
   see progress, costs, and results without needing to understand the internals.
2. **Main Agent** — the AI agent calling the `subagent` tool. Needs clear error
   messages and structured results to reason about.
3. **Agent Author** — creates `.md` agent definitions. Power user who understands
   frontmatter format and prompt engineering.

### User Flows

#### Primary: Agent delegates work

1. User sends a complex prompt to the main agent
2. Main agent decides to delegate and calls `subagent` tool
3. Orchestration sidebar shows new entry with 🔄 status
4. Progress lines stream in the ChatPanel tool output area
5. Sidebar updates in real-time (duration, tokens, cost)
6. Subagent completes → sidebar shows ✅ with summary
7. Main agent receives result and continues reasoning

#### Secondary: User monitors parallel work

1. Main agent spawns 4 parallel subagents
2. Orchestration sidebar shows 4 entries, all 🔄
3. Entries complete independently → ✅ / ❌ as they finish
4. User clicks an entry to expand and read full output
5. Summary bar at bottom shows aggregate stats

#### Error: Subagent fails

1. Subagent times out or encounters API error
2. Sidebar entry turns ❌ with error message
3. Main agent receives error text, decides recovery
4. User can see the error details in the sidebar

### UI States

| State | Sidebar Display |
|-------|----------------|
| No subagent activity | "No subagent activity" placeholder with icon |
| Subagents running | Live list with animated status indicators |
| All complete | List with ✅/❌ indicators, summary bar |
| Mixed (some running) | Running entries at top, completed below |

### Orchestration Sidebar Layout

```
┌─ Orchestration ──────────────────────┐
│                                       │
│  🔄 reviewer — "Review PR #42"       │
│     claude-sonnet-4-5 · 12s · 2.4k   │
│     [$0.03]                           │
│                                       │
│  🔄 scout — "Map auth module"        │
│     claude-haiku-4-5 · 5s · 800      │
│     [$0.001]                          │
│                                       │
│  ✅ analyst — "Coverage analysis"     │
│     claude-sonnet-4-5 · 28s · 5.1k   │
│     [$0.05]                           │
│     ▼ Output                          │
│     │ The codebase has 42 modules...  │
│     │ Coverage: 67% (28/42 modules)   │
│     │ ...                             │
│                                       │
│  ❌ test-writer — "Write tests..."    │
│     timed out after 600s              │
│     ▼ Error                           │
│     │ Session timed out...            │
│                                       │
├───────────────────────────────────────┤
│  4 runs · $0.08 · 8.3k tokens · 90s  │
└───────────────────────────────────────┘
```

---

## Built-In Agents

### packages/templates/agents/analyst.md

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

### packages/templates/agents/reviewer.md

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

### packages/templates/agents/test-writer.md

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

### packages/templates/agents/scout.md

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

## Risks & Mitigations

### Risk Register

| Risk | Category | Impact | Probability | Mitigation |
|------|----------|--------|-------------|------------|
| Subagent causes unhandled crash in main process | Technical | High | Low | Pi SDK error containment + try/catch + timeout. Monitor and add worker_threads if crashes observed. |
| Parallel subagents write to same file | Technical | Medium | Medium | Document constraint. Parallel subagents should target independent files. User responsibility. |
| Cost explosion from aggressive delegation | Business | Medium | Medium | Show costs in UI. No guardrails v1; add budget caps v2 if needed. |
| Main agent overuses subagents for trivial tasks | Operational | Low | Medium | System prompt guidance. Prompt engineering sufficient per assessment. |
| Agent .md model reference becomes stale | Operational | Low | High | Non-blocking warning logged during discovery. Agent falls back to default model. |
| Memory pressure from 4+ concurrent in-memory sessions | Technical | Medium | Low | Concurrency pool limits (max 4). Sessions disposed immediately after completion. |

### Accepted Tradeoffs

1. **No tool filtering in v1** — All subagents get all tools. Simplifies
   implementation. The `tools` frontmatter field is stored for v2.
2. **No cost guardrails in v1** — Costs shown retroactively in UI. Trust the
   user. Add budget caps if cost surprises emerge.
3. **No workflow execution in v1** — Workflows are deferred. The agent can
   manually follow workflow `.md` files as plans using the subagent tool.
4. **Shared container** — Parallel subagents share one container. Simpler
   architecture but requires independent file scope for parallel tasks.
5. **Full Sero system prompt per subagent** — ~2-3k token overhead per subagent
   session. Worth it for full container/workspace awareness.

### Contingency Plans

- **If crashes emerge**: Add worker_thread isolation for subagent sessions
- **If costs spiral**: Add configurable per-session budget with warning/block
- **If tool filtering needed urgently**: Filter `customTools` array by name
  before passing to `createAgentSession`

---

## Implementation Notes

### Key Decisions (from interview)

| Decision | Rationale |
|----------|-----------|
| In-process sessions, not subprocesses | Reuses SharedInfra, ContainerManager, sero-cli bridge. No cold starts. |
| SubagentManager as SharedInfra singleton | Consistent with ContainerManager pattern. Accessible by extension factory + IPC. |
| Dynamic discovery on every tool call | Agents added mid-session are immediately available. Filesystem reads are trivially fast. |
| Full Sero system prompt for subagents | Subagents need container conventions and workspace awareness to operate correctly. |
| Standalone tool (not CLI-bridged) | Complex schema with arrays of objects. Follows question/questionnaire precedent. |
| Activity bar sidebar (not StatusBar popover) | Subagent work is central to the user's workflow, warrants dedicated real estate. |
| Labelled markdown sections for parallel results | Most natural format for Claude to read and cite individual subagent outputs. |
| onUpdate streaming for progress | Real-time visibility into subagent activity within the ChatPanel tool output. |
| create_agent tool (not raw writes) | Validation prevents invalid configs. System prompt guides appropriate usage. |

### Dependencies

- Pi SDK `createAgentSession`, `SessionManager.inMemory()`, `DefaultResourceLoader`
- Existing `SharedInfra` (auth, models, settings, ContainerManager)
- Existing `createSeroExtensionFactory` (for subagent system prompt)
- Existing `createContainerTools` (for subagent workspace access)
- `parseFrontmatter` from Pi SDK (for .md file parsing)

### First-Launch Agent Copy

On Electron startup (in `electron/main.ts` or a dedicated setup module),
check if `~/.sero-ui/agent/agents/` is empty. If so, copy all files from
`packages/templates/agents/` into it. Only runs once — user modifications
are preserved on subsequent launches.

---

## Testing Strategy

### Unit Tests (`electron/__tests__/subagent/`)

| File | Coverage |
|------|----------|
| `discovery.test.ts` | .md parsing, frontmatter validation, scope merging, override behavior, warning emission |
| `pool.test.ts` | acquireSlot/releaseSlot, concurrency limits, abort cascade, queue ordering |
| `runner.test.ts` | Session creation with mocked createAgentSession, timeout handling, output extraction, error paths |
| `tracker.test.ts` | Status transitions (queued→running→completed/failed), event emission, entry persistence |
| `tool.test.ts` | Mode detection (single/parallel/chain/ad-hoc), parameter validation, result formatting |

### Integration Tests

Mock `createAgentSession` to return a session that produces canned responses.
Test full pipeline: discovery → tool call → runner → tracker → result formatting.

Test scenarios:
- Single agent run with valid agent name
- Single agent run with unknown agent (error path)
- Parallel fan-out with 3 tasks
- Chain with 2 steps and `{previous}` substitution
- Ad-hoc inline mode with systemPrompt
- Timeout mid-execution
- Abort cascade from parent session

---

## Out of Scope (v1)

- **Workflow execution engine** — Workflows exist as `.md` files for the agent
  to read as plans, but no automated step parsing or execution
- **Tool filtering enforcement** — `tools` frontmatter field parsed but not
  enforced
- **Cost budgets / guardrails** — Costs displayed, not limited
- **Inter-subagent communication** — No RPC pool or message routing
- **Agent auto-generation** — Agent creates new agents via `create_agent` tool
  on its own initiative (the tool exists; smart usage is prompt-guided)
- **Workflow triggers** (`on-prompt`, `on-commit`) — Manual invocation only
- **Subagent output persistence** — Responses are ephemeral

---

## Phasing

### Phase 1: Core Engine

**Scope**: `electron/subagent/` — types, discovery, pool, runner, tracker, index

**Success criteria**: `SubagentManager.runSingle()`, `.runParallel()`,
`.runChain()` work with mocked sessions. All unit tests pass.

### Phase 2: Tool Registration + Integration

**Scope**: Register `subagent` and `create_agent` tools in sero extension
factory. Wire SubagentManager into `openSessionInternal()` via SharedInfra.
Add system prompt block.

**Success criteria**: Main agent can call `subagent` tool and receive results.
Progress streams via `onUpdate`. Abort cascade works.

### Phase 3: Built-In Content

**Scope**: Create agent templates in `packages/templates/agents/`. Add
first-launch copy logic. Ship 4 built-in agents.

**Success criteria**: Fresh Sero install has 4 agents available. Agents are
user-editable. Discovery finds them.

### Phase 4: Desktop UI

**Scope**: SubagentStore, IPC handlers, preload bridge, OrchestrationSidebar
components, ActivityBar integration.

**Success criteria**: User can see live subagent activity in the orchestration
sidebar. Status dots, output viewers, and summary stats work.

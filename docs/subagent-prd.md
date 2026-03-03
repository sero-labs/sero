# Subagent Orchestration — PRD

> **Source spec**: [docs/subagent-design-spec.md](subagent-design-spec.md)
> **Status**: 🔴 Not Started
> **Last updated**: 2026-03-03

---

## How to Use This Document

Each story has a **Status** field. Update it as work progresses:

| Symbol | Meaning |
|--------|---------|
| 🔴 | Not started |
| 🟡 | In progress |
| 🟢 | Complete |
| ⏸️ | Blocked |
| 🔵 | Deferred to v2 |

Stories within an epic are ordered by dependency. Complete them top-to-bottom
unless noted otherwise. Stories marked `[parallel]` have no dependency on the
story above and can be done in any order within the epic.

Commit all changes once acceptance criteria passes at the end of each story.

---

## Epic 1 — Core Engine (`electron/subagent/`)

> Build the backend subagent infrastructure: types, discovery, concurrency pool,
> runner, tracker, and the `SubagentManager` façade. All work is in
> `apps/desktop/electron/subagent/`. Validated via unit tests with mocked
> `AgentSession`.

### Story 1.1 — Types & Data Models

**Status**: 🔴

Define all shared types used across the subagent system.

**File**: `electron/subagent/types.ts`

**Acceptance Criteria**:

- [ ] `AgentConfig` interface matches spec (name, description, model, thinking,
      timeoutMs, tools, extensions, systemPrompt, source, filePath)
- [ ] `SubagentEntry` interface matches spec (id, agentName, taskPreview,
      status union, timing, parentSessionId, workspaceId, mode, chainStep,
      usage object with inputTokens/outputTokens/cacheRead/cacheWrite/total/cost,
      model, responsePreview, fullResponse, error)
- [ ] `SubagentSettings` interface matches spec (maxConcurrent, maxTotal,
      timeoutMs, model, thinking, blockedExtensions)
- [ ] `RunResult` type for runner output (response text, usage, error)
- [ ] `ResolvedConfig` type for merged precedence output (model, thinking,
      timeoutMs — all resolved to concrete values)
- [ ] Status union type: `'queued' | 'running' | 'completed' | 'failed' | 'aborted' | 'timed_out'`
- [ ] `SubagentMode` type: `'single' | 'parallel' | 'chain'`
- [ ] All types use top-level imports (no inline `import()` expressions)
- [ ] File stays under 500 LOC

---

### Story 1.2 — Agent Discovery

**Status**: 🔴

Load and parse `.md` agent definitions from `~/.sero-ui/agent/agents/`.

**File**: `electron/subagent/discovery.ts`

**Depends on**: 1.1

**Acceptance Criteria**:

- [ ] `discoverAgents()` reads all `*.md` files from `~/.sero-ui/agent/agents/`
- [ ] Parses JSON frontmatter (not YAML — per AGENTS.md convention) to extract
      `name`, `description`, `model`, `thinking`, `timeoutMs`, `tools`,
      `extensions`
- [ ] `.md` body (after frontmatter) becomes `systemPrompt`
- [ ] Sets `source: 'global'` and `filePath` to the absolute path
- [ ] Returns `AgentConfig[]` — one per valid file
- [ ] Logs a non-blocking warning when frontmatter is invalid or incomplete
      (missing required `name` or `description`)
- [ ] Logs a non-blocking warning when `model` references a model not in
      `ModelRegistry` (requires registry param or callback)
- [ ] Gracefully skips malformed files without throwing
- [ ] Runs fresh every invocation — no caching (agents added mid-session are
      immediately available)
- [ ] File stays under 500 LOC

**Unit tests** (`electron/__tests__/subagent/discovery.test.ts`):

- [ ] Parses a valid `.md` file with full frontmatter
- [ ] Parses a file with only required frontmatter fields
- [ ] Skips a file with no frontmatter
- [ ] Skips a file with missing `name`
- [ ] Logs warning for unknown model
- [ ] Returns empty array when directory doesn't exist
- [ ] Returns multiple agents from multiple files

---

### Story 1.3 — Concurrency Pool

**Status**: 🔴

Manages global and per-call concurrency limits, plus abort cascading.

**File**: `electron/subagent/pool.ts`

**Depends on**: 1.1

**Acceptance Criteria**:

- [ ] `ConcurrencyPool` class with `acquireSlot(key, parentSessionId, controller)`,
      `releaseSlot(key, parentSessionId)`, `abortAll(parentSessionId)`
- [ ] `acquireSlot` returns a `Promise<void>` that resolves when a slot is available
- [ ] Respects `maxTotal` (global cap across all calls/sessions)
- [ ] Respects `maxConcurrent` (per-invocation fan-out cap)
- [ ] `abortAll(parentSessionId)` calls `.abort()` on all `AbortController`s
      registered under that parent, then removes them
- [ ] Already-released slots don't count against limits
- [ ] Queued waiters are released FIFO when slots free up
- [ ] `getActiveCount()` returns current total active slots
- [ ] Configurable limits via constructor or `updateLimits()`
- [ ] File stays under 500 LOC

**Unit tests** (`electron/__tests__/subagent/pool.test.ts`):

- [ ] Acquires up to maxTotal slots
- [ ] Blocks when maxTotal reached, resolves when slot freed
- [ ] Respects per-call maxConcurrent independently of maxTotal
- [ ] `abortAll` aborts all controllers for a parent session
- [ ] `abortAll` does not affect other parent sessions
- [ ] `releaseSlot` makes slot available for next waiter
- [ ] Double-release is a no-op (no underflow)

---

### Story 1.4 — Subagent Tracker

**Status**: 🔴

Real-time status tracking and event emission for subagent runs.

**File**: `electron/subagent/tracker.ts`

**Depends on**: 1.1

**Acceptance Criteria**:

- [ ] `SubagentTracker` class with typed EventEmitter
- [ ] `start(entry: SubagentEntry)` — stores entry, emits `subagent_start`
- [ ] `progress(id, partialUsage)` — merges usage, emits `subagent_progress`
- [ ] `complete(id, response, usage)` — sets status/timing, emits `subagent_end`
- [ ] `fail(id, error, usage?)` — sets status to `'failed'`, emits `subagent_end`
- [ ] `abort(id)` — sets status to `'aborted'`, emits `subagent_end`
- [ ] `timeout(id)` — sets status to `'timed_out'`, emits `subagent_end`
- [ ] `snapshot(workspaceId)` — returns all entries for a workspace (current state)
- [ ] `clear(parentSessionId)` — removes entries for a session, emits `subagent_clear`
- [ ] Stores `responsePreview` (first 500 chars) and `fullResponse`
- [ ] Entries persist in memory for the lifetime of the process
- [ ] File stays under 500 LOC

**Unit tests** (`electron/__tests__/subagent/tracker.test.ts`):

- [ ] `start` stores entry and emits event
- [ ] `complete` updates status, timing, response, and emits event
- [ ] `fail` sets error and failed status
- [ ] `abort` sets aborted status
- [ ] `timeout` sets timed_out status
- [ ] `progress` merges partial usage
- [ ] `snapshot` filters by workspaceId
- [ ] `clear` removes entries for a parentSessionId

---

### Story 1.5 — Config Resolution

**Status**: 🔴

Implement the 5-level precedence chain for resolving model, thinking, and timeout.

**File**: `electron/subagent/resolve.ts` (or inline in runner — decide during implementation)

**Depends on**: 1.1

**Acceptance Criteria**:

- [ ] `resolveConfig(taskOverride, callOverride, agentConfig, settings, sessionDefaults)`
      returns `ResolvedConfig` with concrete `model`, `thinking`, `timeoutMs`
- [ ] Precedence: per-task → top-level call → agent frontmatter → global subagent
      settings → session/app defaults
- [ ] Each level only overrides if the value is non-null/non-undefined
- [ ] Falls back to hardcoded defaults as last resort (model from session,
      thinking from settings, timeoutMs: 600_000)
- [ ] File stays under 500 LOC

**Unit tests** (`electron/__tests__/subagent/resolve.test.ts` or in tool.test.ts):

- [ ] Per-task override wins over all others
- [ ] Call override wins over agent frontmatter
- [ ] Agent frontmatter wins over global settings
- [ ] Global settings win over session defaults
- [ ] Missing levels are skipped cleanly
- [ ] All-null resolves to hardcoded defaults

---

### Story 1.6 — Subagent Runner

**Status**: 🔴

Execute a single subagent task via a transient `AgentSession`.

**File**: `electron/subagent/runner.ts`

**Depends on**: 1.1, 1.3, 1.4, 1.5

**Acceptance Criteria**:

- [ ] `SubagentRunner.run(config)` creates a transient `AgentSession` using:
  - `SessionManager.inMemory()`
  - Full Sero system prompt + agent `.md` body as `systemPromptSuffix`
  - Container tools (if workspace has container) or host coding tools
  - Resolved model + thinking from config resolution
- [ ] Session uses a subagent-specific resource loader that:
  - Injects standard Sero CLI + container prompt blocks
  - Excludes `subagent` and `create_agent` tools
  - Skips external extension package loading
- [ ] Sends the task as a user message and collects the full response
- [ ] Respects `AbortController` signal — aborts session on signal
- [ ] Respects `timeoutMs` — aborts and returns timeout error if exceeded
- [ ] Returns `RunResult` with response text, usage stats, and optional error
- [ ] Cleans up session resources after completion (dispose)
- [ ] Reports progress via callback during execution
- [ ] File stays under 500 LOC

**Unit tests** (`electron/__tests__/subagent/runner.test.ts`):

- [ ] Creates session with correct config (mock `createAgentSession`)
- [ ] Returns full response text from session
- [ ] Collects usage stats from session
- [ ] Respects abort signal
- [ ] Times out and returns error after timeoutMs
- [ ] Cleans up session on completion
- [ ] Cleans up session on error
- [ ] Reports progress during execution

---

### Story 1.7 — SubagentManager Façade

**Status**: 🔴

Public API that ties discovery, pool, runner, and tracker together.

**File**: `electron/subagent/index.ts`

**Depends on**: 1.2, 1.3, 1.4, 1.5, 1.6

**Acceptance Criteria**:

- [ ] `SubagentManager` class with `runSingle()`, `runParallel()`, `runChain()`
- [ ] **Single mode**: discovers agents → finds named agent → resolves config →
      acquires slot → tracks → runs → tracks completion → releases slot →
      returns response
- [ ] **Parallel mode**: discovers agents → resolves each task → runs all via
      `Promise.allSettled` with per-call `maxConcurrent` → formats results as
      labelled markdown sections (`## Result N: agentName — "task preview"`)
- [ ] **Chain mode**: discovers agents → for each step sequentially: replaces
      `{previous}` in task → resolves → runs → stores output → returns final
      step's response
- [ ] **Ad-hoc mode**: when `systemPrompt` is provided, builds `AgentConfig`
      inline without discovery lookup
- [ ] `abortAll(parentSessionId)` delegates to pool
- [ ] `snapshot(workspaceId)` delegates to tracker
- [ ] `listAgents()` delegates to discovery
- [ ] Constructor reads `SubagentSettings` from `SettingsManager` with fallback
      defaults
- [ ] File stays under 500 LOC

---

### Story 1.8 — Integration Tests (Core Engine)

**Status**: 🔴

End-to-end tests of the manager with mocked `createAgentSession`.

**File**: `electron/__tests__/subagent/integration.test.ts`

**Depends on**: 1.7

**Acceptance Criteria**:

- [ ] Single agent run with valid agent name → returns response
- [ ] Single agent run with unknown agent → returns clear error
- [ ] Ad-hoc inline mode with `systemPrompt` → runs without discovery
- [ ] Parallel fan-out with 3 tasks → returns labelled markdown sections
- [ ] Chain with 2 steps + `{previous}` substitution → returns final output
- [ ] Timeout mid-execution → entry marked `timed_out`
- [ ] Abort cascade from parent session → all children aborted
- [ ] Snapshot returns correct entries for workspace
- [ ] All tests use mocked `createAgentSession` returning canned responses

---

## Epic 2 — Tool Registration & Session Integration

> Wire the `SubagentManager` into real agent sessions. Register `subagent` and
> `create_agent` tools for main sessions only. Add system prompt guidance. Test
> end-to-end with live sessions.

### Story 2.1 — SubagentManager Singleton on SharedInfra

**Status**: 🔴

Instantiate and export `SubagentManager` from the shared infrastructure module.

**File**: `electron/ipc/shared-infra.ts`

**Depends on**: Epic 1 complete

**Acceptance Criteria**:

- [ ] `export const subagentManager = new SubagentManager()` added to `shared-infra.ts`
- [ ] Manager receives `ensureInfra()` output (auth, models, settings) at init
      or lazily on first use
- [ ] No circular dependency introduced
- [ ] Existing `SharedInfra` exports unaffected
- [ ] File stays under 500 LOC

---

### Story 2.2 — `subagent` Tool Definition

**Status**: 🔴

Define the `subagent` tool schema and execution logic.

**File**: `electron/subagent/tool.ts`

**Depends on**: 1.7, 2.1

**Acceptance Criteria**:

- [ ] Tool schema matches spec (`SubagentParams` with agent, task, tasks, chain,
      model, thinking, timeoutMs, systemPrompt)
- [ ] Mode detection: presence of `tasks` → parallel, `chain` → chain, else single
- [ ] Delegates to `SubagentManager.runSingle/runParallel/runChain`
- [ ] Uses Pi SDK `onUpdate` callback to stream progress lines:
  - `🔄 <agent> started — "<task preview>"`
  - `✅ <agent> completed (<duration>, <tokens> tokens)`
  - `❌ <agent> failed — <error>`
- [ ] Returns `{ content: [{ type: 'text', text: response }] }`
- [ ] Registered as a **standalone tool** (exception to AD-020 bridge) via
      `pi.registerTool()`
- [ ] Only registered for main sessions (`enableAgentManagementTools: true`)
- [ ] File stays under 500 LOC

**Unit tests** (`electron/__tests__/subagent/tool.test.ts`):

- [ ] Detects single mode from `agent` + `task`
- [ ] Detects parallel mode from `tasks` array
- [ ] Detects chain mode from `chain` array
- [ ] Validates required params (e.g. single mode needs `agent` or `systemPrompt`)
- [ ] Formats parallel results as labelled markdown
- [ ] Returns error text (not throw) for failed subagent

---

### Story 2.3 — `create_agent` Tool Definition

**Status**: 🔴

Define the `create_agent` tool that writes new agent `.md` files.

**File**: `electron/subagent/tool.ts` (same file, or `tool-create.ts` if size demands)

**Depends on**: 1.1

**Acceptance Criteria**:

- [ ] Tool schema matches spec (`CreateAgentParams`: name, description,
      systemPrompt, model?, thinking?, timeoutMs?)
- [ ] Validates name format: alphanumeric + hyphens only
- [ ] Checks for name collision with existing agent files
- [ ] Writes well-formed `.md` file with JSON frontmatter to
      `~/.sero-ui/agent/agents/<name>.md`
- [ ] Returns success message with file path
- [ ] Returns clear error on validation failure or collision
- [ ] Only registered for main sessions
- [ ] File stays under 500 LOC

**Unit tests**:

- [ ] Writes a valid agent file
- [ ] Rejects invalid name (spaces, special chars)
- [ ] Rejects duplicate name
- [ ] Written file is parseable by `discoverAgents()`

---

### Story 2.4 — Extension Factory Integration

**Status**: 🔴

Wire `subagent` and `create_agent` tools into the Sero extension factory for
main sessions. Build the subagent resource loader for child sessions.

**Files**: `electron/sero-extension.ts`, `electron/subagent/loader.ts` (new)

**Depends on**: 2.2, 2.3

**Acceptance Criteria**:

- [ ] `createSeroExtensionFactory` accepts optional `subagentManager` +
      `enableAgentManagementTools` in its options
- [ ] When `enableAgentManagementTools: true`:
  - Registers `subagent` tool via `pi.registerTool()`
  - Registers `create_agent` tool via `pi.registerTool()`
- [ ] When `enableAgentManagementTools` is false/omitted, neither tool is registered
- [ ] `createSubagentResourceLoader()` helper created for child sessions:
  - Injects Sero CLI + container prompt blocks
  - Does NOT register `subagent` or `create_agent`
  - Does NOT load external extension packages
- [ ] Main session creation in `electron/ipc/agent.ts` passes
      `subagentManager` + `enableAgentManagementTools: true`
- [ ] Child session creation in `runner.ts` uses the subagent resource loader
- [ ] File stays under 500 LOC (each file)

---

### Story 2.5 — System Prompt Block

**Status**: 🔴

Add subagent guidance to the main-session system prompt.

**File**: `electron/subagent/prompt.ts` (new)

**Depends on**: 2.4

**Acceptance Criteria**:

- [ ] `buildSubagentPromptBlock()` returns the system prompt string from spec
- [ ] Injected via the extension factory's `before_agent_start` hook for main
      sessions only
- [ ] Lists built-in agents and usage modes (single, parallel, chain, ad-hoc)
- [ ] Includes config precedence, when-to-use / when-not-to-use guidance
- [ ] Includes constraints (no recursion, no create_agent in children, independent
      file scope for parallel work)
- [ ] NOT injected into child sessions
- [ ] File stays under 500 LOC

---

### Story 2.6 — Abort Cascade Wiring

**Status**: 🔴

Connect the main agent pool's abort handler to `SubagentManager.abortAll()`.

**File**: `electron/ipc/agent.ts` (modification)

**Depends on**: 2.1

**Acceptance Criteria**:

- [ ] When a main session is aborted (user clicks stop, `/abort`, etc.),
      `subagentManager.abortAll(sessionId)` is called
- [ ] All running child subagents for that session are immediately aborted
- [ ] Already-completed entries in the tracker remain unchanged
- [ ] No orphaned sessions after abort

---

### Story 2.7 — Integration Test (Tool → Manager → Session)

**Status**: 🔴

Full pipeline test with mocked sessions.

**File**: `electron/__tests__/subagent/tool-integration.test.ts`

**Depends on**: 2.2, 2.3, 2.4, 2.5, 2.6

**Acceptance Criteria**:

- [ ] Main session has `subagent` + `create_agent` tools available
- [ ] Child session does NOT have `subagent` or `create_agent`
- [ ] `subagent` tool call → discovery → runner → tracker → result
- [ ] Progress lines stream via `onUpdate`
- [ ] Abort cascade: abort main → all children abort
- [ ] `create_agent` writes file → immediately discoverable

---

## Epic 3 — Built-In Agents & First-Launch Setup

> Create the 4 default agent templates and the first-launch copy mechanism.

### Story 3.1 — Agent Template Files

**Status**: 🔴 `[parallel]`

Create the 4 built-in agent `.md` files.

**Files**: `packages/templates/agents/{analyst,reviewer,test-writer,scout}.md`

**Depends on**: None (can start any time)

**Acceptance Criteria**:

- [ ] `analyst.md` — codebase analysis, JSON frontmatter with name/description/model/tools/thinking
- [ ] `reviewer.md` — code review, JSON frontmatter
- [ ] `test-writer.md` — test generation, JSON frontmatter
- [ ] `scout.md` — fast reconnaissance, uses `claude-haiku-4-5`, thinking off
- [ ] All use JSON frontmatter (not YAML) per AGENTS.md convention
- [ ] Each file is a standalone, well-written system prompt
- [ ] All parseable by `discoverAgents()` from Story 1.2

---

### Story 3.2 — First-Launch Copy Logic

**Status**: 🔴

On Electron startup, copy template agents to the user directory if it's empty.

**File**: `electron/subagent/setup.ts` (new), called from `electron/main.ts`

**Depends on**: 3.1

**Acceptance Criteria**:

- [ ] On app startup, checks if `~/.sero-ui/agent/agents/` exists and has any `.md` files
- [ ] If empty or missing, copies all files from `packages/templates/agents/` into it
- [ ] Creates the directory if it doesn't exist
- [ ] If directory already has `.md` files, does nothing (preserves user edits)
- [ ] Runs once per startup, fast no-op on subsequent launches
- [ ] Logs what it copies for debugging
- [ ] File stays under 500 LOC

**Unit tests**:

- [ ] Copies files when target dir is empty
- [ ] Copies files when target dir doesn't exist
- [ ] Does NOT copy when target dir already has .md files
- [ ] Preserves existing files

---

## Epic 4 — IPC Layer & Desktop UI

> Wire the subagent tracker events through IPC to the renderer. Build the
> Zustand store and orchestration panel UI components.

### Story 4.1 — IPC Channel Constants & Shared Types

**Status**: 🔴

Add subagent IPC channels and event types to the shared type files.

**Files**: `src/types/ipc-channels.ts`, `src/types/ipc.ts`

**Depends on**: 1.1

**Acceptance Criteria**:

- [ ] `IpcChannels.subagent` added with `event`, `listAgents`, `snapshot`, `abort`
- [ ] `SubagentEvent` union type in `ipc.ts`:
  - `subagent_start` with full `SubagentEntry`
  - `subagent_progress` with id + partial usage
  - `subagent_end` with id, status, response, error, usage, durationMs
  - `subagent_clear` with parentSessionId
- [ ] `SubagentAgentSummary` type for `listAgents` response
- [ ] Renderer-safe entry type (subset of `SubagentEntry` without internals)
- [ ] Files stay under 500 LOC

---

### Story 4.2 — IPC Handlers (Main Process)

**Status**: 🔴

Handle subagent IPC from renderer.

**File**: `electron/ipc/subagent.ts` (new)

**Depends on**: 2.1, 4.1

**Acceptance Criteria**:

- [ ] `registerSubagentIpc()` function registers all handlers
- [ ] `listAgents` → calls `subagentManager.listAgents()`, returns `SubagentAgentSummary[]`
- [ ] `snapshot` → calls `subagentManager.snapshot(workspaceId)`, returns entries
- [ ] `abort` → calls `subagentManager.abortSubagent(id)` or similar
- [ ] Tracker events are forwarded to renderer via `webContents.send()` on the
      `subagent.event` channel
- [ ] Handler registered in the main IPC setup (e.g. `electron/ipc/index.ts`)
- [ ] File stays under 500 LOC

---

### Story 4.3 — Preload Bridge

**Status**: 🔴

Expose subagent IPC methods on `window.sero`.

**Files**: `electron/preload.ts`, `src/types/electron.d.ts`

**Depends on**: 4.1, 4.2

**Acceptance Criteria**:

- [ ] `window.sero.subagent.onEvent(cb)` — subscribes to live events, returns cleanup fn
- [ ] `window.sero.subagent.listAgents()` — returns `Promise<SubagentAgentSummary[]>`
- [ ] `window.sero.subagent.snapshot(workspaceId)` — returns `Promise<SubagentEntry[]>`
- [ ] `window.sero.subagent.abort(subagentId)` — returns `Promise<void>`
- [ ] All methods typed in `electron.d.ts` under the `SeroAPI` interface
- [ ] Preload file stays under 500 LOC (split if needed)

---

### Story 4.4 — Zustand Store

**Status**: 🔴

Renderer-side state management for subagent data.

**File**: `src/stores/subagent.ts`

**Depends on**: 4.3

**Acceptance Criteria**:

- [ ] `useSubagentStore` Zustand store with:
  - `entries: Record<string, SubagentEntry>` keyed by run ID
  - `activeWorkspaceId: string | null`
- [ ] `hydrate(workspaceId)` action: calls `window.sero.subagent.snapshot()`,
      replaces entries for that workspace
- [ ] Subscribes to `window.sero.subagent.onEvent()`:
  - `subagent_start` → adds entry
  - `subagent_progress` → merges usage update
  - `subagent_end` → updates status, usage, response, duration
  - `subagent_clear` → removes entries for that parent session
- [ ] `entriesForWorkspace(workspaceId)` selector returns filtered + sorted list
      (running first, then by `startedAt` descending)
- [ ] `abort(subagentId)` action calls `window.sero.subagent.abort()`
- [ ] `summary(workspaceId)` selector returns aggregate: count, total cost,
      total tokens, total duration
- [ ] Re-hydrates when `activeWorkspaceId` changes
- [ ] File stays under 500 LOC

---

### Story 4.5 — ActivityBar: Orchestration Item

**Status**: 🔴

Add the orchestration icon to the coding workspace activity bar.

**Files**: `src/components/apps/coding/ActivityBar.tsx`,
`src/components/apps/coding/CodingSidebar.tsx`,
`src/components/apps/coding/CodingWorkspace.tsx`

**Depends on**: None (can use placeholder panel initially)

**Acceptance Criteria**:

- [ ] `CodingPanel` type extended with `'orchestration'`
- [ ] New activity bar item with appropriate icon (e.g. `Network`, `Workflow`,
      or `Users` from lucide-react)
- [ ] Clicking it opens the sidebar with orchestration panel content
- [ ] Active state styling matches existing items (emerald indicator)
- [ ] `panelTitles` record updated in `CodingSidebar`
- [ ] `CodingSidebar` renders `OrchestrationPanel` when panel is `'orchestration'`
- [ ] Files stay under 500 LOC

---

### Story 4.6 — OrchestrationPanel (Container)

**Status**: 🔴

Top-level orchestration panel that composes the list and summary.

**File**: `src/components/apps/coding/orchestration/OrchestrationPanel.tsx`

**Depends on**: 4.4, 4.5

**Acceptance Criteria**:

- [ ] Calls `useSubagentStore.hydrate(workspaceId)` on mount and workspace change
- [ ] Shows empty state ("No subagent activity") with icon when no entries
- [ ] Renders `SubagentList` when entries exist
- [ ] Renders `SubagentSummary` bar at the bottom when entries exist
- [ ] Handles loading state during initial hydration
- [ ] Scoped to the active workspace
- [ ] File stays under 500 LOC

---

### Story 4.7 — SubagentList & SubagentCard

**Status**: 🔴

Scrollable list of subagent run cards.

**Files**: `src/components/apps/coding/orchestration/SubagentList.tsx`,
`src/components/apps/coding/orchestration/SubagentCard.tsx`

**Depends on**: 4.4

**Acceptance Criteria**:

- [ ] `SubagentList` renders a scrollable list of `SubagentCard` components
- [ ] Running entries appear at top, completed/failed below
- [ ] `SubagentCard` displays:
  - Status icon (🔄 running, ✅ completed, ❌ failed, ⏸ aborted, ⏰ timed out)
  - Agent name + task preview (truncated)
  - Model name
  - Duration (live-updating for running entries)
  - Token count
  - Cost (formatted as $X.XX)
- [ ] Running cards show animated indicator (pulse or spinner)
- [ ] Failed/timed-out cards show error styling
- [ ] Cards are expandable to show output (delegates to `SubagentOutput`)
- [ ] Files stay under 500 LOC each

---

### Story 4.8 — SubagentOutput (Expandable Detail)

**Status**: 🔴

Expandable output viewer within a card.

**File**: `src/components/apps/coding/orchestration/SubagentOutput.tsx`

**Depends on**: 4.7

**Acceptance Criteria**:

- [ ] Collapsible section toggled by clicking "Output" / "Error" in the card
- [ ] Renders `fullResponse` as markdown or preformatted text
- [ ] Renders `error` for failed entries
- [ ] Scrollable with max-height constraint
- [ ] Copy-to-clipboard button for output text
- [ ] File stays under 500 LOC

---

### Story 4.9 — SubagentSummary Bar

**Status**: 🔴

Aggregate stats bar at the bottom of the orchestration panel.

**File**: `src/components/apps/coding/orchestration/SubagentSummary.tsx`

**Depends on**: 4.4

**Acceptance Criteria**:

- [ ] Displays: total runs, aggregate cost, aggregate tokens, total duration
- [ ] Format: `"4 runs · $0.08 · 8.3k tokens · 90s"`
- [ ] Updates in real-time as subagents complete
- [ ] Sticky at bottom of the panel
- [ ] Compact single-line layout
- [ ] File stays under 500 LOC

---

### Story 4.10 — UI States & Edge Cases

**Status**: 🔴

Polish all UI states described in the spec.

**Depends on**: 4.6, 4.7, 4.8, 4.9

**Acceptance Criteria**:

- [ ] **No activity**: Empty state with icon and message
- [ ] **Running**: Live list with animated indicators, live-updating durations
- [ ] **All complete**: List with completion indicators + summary bar
- [ ] **Mixed**: Running entries sorted to top, completed below
- [ ] **Error entries**: Distinct error styling, expandable error details
- [ ] **Panel reload**: Snapshot hydration on remount restores correct state
- [ ] **Workspace switch**: Panel re-hydrates for the new workspace

---

## Epic 5 — Hardening & Documentation

> Final polish, documentation, and manual verification.

### Story 5.1 — Error Containment Audit

**Status**: 🔴

Verify all error paths are handled gracefully.

**Depends on**: Epics 1–4

**Acceptance Criteria**:

- [ ] Failed subagent returns plain error text to main agent (no unhandled throw)
- [ ] Main process never crashes from a subagent failure
- [ ] Timeout produces a clear message with duration
- [ ] Abort produces a clear message
- [ ] API errors (auth, network) are caught and reported
- [ ] Malformed tool parameters return validation error (not crash)

---

### Story 5.2 — Concurrency & Race Condition Audit

**Status**: 🔴 `[parallel]`

Verify concurrency limits and resource cleanup.

**Depends on**: Epics 1–2

**Acceptance Criteria**:

- [ ] `maxTotal` is respected under concurrent parallel calls from multiple sessions
- [ ] `maxConcurrent` is respected per-call
- [ ] No memory leaks from undisposed sessions
- [ ] No orphaned AbortControllers after completion
- [ ] In-memory sessions are GC-eligible after run

---

### Story 5.3 — Manual E2E Verification

**Status**: 🔴

Add manual E2E test procedure to docs.

**File**: `docs/testing/e2e-subagent-testing.md` (new)

**Depends on**: Epics 1–4

**Acceptance Criteria**:

- [ ] Single mode test procedure (named agent + ad-hoc)
- [ ] Parallel mode test procedure (3+ tasks)
- [ ] Chain mode test procedure (2 steps with `{previous}`)
- [ ] `create_agent` test procedure
- [ ] Abort mid-execution test procedure
- [ ] UI orchestration panel verification steps
- [ ] Snapshot hydration test (navigate away and back)

---

### Story 5.4 — Architecture Decision Record

**Status**: 🔴 `[parallel]`

Record the subagent decision in the project decisions log.

**File**: `docs/decisions.md` (append)

**Depends on**: None

**Acceptance Criteria**:

- [ ] New AD entry for subagent system (e.g. AD-023)
- [ ] Documents: in-process model, global-only agents, standalone tool exception,
      no recursion, reduced child extension factory
- [ ] Links to the design spec and this PRD

---

## Dependency Graph

```
Epic 1 (Core Engine)
  1.1 Types ─────────────────────┬──── 1.2 Discovery
                                 ├──── 1.3 Pool
                                 ├──── 1.4 Tracker
                                 └──── 1.5 Resolve
                                           │
  1.2 + 1.3 + 1.4 + 1.5 ────────┬──── 1.6 Runner
                                 │
  1.6 ───────────────────────────┴──── 1.7 Manager Façade
                                           │
  1.7 ──────────────────────────────── 1.8 Integration Tests

Epic 2 (Tools & Session Wiring)
  1.7 ──── 2.1 SharedInfra Singleton
  2.1 ──── 2.2 subagent Tool
  2.1 ──── 2.3 create_agent Tool
  2.2 + 2.3 ── 2.4 Extension Factory
  2.4 ──── 2.5 System Prompt
  2.1 ──── 2.6 Abort Cascade
  All ──── 2.7 Tool Integration Test

Epic 3 (Built-In Agents)           ← can start in parallel with Epic 2
  (none) ── 3.1 Template Files
  3.1 ───── 3.2 First-Launch Copy

Epic 4 (Desktop UI)
  1.1 ──── 4.1 IPC Types
  4.1 ──── 4.2 IPC Handlers
  4.2 ──── 4.3 Preload Bridge
  4.3 ──── 4.4 Zustand Store
  (none) ── 4.5 ActivityBar Item    ← can start early with placeholder
  4.4 + 4.5 ── 4.6 OrchestrationPanel
  4.4 ──── 4.7 List + Card
  4.7 ──── 4.8 SubagentOutput
  4.4 ──── 4.9 Summary Bar
  4.6–4.9 ── 4.10 UI States Polish

Epic 5 (Hardening)
  All ──── 5.1 Error Audit
  All ──── 5.2 Concurrency Audit
  All ──── 5.3 E2E Test Doc
  (none) ── 5.4 ADR
```

## Recommended Execution Order

**Phase A** — Foundation (Stories 1.1 → 1.5 + 3.1 + 4.1 + 5.4 in parallel)
These are leaf nodes with no upstream blockers.

**Phase B** — Core Pipeline (1.6 → 1.7 → 1.8)
Runner and manager, validated by integration tests.

**Phase C** — Tool Wiring (2.1 → 2.2/2.3 → 2.4 → 2.5/2.6 → 2.7 + 3.2)
Wire into real sessions and test end-to-end.

**Phase D** — UI Stack (4.2 → 4.3 → 4.4 → 4.5/4.6 → 4.7/4.8/4.9 → 4.10)
IPC plumbing first, then components bottom-up.

**Phase E** — Hardening (5.1 → 5.2 → 5.3)
Audit and document.

---

## Out of Scope (v1)

Tracked here for v2 planning. Do NOT implement these:

- Tool filtering enforcement (frontmatter `tools` field)
- Cost budgets / guardrails
- Workflow execution engine
- Inter-subagent communication
- Project-scoped agents (workspace `.sero/agents/`)
- Extension package allowlists for child sessions
- Subagent output persistence to disk
- Worker thread isolation

# Symphony Sero App — Implementation Plan

## Overview

Build a Sero app (`pi-symphony-extension`) that implements the Symphony service specification: a long-running orchestrator that polls an issue tracker for issues, creates isolated workspaces, and runs Codex coding-agent sessions per issue.

**Two tracker backends:**
1. **Linear** — GraphQL API, polls by project slug + active states
2. **File-based** — watches a local folder of structured issue files (YAML/Markdown), enabling tracker-free or self-hosted workflows

Both implement the same `IssueTracker` interface and produce the same `Issue` model. The orchestrator is tracker-agnostic.

**Key integration point:** Uses the Sero cron system's patterns (singleton scheduler, transient sessions, file-backed state, state watcher) adapted for Symphony's poll-dispatch-reconcile loop.

---

## Package Identity

| Field | Value |
|-------|-------|
| Package name | `@sero/symphony` |
| Directory | `packages/pi-symphony-extension/` |
| App ID | `symphony` |
| Display name | `Symphony` |
| Icon | `activity` (Lucide) |
| Scope | `global` |
| State file | `.sero/apps/symphony/state.json` (global: `$SERO_HOME/apps/symphony/state.json`) |
| Dev port | `5194` |
| Tool name | `symphony` |

---

## Directory Structure

```
packages/pi-symphony-extension/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── shared/
│   ├── types.ts                    # Core domain model (Issue, Config, RunEntry, etc.)
│   └── template.ts                 # Liquid-style template engine (strict mode)
├── extension/
│   ├── index.ts                    # Extension entry: tool registration, lifecycle hooks
│   ├── workflow-loader.ts          # WORKFLOW.md parser (YAML front matter + prompt body)
│   ├── config.ts                   # Typed config layer with defaults and $VAR resolution
│   ├── tracker.ts                  # IssueTracker interface + factory (Linear | file)
│   ├── linear-client.ts            # Linear GraphQL tracker implementation
│   ├── file-tracker.ts             # File-based tracker implementation (watches a folder)
│   ├── orchestrator.ts             # Poll loop, dispatch decisions, state machine owner
│   ├── reconciler.ts               # Stall detection + tracker state refresh
│   ├── workspace-manager.ts        # Workspace creation, hooks, cleanup, safety invariants
│   ├── agent-runner.ts             # Codex app-server subprocess client (JSON-RPC/stdio)
│   ├── prompt-builder.ts           # Render prompt from template + issue + attempt
│   ├── retry-manager.ts            # Retry queue with exponential backoff + continuation
│   ├── state-io.ts                 # State file I/O for UI synchronization (atomic writes)
│   ├── state-watcher.ts            # File watcher to sync UI changes back to orchestrator
│   └── logger.ts                   # Structured logging with issue/session context
├── ui/
│   ├── index.html
│   ├── main.tsx
│   ├── styles.css
│   ├── tsconfig.json
│   ├── SymphonyApp.tsx             # Root component
│   ├── components/
│   │   ├── Header.tsx              # Title, service status, start/stop/refresh controls
│   │   ├── RunningTable.tsx        # Table of active agent sessions
│   │   ├── RetryQueue.tsx          # Table of pending retries with countdown
│   │   ├── TokenTotals.tsx         # Aggregate token/runtime stats card
│   │   ├── IssueRow.tsx            # Single running-issue row with expand
│   │   ├── WorkflowStatus.tsx      # Current WORKFLOW.md config summary + validation
│   │   └── EmptyState.tsx          # When service is idle / no sessions
│   └── lib/
│       └── format.ts               # Duration, token count, timestamp formatters
```

---

## Phase 1: Foundation (shared types + config + workflow loader)

### 1A. `shared/types.ts` — Core Domain Model

Define all types from spec Section 4:

```typescript
// Issue (Section 4.1.1)
interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: BlockerRef[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

// Workflow Definition (Section 4.1.2)
interface WorkflowDefinition {
  config: Record<string, unknown>;
  promptTemplate: string;
}

// Run states (Section 7.2)
type RunPhase =
  | 'preparing_workspace' | 'building_prompt' | 'launching_agent'
  | 'initializing_session' | 'streaming_turn' | 'finishing'
  | 'succeeded' | 'failed' | 'timed_out' | 'stalled'
  | 'canceled_by_reconciliation';

// Running entry (Section 4.1.8 running map value)
interface RunningEntry {
  issueId: string;
  identifier: string;
  issue: Issue;
  sessionId: string | null;
  codexAppServerPid: string | null;
  lastCodexMessage: string | null;
  lastCodexEvent: string | null;
  lastCodexTimestamp: string | null;
  codexInputTokens: number;
  codexOutputTokens: number;
  codexTotalTokens: number;
  lastReportedInputTokens: number;
  lastReportedOutputTokens: number;
  lastReportedTotalTokens: number;
  turnCount: number;
  retryAttempt: number | null;
  startedAt: string;
  phase: RunPhase;
}

// Retry entry (Section 4.1.7)
interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
}

// Orchestrator runtime state (Section 4.1.8) — persisted snapshot for UI
interface SymphonyState {
  serviceActive: boolean;
  workflowPath: string | null;
  workflowValid: boolean;
  workflowError: string | null;
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  running: RunningEntry[];
  retrying: RetryEntry[];
  completed: string[];  // issue IDs (bookkeeping)
  codexTotals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
  };
  rateLimits: Record<string, unknown> | null;
  lastPollAt: string | null;
  lastError: string | null;
  trackerKind: 'linear' | 'file' | null;
  trackerLabel: string | null;  // project slug (Linear) or issues_dir basename (file)
}

// Config types (Section 5.3)
interface SymphonyConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  hooks: HooksConfig;
  agent: AgentConfig;
  codex: CodexConfig;
}

// Tracker config — discriminated union
type TrackerConfig =
  | { kind: 'linear'; api_key: string; project_slug: string; active_states: string[]; terminal_states: string[]; }
  | { kind: 'file'; issues_dir: string; active_states: string[]; terminal_states: string[]; };
// ... other sub-configs with defaults
```

### 1B. `shared/template.ts` — Strict Template Engine

Simple Liquid-compatible renderer:
- Variable interpolation: `{{ issue.title }}`, `{{ attempt }}`
- Dot-path access for nested fields
- Strict mode: fail on unknown variables
- Support for `{% for %}` loops (for labels, blockers)
- ~120 LOC

### 1C. `extension/workflow-loader.ts` — WORKFLOW.md Parser

Per spec Section 5:
- Parse YAML front matter (between `---` delimiters)
- Extract prompt body (trimmed markdown after front matter)
- Validate front matter is a map
- Return `WorkflowDefinition { config, promptTemplate }`
- Error types: `missing_workflow_file`, `workflow_parse_error`, `workflow_front_matter_not_a_map`
- Uses `js-yaml` for YAML parsing
- ~100 LOC

### 1D. `extension/config.ts` — Typed Config Layer

Per spec Section 6:
- Parse workflow config into typed `SymphonyConfig`
- Apply defaults from Section 6.4
- `$VAR` environment variable resolution
- `~` home directory expansion for paths
- Comma-separated string → array coercion for state lists
- String integer → number coercion
- Dispatch preflight validation (Section 6.3)
- ~200 LOC

---

## Phase 2: Issue Tracker Abstraction + Workspace

### 2A. `extension/tracker.ts` — IssueTracker Interface + Factory

The orchestrator is **tracker-agnostic**. All issue sourcing goes through a common interface:

```typescript
interface IssueTracker {
  kind: 'linear' | 'file';

  /** Fetch issues eligible for dispatch (active states, not terminal). */
  fetchCandidateIssues(): Promise<Issue[]>;

  /** Bulk-refresh current state for a set of issue IDs (reconciliation). */
  fetchIssueStatesByIds(ids: string[]): Promise<Map<string, string>>;

  /** Transition an issue to a new state (e.g., mark done / failed). */
  transitionIssue?(issueId: string, toState: string): Promise<void>;

  /** Dispose watchers / connections. */
  destroy(): void;
}

function createTracker(config: SymphonyConfig, logger: Logger): IssueTracker
```

- Factory reads `config.tracker.kind` (`"linear"` | `"file"`)
- Returns the appropriate implementation
- Orchestrator, reconciler, and retry manager all receive the tracker interface — never import a specific backend directly
- ~60 LOC

### 2B. `extension/linear-client.ts` — Linear Tracker Implementation

Implements `IssueTracker` for Linear:
- `fetchCandidateIssues()` — paginated GraphQL query by project slug + active states
- `fetchIssueStatesByIds(ids)` — bulk state refresh for reconciliation
- GraphQL query construction with proper variable types (`[ID!]`)
- Issue normalization (Section 11.3): lowercase labels, blocker extraction, priority coercion
- Pagination with cursor (`after`, `first: 50`)
- 30s network timeout
- Error categories from Section 11.4
- ~250 LOC

### 2C. `extension/file-tracker.ts` — File-Based Tracker Implementation

Implements `IssueTracker` for a local folder of structured issue files, enabling Linear-free workflows.

**Folder structure:**

```
<issues_dir>/                      # Configured via tracker.issues_dir
├── active/                        # Issues eligible for dispatch
│   ├── PROJ-001.md
│   └── PROJ-002.md
├── done/                          # Terminal: completed successfully
│   └── PROJ-000.md
├── failed/                        # Terminal: agent gave up
│   └── PROJ-003.md
└── paused/                        # Not active, not terminal (user paused)
    └── PROJ-004.md
```

**Issue file format** (YAML front matter + Markdown body):

```markdown
---
id: PROJ-001
title: Add retry logic to payment service
priority: 2
labels: [backend, payments]
branch: feat/PROJ-001-retry-logic
blocked_by: []
---

## Description

The payment service currently fails silently when Stripe returns a 429.
Add exponential backoff retry logic with a max of 3 attempts...
```

**Implementation details:**
- `fetchCandidateIssues()` — reads all `.md` files from `active/` subfolder, parses YAML front matter into `Issue` objects
- `fetchIssueStatesByIds(ids)` — scans all subfolders to find each issue's current state (folder = state)
- `transitionIssue(id, toState)` — moves the `.md` file to the target subfolder (e.g., `active/` → `done/`)
- State mapping: subfolder names map to states — `active/` = any active state names from config, `done/` = terminal success, `failed/` = terminal failure, `paused/` = inactive
- `identifier` derived from filename (without `.md` extension)
- `id` from front matter (or falls back to identifier)
- Missing optional fields get sensible defaults (priority: null, labels: [], etc.)
- Front matter parsing reuses `js-yaml` (already a dependency)
- File watcher on the issues directory for real-time detection of new/moved files (optional — poll also works)
- ~200 LOC

**Config for file tracker** (in WORKFLOW.md front matter):

```yaml
tracker:
  kind: file
  issues_dir: ~/symphony-issues    # Folder path (~ expanded, $VAR resolved)
  active_states: [active]           # Maps to subfolder names
  terminal_states: [done, failed]
```

**Why this design:**
- **Drop-in migration from Linear** — same `Issue` model, same orchestrator behavior, just different source
- **Human-editable** — issues are plain Markdown files, easily created/edited in any editor or script
- **State via filesystem** — moving a file between folders changes its state (intuitive, scriptable, git-friendly)
- **No database** — consistent with Symphony's in-memory philosophy
- **Composable** — CI/CD pipelines, scripts, or other tools can create issue files by dropping `.md` into `active/`

### 2D. `extension/workspace-manager.ts` — Workspace Lifecycle

Per spec Section 9:
- `createForIssue(identifier)` → sanitize key, ensure directory, run hooks
- Sanitize: replace non-`[A-Za-z0-9._-]` with `_`
- Safety invariants: path must be under workspace root (Section 9.5)
- `runHook(name, script, cwd, timeoutMs)` — shell execution via `child_process.execSync` with timeout
- `cleanWorkspace(identifier)` — run `before_remove` hook, then `rm -rf`
- Hook timeout from `hooks.timeout_ms` (default 60s)
- ~180 LOC

---

## Phase 3: Agent Runner + Prompt Builder

### 3A. `extension/agent-runner.ts` — Codex App-Server Client

Per spec Section 10:
- Launch subprocess: `bash -lc <codex.command>` with workspace cwd
- JSON-RPC handshake: `initialize` → `initialized` → `thread/start` → `turn/start`
- Line-delimited JSON parsing from stdout (buffer partial lines)
- Stderr: log as diagnostics, do not parse as protocol
- Turn completion detection: `turn/completed`, `turn/failed`, `turn/cancelled`
- Timeout enforcement: `read_timeout_ms`, `turn_timeout_ms`
- Event emission to orchestrator callback (session_started, turn_completed, etc.)
- Token usage extraction from nested payload shapes
- Approval auto-handling (auto-approve commands + file changes)
- User-input-required → hard fail
- Unsupported tool calls → failure response + continue
- Multi-turn loop: reuse thread_id, send continuation guidance for turns 2+
- Clean subprocess teardown (SIGTERM → SIGKILL after timeout)
- ~400 LOC

### 3B. `extension/prompt-builder.ts` — Prompt Rendering

Per spec Section 12:
- Render `promptTemplate` with `{ issue, attempt }` using strict template engine
- Convert issue fields to template-compatible format (string keys)
- Preserve nested arrays (labels, blockers)
- First turn: full rendered prompt
- Continuation turns: brief continuation guidance (not full re-render)
- Fallback: "You are working on an issue from Linear." if prompt body empty
- ~80 LOC

---

## Phase 4: Orchestrator Core

### 4A. `extension/orchestrator.ts` — Poll Loop & Dispatch

Per spec Sections 7-8:
- **In-memory state**: running map, claimed set, retry_attempts map, completed set, codex_totals
- **Poll tick** (Section 8.1): reconcile → validate → fetch candidates → sort → dispatch
- **Candidate selection** (Section 8.2): active state, not claimed, slots available, blocker check for Todo
- **Sort order**: priority asc → created_at oldest → identifier lexicographic
- **Concurrency control** (Section 8.3): global limit + per-state limits
- **Dispatch** (Section 16.4): spawn worker, track in running map, add to claimed set
- **Worker exit handling** (Section 16.6): normal → continuation retry (1s), abnormal → exponential backoff
- **Codex update handling**: update session fields, token counters, rate limits
- **State snapshot**: periodically write to state.json for UI consumption
- Uses `setInterval` for poll tick (like cron's 30s tick pattern)
- ~400 LOC

### 4B. `extension/reconciler.ts` — Active Run Reconciliation

Per spec Section 8.5:
- **Part A — Stall detection**: check elapsed since last event, kill if > stall_timeout_ms
- **Part B — Tracker state refresh**: fetch current states, stop terminal/non-active runs
- Terminal state → terminate + clean workspace
- Non-active state → terminate without cleanup
- Active state → update in-memory issue snapshot
- Refresh failure → keep workers, retry next tick
- ~150 LOC

### 4C. `extension/retry-manager.ts` — Retry Queue

Per spec Section 8.4:
- `scheduleRetry(issueId, attempt, opts)` — cancel existing timer, create new entry
- Continuation retry: 1000ms fixed delay
- Failure retry: `min(10000 * 2^(attempt-1), max_retry_backoff_ms)`
- `onRetryTimer(issueId)` — fetch candidates, re-dispatch or release claim
- Timer handles via `setTimeout`
- ~120 LOC

---

## Phase 5: Extension Entry + State Sync

### 5A. `extension/index.ts` — Extension Entry Point

Following kanban/cron patterns:
- **Tool registration**: `symphony` tool with actions:
  - `start` — start the orchestrator service
  - `stop` — stop the orchestrator service
  - `status` — show current state summary
  - `refresh` — trigger immediate poll cycle
  - `config` — show current effective config
  - `issues` — list running/retrying issues
- **Command**: `/symphony` slash command
- **Lifecycle**: `session_start` → init, `session_shutdown` → cleanup (ref-counted singleton like cron)
- **WORKFLOW.md watcher**: `fs.watch` for dynamic reload (Section 6.2)
- **Singleton orchestrator**: one per process, survives session switches
- Add `'symphony'` to `TOOLS_TO_BRIDGE` in `electron/cli/index.ts`
- ~350 LOC

### 5B. `extension/state-io.ts` — State File I/O

Following cron's state-io pattern:
- Atomic writes (temp file + rename)
- Mutex serialization (promise queue)
- Path resolution (SERO_HOME-aware)
- Default state factory
- ~60 LOC

### 5C. `extension/state-watcher.ts` — File Watcher

Following cron's state-watcher pattern:
- Watch directory for state.json changes
- Debounce 500ms
- Sync UI-driven changes (e.g., start/stop toggle) back to orchestrator
- Own-write feedback prevention
- ~100 LOC

### 5D. `extension/logger.ts` — Structured Logging

Per spec Section 13:
- File-based logging to `$SERO_HOME/apps/symphony/symphony.log`
- Format: `ISO [LEVEL] event_name {issue_id, issue_identifier, session_id, ...}`
- Log rotation at 1MB
- Console + file + EventBus destinations
- Context fields: issue_id, issue_identifier, session_id per spec
- ~100 LOC

---

## Phase 6: UI Dashboard

### 6A. `ui/SymphonyApp.tsx` — Root Component

- `useAppState<SymphonyState>()` for reactive state
- Layout: Header + main content area
- Conditional rendering: empty state vs active dashboard
- Auto-refresh display (timestamps update via interval)
- ~200 LOC

### 6B. `ui/components/Header.tsx`

- Service status indicator (active/stopped/error)
- Start/Stop toggle button
- Refresh button (trigger immediate poll)
- Workflow path + validation status
- Tracker info (kind + project slug)
- Poll interval display
- ~120 LOC

### 6C. `ui/components/RunningTable.tsx`

- Table of active sessions from `state.running`
- Columns: Issue ID, Title, State, Phase, Turn Count, Session Time, Tokens, Last Event
- Expandable rows for detail
- Color-coded phases
- ~150 LOC

### 6D. `ui/components/IssueRow.tsx`

- Single running issue row with expand/collapse
- Shows: identifier, title, state badge, phase badge, turn count, elapsed time
- Expanded: full token breakdown, last message, session ID, PID
- ~130 LOC

### 6E. `ui/components/RetryQueue.tsx`

- Table of pending retries from `state.retrying`
- Columns: Issue ID, Attempt #, Due In (countdown), Error Reason
- ~100 LOC

### 6F. `ui/components/TokenTotals.tsx`

- Card showing aggregate codex_totals
- Input/output/total tokens with formatting
- Total runtime (seconds → human-readable duration)
- Rate limit info if available
- ~80 LOC

### 6G. `ui/components/WorkflowStatus.tsx`

- Current workflow config summary
- Active states, terminal states
- Concurrency settings
- Codex command + timeouts
- Validation errors if any
- ~100 LOC

### 6H. `ui/components/EmptyState.tsx`

- Shown when service is stopped or no sessions running
- Instructions to start + configure
- ~40 LOC

### 6I. `ui/lib/format.ts`

- `formatDuration(ms)` → "2h 15m 30s"
- `formatTokens(n)` → "1.2K" / "45.3K"
- `formatTimestamp(iso)` → relative time
- `formatCountdown(dueAtMs)` → "in 30s"
- ~60 LOC

---

## Phase 7: Build Config + Host Integration

### 7A. `package.json`

```json
{
  "name": "@sero/symphony",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "pi": {
    "extensions": ["./extension/index.ts"]
  },
  "sero": {
    "app": {
      "id": "symphony",
      "name": "Symphony",
      "icon": "activity",
      "scope": "global",
      "stateFile": ".sero/apps/symphony/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "SymphonyApp",
      "devPort": 5194
    }
  },
  "dependencies": {
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@sero/app-runtime": "workspace:*",
    "@module-federation/vite": "...",
    "@vitejs/plugin-react": "...",
    "vite": "...",
    "tailwindcss": "...",
    "typescript": "..."
  }
}
```

### 7B. `vite.config.ts`

Standard federation config (port 5194), exposing `./SymphonyApp`.

### 7C. Host Integration

- Add `'symphony'` to `TOOLS_TO_BRIDGE` in `apps/desktop/electron/cli/index.ts`
- No other host changes needed (auto-discovery handles the rest)

---

## Phase 8: Cron Integration

The orchestrator's poll loop can optionally leverage the Sero cron system:

**Option A (Recommended): Built-in timer, cron-inspired patterns**
- Use `setInterval` for the poll tick (like cron's 30s tick)
- Use cron's singleton pattern (ref-counted, survives session switches)
- Use cron's state-io pattern (atomic writes, mutex, own-write prevention)
- Use cron's transient session pattern for spawning Codex agent sessions
- The poll interval is configurable via WORKFLOW.md (not a cron expression)

**Option B: Delegate polling to cron jobs**
- Register a cron job that runs `symphony refresh` every N seconds
- Simpler but less control over timing and lifecycle
- Harder to do reconciliation on every tick

**Decision: Option A** — The orchestrator needs tighter control than cron jobs provide. We adopt cron's *patterns* (singleton scheduler, atomic state I/O, state watcher, transient sessions) but run our own timer loop with configurable interval.

---

## Implementation Order

| Step | Files | Description |
|------|-------|-------------|
| 1 | `package.json`, `tsconfig.json`, `vite.config.ts` | Package scaffold |
| 2 | `shared/types.ts` | All domain model types |
| 3 | `shared/template.ts` | Strict template engine |
| 4 | `extension/logger.ts` | Structured logging (needed by everything) |
| 5 | `extension/state-io.ts` | State file I/O |
| 6 | `extension/workflow-loader.ts` | WORKFLOW.md parser |
| 7 | `extension/config.ts` | Typed config with defaults |
| 8 | `extension/tracker.ts` | IssueTracker interface + factory |
| 9 | `extension/linear-client.ts` | Linear tracker implementation |
| 10 | `extension/file-tracker.ts` | File-based tracker implementation |
| 11 | `extension/workspace-manager.ts` | Workspace lifecycle |
| 12 | `extension/prompt-builder.ts` | Prompt rendering |
| 13 | `extension/agent-runner.ts` | Codex app-server client |
| 14 | `extension/retry-manager.ts` | Retry queue |
| 15 | `extension/reconciler.ts` | Stall detection + state refresh |
| 16 | `extension/orchestrator.ts` | Poll loop + dispatch |
| 17 | `extension/state-watcher.ts` | File watcher for UI sync |
| 18 | `extension/index.ts` | Extension entry + tool registration |
| 19 | `ui/lib/format.ts` | Formatting utilities |
| 20 | `ui/SymphonyApp.tsx` + all components | Dashboard UI |
| 21 | Host integration | `TOOLS_TO_BRIDGE` update |
| 22 | `pnpm install` + typecheck | Final validation |

---

## Estimated File Sizes

| File | Est. LOC | Note |
|------|----------|------|
| `shared/types.ts` | ~220 | All interfaces + defaults (incl. TrackerConfig union) |
| `shared/template.ts` | ~120 | Strict Liquid subset |
| `extension/index.ts` | ~350 | Tool defs + lifecycle |
| `extension/workflow-loader.ts` | ~100 | YAML + markdown split |
| `extension/config.ts` | ~200 | Typed getters + validation |
| `extension/tracker.ts` | ~60 | IssueTracker interface + factory |
| `extension/linear-client.ts` | ~250 | Linear GraphQL tracker |
| `extension/file-tracker.ts` | ~200 | File-based tracker (folder watcher + YAML parsing) |
| `extension/workspace-manager.ts` | ~180 | Filesystem + hooks |
| `extension/agent-runner.ts` | ~400 | Subprocess + JSON-RPC |
| `extension/prompt-builder.ts` | ~80 | Template rendering |
| `extension/orchestrator.ts` | ~400 | State machine + dispatch |
| `extension/reconciler.ts` | ~150 | Stall + state refresh |
| `extension/retry-manager.ts` | ~120 | Backoff + timers |
| `extension/state-io.ts` | ~60 | Atomic file I/O |
| `extension/state-watcher.ts` | ~100 | Directory watcher |
| `extension/logger.ts` | ~100 | Structured logging |
| `ui/SymphonyApp.tsx` | ~200 | Root component |
| `ui/components/*.tsx` (7 files) | ~720 total | Dashboard components |
| `ui/lib/format.ts` | ~60 | Formatters |
| **Total** | **~3,670** | All under 500 LOC per file |

---

## Key Design Decisions

1. **Global scope** — Symphony manages its own workspaces per-issue; it's not tied to a single Sero workspace.

2. **Tracker abstraction** — The `IssueTracker` interface decouples the orchestrator from any specific issue source. Linear and file-based backends are first-class. Switching trackers requires only a config change in WORKFLOW.md (`tracker.kind: file` vs `tracker.kind: linear`).

3. **File-based tracker uses folders-as-states** — Issue files live in subfolders (`active/`, `done/`, `failed/`, `paused/`). Moving a file between folders = state transition. This is intuitive, scriptable, git-friendly, and requires no external service.

4. **Singleton orchestrator** — One instance per Electron process, ref-counted across sessions (follows cron pattern).

5. **State file as UI bridge** — The orchestrator writes periodic snapshots to `state.json`; the UI watches via `useAppState()`. This is the standard Sero app data flow.

6. **Cron-inspired patterns, not cron-dependent** — We adopt the cron extension's proven patterns (atomic I/O, mutex, state watcher, singleton lifecycle) but run an independent timer loop for tighter orchestration control.

7. **No persistent database** — Per spec Section 14.3, orchestrator state is in-memory. Recovery is tracker-driven (re-poll on restart).

8. **Agent sessions via child_process** — Codex app-server is launched as a subprocess with JSON-RPC over stdio. This is direct process management, not routed through Pi SDK's AgentSession (which is for the Sero agent itself).

9. **WORKFLOW.md hot-reload** — `fs.watch` detects changes and re-applies config without restart (spec Section 6.2).

10. **Tool bridging** — The `symphony` tool is added to `TOOLS_TO_BRIDGE` so it appears as `sero symphony start` in the CLI bridge, not as a standalone tool schema.

---

## Risk Areas

| Risk | Mitigation |
|------|------------|
| agent-runner.ts is complex (subprocess + JSON-RPC + timeouts) | Careful error handling, comprehensive timeout enforcement, clean shutdown |
| Linear API schema drift | Isolated query construction, defensive field extraction; tracker abstraction limits blast radius |
| File tracker: concurrent file moves | Atomic `fs.renameSync` for state transitions; re-scan on conflict |
| File tracker: malformed issue files | Defensive YAML parsing, skip + log bad files, don't crash the poll loop |
| File size limits (500 LOC) | Pre-split into focused modules; orchestrator.ts and agent-runner.ts are the largest at ~400 each |
| State file write frequency | Debounce snapshots (write at most every 2s during active runs) |
| Subprocess cleanup on crash | SIGTERM with timeout → SIGKILL; track PIDs for orphan cleanup |

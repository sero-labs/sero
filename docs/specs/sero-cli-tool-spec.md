# Sero CLI Tool — Specification

**AD-020: CLI Tool for Agent Context Reduction**

> Replace individual agent tools with a single `sero-cli` tool backed by a
> distributed command registry. Reduces context window bloat, enables multi-step
> command chaining, and gives the agent programmatic control over the Sero
> platform itself.

---

## 1. Problem

The agent currently has **21 tools** in its context window — each with a full
JSON schema (name, description, parameters). As the app matures and more
packages are added, this grows linearly. This is sub-optimal because:

- **Cost** — every tool schema is sent with every API request, consuming input
  tokens on every turn.
- **Performance** — larger system prompts increase time-to-first-token.
- **Decision quality** — models perform worse with too many tool options
  (selection confusion, unnecessary tool calls).
- **No chaining** — each tool call is a separate round-trip. An operation like
  "check todos then create a note" requires two turns.

### Current tool inventory

| Category | Tools | Count |
|---|---|---|
| Core coding | bash, read, write, edit | 4 |
| Workspace ops | ls, read_terminal, register_dev_server | 3 |
| Sero extension | set_session_title | 1 |
| Package extensions | calc, daily_quote, generate_image, notes, plan_todos, slopzilla, starling, todo, question, questionnaire, weight, interview | 12 |
| **Total** | | **20** |

## 2. Solution Overview

Introduce a **single `sero-cli` tool** that replaces all non-core tools. The
agent invokes `sero-cli` with a command string (e.g. `todo list`, `notes create
"Meeting notes"`), and Sero routes it to the appropriate handler.

After this change, the agent context contains **5 tools** instead of 21:

| Tool | Source |
|---|---|
| `bash` | Pi SDK (native) |
| `read` | Pi SDK (native) |
| `write` | Pi SDK (native) |
| `edit` | Pi SDK (native) |
| `sero-cli` | Sero (new) |

**Net reduction: 15 tools removed from context.**

The agent can also chain multiple commands in a single tool call:

```
sero todo list
sero notes create "Bug fix summary" --content "Fixed the auth race condition"
```

## 3. Architecture

### 3.1 Execution Surface — The `sero-cli` Tool

A single tool registered with the Pi SDK agent:

```typescript
{
  name: 'sero-cli',
  label: 'Sero CLI',
  description:
    'Execute Sero platform commands. Supports app operations (todo, notes, ' +
    'and plugin tools), workspace management, version control, and dev servers. ' +
    'Run `sero help` for available commands. Chain multiple commands by ' +
    'passing multi-line input (one command per line).',
  parameters: {
    command: string   // e.g. "todo list" or multi-line "todo list\nnotes search meeting"
    timeout?: number  // optional timeout in seconds
  }
}
```

The tool handler:
1. Splits the input by newlines into individual commands
2. Executes each sequentially via the CLI command registry
3. Aggregates output (with clear delimiters between commands)
4. Returns the combined result

### 3.2 Dual Runtime — Container vs Host

The CLI must work for both container and filesystem workspaces:

| Workspace Type | Runtime | How it works |
|---|---|---|
| **Container** | Native process in container | `sero-cli` binary installed in container image. Communicates with Electron host via a lightweight IPC socket (Unix domain socket mounted into the container). |
| **Filesystem** | Host process (IPC bridge) | `sero-cli` tool handler runs directly in the Electron main process, calling the same command handlers without any subprocess. No separate binary needed. |

**Container architecture:**

```
┌─────────────────────┐     Unix socket      ┌───────────────────┐
│  Container          │ ◄──────────────────► │  Electron Host    │
│                     │                       │                   │
│  sero-cli binary    │   JSON-RPC over UDS   │  CLI RPC Server   │
│  (called by agent   │                       │  (routes to       │
│   bash or sero-cli  │                       │   command          │
│   tool)             │                       │   registry)       │
└─────────────────────┘                       └───────────────────┘
```

- The Electron host creates a Unix domain socket at a known path, bind-mounted
  into the container (e.g. `/tmp/sero-cli.sock`).
- The `sero-cli` binary in the container sends JSON-RPC requests over this socket.
- The host-side server deserializes and routes to the command registry.

**Filesystem architecture:**

```
┌──────────────────────────────────────────────────────┐
│  Electron Main Process                               │
│                                                      │
│  sero-cli tool handler ──► CLI Command Registry      │
│  (direct function call, no subprocess)               │
└──────────────────────────────────────────────────────┘
```

No binary, no socket — the `sero-cli` tool's `execute` function directly
calls the command registry in-process.

### 3.3 Command Registry

A central registry where commands are registered from anywhere in the app:

```typescript
// electron/cli/registry.ts

interface CliCommand {
  /** Command name (e.g. 'todo', 'workspace'). Dot notation for subcommands. */
  name: string;
  /** One-line description for `sero help` listing. */
  summary: string;
  /** Detailed help text shown by `sero help <command>`. */
  help?: string;
  /** Parameter definitions (for help generation and validation). */
  params?: CliParam[];
  /** The handler function. */
  execute: (args: string[], context: CliContext) => Promise<CliResult>;
  /** Optional: mark as IPC-exposed (for guardrail enforcement). */
  source?: 'app' | 'ipc' | 'builtin';
}

interface CliParam {
  name: string;
  description: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  default?: unknown;
}

interface CliContext {
  workspaceId: string;
  /** Access to the container manager (if container workspace). */
  containerManager?: ContainerManager;
  /** Access to workspace manager. */
  workspaceManager: WorkspaceManager;
}

interface CliResult {
  output: string;
  exitCode?: number;  // 0 = success (default), non-zero = error
}
```

### 3.4 Registration API — `registerCliTool`

A new method on `ExtensionAPI` alongside the existing `registerTool`:

```typescript
// In ExtensionAPI (Pi SDK extension interface)
interface ExtensionAPI {
  // Existing
  registerTool(def: ToolDefinition): void;
  registerCommand(name: string, def: CommandDefinition): void;

  // New
  registerCliTool(def: CliToolDefinition): void;
}

interface CliToolDefinition {
  /** CLI command name (e.g. 'todo'). Supports subcommands via spaces: 'todo list'. */
  name: string;
  /** One-line summary for compact help listing. */
  summary: string;
  /** Detailed help text with examples. Shown by `sero help <command>`. */
  help?: string;
  /** Parameter definitions. */
  params?: CliParam[];
  /** Handler — receives parsed args and returns output string. */
  execute: (args: string[], context: CliContext) => Promise<CliResult>;
}
```

**Migration example — pi-todo-extension:**

```typescript
// BEFORE (registerTool — adds tool to agent context)
pi.registerTool({
  name: 'todo',
  description: 'Manage todo items: add, list, complete, remove...',
  parameters: Type.Object({
    action: Type.String({ ... }),
    text: Type.Optional(Type.String({ ... })),
    id: Type.Optional(Type.Number({ ... })),
  }),
  execute: async (_id, params) => { ... },
});

// AFTER (registerCliTool — no tool in context, available via `sero todo`)
pi.registerCliTool({
  name: 'todo',
  summary: 'Manage todo items',
  help: `Usage: sero todo <action> [args]

Actions:
  list              List all todos
  add <text>        Add a new todo
  complete <id>     Mark a todo as done
  remove <id>       Remove a todo

Examples:
  sero todo list
  sero todo add "Fix login bug"
  sero todo complete 3`,
  params: [
    { name: 'action', description: 'Action to perform', required: true },
    { name: 'text', description: 'Todo text (for add)', required: false },
    { name: 'id', description: 'Todo ID (for complete/remove)', required: false, type: 'number' },
  ],
  execute: async (args, ctx) => {
    const [action, ...rest] = args;
    // ... same logic, different interface
  },
});
```

**Both APIs coexist.** Packages choose which to use. No breaking changes.
Gradual migration on a per-package basis.

### 3.5 System Prompt Injection

The `sero-cli` tool alone isn't enough — the agent needs guidance on when
and how to use it. A system prompt block is injected via `before_agent_start`:

```
## Sero CLI

You have access to the `sero-cli` tool for platform operations. Use it instead
of asking the user to perform actions manually.

Quick reference (run `sero help` for full list):
  sero todo list              — List todos
  sero notes search <query>   — Search notes
  sero workspace info         — Current workspace details
  sero vcs status             — Version control status
  sero devserver list         — List running dev servers

Chain commands (one per line):
  sero todo list
  sero notes create "Summary" --content "..."

For detailed help: sero help <command>
```

This is **much smaller** than 16 individual tool schemas.

### 3.6 Built-in Commands

These commands are always registered (not from packages):

| Command | Summary | Source |
|---|---|---|
| `help` | Show available commands and usage | builtin |
| `help <command>` | Detailed help for a specific command | builtin |
| `workspace info` | Show current workspace details | builtin |
| `workspace list` | List all workspaces | builtin |
| `session info` | Show session stats (tokens, cost, model) | builtin |
| `set-title <text>` | Set session title | builtin |

### 3.7 IPC-Exposed Commands (Curated Safe Subset)

Selected IPC methods are exposed as CLI commands, giving the agent
programmatic control over Sero. **Only safe operations** are included:

| CLI Command | IPC Method | Access |
|---|---|---|
| `workspace list` | `workspace.list` | read |
| `workspace info [id]` | `workspace.getConfig` | read |
| `workspace open <id>` | `workspace.open` | write |
| `workspace close <id>` | `workspace.close` | write |
| `vcs status` | `vcs.status` | read |
| `vcs log [--limit N]` | `vcs.logEntries` | read |
| `vcs diff <from> [to]` | `vcs.diff` | read |
| `vcs checkpoint [msg]` | `vcs.create` | write |
| `vcs bookmarks` | `vcs.bookmarks` | read |
| `devserver list` | `devServer.list` | read |
| `devserver register ...` | `devServer.register` (replaces register_dev_server tool) | write |
| `devserver stop <id>` | `devServer.stop` | write |
| `editor read <path>` | `editor.readFile` | read |
| `editor list <dir>` | `editor.listFiles` | read |
| `appstate read <path>` | `appState.read` | read |
| `appstate write <path>` | `appState.write` | write |
| `terminal read [lines]` | terminal buffer read | read |

**Blacklisted** (never exposed):
- `auth.*` — credential management
- `safeStorage.*` — encryption keys
- `net.fetch` — arbitrary network requests
- `layout.*` — UI layout state
- `agent.*` — agent session control (would be recursive)
- `github.login/logout` — OAuth flows

### 3.8 Help System

**`sero help`** — compact listing:

```
Sero CLI — Platform commands for the Sero agent

BUILTIN
  help [command]        Show help for a command
  workspace <action>    Manage workspaces (list, info, open, close)
  session info          Show session stats
  set-title <text>      Set session title

VERSION CONTROL
  vcs status            Working copy status
  vcs log               Show change log
  vcs diff <from> [to]  Show diff between changes
  vcs checkpoint [msg]  Create a checkpoint
  vcs bookmarks         List bookmarks

DEV SERVERS
  devserver list        List registered dev servers
  devserver register    Register a new dev server
  devserver stop <id>   Stop a dev server

APPS
  todo <action>         Manage todo items
  notes <action>        Manage notes
  calc <expr>           Evaluate a calculation
  weight <action>       Track weight entries
  ...

Run `sero help <command>` for detailed usage.
```

**`sero help todo`** — detailed with examples:

```
todo — Manage todo items

Usage: sero todo <action> [args]

Actions:
  list              List all todos
  add <text>        Add a new todo
  complete <id>     Mark a todo as done
  remove <id>       Remove a todo

Examples:
  sero todo list
  sero todo add "Fix login bug"
  sero todo complete 3
```

## 4. Implementation Plan

### Phase 1 — Core Infrastructure

1. **`electron/cli/registry.ts`** — Command registry (register, lookup, execute)
2. **`electron/cli/parser.ts`** — Argument parser (handles quoted strings,
   flags, multi-line splitting)
3. **`electron/cli/help.ts`** — Help command generator (compact + detailed)
4. **`electron/cli/types.ts`** — Shared types (CliCommand, CliContext, CliResult, etc.)
5. **`electron/cli/tool.ts`** — The `sero-cli` tool definition (ToolDefinition
   for Pi SDK, wraps registry execution)
6. **`electron/cli/index.ts`** — Public API: `createCliTool()`, `getCliRegistry()`

### Phase 2 — IPC Bridge Commands

7. **`electron/cli/commands/workspace.ts`** — workspace list/info/open/close
8. **`electron/cli/commands/vcs.ts`** — vcs status/log/diff/checkpoint/bookmarks
9. **`electron/cli/commands/devserver.ts`** — devserver list/register/stop
10. **`electron/cli/commands/editor.ts`** — editor read/list
11. **`electron/cli/commands/appstate.ts`** — appstate read/write
12. **`electron/cli/commands/terminal.ts`** — terminal read
13. **`electron/cli/commands/session.ts`** — session info, set-title

### Phase 3 — Extension API + Migration

14. **`registerCliTool` on ExtensionAPI** — Add the new registration method to
    the Sero extension wrapper (not upstream Pi SDK — implemented as a Sero-side
    adapter that intercepts the call and routes to the CLI registry)
15. **Migrate package extensions** — Convert each `registerTool` call to
    `registerCliTool` in:
    - pi-todo-extension
    - pi-notes-extension
    - pi-calc-extension
    - pi-daily-quote
    - pi-weight-tracker
    - pi-starling-extension
    - pi-slopzilla-extension
    - pi-imagegen-extension
    - pi-plan-mode-extension
    - sero-user-feedback-plugin (question, questionnaire, interview)
16. **Remove `set_session_title` tool** — Replace with builtin `set-title` CLI command
17. **Remove `register_dev_server` tool** — Replace with `devserver register` CLI command
18. **Remove `read_terminal` tool** — Replace with `terminal read` CLI command
19. **Remove `ls` tool** — Agent can use `bash` for `ls` (or `sero editor list`)

### Phase 4 — Container Binary (Container Workspaces)

20. **`electron/cli/rpc-server.ts`** — JSON-RPC server over Unix domain socket,
    started per-workspace when container launches
21. **`cli-bin/sero-cli.ts`** — Lightweight Node.js binary that connects to the
    UDS and forwards commands. Compiled to a standalone binary and baked into the
    container image.
22. **Container image update** — Add `sero-cli` binary to the Sero container image
23. **Mount UDS** — Bind-mount the socket into the container at `/tmp/sero-cli.sock`

### Phase 5 — System Prompt + Polish

24. **Update `buildContainerPromptBlock()`** — Add CLI quick reference to
    container system prompt
25. **Update `before_agent_start` hook** — Inject CLI help summary for all workspaces
26. **Update tool creation** — Remove migrated tools from `createContainerTools()`
    and host tool lists
27. **Testing** — End-to-end tests for CLI command execution in both container
    and filesystem modes

## 5. File Layout (New Files)

```
electron/
  cli/
    index.ts              — Public API
    registry.ts           — Command registry
    parser.ts             — Argument parser
    help.ts               — Help generator
    tool.ts               — sero-cli ToolDefinition
    rpc-server.ts         — JSON-RPC over UDS (container IPC)
    types.ts              — Shared types
    commands/
      workspace.ts        — workspace subcommands
      vcs.ts              — vcs subcommands
      devserver.ts        — devserver subcommands
      editor.ts           — editor subcommands
      appstate.ts         — appstate subcommands
      terminal.ts         — terminal subcommands
      session.ts          — session subcommands

cli-bin/
  sero-cli.ts             — Container-side binary (connects to UDS)
  build.mjs               — Build script (esbuild → single binary)
```

## 6. IPC Data Flow (Updated)

For container workspaces:

```
Agent prompt
  → sero-cli tool handler (Electron main)
    → CLI Command Registry
      → [for IPC commands] existing IPC handler logic
      → [for app commands] registerCliTool handler
    → aggregated result string
  → tool result returned to agent
```

For container workspaces where agent uses bash:

```
Agent bash tool call: `sero todo list`
  → container exec → runs sero-cli binary in container
    → UDS → JSON-RPC → Electron host
      → CLI Command Registry → handler
    → JSON-RPC response → sero-cli binary → stdout
  → bash tool captures stdout → returns to agent
```

## 7. Invocation Identity Model

Every CLI command execution carries an **invocation context** that identifies
who is calling, from where, and under what constraints. This is critical because
the same command registry serves three distinct callers with different trust
levels.

### 7.1 Invocation Context

```typescript
interface CliInvocation {
  /** Which workspace the command targets. Always present. */
  workspaceId: string;
  /** Active agent session (null for user-terminal calls). */
  sessionId: string | null;
  /** Current agent turn (null for user-terminal / between turns). */
  turnId: string | null;
  /** How the command was invoked. */
  source: CliSource;
  /** AbortSignal from the parent tool call (for cancellation). */
  signal?: AbortSignal;
}

type CliSource =
  | 'tool'      // Agent called the sero-cli tool directly
  | 'bash'      // Agent ran `sero <cmd>` via bash inside a container
  | 'terminal'; // User typed `sero <cmd>` in an interactive terminal
```

### 7.2 How source is determined

| Entry point | source | sessionId | turnId |
|---|---|---|---|
| `sero-cli` tool handler (§3.1) | `'tool'` | from pool entry | from active turn |
| Container binary via UDS (§3.2) | `'bash'` | attached by RPC server from active session for that workspace | from active turn if streaming, else null |
| User types in interactive terminal | `'terminal'` | null | null |

The RPC server (host side of the Unix domain socket) resolves `sessionId` by
looking up which agent session is currently active for the given `workspaceId`
in the session pool. If no session is active (user just has a terminal open),
`sessionId` is null.

`turnId` is set only when the agent is mid-turn (streaming). The RPC server
checks `session.agent.state.isStreaming` to decide. This matters for rate
limiting (§7.3) which is per-turn.

### 7.3 Guardrail enforcement by source

| Guardrail | `tool` | `bash` | `terminal` |
|---|---|---|---|
| IPC blacklist (§3.7) | ✅ enforced | ✅ enforced | ✅ enforced |
| Per-turn rate limit | ✅ enforced (50/turn) | ✅ enforced (shared budget) | ❌ no limit |
| Per-command timeout | ✅ enforced | ✅ enforced | ❌ no timeout |
| Output truncation | ✅ 50KB / 2000 lines | ✅ 50KB / 2000 lines | ❌ full output |
| Write-command confirmation | ❌ no (agent has autonomy) | ❌ no | ❌ no |
| Abort signal propagation | ✅ from tool signal | ✅ from active session abort | ❌ n/a |

Key principle: **`tool` and `bash` share the same trust level** — both are the
agent acting autonomously. The rate limit budget is shared: if the agent uses 30
commands via `sero-cli` tool calls and then runs `sero todo list` via bash,
that's 31 against the same 50/turn cap.

`terminal` is the user themselves — no rate limiting, no truncation, no timeouts.

### 7.4 Rate limiting mechanics

```typescript
// Tracked per workspace + turn, stored on the session pool entry
interface TurnBudget {
  turnId: string;
  commandCount: number;
}
```

- Budget resets when `turnId` changes (new agent turn).
- When `commandCount >= 50`, commands return a hard error:
  `"Rate limit: 50 CLI commands per turn exceeded. Wait for the next turn."`
- The `help` command is exempt from rate limiting (read-only, necessary for
  self-correction).

## 8. Chain Semantics

### 8.1 Multi-command execution model

The `sero-cli` tool accepts multi-line input. Each non-empty line is one
command. Commands execute **sequentially, top to bottom**.

### 8.2 Error behaviour: fail-fast with partial output

On the first command that returns a non-zero exit code, execution **stops**.
The tool returns all output accumulated so far, including the failing command's
error, so the agent has full context for self-correction.

This matches the mental model of `set -e` in shell scripts and is consistent
with how the existing bash tool treats non-zero exits (it throws, surfacing the
error to the agent).

**Rationale for fail-fast over continue-all:**
- Commands in a chain are usually dependent (`sero vcs status` then
  `sero vcs checkpoint "fix"` — no point checkpointing if status failed).
- Continue-all would require the agent to parse a status table to find which
  commands failed, adding complexity and error-prone parsing.
- Fail-fast gives the agent a clear signal: "everything above this line
  succeeded, this line failed, nothing below ran."

### 8.3 Output format

```
$ sero todo list
- [ ] Fix login bug (#1)
- [x] Update README (#2)

$ sero notes create "Summary"
Created note: Summary (id: 42)

$ sero vcs checkpoint "post-cleanup"
ERROR: No file changes to checkpoint.
[command 3/4 failed with exit code 1 — remaining commands skipped]
```

Rules:
- Each command's output is prefixed with `$ sero <command>` (echoed input).
- A blank line separates commands.
- On failure, the error line is followed by a bracketed summary showing
  position and skip count.
- On full success (all commands pass), no summary footer is added — the
  output speaks for itself.

### 8.4 Single-command shorthand

If the input contains no newlines, it is treated as a single command. The
output has no `$ sero ...` prefix echo (unnecessary noise for one command).
This keeps simple calls clean:

```
Input:  "todo list"
Output: "- [ ] Fix login bug (#1)\n- [x] Update README (#2)"
```

## 9. Timeout Budget Model

### 9.1 Two-level timeout hierarchy

```
┌─────────────────────────────────────────────┐
│  Batch timeout (tool-level)                 │
│  Default: 120s — set via tool `timeout` param│
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ cmd 1    │ │ cmd 2    │ │ cmd 3    │    │
│  │ 30s max  │ │ 30s max  │ │ 30s max  │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                             │
│  Elapsed time is tracked. Each command gets │
│  min(per_cmd_limit, batch_remaining).       │
└─────────────────────────────────────────────┘
```

| Level | Default | Configurable | Source |
|---|---|---|---|
| **Batch** (entire tool call) | 120s | Yes — `timeout` param on the `sero-cli` tool | Agent chooses per-call |
| **Per-command** | 30s | No (fixed cap) | Hardcoded |

### 9.2 Timeout allocation algorithm

```typescript
function commandTimeout(
  perCommandLimit: number,  // 30s
  batchDeadline: number,    // absolute timestamp
): number {
  const batchRemaining = batchDeadline - Date.now();
  if (batchRemaining <= 0) throw new TimeoutError('Batch timeout exceeded');
  return Math.min(perCommandLimit * 1000, batchRemaining);
}
```

For each command in a chain:
1. Compute `batchRemaining = batchDeadline - now`.
2. If `batchRemaining <= 0`, stop immediately with a timeout error (same
   format as chain error — show partial output + timeout message).
3. Otherwise, run the command with `timeout = min(30s, batchRemaining)`.
4. If the command itself times out, treat as a non-zero exit and apply
   fail-fast (§8.2).

### 9.3 Examples

| Scenario | Batch timeout | Commands | Behaviour |
|---|---|---|---|
| 3 fast commands | 120s (default) | Each takes <1s | All succeed, ~3s total |
| 1 slow command | 120s | Takes 45s | Fails at 30s (per-command cap) |
| 10 commands, tight batch | 20s via `timeout: 20` | Each takes 3s | Commands 1-6 succeed (18s), command 7 gets 2s remaining, may timeout |
| Agent omits timeout | 120s (default) | Any | Normal operation |

### 9.4 Timeout errors

```
$ sero some-slow-command
ERROR: Command timed out after 30s
[command 2/5 timed out — remaining commands skipped]
```

Timeout errors are **non-retriable within the same chain**. The agent can
retry the individual command in a new `sero-cli` call if needed.

### 9.5 Source-specific timeout behaviour

| Source | Batch timeout | Per-command timeout |
|---|---|---|
| `tool` | From tool `timeout` param (default 120s) | 30s |
| `bash` | Inherited from bash tool's own timeout | 30s |
| `terminal` | None | None |

When invoked via `bash`, the container binary itself has no timeout — it
inherits whatever timeout the bash tool applied to the `container exec`
call. The per-command 30s limit still applies on the host side (the RPC
server enforces it).

## 10. Guardrails Summary

| # | Guardrail | Enforcement point |
|---|---|---|
| G1 | IPC namespace blacklist | Registry — `register()` rejects blacklisted prefixes |
| G2 | Per-turn rate limit (50 commands) | Tool handler + RPC server, keyed by `(workspaceId, turnId)` |
| G3 | Output truncation (50KB / 2000 lines) | Tool handler (for `tool` source), RPC response serializer (for `bash`) |
| G4 | Batch timeout (default 120s) | Tool handler — wraps entire chain execution |
| G5 | Per-command timeout (30s cap) | Registry `execute()` wrapper — enforced for all sources except `terminal` |
| G6 | No recursive agent calls | Blacklist — `agent.*` namespace cannot be registered |
| G7 | Abort signal propagation | Tool handler passes `signal` through invocation context |

## 11. Migration Strategy

**Phase 3 is non-breaking.** Both `registerTool` and `registerCliTool` work
simultaneously. Packages migrate one at a time. During migration:

- A package that still uses `registerTool` → tool appears in agent context as before
- A package migrated to `registerCliTool` → tool removed from context, available via `sero <cmd>`
- Both can coexist in the same session

**Recommended migration order:**
1. Low-risk apps first (todo, notes, calc, daily_quote, weight)
2. Media and creative apps (starling, slopzilla)
3. Complex apps (imagegen, plan-mode, user-feedback)
4. Builtin tools last (ls, read_terminal, register_dev_server, set_session_title)

## 12. Open Questions

1. **Container binary format** — Compile to a static binary via `pkg` or
   `esbuild` + Node SEA? Or just install Node in the container and run the
   script directly (simpler, Node is already in the image)?
2. **Multi-line vs single-line** — Should the tool accept multi-line command
   strings (one command per line) or an array of commands? Multi-line is more
   natural for the LLM.
3. **Streaming** — Should long-running CLI commands stream output back, or
   buffer until complete? Buffering is simpler and matches current tool behaviour.

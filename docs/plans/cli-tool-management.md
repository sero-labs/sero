# Sero CLI Tool Management — Specification

> **Status:** Draft
> **Date:** 2026-02-23
> **Goal:** Replace the majority of agent tool definitions with a single `sero` CLI,
> reducing context window bloat while giving the agent more power through
> composable shell commands and programmatic control over Sero itself.

---

## 1. Motivation

### The Problem

Every tool registered with the agent gets serialised into the LLM context as a
tool definition (name, description, JSON schema). As extensions grow, so does
the tool list:

| Category | Tools | Approx. tokens |
|---|---|---|
| Core coding (bash, read, write, edit) | 4 | ~800 |
| Workspace (ls, read_terminal, register_dev_server) | 3 | ~400 |
| System (set_session_title) | 1 | ~100 |
| Extensions (notes, todo, calc, quote, weight, plan_todos, spotify, starling, slopzilla, generate_image, question, questionnaire, interview) | 13 | ~2,600 |
| **Total** | **~21** | **~3,900** |

Beyond raw token cost, every tool definition is noise that the model must reason
over when deciding which tool to call. More tools → more ambiguity → worse tool
selection → more wasted turns.

### The Opportunity

Container workspaces already execute everything via `bash`. The agent is fluent
in shell commands. Instead of 21 tool definitions, we can provide:

- **4 core tools** (bash, read, write, edit) — structured I/O that genuinely
  benefits from typed schemas
- **1 CLI** (`sero`) — everything else, discoverable via `sero help`

This also unlocks:

1. **Multi-step composition** — `sero notes add ... && sero todo add ...` in
   one bash call eliminates intermediate round-trips
2. **Self-documenting** — `sero help <command>` replaces static tool
   descriptions with dynamic, detailed help text
3. **Extensibility** — new commands don't change the tool schema
4. **Sero meta-control** — the agent can programmatically control the app itself
   (model switching, thinking level, workspace management, etc.)

### Before & After

```
BEFORE (per turn):
  System prompt: ...tools... [21 tool definitions, ~3,900 tokens]
  Agent: calls notes({ action: "add", title: "...", body: "..." })
  → round trip
  Agent: calls todo({ action: "add", text: "..." })
  → round trip
  Agent: calls set_session_title({ title: "..." })
  → round trip
  (3 tool calls = 3 LLM round-trips)

AFTER (per turn):
  System prompt: ...tools... [4 tool definitions, ~800 tokens]
  Agent: calls bash({
    command: 'sero notes add --title "..." --body "..." && \
             sero todo add "..." && \
             sero title "..."'
  })
  → 1 round trip
  (1 bash call = 1 LLM round-trip)
```

---

## 2. Architecture Overview

```
┌─ Container ──────────────────────────────────┐
│                                              │
│  Agent (LLM)                                 │
│    │                                         │
│    ├─ bash tool ──► sero <command>           │
│    ├─ read tool                              │
│    ├─ write tool                             │
│    └─ edit tool                              │
│                                              │
│  sero CLI binary                             │
│    ├─ File-based commands ──► .sero/ state   │
│    ├─ Host API commands ─────────────────────┼──► Sero Host API
│    └─ Control commands ──────────────────────┼──► Sero Host API
│                                              │
└──────────────────────────────────────────────┘

┌─ Electron Main Process ─────────────────────┐
│                                              │
│  Sero Host API (HTTP server)                 │
│    ├─ /api/ext/*        Extension actions    │
│    ├─ /api/control/*    App control (IPC)    │
│    └─ /api/ask          User interaction     │
│                                              │
│  Existing IPC handlers                       │
│    ├─ Agent pool                             │
│    ├─ Workspace manager                      │
│    └─ Container manager                      │
│                                              │
└──────────────────────────────────────────────┘
```

### Command Tiers

The CLI organises commands into three tiers based on trust level:

| Tier | Description | Auth | Examples |
|---|---|---|---|
| **Local** | File-based state, no host communication | None | `notes`, `todo`, `calc`, `weight`, `quote` |
| **Host** | Requires host API call (external APIs, UI) | Session token | `spotify`, `image`, `starling`, `ask`, `terminal` |
| **Control** | Mutates Sero app state via Electron IPC | Session token + permission guard | `control model`, `control thinking`, `control workspace`, `control tools` |

---

## 3. CLI Design

### 3.1 Installation & Distribution

The CLI is a self-contained Node.js script bundled as part of Sero. It is
**mounted read-only** into containers alongside skills and prompts:

```typescript
// In buildContainerConfig():
readOnlyMounts: [
  path.join(SERO_AGENT_DIR, 'skills'),
  path.join(SERO_AGENT_DIR, 'prompts'),
  path.join(SERO_AGENT_DIR, 'cli'),       // ← NEW
],
```

A symlink or shell wrapper at `/usr/local/bin/sero` inside the container points
to the mounted script:

```bash
# Created during container setup (lifecycle.ts)
ln -sf /path/to/mounted/cli/sero.mjs /usr/local/bin/sero
```

For **filesystem workspaces**, the same script runs directly on the host via
Node.js. See §7 for details.

### 3.2 Command Structure

```
sero <command> [subcommand] [args] [flags]
sero help [command]
sero --version
```

**Global flags:**

| Flag | Description |
|---|---|
| `--help`, `-h` | Show help for the command |
| `--json` | Output as JSON (for programmatic parsing) |
| `--quiet`, `-q` | Suppress non-essential output |

### 3.3 Help System

The help system is the primary way the agent discovers CLI capabilities. It
replaces static tool descriptions in the system prompt.

#### Top-level help

```
$ sero help

Sero CLI — workspace tools, integrations, and app control.

USAGE
  sero <command> [subcommand] [args] [flags]
  sero help <command>

COMMANDS
  notes        Manage workspace notes (add, edit, list, pin, remove, show)
  todo         Manage todo list (add, toggle, list, clear)
  calc         Evaluate math expressions
  quote        Daily inspirational quote
  weight       Track weight over time
  plan         Plan mode and task management
  spotify      Control Spotify playback and playlists
  image        Generate images with AI
  starling     View Starling Bank account info
  slopzilla    View SlopZilla history and bookmarks
  ask          Ask the user a question with options
  survey       Ask the user multiple questions
  interview    Ask the user open-ended questions
  title        Set the session title
  terminal     Read recent terminal output
  dev-server   Register a dev server with the host
  control      Control Sero app settings (model, thinking, tools, workspace)

GLOBAL FLAGS
  --help, -h    Show help for a command
  --json        Output as JSON
  --quiet, -q   Suppress non-essential output

EXAMPLES
  sero notes add --title "API Design" --body "REST vs GraphQL comparison"
  sero todo add "Fix login bug" && sero todo add "Write tests"
  sero calc "sqrt(144) + 2^3"
  sero control model set anthropic/claude-sonnet-4-6
  sero help notes

Run 'sero help <command>' for detailed usage of any command.
```

#### Command-level help

Each command provides detailed help with all subcommands, flags, and examples:

```
$ sero help notes

Manage workspace notes — create, edit, search, and organise notes.

USAGE
  sero notes <action> [flags]

ACTIONS
  list                List all notes (newest first)
  add                 Create a new note
  show <id>           Show full note content
  edit <id>           Edit an existing note
  remove <id>         Remove a note
  pin <id>            Pin a note to the top
  unpin <id>          Unpin a note

FLAGS
  --title <text>      Note title (required for add)
  --body <text>       Note body (required for add, optional for edit)
  --query <text>      Search filter (for list)
  --id <number>       Note ID (alternative to positional arg)
  --json              Output as JSON

EXAMPLES
  sero notes list
  sero notes list --query "design"
  sero notes add --title "Meeting Notes" --body "Discussed Q1 roadmap..."
  sero notes show 3
  sero notes edit 3 --body "Updated: added action items"
  sero notes pin 1
  sero notes remove 5
```

```
$ sero help control

Control Sero app settings — model, thinking level, tools, and workspaces.

USAGE
  sero control <resource> <action> [args]

RESOURCES
  model               Manage the active LLM model
    show              Show current model (provider/id)
    set <model>       Set model (e.g. "anthropic/claude-sonnet-4-6")
    list              List available models

  thinking            Manage thinking/reasoning level
    show              Show current level
    set <level>       Set level (off, minimal, low, medium, high, xhigh)

  tools               Manage active tool set
    list              List all tools with active/inactive status
    enable <name>     Enable a tool
    disable <name>    Disable a tool
    reset             Reset to default tool set

  workspace           Manage workspaces
    list              List all workspaces with open/closed status
    info [id]         Show workspace details (default: current)
    open <id>         Open a workspace in sidebar
    close <id>        Close a workspace from sidebar

  session             Session information
    info              Show session path, token usage, cost
    title <text>      Set session display name
    compact           Trigger context compaction

  prompt              System prompt management
    show              Display current system prompt
    append <text>     Append text to system prompt for this session

PERMISSIONS
  Control commands require the SERO_CONTROL permission level.
  Some actions (model set, tools disable) are guarded by the workspace
  permission policy. See §6 for details.

EXAMPLES
  sero control model show
  sero control model set anthropic/claude-sonnet-4-6
  sero control thinking set high
  sero control tools list
  sero control tools disable starling
  sero control workspace list
  sero control session info
  sero control session compact
```

### 3.4 Output Format

**Default:** Human-readable text, designed for LLM consumption. Concise, no
decoration, no colour codes.

```
$ sero notes list
1. [pinned] API Design
   REST vs GraphQL comparison...
2. Meeting Notes
   Discussed Q1 roadmap with team...
3. Bug Triage
   Login timeout issue on Safari...

3 notes (1 pinned)
```

**JSON mode (`--json`):** Structured output for programmatic use.

```json
$ sero notes list --json
{
  "notes": [
    { "id": 1, "title": "API Design", "pinned": true, "body": "REST vs GraphQL..." },
    { "id": 2, "title": "Meeting Notes", "pinned": false, "body": "Discussed Q1..." }
  ],
  "count": 2
}
```

### 3.5 Error Handling

Errors use non-zero exit codes and write to stderr, consistent with Unix
conventions and the existing bash tool behaviour (which throws on non-zero exit,
surfacing the error to the agent):

```
$ sero notes show 999
Error: Note 999 not found.
$ echo $?
1
```

```
$ sero control model set nonexistent/model
Error: Model "nonexistent/model" not found. Run 'sero control model list' to see available models.
$ echo $?
1
```

---

## 4. Command Reference

### 4.1 Local Commands (File-Based State)

These commands read/write JSON state files in `.sero/apps/<name>/state.json`
relative to the workspace root. They require no host communication.

| Command | Replaces Tool | State Path |
|---|---|---|
| `sero notes <action>` | `notes` | `.sero/apps/notes/state.json` |
| `sero todo <action>` | `todo` | `.sero/apps/todo/state.json` |
| `sero calc <expression>` | `calc` | `.sero/apps/calc/state.json` |
| `sero quote [get\|set]` | `daily_quote` | `.sero/apps/daily_quote/state.json` |
| `sero weight <action>` | `weight` | `.sero/apps/weight/state.json` |
| `sero plan <action>` | `plan_todos` | `.sero/apps/planmode/state.json` |
| `sero slopzilla <action>` | `slopzilla` | `.sero/apps/slopzilla/state.json` |

**State format compatibility:** The CLI uses the exact same JSON schema as the
existing extensions. This means:

- Existing state files work without migration
- The UI components that read state (if any) continue to work
- Extensions and CLI can coexist during migration

### 4.2 Host API Commands

These commands require communication with the Sero Electron main process via
the Host API (see §5).

| Command | Replaces Tool | Host Endpoint |
|---|---|---|
| `sero spotify <action>` | `spotify` | `POST /api/ext/spotify` |
| `sero image generate <prompt>` | `generate_image` | `POST /api/ext/image` |
| `sero starling <action>` | `starling` | `POST /api/ext/starling` |
| `sero ask <question> --options ...` | `question` | `POST /api/ask` |
| `sero survey --questions ...` | `questionnaire` | `POST /api/survey` |
| `sero interview --questions ...` | `interview` | `POST /api/interview` |
| `sero title <text>` | `set_session_title` | `POST /api/ext/title` |
| `sero terminal [--lines N]` | `read_terminal` | `GET /api/ext/terminal` |
| `sero dev-server register <name> ...` | `register_dev_server` | `POST /api/ext/dev-server` |

#### User Interaction Commands

The `ask`, `survey`, and `interview` commands are blocking — the CLI sends a
request to the host, the host displays UI to the user, and the CLI waits for
the response:

```
$ sero ask "Which database should we use?" --options "PostgreSQL" "SQLite" "MongoDB"
> User selected: PostgreSQL
PostgreSQL
```

The bash tool's timeout parameter provides a natural timeout mechanism. The host
API also supports a `timeout` query parameter for server-side timeout.

#### Image Generation

Since CLI stdout is text-only, generated images are saved to disk:

```
$ sero image generate "A sunset over mountains" --output /workspace/sunset.png
Image saved to /workspace/sunset.png (1024x1024, 245KB)
```

The agent can then use the `read` tool to view the image if needed.

### 4.3 Control Commands (Sero App Control)

These commands expose Electron IPC methods, giving the agent programmatic
control over Sero itself. This is the most powerful tier and requires guards.

| Command | IPC Channel | Guard Level |
|---|---|---|
| `sero control model show` | `agent:getModelState` | read |
| `sero control model set <model>` | `agent:setModel` | write |
| `sero control model list` | `agent:getModelState` | read |
| `sero control thinking show` | `agent:getModelState` | read |
| `sero control thinking set <level>` | `agent:setThinkingLevel` | write |
| `sero control tools list` | `agent:getContext` | read |
| `sero control tools enable <name>` | `agent:setContextOverrides` | write |
| `sero control tools disable <name>` | `agent:setContextOverrides` | write |
| `sero control tools reset` | `agent:setContextOverrides` | write |
| `sero control workspace list` | `workspace:list` | read |
| `sero control workspace info [id]` | `workspace:getConfig` | read |
| `sero control workspace open <id>` | `workspace:open` | write |
| `sero control workspace close <id>` | `workspace:close` | write |
| `sero control session info` | `agent:getUsage` | read |
| `sero control session compact` | internal | write |
| `sero control prompt show` | `agent:getContext` | read |
| `sero control prompt append <text>` | `before_agent_start` hook | write |

#### Future Control Expansions

The control tier is designed to grow. Potential future commands:

- `sero control container restart` — restart the workspace container
- `sero control extension reload` — hot-reload extensions
- `sero control checkpoint create` — create a VCS checkpoint
- `sero control checkpoint restore <id>` — restore to a checkpoint
- `sero control window focus <panel>` — focus a UI panel

---

## 5. Host Communication

### 5.1 Sero Host API Server

The Electron main process runs a lightweight HTTP server accessible from
containers. This is the bridge between the CLI and Sero's internals.

#### Server Setup

```typescript
// New file: electron/api/server.ts

import http from 'node:http';

export interface HostApiOptions {
  sessionId: string;
  workspaceId: string;
  containerManager: ContainerManager;
  workspaceManager: WorkspaceManager;
  agentPool: Map<string, PoolEntry>;
  permissionPolicy: PermissionPolicy;
}

export function createHostApiServer(options: HostApiOptions): http.Server {
  const server = http.createServer(async (req, res) => {
    // Auth: validate session token from Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== options.sessionToken) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    // Route to handlers...
  });

  // Listen on random port, bind to localhost only
  server.listen(0, '127.0.0.1');
  return server;
}
```

#### Environment Injection

The API server URL and auth token are injected as environment variables during
container creation and command execution:

```typescript
// In ContainerManager.exec():
envParts.push(
  `SERO_API_URL=http://host.containers.internal:${apiPort}`,
  `SERO_API_TOKEN=${sessionToken}`,
  `SERO_SESSION_ID=${sessionId}`,
  `SERO_WORKSPACE_ID=${workspaceId}`,
);
```

The CLI reads these from the environment:

```typescript
const apiUrl = process.env.SERO_API_URL;
const apiToken = process.env.SERO_API_TOKEN;
```

### 5.2 API Protocol

All endpoints accept/return JSON. Standard HTTP status codes.

#### Extension Endpoints

```
POST /api/ext/:name
Content-Type: application/json
Authorization: Bearer <token>

{ "action": "list", "query": "design" }

→ 200 OK
{ "result": { "notes": [...], "count": 3 } }
```

Extension endpoints are generic — the `:name` maps to the extension name, and
the body is passed to the extension's execute function.

#### User Interaction Endpoints

```
POST /api/ask
Content-Type: application/json

{
  "question": "Which database?",
  "options": [
    { "label": "PostgreSQL", "description": "Mature, full-featured" },
    { "label": "SQLite", "description": "Lightweight, embedded" }
  ],
  "timeout": 60000
}

→ 200 OK (blocks until user responds)
{ "answer": "PostgreSQL" }
```

#### Control Endpoints

```
POST /api/control/:resource/:action
Content-Type: application/json
Authorization: Bearer <token>

{ "value": "anthropic/claude-sonnet-4-6" }

→ 200 OK
{ "result": { "model": "claude-sonnet-4-6", "provider": "anthropic" } }

→ 403 Forbidden (if permission denied)
{ "error": "Action 'model.set' is not permitted by workspace policy" }
```

### 5.3 Error Responses

```json
{
  "error": "Description of the error",
  "code": "NOT_FOUND",
  "details": {}
}
```

Standard error codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`,
`TIMEOUT`, `INTERNAL_ERROR`.

---

## 6. Permission & Guard System

### 6.1 Rationale

Exposing Electron IPC via CLI gives the agent significant power. Without guards,
the agent could:

- Switch to cheaper/weaker models mid-task
- Disable safety-relevant tools
- Close workspaces the user has open
- Trigger expensive operations (mass compaction)

The permission system provides defence-in-depth while keeping the default
experience frictionless.

### 6.2 Permission Policy

Each workspace's `.sero-workspace.json` can define a CLI permission policy:

```json
{
  "id": "my-project",
  "name": "My Project",
  "container": true,
  "cli": {
    "permissions": {
      "control.model.set": "ask",
      "control.thinking.set": "allow",
      "control.tools.disable": "deny",
      "control.workspace.close": "deny",
      "control.session.compact": "allow",
      "control.prompt.append": "allow"
    }
  }
}
```

#### Permission Levels

| Level | Behaviour |
|---|---|
| `allow` | Execute immediately, no confirmation |
| `ask` | Show confirmation dialog to user before executing |
| `deny` | Block with error message |

#### Defaults

If no policy is defined, sensible defaults apply:

| Action Pattern | Default |
|---|---|
| `control.*.show`, `control.*.list`, `control.*.info` | `allow` |
| `control.model.set` | `ask` |
| `control.thinking.set` | `allow` |
| `control.tools.enable` | `allow` |
| `control.tools.disable` | `ask` |
| `control.tools.reset` | `allow` |
| `control.workspace.open` | `allow` |
| `control.workspace.close` | `ask` |
| `control.session.compact` | `allow` |
| `control.prompt.append` | `allow` |
| All extension commands | `allow` |
| All local commands | `allow` |

#### Guard Implementation

```typescript
// In host API server:
async function checkPermission(
  action: string,
  policy: PermissionPolicy,
  askUser: (question: string) => Promise<boolean>,
): Promise<boolean> {
  const level = policy[action] ?? getDefaultLevel(action);

  switch (level) {
    case 'allow': return true;
    case 'deny': return false;
    case 'ask': return askUser(`Agent wants to: ${describeAction(action)}`);
  }
}
```

When an `ask` action is triggered, the host shows a confirmation dialog in the
Sero UI. The CLI blocks until the user responds.

### 6.3 Audit Log

All control commands are logged to `.sero/cli-audit.jsonl` in the workspace:

```jsonl
{"ts":"2026-02-23T10:30:00Z","action":"control.model.set","args":{"model":"claude-sonnet-4-6"},"result":"allowed"}
{"ts":"2026-02-23T10:30:05Z","action":"control.tools.disable","args":{"tool":"starling"},"result":"denied","reason":"policy"}
```

This provides visibility into what the agent changed and when.

---

## 7. Workspace Type Support

### 7.1 Container Workspaces (Primary)

Container workspaces are the primary target for the CLI. The CLI binary is
mounted read-only and symlinked into the PATH during container setup.

**Advantages:**
- Full isolation — CLI runs inside the sandbox
- Environment variables injected automatically
- All file-based state is within `/workspace/.sero/`
- Host API accessible via `host.containers.internal`

### 7.2 Filesystem Workspaces

Filesystem workspaces currently run Pi SDK tools directly on the host. The CLI
can also run on the host with the same security model.

**Recommendation: Support CLI on filesystem workspaces.**

Rationale:
- The CLI performs the same operations as existing tools (read/write JSON, call
  APIs) — it is no more dangerous than what `bash` already allows
- For pure local commands (notes, todos, etc.), the CLI just reads/writes files
  in `.sero/` — identical to what extensions do today
- For host API commands, the CLI communicates with the same Electron process
  that's already running
- The control commands have the same permission guards regardless of workspace
  type

**Implementation for filesystem mode:**

```typescript
// In agent.ts, when container is disabled:
const builtinTools = createCodingTools(wsPath);

// Inject SERO_* env vars into the bash tool's environment so the
// CLI can reach the host API when run via bash
```

The `SERO_API_URL` points to `http://127.0.0.1:<port>` (localhost) instead of
`host.containers.internal`.

### 7.3 Ad-hoc Container Approach (Not Recommended)

The user asked about spinning up an ephemeral container just for CLI execution
on filesystem workspaces. This is **not recommended** because:

1. **Overhead** — Container startup adds 2-5 seconds per CLI call
2. **State mismatch** — Container would need workspace mounted, adding complexity
3. **No security benefit** — The CLI's operations (file I/O, HTTP calls) don't
   benefit from container isolation
4. **Complexity** — Managing ephemeral containers alongside long-lived workspace
   containers adds significant code

The host-direct approach for filesystem workspaces is simpler, faster, and
equally safe.

---

## 8. System Prompt Changes

### 8.1 Current System Prompt (Tool Section)

Currently, all ~21 tool definitions are serialised into the system prompt by the
LLM provider SDK. Each tool includes name, description, and full JSON schema.

### 8.2 New System Prompt Addition

The container system prompt (`system-prompt.ts`) gains a CLI section:

```markdown
## Sero CLI

The `sero` command-line tool is available for workspace management,
productivity tools, integrations, and Sero app control. Use it via bash.

**Discovery:** Run `sero help` to see all available commands, or
`sero help <command>` for detailed usage of a specific command.

**Common commands:**
- `sero notes`, `sero todo` — Workspace notes and todos
- `sero ask "question" --options "A" "B"` — Ask the user a question
- `sero control model set <model>` — Switch LLM model
- `sero control session info` — View token usage and cost

**Tips:**
- Chain commands: `sero notes add --title "X" --body "Y" && sero todo add "Z"`
- Use `--json` for structured output: `sero notes list --json`
- Use `--quiet` to suppress non-essential output
```

This replaces ~3,100 tokens of tool definitions with ~200 tokens of guidance.
The agent calls `sero help` on first use to discover the full command set (the
output is cached across turns via normal context).

### 8.3 Retained Native Tools

Only 4 tools remain as native tool definitions:

| Tool | Reason |
|---|---|
| `bash` | Vehicle for CLI calls; complex schema (command, timeout) |
| `read` | Returns images as base64 content blocks; offset/limit pagination |
| `write` | Atomic file creation with parent directories |
| `edit` | Fuzzy text matching, diff output, BOM handling |

These tools benefit from structured input/output that can't be replicated as
effectively via CLI stdout.

---

## 9. Plan Mode Adaptation

Plan mode (`pi-plan-mode-extension`) currently uses `pi.setActiveTools()` to
restrict available tools. In the CLI model:

### Option A: Keep plan mode as native extension (Recommended for MVP)

Plan mode's core value is **tool filtering** — a meta-operation. The extension
continues to call `pi.setActiveTools()` to restrict the 4 native tools. CLI
commands don't need filtering because they're invoked via `bash`, and the bash
tool can be disabled/enabled by the plan mode extension.

When plan mode is active:
- Native tools: `bash` (read-only commands only), `read`
- CLI: Available via bash (but bash is restricted to safe commands)

### Option B: CLI-native plan mode (Future)

```bash
$ sero plan start
Plan mode enabled. Read-only tools active.

$ sero plan set "Step 1: Analyse auth module" "Step 2: Refactor tokens"
Plan created (2 steps)

$ sero plan complete 1
✓ Step 1 completed (1/2)

$ sero plan execute
Execution mode enabled. Full tool access restored.
```

The `sero plan start` command calls the host API to invoke
`pi.setActiveTools()` on the agent session.

---

## 10. Extension Integration

### 10.1 How Extensions Register CLI Commands

Extensions that want to provide CLI commands register them via a new
`pi.registerCliCommand()` API:

```typescript
// In an extension:
pi.registerCliCommand('myext', {
  description: 'My custom extension',
  subcommands: {
    list: { description: 'List items', handler: async (args) => { ... } },
    add: { description: 'Add item', handler: async (args) => { ... } },
  },
});
```

The CLI discovers available commands by reading a manifest file written by the
extension loader:

```
.sero/cli/manifest.json
{
  "commands": {
    "notes": { "type": "local", "description": "..." },
    "spotify": { "type": "host", "endpoint": "/api/ext/spotify", "description": "..." },
    "myext": { "type": "host", "endpoint": "/api/ext/myext", "description": "..." }
  }
}
```

For the initial implementation, all built-in extension commands are hardcoded in
the CLI. The manifest-based approach is a future enhancement for third-party
extensions.

### 10.2 Coexistence During Migration

During the migration period, both tool and CLI interfaces can coexist:

1. **Phase 1:** CLI is available alongside existing tools. Agent can use either.
   System prompt mentions CLI as preferred.
2. **Phase 2:** Extension tools are removed from the tool registry. Agent uses
   CLI exclusively. Extensions still run server-side for host API handling.
3. **Phase 3:** Extensions that are purely file-based (notes, todo, etc.) are
   replaced entirely by the CLI. Extensions that need host APIs (spotify, image)
   keep a thin server-side handler.

---

## 11. Implementation Plan

### Phase 1: Core CLI + Local Commands

**Scope:** File-based commands only, no host API.

1. Create `packages/sero-cli/` package
   - CLI entry point with command parser (no external deps — use Node built-ins)
   - Help system with `sero help` and `sero help <command>`
   - Local commands: `notes`, `todo`, `calc`, `quote`, `weight`, `slopzilla`
   - State file I/O matching existing extension JSON schemas
   - `--json` output mode
2. Build step produces `sero.mjs` (single file, bundled)
3. Mount into containers via `readOnlyMounts`
4. Symlink in container PATH during setup
5. Update system prompt to mention CLI
6. **Do not remove existing tools yet** — coexistence period

### Phase 2: Host API + Extension Commands

**Scope:** Host API server, host-dependent commands.

1. Create `electron/api/server.ts` — lightweight HTTP API server
2. Start API server during app init, inject URL/token into containers
3. Add host API commands: `spotify`, `image`, `starling`, `ask`, `survey`,
   `interview`, `title`, `terminal`, `dev-server`
4. Add user interaction flow (blocking ask/survey/interview)
5. Test cross-container communication

### Phase 3: Control Commands + Permission System

**Scope:** Sero app control via CLI, permission guards.

1. Implement control endpoints bridging to Electron IPC
2. Add permission policy to `.sero-workspace.json`
3. Implement `ask` permission level with UI confirmation dialog
4. Add audit logging
5. Control commands: `model`, `thinking`, `tools`, `workspace`, `session`,
   `prompt`

### Phase 4: Tool Removal + Optimisation

**Scope:** Remove extension tools, optimise context.

1. Remove extension tool registrations (notes, todo, calc, etc.)
2. Remove container-specific tools that moved to CLI (ls, read_terminal,
   register_dev_server, set_session_title)
3. Update plan mode to work with CLI-only model
4. Benchmark: measure context size reduction, turn count, latency
5. Update system prompt to remove tool-specific instructions

### Phase 5: Extension CLI Registration (Future)

**Scope:** Dynamic command registration for third-party extensions.

1. Add `pi.registerCliCommand()` API
2. Manifest file generation during extension loading
3. CLI reads manifest for dynamic command discovery
4. Help system includes dynamically registered commands

---

## 12. Open Questions

1. **Should `read` and `write` move to CLI too?** They benefit from structured
   output (image base64, diff details), but `cat` and file redirection are
   close equivalents. Keeping them as native tools feels right for now.

2. **Cache `sero help` output?** The agent will call `sero help` on first use.
   The output enters the context and is available for subsequent turns. Should
   we inject it preemptively in the system prompt instead? Probably not — it's
   better to let the agent pull it on demand.

3. **Should the CLI support pipes?** e.g., `sero notes list | grep "design"`.
   Since commands run in bash, pipes work naturally. No special support needed.

4. **WebSocket vs HTTP for blocking commands?** HTTP long-polling is simpler and
   sufficient. WebSocket would be needed only if we want bidirectional streaming,
   which isn't required for v1.

5. **Control command scope:** Should some control commands be session-scoped
   (e.g., model changes apply only to the current session) or global? Currently,
   model and thinking changes are session-scoped in Sero, which is correct.

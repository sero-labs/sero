
Conversation with Claude Opus - 12 Feb 2026.....

My question:
I'm trying to get my head around the model for how to handle sessions/workspaces so that the cwd is handled correctly. 
Sero currently allows chat sessions, but eventually needs to implement sandboxed dev environments, self-contained apps and will be used for many things for general life/business/wealth management.
PI coding agent also supports /slash-commands and @path/file references, so I don't think having a single workspace is a good idea, particularly if within it are hundreds of individual projects (many dev projects will have similar folders/file names), but I want general information to be available everywhere.
I need a way to handle this logically and intuitively.


Claudes response

# Sero — Workspace & Session Management Specification

**Version:** 0.1.0
**Status:** Draft

---

## 1. Overview

Sero is a personal AI assistant that supports chat sessions, sandboxed development environments, and self-contained applications across a broad range of domains — development, business, wealth management, and general life management.

This specification defines how Sero manages **workspaces**, **environments**, and **sessions** to provide intuitive context scoping, unambiguous file resolution, and cross-domain awareness without collision.

### 1.1 Design Principles

- **Uniform model** — there is no "special" global workspace. All workspaces are peers with identical behaviour.
- **Composite environments** — multiple workspaces can be open simultaneously, like VS Code multi-root workspaces.
- **Explicit session binding** — every session (chat, terminal, sandbox) targets exactly one workspace for command execution and file resolution.
- **Cross-workspace awareness** — the AI has visibility into all open workspaces for context, even though execution is scoped to one.
- **Low friction** — lightweight tasks should not require workspace creation. A default scratchpad workspace exists for ad-hoc work.

---

## 2. Directory Structure

```
~/.sero-ui/
├── agent/                              # Agent-level config & state
│   ├── settings.json                   # Global settings, preferences, API keys
│   ├── projects.json                   # Registry of all known workspaces
│   ├── skills/                         # Agent-level skills/tools
│   ├── sessions/
│   │   ├── active/                     # Currently open sessions
│   │   │   └── {sessionId}.jsonl
│   │   └── archive/                    # Completed/suspended sessions
│   │       └── {sessionId}.jsonl
│   └── logs/                           # Session logs, audit trail
│       └── {sessionId}/
│           └── transcript.log
│
└── workspaces/
    ├── scratchpad/                     # Default workspace for ad-hoc tasks
    │   ├── .sero-workspace.json
    │   └── ...
    ├── global/                         # User's general knowledge & data
    │   ├── .sero-workspace.json
    │   ├── knowledge/
    │   ├── finance/
    │   ├── contacts/
    │   └── templates/
    ├── trading-platform/
    │   ├── .sero-workspace.json
    │   ├── apps/
    │   │   ├── bond-grid/
    │   │   └── swap-grid/
    │   └── shared/
    └── sero-dev/
        ├── .sero-workspace.json
        └── src/
```

### 2.1 Agent Directory (`~/.sero-ui/agent/`)

Stores all agent-level configuration and state that is not specific to any workspace.

| Path | Purpose |
|---|---|
| `config.json` | User preferences, defaults, AI model config, API keys |
| `projects.json` | Registry mapping workspace IDs to paths and metadata |
| `skills/` | Agent-level skills available in all sessions |
| `sessions/active/` | State files for currently open sessions |
| `sessions/archive/` | State files for suspended/completed sessions |
| `logs/` | Per-session transcripts and audit logs |

### 2.2 Workspace Directories (`~/.sero-ui/workspaces/{workspaceId}/`)

Each workspace is a self-contained directory with a `.sero-workspace.json` at its root. The workspace ID is the directory name and must be unique.

Two workspaces are created by default on first run:

- **`scratchpad`** — for ad-hoc tasks that don't warrant a named workspace.
- **`global`** — a conventional home for cross-cutting personal data (knowledge, finance, contacts). It is an ordinary workspace with no special privileges.

---

## 3. Workspaces

### 3.1 Workspace Definition

A workspace is a scoped domain with its own root directory, configuration, and optional skills. It represents a bounded context — a project, a life domain, or a collection of related work.

### 3.2 Workspace Config (`.sero-workspace.json`)

```json
# ~/.sero-ui/workspaces/trading-platform/.sero-workspace.json

id: trading-platform
name: Trading Platform
description: Bond & Swap trading applications — UI layer

# Default cwd when a new session targets this workspace
defaultCwd: /

# Context hints for the AI — loaded when this workspace is open
contextHints:
  - "TypeScript/React frontend with Piral micro-frontend framework"
  - "SignalR for real-time streaming, .NET 8 Core microservices"
  - "ag-grid for data grids, handling 100k+ records/sec"

# Workspace-specific skills/tools
skills:
  - ./skills/grid-patterns
  - ./skills/signalr-helpers

# Files/dirs to always include in AI context when workspace is open
contextFiles:
  - ./docs/architecture.md
  - ./shared/types/

# Files/dirs to exclude from AI indexing
exclude:
  - node_modules
  - dist
  - "*.lock"

tags:
  - work
  - development
  - finance
```

### 3.3 Workspace Registry (`~/.sero-ui/agent/projects.json`)

```json
workspaces:
  - id: scratchpad
    path: ~/.sero-ui/workspaces/scratchpad
    autoOpen: true

  - id: global
    path: ~/.sero-ui/workspaces/global
    autoOpen: true

  - id: trading-platform
    path: ~/.sero-ui/workspaces/trading-platform
    autoOpen: false

  - id: sero-dev
    path: ~/.sero-ui/workspaces/sero-dev
    autoOpen: false
```

`autoOpen: true` means the workspace is opened into the composite environment on launch.

---

## 4. Composite Environment

The composite environment is the set of workspaces currently open in a Sero session. It governs what the AI is aware of and what is available for cross-workspace references.

```
┌───────────────────────────────────────────────────┐
│  Composite Environment                            │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ global   │  │ scratch  │  │ trading-       │  │
│  │          │  │ pad      │  │ platform       │  │
│  └──────────┘  └──────────┘  └────────────────┘  │
│                                                   │
│  Sessions (each bound to ONE workspace):          │
│  ├─ Chat #1 ──────────────→ trading-platform      │
│  ├─ Chat #2 ──────────────→ global                │
│  ├─ Terminal #1 ──────────→ sero-dev              │
│  └─ Sandbox #1 ──────────→ trading-platform       │
└───────────────────────────────────────────────────┘
```

### 4.1 Opening & Closing Workspaces

```
/workspace open trading-platform      # Add to composite
/workspace close trading-platform     # Remove from composite
/workspace list                       # Show all known workspaces
/workspace list --open                # Show currently open workspaces
/workspace create my-new-project      # Create new workspace
```

Closing a workspace does not destroy sessions bound to it — those sessions continue but lose cross-workspace visibility from other workspaces into theirs.

### 4.2 AI Context in the Composite

When processing a message in any session, the AI receives:

1. **Full context** from the session's bound workspace (files, skills, contextHints).
2. **Summary context** from all other open workspaces (name, description, contextHints, key metadata).
3. **Agent-level context** from `~/.sero-ui/agent/` (config, global skills).

This means a session bound to `trading-platform` can still reference concepts from `global` or `sero-dev` — the AI knows about them — but file operations and cwd resolve against `trading-platform`.

---

## 5. Sessions

### 5.1 Session Types

| Type | Description | Has cwd | Sandboxed |
|---|---|---|---|
| `chat` | Conversational AI session | Yes | No |
| `terminal` | Shell/command execution | Yes | No |
| `sandbox` | Isolated dev environment | Yes | Yes |
| `app` | Self-contained application | Optional | Yes |

### 5.2 Session Binding

Every session is bound to exactly one workspace at creation time. This binding is **permanent for the session's lifetime**.

```
User creates new session
  │
  ├─ Multiple workspaces open?
  │   ├─ Yes → Infer from user input or present picker
  │   └─ No  → Bind to the only open workspace
  │
  ├─ Set cwd = workspace defaultCwd (or last used cwd)
  │
  └─ Session is live
```

If a conversation shifts to a different workspace's domain, the user **forks** a new session rather than re-targeting. This avoids ambiguity where `@file.ts` meant different things at different points in the history.

```
/fork sero-dev       # Fork current chat into a new session bound to sero-dev
                     # Carries conversation context, rebinds cwd
```

### 5.3 Session State

```json
# ~/.sero-ui/agent/sessions/active/{sessionId}.json

id: a1b2c3d4
type: chat
workspace: trading-platform
cwd: /apps/bond-grid
createdAt: 2026-02-12T10:30:00Z
updatedAt: 2026-02-12T11:45:00Z
title: "Fix row flash animation on bond grid"

# Composite snapshot — which workspaces were open
compositeWorkspaces:
  - global
  - scratchpad
  - trading-platform

# Session-specific context (pinned files, notes)
pinnedContext:
  - @/apps/bond-grid/src/components/Grid.tsx
  - @ws:global/knowledge/ag-grid-patterns.md
```

### 5.4 Session Lifecycle

```
  ┌──────────┐
  │ Created  │
  └────┬─────┘
       │
  ┌────▼─────┐     /suspend
  │  Active  │─────────────────┐
  └────┬─────┘                 │
       │                  ┌────▼──────┐
       │                  │ Suspended │
       │                  └────┬──────┘
       │         /resume       │
       │◄──────────────────────┘
       │
       │  /close or inactivity timeout
  ┌────▼─────┐
  │ Archived │
  └──────────┘
```

- **Active** — open and receiving input.
- **Suspended** — state preserved, not consuming resources. Can be resumed.
- **Archived** — read-only. Session log preserved in `~/.sero-ui/agent/sessions/archive/`.

---

## 6. Path Resolution & File References

### 6.1 Reference Syntax

```
@file.ts                              # Relative to session cwd
@./utils/helpers.ts                   # Explicit relative to cwd
@/apps/bond-grid/file.ts              # Absolute from workspace root
@ws:global/finance/portfolio.json     # Cross-workspace reference
@ws:sero-dev/src/main.ts              # Cross-workspace reference
```

### 6.2 Resolution Order

For unqualified references (no `@ws:` prefix):

```
1. Session cwd
   └─ ~/.sero-ui/workspaces/trading-platform/apps/bond-grid/{ref}

2. Workspace root
   └─ ~/.sero-ui/workspaces/trading-platform/{ref}

3. Not found → error
```

Unqualified references **never** resolve across workspace boundaries. Cross-workspace access must use the `@ws:` prefix.

### 6.3 CWD Navigation

```
/cd apps/swap-grid            # Relative to current cwd
/cd /apps/swap-grid           # Absolute from workspace root
/cd ..                        # Parent directory
/cd                           # Reset to workspace root
/pwd                          # Print current cwd (workspace-relative)
```

CWD is always relative to the bound workspace root and cannot escape it.

---

## 7. Slash Commands

### 7.1 Workspace Management

| Command | Description |
|---|---|
| `/workspace list` | List all known workspaces |
| `/workspace list --open` | List workspaces in composite |
| `/workspace open {id}` | Add workspace to composite |
| `/workspace close {id}` | Remove workspace from composite |
| `/workspace create {id}` | Create a new workspace |
| `/workspace delete {id}` | Delete a workspace (with confirmation) |
| `/workspace info` | Show current session's bound workspace |
| `/workspace info {id}` | Show details of a specific workspace |

### 7.2 Session Management

| Command | Description |
|---|---|
| `/sessions` | List active sessions |
| `/sessions --all` | List all sessions including archived |
| `/fork {workspaceId}` | Fork current chat to a new session in another workspace |
| `/suspend` | Suspend current session |
| `/close` | Close and archive current session |
| `/pin @path` | Pin a file to session context |
| `/unpin @path` | Remove a pinned file |

### 7.3 Navigation

| Command | Description |
|---|---|
| `/cd {path}` | Change working directory within workspace |
| `/pwd` | Print working directory (workspace-relative) |
| `/ls` | List files in current cwd |
| `/ls {path}` | List files at path |

### 7.4 Development

| Command | Description |
|---|---|
| `/sandbox` | Spawn sandboxed dev environment from current cwd |
| `/sandbox --clean` | Spawn clean sandbox (no inherited state) |

---

## 8. Session Creation — Workspace Inference

When a user creates a new session with an initial message, Sero attempts to infer the target workspace before falling back to a picker.

### 8.1 Inference Strategy

```
User: "fix the bond grid row flashing issue"
  │
  ├─ 1. Keyword match against workspace contextHints and tags
  │     → "bond grid" matches trading-platform
  │
  ├─ 2. File reference match
  │     → @apps/bond-grid/... only exists in trading-platform
  │
  ├─ 3. Recent session affinity
  │     → User was last working in trading-platform
  │
  └─ 4. Ambiguous → present workspace picker
```

If the message contains no workspace-identifiable content (e.g., "hello" or "what's the weather"), bind to `scratchpad` or the most recently used workspace, depending on user preference.

---

## 9. Cross-Workspace Patterns

### 9.1 Reading Across Workspaces

Any session can **read** from other open workspaces using `@ws:` syntax:

```
# In a trading-platform session:
"Use the template from @ws:global/templates/component.tsx"
```

The AI fetches the file from the named workspace. The session's cwd does not change.

### 9.2 Writing Across Workspaces

Write operations across workspace boundaries require explicit confirmation:

```
User: "Save this component to @ws:sero-dev/src/components/Grid.tsx"
Sero: "This will write to the sero-dev workspace. Proceed? [y/n]"
```

### 9.3 Forking with Context

When forking to a different workspace, the conversation history carries over but cwd rebinds:

```
/fork sero-dev

# New session:
#   workspace: sero-dev
#   cwd: / (sero-dev root)
#   history: inherited from parent session
#   parent: a1b2c3d4
```

The forked session's state references its parent for traceability.

---

## 10. Example Workflows

### 10.1 Quick Ad-Hoc Task

```
User opens new chat → auto-binds to scratchpad
User: "Draft an email to the accountant about Q4 tax estimates"
  → Sero uses global knowledge via @ws:global/finance/ if open
  → No workspace ceremony needed
```

### 10.2 Focused Development Session

```
User: /workspace open trading-platform
User opens new chat → selects trading-platform
User: /cd apps/bond-grid
User: "The row flash animation triggers on every SignalR update,
       should only flash on new records. See @src/components/Grid.tsx"
  → Resolves to ~/.sero-ui/workspaces/trading-platform/apps/bond-grid/src/components/Grid.tsx
  → AI has full trading-platform context
```

### 10.3 Cross-Domain Research

```
User has open: global, trading-platform, personal-finance
User opens chat → binds to personal-finance
User: "Compare our investment portfolio performance against
       the trading desk P&L from @ws:trading-platform/reports/q4.csv"
  → cwd is in personal-finance
  → Cross-reads from trading-platform via @ws: prefix
  → AI synthesises across both
```

---

## 11. Future Considerations

- **Workspace templates** — predefined workspace structures for common use cases (e.g., "node-project", "research", "client-engagement").
- **Workspace linking** — formal dependency declarations between workspaces (e.g., `sero-dev` depends on patterns from `global`).
- **Shared skills** — skills that can be published from one workspace and consumed by others without duplication.
- **Remote workspaces** — workspace roots pointing to remote filesystems or cloud storage.
- **Collaboration** — multi-user access to shared workspaces with permission models.

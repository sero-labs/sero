# JJ (Jujutsu) Versioning Strategy for Sero

## Executive Summary

Integrate JJ as Sero's native version control layer, replacing/augmenting
the existing Git placeholder in the CodingWorkspace activity bar. JJ runs
**inside the workspace container** (where all file operations happen), exposed
to both the agent (Pi extension tools) and the user (React views in the
CodingWorkspace sidebar + dedicated panels).

JJ's design — immutable changes, automatic rebasing, first-class bookmarks,
operation log with undo — maps perfectly onto Sero's features:
**checkpointing (revert), bookmarking, forking, and timeline navigation.**

---

## 0. Reference Implementations

Two existing Pi extensions provide the foundation for this work:

### `jj-workflow.ts` — Command Guard Hook

A `tool_call` hook that intercepts `bash` tool calls to:
- **Block all git commands** — forces the agent to use JJ exclusively
- **Block interactive JJ commands** — prevents `jj diffedit`, `jj split -i`,
  `jj describe` (without `-m`), `jj resolve` (without `--list`), etc.
- Uses regex patterns to detect command types and returns `{ block: true, reason }`

This must be ported to Sero. The agent should never use git directly or invoke
JJ commands that open interactive editors (which don't work inside containers).

### `jj-session-binding.ts` — Session ↔ JJ Change Binding

A full extension that creates a 1:1 mapping between Pi sessions and JJ changes:

**Core features:**
- On `session_start`, creates a new JJ change (`jj new -m "session: <id>"`)
  and stores a `JjLink` record in the session via `pi.appendEntry()`
- Validates the link on every user prompt — detects drift (@ moved away)
  and orphans (change was squashed/abandoned)
- **Auto-resolves orphans** by scanning `jj op show` to find where the
  change went (squashed into another, etc.)
- **Blocks mutating JJ commands** from agent bash calls (only read-only
  commands like `log`, `diff`, `status` are allowed)
- **Auto-summarizes** sessions into JJ revision descriptions using an LLM
  (`complete()` with a sandboxed `just-bash` virtual FS)
- `/jresume` command — lists all JJ-bound sessions, lets user pick one to
  resume
- `/jrebind` command — rebinds current session to a different change ID

**TUI methods that need Sero equivalents:**

| Pi TUI (`ctx.ui.*`) | Sero Replacement |
|---|---|
| `ctx.ui.notify(msg, level)` | Toast notification system (renderer) |
| `ctx.ui.select(title, options)` | Modal select dialog or command palette |
| `ctx.ui.setStatus(key, text)` | StatusBar segment (already has workspace + agent count) |
| `ctx.ui.theme.fg(token, text)` | CSS variables (`var(--text-muted)`, etc.) — N/A for extension code, only for UI |

**Key insight:** The session-binding concept is powerful and should be a
**first-class Sero feature**, not just an extension bolt-on. Every agent
session in Sero should automatically bind to a JJ change, and the
ChatPanel header should show the bound change ID with status (active /
drifted / orphaned).

---

## 1. Why JJ Fits Sero

| JJ Concept | Sero Feature | Why It's Better Than Git |
|---|---|---|
| **Working-copy change** | Auto-checkpoint — every save is versioned | No staging area / `git add` dance |
| **Operation log** (`jj op log`) | Full undo/redo timeline | Can undo ANY operation, not just commits |
| **Bookmarks** | Named save points the user can jump to | Lightweight, no "branch" confusion |
| **`jj new`** | Fork from any point | Creates a new change on top of any revision |
| **`jj restore`** | Revert to checkpoint | Restore working copy to any previous state |
| **Conflicts as data** | Non-blocking parallel work | Agent and user can work in parallel without merge hell |
| **Git compatibility** | Push/pull to GitHub | JJ can colocate with `.git` — zero migration cost |

---

## 2. Architecture Overview

```
┌─ Renderer (React) ──────────────────────────────────────────────────┐
│                                                                      │
│  CodingWorkspace                                                     │
│   ├─ ActivityBar: [Explorer] [Search] [Version Control] [Terminal]   │
│   ├─ CodingSidebar (panel = 'vcs')                                   │
│   │    └─ VcsPanel                                                   │
│   │         ├─ ChangesList (working copy + recent changes)           │
│   │         ├─ BookmarksList                                         │
│   │         └─ QuickActions (checkpoint, restore, fork)              │
│   │                                                                  │
│   └─ EditorPanel can show:                                           │
│        ├─ TimelineView (full operation log, visual graph)            │
│        ├─ DiffView (change details, file-level diffs)                │
│        └─ ConflictResolver (when conflicts exist)                    │
│                                                                      │
│  Zustand Store: src/stores/vcs.ts                                    │
│   ├─ changes: JjChange[]         (per workspace)                     │
│   ├─ bookmarks: JjBookmark[]     (per workspace)                     │
│   ├─ operations: JjOperation[]   (per workspace)                     │
│   ├─ workingCopy: JjChange       (current)                           │
│   ├─ status: 'idle' | 'loading' | 'error'                           │
│   └─ conflicts: JjConflict[]                                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
        │                                    ▲
        │ IPC (sero:vcs:*)                   │ IPC events (sero:vcs:changed)
        ▼                                    │
┌─ Electron Main ─────────────────────────────────────────────────────┐
│                                                                      │
│  electron/vcs/                                                       │
│   ├─ types.ts          — JjChange, JjBookmark, JjOperation, etc.    │
│   ├─ jj-runner.ts      — executes jj commands inside container       │
│   ├─ jj-parser.ts      — parses jj CLI JSON output → typed objects   │
│   ├─ vcs-manager.ts    — orchestrator (per-workspace state, polling) │
│   └─ index.ts          — public API                                  │
│                                                                      │
│  electron/ipc/vcs.ts   — IPC handlers                                │
│                                                                      │
│  JJ commands run via:                                                │
│    ContainerManager.exec(workspaceId, 'jj <command> --color=never')  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
        │
        │ container exec
        ▼
┌─ Container (Linux VM) ──────────────────────────────────────────────┐
│                                                                      │
│  /workspace/                                                         │
│   ├─ .jj/              — JJ repo (auto-initialised)                 │
│   ├─ .git/             — colocated Git repo (optional, for push)     │
│   └─ ... workspace files                                             │
│                                                                      │
│  jj binary installed in container image (sero-node)                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌─ Pi Extension (packages/pi-vcs-extension/) ─────────────────────────┐
│                                                                      │
│  Agent tools:                                                        │
│   ├─ vcs_status     — show working copy status                       │
│   ├─ vcs_checkpoint — describe + snapshot current state              │
│   ├─ vcs_log        — show change history                            │
│   ├─ vcs_restore    — revert to a previous change                    │
│   ├─ vcs_bookmark   — create/list/delete bookmarks                   │
│   ├─ vcs_fork       — create new change from any revision            │
│   ├─ vcs_diff       — show diff between changes                      │
│   └─ vcs_undo       — undo last operation                            │
│                                                                      │
│  These call jj directly (inside container via bash tool,             │
│  or via dedicated IPC when running in Sero)                          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Integration Layers

### 3.1 Container Layer — JJ Binary

JJ must be available inside every workspace container.

**Changes to container image (`sero-node`):**
- Install `jj` binary in the container image build (Dockerfile)
- Configure JJ defaults: `jj config set --user ui.color "never"` (for
  machine parsing), `jj config set --user user.name "Sero"`,
  `jj config set --user user.email "sero@local"`

**Auto-initialisation (in `lifecycle.ts`):**
- After container creation, run `jj git init --colocate` in `/workspace`
  (replaces the current `git init -q`)
- This gives us JJ + Git coexistence from day one

### 3.2 Main Process Layer — VCS Manager

New module: `electron/vcs/`

**`jj-runner.ts`** — thin wrapper around `ContainerManager.exec()`:
```typescript
class JjRunner {
  constructor(private cm: ContainerManager) {}

  async run(workspaceId: string, args: string[]): Promise<JjResult> {
    const cmd = `jj ${args.join(' ')} --color=never`;
    const result = await this.cm.exec(workspaceId, cmd, '/workspace');
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }

  // Typed convenience methods:
  async log(workspaceId: string, opts?: LogOpts): Promise<JjChange[]> { ... }
  async status(workspaceId: string): Promise<JjStatus> { ... }
  async describe(workspaceId: string, description: string): Promise<void> { ... }
  async bookmark(workspaceId: string, action: 'create'|'list'|'delete', name?: string): Promise<...> { ... }
  async restore(workspaceId: string, revision: string): Promise<void> { ... }
  // etc.
}
```

**`jj-parser.ts`** — parses JJ's template output into typed objects. JJ
supports custom templates (`-T`), so we can request structured output:
```bash
jj log -T 'change_id ++ "\t" ++ commit_id ++ "\t" ++ description ++ "\t" ++ author ++ "\t" ++ timestamp ++ "\n"'
```
Or use `--template` with JSON-friendly formatting for reliable parsing.

**`vcs-manager.ts`** — per-workspace orchestrator:
- Manages a polling interval (e.g. every 2s) to detect changes
- Caches state per workspace (changes, bookmarks, conflicts)
- Emits events to the renderer when state changes
- Handles the `jj git init --colocate` on first access if `.jj/` doesn't exist

### 3.3 IPC Layer

New IPC handlers in `electron/ipc/vcs.ts`:

| Channel | Direction | Purpose |
|---|---|---|
| `sero:vcs:status` | renderer → main | Get working copy status |
| `sero:vcs:log` | renderer → main | Get change history |
| `sero:vcs:describe` | renderer → main | Set description on working copy |
| `sero:vcs:checkpoint` | renderer → main | Describe + `jj new` (snapshot) |
| `sero:vcs:restore` | renderer → main | Restore working copy to revision |
| `sero:vcs:bookmark` | renderer → main | Create/list/delete bookmarks |
| `sero:vcs:fork` | renderer → main | Create new change from revision |
| `sero:vcs:diff` | renderer → main | Get diff for a change |
| `sero:vcs:undo` | renderer → main | Undo last operation |
| `sero:vcs:op-log` | renderer → main | Get operation log |
| `sero:vcs:changed` | main → renderer | Push state updates |

Preload bridge additions in `electron/preload.ts`:
```typescript
vcs: {
  status: (workspaceId: string) => ipcRenderer.invoke('sero:vcs:status', workspaceId),
  log: (workspaceId: string, limit?: number) => ipcRenderer.invoke('sero:vcs:log', workspaceId, limit),
  checkpoint: (workspaceId: string, description: string) => ...,
  restore: (workspaceId: string, revision: string) => ...,
  bookmark: (workspaceId: string, action: string, name?: string, revision?: string) => ...,
  fork: (workspaceId: string, revision: string) => ...,
  diff: (workspaceId: string, revision: string) => ...,
  undo: (workspaceId: string) => ...,
  opLog: (workspaceId: string) => ...,
  onChanged: (callback: (workspaceId: string, data: VcsState) => void) => ...,
}
```

### 3.4 Renderer Layer — Views

**NOT a federated Sero app.** Version control is part of the CodingWorkspace
(like Explorer and Search), not a standalone app. It lives in the
`src/components/apps/coding/` directory.

#### 3.4.1 Activity Bar Change

Rename the existing `git` panel to `vcs`:

```typescript
// ActivityBar.tsx — update the items array:
{ id: 'vcs', label: 'Version Control', icon: <GitBranch className="size-[18px]" /> },
```

#### 3.4.2 Sidebar Panel — `VcsPanel`

Lives in `src/components/apps/coding/vcs/VcsPanel.tsx`. Shown when
`activePanel === 'vcs'` in the CodingSidebar.

```
┌─────────────────────────────┐
│  VERSION CONTROL            │
├─────────────────────────────┤
│  ⊕ Checkpoint  ↩ Undo      │  ← Quick actions bar
├─────────────────────────────┤
│  Working Copy               │
│  ┌─────────────────────────┐│
│  │ ● tqvzulgp (no desc)   ││  ← Current change
│  │   M src/main.ts         ││  ← Modified files
│  │   A src/utils.ts        ││
│  │   [describe...]         ││  ← Inline description input
│  └─────────────────────────┘│
├─────────────────────────────┤
│  Recent Changes             │
│  ○ ksrmwuon  fix login bug  │
│  ○ zpqnrvts  add auth api   │
│  ○ yqosxwkz  initial setup  │
│  ···show more               │
├─────────────────────────────┤
│  Bookmarks                  │  ← Collapsible section
│  🏷 main → ksrmwuon         │
│  🏷 feature-auth → zpqnrvts │
│  + New bookmark...          │
└─────────────────────────────┘
```

**Key interactions:**
- Click a change → open DiffView in EditorPanel
- Right-click a change → context menu (restore, fork, bookmark, diff)
- Click "Checkpoint" → describe current + `jj new`
- Click "Undo" → `jj undo`
- Click a modified file → open diff for that file in EditorPanel

#### 3.4.3 Editor Views

These open as tabs in the EditorPanel (like file tabs):

**TimelineView** — visual graph of changes:
```
┌──────────────────────────────────────────────┐
│  Timeline                               ✕    │
├──────────────────────────────────────────────┤
│                                              │
│  ●  tqvzulgp  (working copy)  now            │
│  │   Working on auth refactor                │
│  │                                           │
│  ○  ksrmwuon  🏷 main  2 min ago             │
│  │   fix login bug                           │
│  │                                           │
│  ○  zpqnrvts  🏷 feature-auth  15 min ago    │
│  ├──○  yqosxwkz  initial setup  1 hour ago   │
│  │                                           │
│  ○  zzzzzzzz  root()                         │
│                                              │
│  [Restore] [Fork] [Bookmark]  ← selection    │
└──────────────────────────────────────────────┘
```

Rendered with custom React components (not a TUI). Uses the same CSS
variables as the rest of Sero. The graph lines can be drawn with SVG or
simple CSS borders.

**DiffView** — shows the diff for a selected change:
```
┌──────────────────────────────────────────────┐
│  ksrmwuon: fix login bug                ✕    │
├──────────────────────────────────────────────┤
│  src/auth/login.ts                           │
│  ──────────────────────────                  │
│  - const token = getToken();                 │
│  + const token = await getToken();           │
│  + if (!token) throw new AuthError();        │
│                                              │
│  src/api/client.ts                           │
│  ──────────────────────────                  │
│  - fetch(url)                                │
│  + fetch(url, { headers: authHeaders() })    │
└──────────────────────────────────────────────┘
```

Uses Monaco's diff editor (`monaco.editor.createDiffEditor`) for rich
inline diffs when a single file is selected.

### 3.5 Sero Extension Layer (Inline, Not a Separate Package)

JJ integration is **built into the sero-extension factory**
(`electron/sero-extension.ts`), not a separate `packages/pi-vcs-extension/`.

**Why inline, not a package:**
- Session-change binding needs direct access to `AgentSession` lifecycle
  events, session manager, and session entries (`pi.appendEntry()`)
- The command guard needs to intercept `bash` tool calls at the extension
  level (not achievable from a federated app)
- Status bar integration needs `ctx.ui.setStatus()` equivalent (Sero's
  StatusBar IPC)
- Auto-summarization needs access to session data and model registry
- The reference implementations (`jj-workflow.ts`, `jj-session-binding.ts`)
  are both extension-level code — they belong in the extension factory

**New files in `electron/vcs/`:**

```
electron/vcs/
├── types.ts              — JjChange, JjBookmark, JjLink, etc.
├── jj-runner.ts          — execute jj in container via ContainerManager
├── jj-parser.ts          — parse jj CLI output → typed objects
├── command-guard.ts      — port of jj-workflow.ts (block git + interactive jj)
├── session-binding.ts    — port of jj-session-binding.ts (session ↔ change link)
├── summarizer.ts         — auto-summarize session → jj describe
├── vcs-manager.ts        — per-workspace orchestrator + polling
└── index.ts              — public API
```

#### Three Functional Layers

**Layer 1: Command Guard** (ported from `jj-workflow.ts`)

Registered in the sero-extension factory's `tool_call` event:
- Blocks all `git` commands with a message to use JJ
- Blocks interactive JJ commands (`diffedit`, `split -i`, `describe`
  without `-m`, `resolve` without `--list`, `commit` without `-m`)
- Returns `{ block: true, reason }` with actionable guidance

**Layer 2: Session Binding** (ported from `jj-session-binding.ts`)

Registered in the sero-extension factory lifecycle events:
- `session_start` → create new JJ change (`jj new`), store `JjLink` via
  `pi.appendEntry('jj-link', data)`
- `input` → validate link before each user turn (detect drift/orphan)
- `turn_end` → trigger auto-summarization
- `tool_call` → block mutating JJ commands from agent (read-only only)

**TUI method replacements:**

| Reference code | Sero equivalent |
|---|---|
| `ctx.ui.notify(msg, 'warning')` | IPC → renderer toast notification |
| `ctx.ui.select(title, options)` | IPC → renderer modal dialog (async response) |
| `ctx.ui.setStatus('jj-session-binding', text)` | IPC → StatusBar VCS segment |
| `ctx.ui.theme.fg('success', text)` | Not needed — StatusBar uses React + CSS vars |

New IPC channels for extension → renderer communication:
- `sero:vcs:notify` — push notifications to renderer toast system
- `sero:vcs:select` — request user selection, await IPC response
- `sero:vcs:status-update` — update StatusBar VCS segment

**Layer 3: Agent Tools**

Registered as tools in the sero-extension factory (not standalone tools):

| Tool | Description | JJ Command |
|---|---|---|
| `vcs_status` | Show working copy changes and modified files | `jj status` |
| `vcs_checkpoint` | Save current state with a description | `jj describe -m "..." && jj new` |
| `vcs_log` | Show recent change history | `jj log --limit N` |
| `vcs_restore` | Revert workspace to a previous change | `jj restore --from REV` |
| `vcs_bookmark` | Create/list/delete named bookmarks | `jj bookmark create/list/delete` |
| `vcs_diff` | Show what changed in a specific revision | `jj diff -r REV` |
| `vcs_undo` | Undo the last operation | `jj undo` |

These execute JJ via `ContainerManager.exec()` (not via the agent's `bash`
tool), so they bypass the command guard.

#### Agent Prompt Integration

The sero-extension factory injects VCS context into the system prompt via
`before_agent_start`:

```
## Version Control (JJ)

This workspace uses JJ (Jujutsu) for version control. Your session is bound
to JJ change `<changeId>` (status: <active|drifted|orphaned>).

Key rules:
- Do NOT use git commands. Use JJ exclusively.
- Do NOT use interactive JJ commands (diffedit, split -i, etc.) — they will be blocked.
- Always use -m "message" with jj describe and jj commit.
- Every file change is automatically tracked in the working copy.
- Use vcs_checkpoint to save a named snapshot before risky changes.
- Use vcs_restore to revert if something goes wrong.
- Use vcs_bookmark to mark important states.
- Use vcs_undo to undo your last version control operation.
- Use only read-only jj commands in bash (log, diff, show, status).
- For mutating operations, use the vcs_* tools.
```

#### Auto-Summarization

Ported from the reference implementation's summarizer:
- On `turn_end`, schedules a background summarization (coalesced, non-blocking)
- Collects session data (messages, compaction summaries, linked sessions)
- Calls an LLM (preferring fast/cheap models: Cerebras, Haiku) with a
  structured prompt to generate a revision description
- Writes the summary via `jj describe -r <changeId> -m "<summary>"`
- The JJ change description becomes a living summary of what the session did

This means the TimelineView in the UI will show rich, auto-generated
descriptions for every session's work — not just "session: abc123".

---

## 4. Implementation Phases

### Phase 1: Foundation (Container + Runner + Command Guard)

1. **Install JJ in container image** — update Dockerfile, rebuild
2. **`electron/vcs/types.ts`** — all shared types (`JjChange`, `JjLink`, etc.)
3. **`electron/vcs/jj-runner.ts`** — execute JJ inside container via
   `ContainerManager.exec()`
4. **`electron/vcs/jj-parser.ts`** — parse JJ template output into typed objects
5. **Auto-init** — change `lifecycle.ts` to run `jj git init --colocate`
   instead of `git init -q` on container creation
6. **`electron/vcs/command-guard.ts`** — port `jj-workflow.ts` patterns
   (block git, block interactive JJ)
7. **Wire command guard** into `sero-extension.ts` `tool_call` event

### Phase 2: Session Binding + Agent Tools

8. **`electron/vcs/session-binding.ts`** — port session ↔ change binding
   (create link on `session_start`, validate on `input`, orphan recovery)
9. **Register VCS tools** in sero-extension factory (`vcs_status`,
   `vcs_checkpoint`, `vcs_log`, `vcs_restore`, `vcs_bookmark`, `vcs_diff`,
   `vcs_undo`)
10. **System prompt injection** — VCS block in `before_agent_start` with
    bound change ID and status
11. **StatusBar VCS segment** — show bound change ID + status (active /
    drifted / orphaned) via IPC to StatusBar component

### Phase 3: IPC + Store + Sidebar Panel

12. **`electron/ipc/vcs.ts`** — IPC handlers for all VCS operations
13. **Preload bridge** — `window.sero.vcs.*` methods
14. **`src/stores/vcs.ts`** — Zustand store (per-workspace state)
15. **Rename `git` → `vcs`** in ActivityBar
16. **`VcsPanel`** in CodingSidebar — working copy status, changed files list
17. **Quick actions** — Checkpoint button, Undo button
18. **Describe input** — inline description field for working copy
19. **Recent changes list** — scrollable, clickable

### Phase 4: Core UI Operations

20. **Checkpoint flow** — describe + `jj new` via IPC, UI feedback
21. **Restore flow** — select revision → confirm dialog → `jj restore`
22. **Bookmark CRUD** — create, list, delete in sidebar section
23. **Fork** — right-click change → "Fork from here" → `jj new REV`
24. **Undo** — `jj undo` with confirmation popover

### Phase 5: Auto-Summarization

25. **`electron/vcs/summarizer.ts`** — port summarizer (LLM-based session
    summary → `jj describe`)
26. **Schedule on `turn_end`** — coalesced, non-blocking, uses cheap model
27. **Summary status** — show "Summarizing..." in StatusBar during generation
28. **Post-validation** — strip LLM chatter, enforce length limits

### Phase 6: Editor Views

29. **DiffView** — opens in EditorPanel tab, file-level diffs
30. **TimelineView** — visual change graph in EditorPanel tab
31. **Monaco diff editor** integration for single-file diffs
32. **File click in VcsPanel** → open diff for that file

### Phase 7: Advanced Features

33. **Polling / file watcher** — auto-refresh VCS state on file changes
34. **Operation log view** — full `jj op log` timeline
35. **Notification toasts** — replace `ctx.ui.notify()` for VCS events
36. **Select dialogs** — replace `ctx.ui.select()` for orphan resolution etc.
37. **Conflict resolution UI** — when JJ detects conflicts
38. **Git push/pull** — via colocated repo, integrated in sidebar
39. **`/jresume` command** — list JJ-bound sessions, switch to one
40. **`/jrebind` command** — rebind session to different change ID
41. **Squash / split** — advanced change manipulation (non-interactive)

---

## 5. Key Design Decisions

### 5.1 NOT a Federated App

Version control is **intrinsic to the CodingWorkspace**, not a standalone
app. Reasons:
- It needs tight integration with the file tree, editor, and terminal
- It operates on workspace files (same scope as Explorer)
- It should be visible alongside code, not in a separate app view
- Users expect VCS in the coding sidebar (VSCode pattern)

The Pi extension provides agent tools. The views live in `coding/vcs/`.

### 5.2 JJ Inside Container Only

JJ runs inside the container because:
- All file operations already happen inside the container
- The workspace root (`/workspace`) is the JJ repo root
- Container isolation prevents VCS operations from affecting the host
- JJ's `.jj/` directory is part of the bind-mounted workspace, so it
  persists when the container stops

### 5.3 Colocated Git for Compatibility

`jj git init --colocate` gives us:
- Full JJ workflow (immutable changes, operation log, bookmarks)
- Git compatibility (push to GitHub, clone from Git remotes)
- Users can fall back to `git` commands if needed
- `.gitignore` is respected by JJ

### 5.4 Dual Access: Agent + UI

Both the agent (via Pi extension tools) and the user (via React views)
can perform VCS operations. They go through the same JJ state:
- Agent calls `vcs_checkpoint` → JJ state changes → polling detects →
  renderer updates
- User clicks "Checkpoint" in UI → IPC → JJ command → state changes →
  renderer updates
- No conflicts between the two because JJ handles concurrent access
  gracefully via its operation log

### 5.5 Views in CodingWorkspace, NOT ctx.ui

The reference implementations you found use `ctx.ui` for TUI rendering.
In Sero, we replace that with:
- **Sidebar panel** (`VcsPanel`) for quick status and actions
- **Editor tabs** (`TimelineView`, `DiffView`) for detailed views
- **Context menus** for per-change actions
- **Modal dialogs** for confirmations (restore, delete bookmark)

This follows Sero's existing pattern: ActivityBar selects the sidebar
content, rich views open in the editor area.

---

## 6. State Shape

```typescript
// electron/vcs/types.ts (shared via src/types/ipc.ts)

// ── JJ Data Types ──────────────────────────────────────────

interface JjChange {
  changeId: string;       // Short change ID (e.g. "tqvzulgp")
  commitId: string;       // Full commit hash
  description: string;    // Change description (may be auto-generated summary)
  author: string;
  timestamp: string;      // ISO string
  isWorkingCopy: boolean;
  isEmpty: boolean;
  isConflict: boolean;
  bookmarks: string[];    // Bookmarks pointing to this change
  parents: string[];      // Parent change IDs
  files: JjFileChange[];  // Modified files (only for working copy + selected)
}

interface JjFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  oldPath?: string;       // For renames
}

interface JjBookmark {
  name: string;
  changeId: string;
  isTracking: boolean;    // Tracking a remote bookmark
  remote?: string;        // Remote name if tracking
}

interface JjOperation {
  id: string;
  timestamp: string;
  description: string;    // e.g. "describe change tqvzulgp"
  tags: string[];
}

interface JjConflict {
  path: string;
  changeId: string;
}

// ── Session Binding Types (from jj-session-binding.ts) ─────

/**
 * Persisted in session entries via pi.appendEntry('jj-link', data).
 * Multiple JjLink entries may exist in a session — the latest one wins.
 */
interface JjLink {
  changeId: string;           // JJ change ID this session is bound to
  repoRoot: string;           // JJ repo root path (inside container)
  workspaceRoot: string;      // JJ workspace root path
  linkedAt: string;           // ISO timestamp of binding creation
  status: 'active' | 'drifted' | 'orphaned';
  orphanedReason?: 'squashed' | 'abandoned' | 'unknown';
  orphanedAt?: string;        // ISO timestamp when orphan was detected
}

// ── Renderer Store Shape ───────────────────────────────────

/** Per-workspace VCS state in the Zustand store. */
interface WorkspaceVcsState {
  // JJ repo state
  changes: JjChange[];
  bookmarks: JjBookmark[];
  operations: JjOperation[];
  workingCopy: JjChange | null;
  conflicts: JjConflict[];

  // Session binding (for the active session in this workspace)
  sessionLink: JjLink | null;
  summaryStatus: 'idle' | 'summarising' | null;

  // UI state
  status: 'uninitialised' | 'idle' | 'loading' | 'error';
  error?: string;
  isJjAvailable: boolean;
}

/** Top-level Zustand store. */
interface VcsStoreState {
  workspaceStates: Record<string, WorkspaceVcsState>;

  // Actions
  setWorkspaceState: (workspaceId: string, state: Partial<WorkspaceVcsState>) => void;
  refresh: (workspaceId: string) => Promise<void>;
  checkpoint: (workspaceId: string, description: string) => Promise<void>;
  restore: (workspaceId: string, revision: string) => Promise<void>;
  createBookmark: (workspaceId: string, name: string, revision?: string) => Promise<void>;
  deleteBookmark: (workspaceId: string, name: string) => Promise<void>;
  undo: (workspaceId: string) => Promise<void>;
}
```

### StatusBar Integration

The StatusBar gets a new VCS segment showing session binding status:

```
┌─────────────────────────────────────────────────────────────────────┐
│  sero-dev · /workspace  ●  tqvzulgp (active)  │  2 agents active   │
└─────────────────────────────────────────────────────────────────────┘
                           ↑ VCS segment: change ID + status dot
                             ● green = active
                             ● yellow = drifted (@ moved away)
                             ● red = orphaned (change squashed/abandoned)
                             ○ grey = unbound (no JJ repo)
```

---

## 7. File Organisation

```
apps/desktop/
├── electron/
│   ├── vcs/
│   │   ├── types.ts              — JjChange, JjBookmark, JjLink, JjOperation, etc.
│   │   ├── jj-runner.ts          — execute jj in container via ContainerManager
│   │   ├── jj-parser.ts          — parse jj template/CLI output → typed objects
│   │   ├── command-guard.ts      — block git + interactive jj (from jj-workflow.ts)
│   │   ├── session-binding.ts    — session ↔ change link lifecycle (from jj-session-binding.ts)
│   │   ├── summarizer.ts         — LLM-based session → jj describe (from jj-session-binding.ts)
│   │   ├── tools.ts              — vcs_* tool definitions for sero-extension
│   │   ├── vcs-manager.ts        — per-workspace orchestrator + polling
│   │   └── index.ts              — public API
│   ├── ipc/
│   │   └── vcs.ts                — IPC handlers for renderer ↔ main
│   └── sero-extension.ts         — wire command-guard, session-binding, tools
│
├── src/
│   ├── stores/
│   │   └── vcs.ts                — Zustand store (per-workspace VCS state)
│   ├── types/
│   │   ├── ipc.ts                — add VCS types (re-export from electron/vcs/types)
│   │   └── electron.d.ts         — add window.sero.vcs typing
│   └── components/
│       ├── layout/
│       │   └── StatusBar.tsx     — add VCS segment (change ID + status)
│       └── apps/coding/
│           ├── vcs/
│           │   ├── VcsPanel.tsx           — sidebar panel (main container)
│           │   ├── WorkingCopySection.tsx  — current change + modified files
│           │   ├── ChangesSection.tsx      — recent changes list
│           │   ├── BookmarksSection.tsx    — bookmark list + CRUD
│           │   ├── ChangeItem.tsx          — single change row
│           │   ├── FileChangeItem.tsx      — single file change row
│           │   ├── QuickActions.tsx        — checkpoint / undo action bar
│           │   ├── DescribeInput.tsx       — inline description field
│           │   ├── TimelineView.tsx        — graph view (opens as editor tab)
│           │   ├── DiffView.tsx            — diff view (opens as editor tab)
│           │   └── types.ts               — component-local types
│           ├── ActivityBar.tsx    — rename git → vcs
│           └── CodingSidebar.tsx  — add vcs panel case
│
│   No packages/pi-vcs-extension/ — all VCS logic is inline in the
│   sero-extension factory + electron/vcs/ module. This keeps session
│   binding, command guarding, and tool registration in one place with
│   full access to the Pi SDK lifecycle.
```

### Reference Files (source of truth for porting)

```
/Users/danielcarter/Documents/Dev/projects/backup/pi-mono/examples/
├── jj-workflow.ts          → electron/vcs/command-guard.ts
└── jj-session-binding.ts   → electron/vcs/session-binding.ts
                             + electron/vcs/summarizer.ts
```

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| JJ binary size in container image | Larger image, slower first-start | JJ is ~20MB static binary — acceptable |
| JJ CLI output format changes | Parser breaks | Pin JJ version in image; use `--template` for structured output |
| Polling overhead for state refresh | CPU waste | Use file watcher on `.jj/` or debounced polling (2s); pause when workspace is not active |
| Container not running when user clicks VCS | Error state | Show "Container not running" in VcsPanel; offer to start |
| Agent and user race on JJ commands | Corrupted state | JJ's operation log handles this natively — concurrent access is safe |
| Large repos (many changes) | Slow log queries | Limit default log to 50 changes; paginate on scroll |

---

## 9. Open Questions

1. **Should auto-checkpoint be opt-in or default?** The agent could
   automatically checkpoint before every tool call that modifies files.
   This gives perfect undo but creates many changes. Recommend: opt-in
   via workspace config, with the agent explicitly checkpointing before
   risky multi-file edits.

2. **Git remote integration priority?** Colocated mode gives us `jj git
   push/fetch` for free. Should Phase 1 include remote operations, or
   defer to Phase 7? Recommend: defer — local versioning is the core
   value.

3. **JJ version pinning?** JJ is pre-1.0 and evolving. Should we pin a
   specific version in the container image? Recommend: yes, pin and
   document. Update deliberately.

4. **Conflict resolution UI complexity?** JJ handles conflicts gracefully
   but the UI for resolving them could be complex. Recommend: start with
   "show conflicts exist" in Phase 3, build resolution UI in Phase 7.

5. **Existing `.git` repos?** When a user opens a workspace that already
   has `.git` but no `.jj`, should we auto-colocate? Recommend: yes,
   with a one-time confirmation dialog.

6. **Session binding: one change per session or one per workspace?** The
   reference binds one JJ change per Pi session. In Sero, multiple
   sessions can exist per workspace. Should each session get its own
   change (like the reference), or should the workspace's "active session"
   drive a single working copy? Recommend: one change per session (matches
   reference), since sessions represent distinct tasks/conversations.

7. **Summarizer model selection.** The reference tries Cerebras, then
   Haiku, then falls back to `ctx.model`. Sero should use the same
   strategy but may need a settings UI for model preference. Recommend:
   use the same fallback chain initially, add settings later.

8. **`ctx.ui.select()` replacement priority.** The orphan auto-resolution
   uses `ctx.ui.select()` to ask the user to pick a target change. This
   is blocking UI in the TUI. In Sero, this needs an async IPC dialog
   flow. Recommend: implement auto-resolution first (the single-candidate
   path), defer the multi-candidate selector to Phase 7.

9. **Command guard: should the agent ever be allowed mutating JJ?** The
   reference blocks ALL mutating JJ from `bash` calls, providing dedicated
   tools instead. This is the safest approach. Alternative: allow specific
   mutating commands (e.g. `jj describe -m "..."`) in bash. Recommend:
   block all, use dedicated tools (matches reference).

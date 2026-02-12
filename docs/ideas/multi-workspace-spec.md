# Multi-Workspace Implementation Spec

**Status:** Ready for implementation
**Based on:** `docs/ideas/multi-workspace.md` (Claude Opus session)
**Date:** 2026-02-12

---

## 1. Overview

Workspaces are Sero's foundational organising unit. A workspace is a bounded
context — a project, a life domain, or a collection of related work — with its
own root directory, configuration, PI SDK skills/extensions, and scoped
sessions.

This spec defines the concrete implementation plan against Sero's existing
architecture and the PI SDK.

### 1.1 Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Full scope** — composite environment, cross-workspace refs, inference, lifecycle — all in | Integral to what makes or breaks the app |
| 2 | **External paths** — workspaces point to real directories on disk (like PI's `cwd`) | Dev projects live in `~/Dev/...`, not inside `~/.sero-ui/` |
| 3 | **Workspaces replace project tabs** — ProjectBar is removed from CodingWorkspace | Workspaces subsume the "project" concept entirely |
| 4 | **ChatPanel stays global** — sessions know their workspace, sidebar groups them | Matches existing AD-003; session selection changes workspace context |
| 5 | **Multiple simultaneous `AgentSession`s** — one per active session, keyed by session ID | Enables parallel work; active agents indicated in sidebar |
| 6 | **Scratchpad default** — new sessions go to scratchpad unless user picks a workspace | VSCode-style workspace selection for explicit binding |
| 7 | **Tree view sidebar** — workspace headers → sessions underneath | May evolve to a dedicated sessions panel later |

### 1.2 How It Maps to PI SDK

| Concept | PI SDK Mechanism |
|---------|------------------|
| Workspace cwd | `createAgentSession({ cwd: workspacePath })` |
| Scoped tools | `createCodingTools(workspacePath)` |
| Workspace skills/context | `DefaultResourceLoader({ cwd: workspacePath })` discovers `.pi/skills/`, `AGENTS.md`, etc. |
| Session persistence | `SessionManager.create(workspacePath, sessionDir)` groups sessions by workspace |
| Shared auth/models | Single `AuthStorage` + `ModelRegistry` shared across all sessions |
| Workspace-specific extensions | `DefaultResourceLoader({ additionalExtensionPaths })` per workspace |
| Cross-workspace context | `systemPromptOverride` or `before_agent_start` injects summaries of other open workspaces |

---

## 2. Directory Structure

```
~/.sero-ui/
├── agent/
│   ├── .env                          # API keys (existing)
│   ├── auth.json                     # PI SDK auth storage (existing)
│   ├── settings.json                 # Global settings
│   ├── workspaces.json               # ★ Workspace registry
│   └── sessions/                     # All sessions (grouped by workspace cwd)
│       ├── --Users--dan--Dev--sero/  # PI SDK auto-names by cwd
│       │   └── *.jsonl
│       ├── --Users--dan--.sero-ui--workspaces--scratchpad/
│       │   └── *.jsonl
│       └── ...
│
└── workspaces/
    ├── scratchpad/                   # Default: ad-hoc tasks
    │   └── .sero-workspace.json
    └── global/                       # Default: cross-cutting personal data
        ├── .sero-workspace.json
        ├── knowledge/
        ├── finance/
        └── templates/

# External workspace (dev project):
~/Dev/projects/sero/sero/
├── .sero-workspace.json              # ★ Workspace config at project root
├── AGENTS.md                         # PI SDK discovers this automatically
├── .pi/
│   ├── skills/                       # PI SDK discovers per-project skills
│   └── extensions/                   # PI SDK discovers per-project extensions
└── src/
```

### 2.1 Workspace Registry (`~/.sero-ui/agent/workspaces.json`)

```typescript
interface WorkspaceRegistry {
  workspaces: WorkspaceRegistryEntry[];
}

interface WorkspaceRegistryEntry {
  /** Unique ID (kebab-case slug). */
  id: string;
  /** Absolute path to workspace root. */
  path: string;
  /** Open into composite environment on launch. */
  autoOpen: boolean;
}
```

```json
{
  "workspaces": [
    { "id": "scratchpad", "path": "~/.sero-ui/workspaces/scratchpad", "autoOpen": true },
    { "id": "global", "path": "~/.sero-ui/workspaces/global", "autoOpen": true },
    { "id": "sero-dev", "path": "/Users/dan/Dev/projects/sero/sero", "autoOpen": false },
    { "id": "trading-platform", "path": "/Users/dan/Dev/work/trading-platform", "autoOpen": false }
  ]
}
```

### 2.2 Workspace Config (`.sero-workspace.json`)

Lives at the workspace root directory. Discovered by Sero when a workspace is
opened.

```typescript
interface WorkspaceConfig {
  id: string;
  name: string;
  description?: string;
  /** Default cwd relative to workspace root for new sessions. */
  defaultCwd?: string;
  /** Context hints injected into system prompt when workspace is open. */
  contextHints?: string[];
  /** Paths to workspace-specific skills (relative to workspace root). */
  skills?: string[];
  /** Files always included in AI context when workspace is open. */
  contextFiles?: string[];
  /** Globs to exclude from AI indexing. */
  exclude?: string[];
  /** Tags for categorisation and inference. */
  tags?: string[];
}
```

---

## 3. Architecture Changes

### 3.1 Component Hierarchy (after)

```
┌─────────────────────────────────────────────────────────────┐
│  TitleBar (⊞ sidebar toggle … workspace name … ⌘K … ⊟ chat)│
├──────────┬──────────────────────────────┬─┬─────────────────┤
│  Main    │                              │║│                 │
│  Sidebar │     Active App               │║│  Chat Panel     │
│  ┌─────┐ │     (CodingWorkspace / etc.) │║│  (global agent) │
│  │Wksp │ │                              │║│                 │
│  │  ├ S │ │                              │║│                 │
│  │  └ S │ │                              │║│                 │
│  │Wksp │ │                              │║│                 │
│  │  └ S │ │                              │║│                 │
│  └─────┘ │                              │║│                 │
├──────────┴──────────────────────────────┴─┴─────────────────┤
│  StatusBar (workspace name · cwd · active agents: 2)         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 What Changes

| Component | Before | After |
|-----------|--------|-------|
| **MainSidebar** | Apps list + flat chat list | Apps list + workspace→session tree |
| **ProjectBar** | Static project tabs | **Removed** — workspaces replace projects |
| **CodingWorkspace** | Has ProjectBar | No ProjectBar; reflects active workspace filesystem |
| **ChatPanel** | Global, single agent | Global, multi-agent aware (shows active session's workspace) |
| **StatusBar** | Placeholder | Shows workspace name, cwd, active agent count |
| **TitleBar** | Static "Sero" | Shows active workspace name |
| **Agent IPC** | Singleton AgentSession | AgentPool — Map<sessionId, AgentSession> |
| **Session IPC** | Flat list, homedir cwd | Workspace-scoped: list by workspace, create with workspace binding |

### 3.3 Store Architecture

```
src/stores/
├── app.ts              # Shell: sidebar, chatPanel, activeApp, theme (mostly unchanged)
├── workspace.ts        # ★ NEW: workspace registry, composite env, active workspace
├── sessions.ts         # MODIFIED: sessions grouped by workspace
└── agent.ts            # MODIFIED: multi-session agent pool
```

#### `workspace.ts` (new)

```typescript
interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  description?: string;
  contextHints?: string[];
  tags?: string[];
  autoOpen: boolean;
}

interface WorkspaceState {
  /** All registered workspaces. */
  workspaces: WorkspaceInfo[];
  /** IDs of workspaces currently in the composite environment. */
  openWorkspaceIds: string[];
  /** Currently focused workspace (drives sidebar highlight). */
  activeWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadWorkspaces: () => Promise<void>;
  openWorkspace: (id: string) => Promise<void>;
  closeWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string, path: string) => Promise<WorkspaceInfo>;
  removeWorkspace: (id: string) => Promise<void>;
  setActiveWorkspace: (id: string | null) => void;
  /** Register an existing directory as a workspace (VSCode "Add Folder"). */
  addFolder: (folderPath: string) => Promise<WorkspaceInfo>;
}
```

#### `sessions.ts` (modified)

```typescript
interface SessionsState {
  /** All sessions, keyed by workspace ID for grouping. */
  sessionsByWorkspace: Record<string, SeroSessionInfo[]>;
  activeSessionId: string | null;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSessions: () => Promise<void>;
  /** Create a session bound to a workspace. Defaults to scratchpad. */
  createSession: (workspaceId?: string) => Promise<SeroSessionInfo>;
  deleteSession: (sessionPath: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
}
```

`SeroSessionInfo` gains a `workspaceId` field:

```typescript
interface SeroSessionInfo {
  path: string;
  id: string;
  cwd: string;
  workspaceId: string;          // ★ NEW
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}
```

#### `agent.ts` (modified — AgentPool)

```typescript
interface AgentInstance {
  sessionPath: string;
  sessionId: string;
  workspaceId: string;
  isStreaming: boolean;
  messages: ChatMessage[];
  error: string | null;
}

interface AgentState {
  /** All active agent instances, keyed by session ID. */
  agents: Record<string, AgentInstance>;
  /** Which session is shown in the ChatPanel. */
  focusedSessionId: string | null;

  // Actions
  openSession: (sessionPath: string, workspaceId: string) => Promise<void>;
  closeSession: (sessionId: string) => Promise<void>;
  sendPrompt: (sessionId: string, text: string) => Promise<void>;
  abort: (sessionId: string) => Promise<void>;
  /** Focus a session in the ChatPanel. */
  focusSession: (sessionId: string) => void;
  initEventListener: () => () => void;

  // Derived
  focusedAgent: () => AgentInstance | null;
  /** IDs of sessions currently streaming (for sidebar indicators). */
  streamingSessionIds: () => string[];
}
```

### 3.4 IPC Layer

#### New Channels

```typescript
export const IpcChannels = {
  workspace: {
    list: 'sero:workspace:list',       // → WorkspaceInfo[]
    create: 'sero:workspace:create',   // (name, path) → WorkspaceInfo
    remove: 'sero:workspace:remove',   // (id) → void
    open: 'sero:workspace:open',       // (id) → WorkspaceConfig (full)
    close: 'sero:workspace:close',     // (id) → void
    addFolder: 'sero:workspace:add-folder', // (folderPath) → WorkspaceInfo
  },
  sessions: {
    list: 'sero:sessions:list',        // (workspaceId?) → SeroSessionInfo[]
    create: 'sero:sessions:create',    // (workspaceId) → SeroSessionInfo
    delete: 'sero:sessions:delete',    // (sessionPath) → void
  },
  agent: {
    open: 'sero:agent:open',           // (sessionId, sessionPath, workspaceId) → ChatMessage[]
    prompt: 'sero:agent:prompt',       // (sessionId, text) → void
    abort: 'sero:agent:abort',         // (sessionId) → void
    close: 'sero:agent:close',         // (sessionId) → void
    event: 'sero:agent:event',         // main→renderer push (now includes sessionId)
  },
} as const;
```

#### Agent Event Changes

Every `AgentStreamEvent` gains a `sessionId` field so the renderer can route
events to the correct `AgentInstance`:

```typescript
export type AgentStreamEvent =
  | { type: 'agent_start'; sessionId: string }
  | { type: 'agent_end'; sessionId: string }
  | { type: 'text_delta'; sessionId: string; messageId: string; delta: string }
  // ... all events get sessionId
```

### 3.5 Electron Main Process

#### WorkspaceManager (new: `electron/workspace.ts`)

```typescript
class WorkspaceManager {
  private registry: WorkspaceRegistry;
  private configCache: Map<string, WorkspaceConfig>;

  /** Load registry from ~/.sero-ui/agent/workspaces.json */
  async load(): Promise<void>;
  /** Save registry to disk. */
  async save(): Promise<void>;
  /** Create default workspaces (scratchpad + global) on first run. */
  async ensureDefaults(): Promise<void>;

  /** List all registered workspaces. */
  list(): WorkspaceInfo[];
  /** Register a directory as a workspace. Creates .sero-workspace.json if missing. */
  async addFolder(folderPath: string, name?: string): Promise<WorkspaceInfo>;
  /** Create a new workspace under ~/.sero-ui/workspaces/. */
  async create(name: string): Promise<WorkspaceInfo>;
  /** Unregister a workspace. Does NOT delete the directory. */
  remove(id: string): void;
  /** Read the .sero-workspace.json for a workspace. */
  async getConfig(id: string): Promise<WorkspaceConfig>;
}
```

#### AgentPool (replaces singleton in `electron/ipc/agent.ts`)

```typescript
class AgentPool {
  /** Shared across all sessions — created once. */
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;

  /** One AgentSession per active session. */
  private sessions: Map<string, {
    session: AgentSession;
    unsubscribe: () => void;
    workspaceId: string;
  }>;

  /** Open a session with workspace-scoped cwd, tools, and resource loader. */
  async open(sessionId: string, sessionPath: string, workspace: WorkspaceInfo): Promise<ChatMessage[]>;
  /** Send a prompt to a specific session. */
  async prompt(sessionId: string, text: string): Promise<void>;
  /** Abort a specific session. */
  async abort(sessionId: string): Promise<void>;
  /** Close and dispose a specific session. */
  close(sessionId: string): void;
  /** Close all sessions (app shutdown). */
  disposeAll(): void;
}
```

Each `open()` call creates a fully independent `AgentSession`:

```typescript
async open(sessionId, sessionPath, workspace) {
  // Workspace-scoped resource loader
  const loader = new DefaultResourceLoader({
    cwd: workspace.path,
    agentDir: SERO_AGENT_DIR,
    settingsManager: this.settingsManager,
    // Inject composite environment context
    systemPromptOverride: (base) => this.buildCompositePrompt(base, workspace.id),
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: workspace.path,
    agentDir: SERO_AGENT_DIR,
    model: this.model,
    authStorage: this.authStorage,
    modelRegistry: this.modelRegistry,
    tools: createCodingTools(workspace.path),
    resourceLoader: loader,
    sessionManager: SessionManager.open(sessionPath, SERO_SESSION_DIR),
    settingsManager: this.settingsManager,
  });

  // Subscribe and tag events with sessionId before forwarding
  const unsub = session.subscribe((event) => {
    this.forwardEvent(sessionId, event);
  });

  this.sessions.set(sessionId, { session, unsubscribe: unsub, workspaceId: workspace.id });
}
```

---

## 4. UI Changes

### 4.1 MainSidebar — Workspace Tree

Replace the flat session list with a tree view:

```
┌─────────────────────────────────┐
│ Apps                            │
│  💻 Coding                      │
│  📅 Calendar                    │
│  ...                            │
├─────────────────────────────────┤
│ Workspaces            [+ Add]   │
│                                 │
│ ▼ Scratchpad                    │
│    ● Fix email draft    2m ago  │
│    ○ Tax questions      1h ago  │
│                                 │
│ ▼ Sero Dev             🟢       │
│    ● Multi-workspace    just now│  ← active, agent streaming
│    ○ Fix chat panel     3h ago  │
│                                 │
│ ▸ Global                        │
│                                 │
│ ▸ Trading Platform              │
│                                 │
│ ──────────────────────────────  │
│ [+ Add Workspace]               │
└─────────────────────────────────┘

● = active session (has open AgentSession)
🟢 = workspace has an agent currently streaming
```

**Interactions:**
- Click workspace header → expand/collapse, set as active workspace
- Click session → focus in ChatPanel (opens AgentSession if not already open)
- `+` on workspace header → create new session in that workspace
- `[+ Add Workspace]` → native folder picker (like VSCode "Add Folder to Workspace")
- Right-click workspace → Close, Remove, Info
- Right-click session → Delete, Rename

### 4.2 Workspace Picker (VSCode-style)

Triggered by `[+ Add Workspace]` button or ⌘K → "Add Workspace" command.

For existing folder:
1. Native `dialog.showOpenDialog({ properties: ['openDirectory'] })`
2. If `.sero-workspace.json` exists → register and open
3. If not → create `.sero-workspace.json` with sensible defaults (derive name from folder name)

For new workspace (non-dev):
1. Text input for name
2. Created under `~/.sero-ui/workspaces/{slug}/`

### 4.3 CodingWorkspace

- **Remove** `ProjectBar` component entirely
- **Remove** `ProjectBar` import and render from `CodingWorkspace.tsx`
- CodingWorkspace reflects the active workspace's filesystem
- ActivityBar Explorer will eventually show the active workspace's file tree

### 4.4 StatusBar

```
⎇ main │ Sero Dev │ ~/Dev/projects/sero/sero │ Agents: 2 active │ v0.1.0 │ dark
```

Shows: active workspace name, workspace path, active agent count.

### 4.5 TitleBar

Replace static "Sero" app name with active workspace name (or "Sero" when no
workspace is focused).

### 4.6 ChatPanel

Stays structurally the same. Key changes:
- Header shows workspace badge: `Agent · Sero Dev`
- Messages come from `agents[focusedSessionId]` instead of a single agent
- Prompt input targets the focused session's `AgentSession`
- Empty state changes based on whether a workspace is open

---

## 5. Session Lifecycle

### 5.1 Session Creation

```
User clicks "+" on workspace header
  │
  └─ createSession(workspaceId)
       │
       ├─ IPC: sero:sessions:create (workspaceId)
       │    └─ SessionManager.create(workspace.path, SERO_SESSION_DIR)
       │       (sessions auto-grouped by workspace path)
       │
       ├─ Returns SeroSessionInfo { ..., workspaceId }
       │
       └─ Auto-focus new session in ChatPanel
```

For "New Chat" without explicit workspace → defaults to scratchpad.

### 5.2 Session Binding

Each session is permanently bound to one workspace at creation. The binding is
stored in two places:
1. **PI SDK session header** — `cwd` field matches workspace path
2. **Session metadata** — `workspaceId` derived from cwd→workspace lookup

### 5.3 Session States

| State | Description | In Agent Pool? |
|-------|-------------|----------------|
| **Focused** | Shown in ChatPanel, has AgentSession | Yes |
| **Background** | Has AgentSession, not shown in ChatPanel | Yes |
| **Idle** | No AgentSession, just a .jsonl on disk | No |

Clicking a session in the sidebar → opens AgentSession (if not already) → focuses in ChatPanel.

Closing a session's AgentSession (explicit action or resource pressure) moves it
to Idle. The .jsonl persists and can be reopened.

### 5.4 Session Fork

```
/fork sero-dev       # Fork current chat into new session bound to sero-dev workspace
```

Uses PI SDK's `session.fork()` or `SessionManager.createBranchedSession()`. The
forked session gets a new AgentSession with the target workspace's cwd.

---

## 6. Composite Environment

### 6.1 Context Injection

When a session is opened, its system prompt is augmented with a summary of all
other open workspaces:

```typescript
function buildCompositePrompt(basePrompt: string, activeWorkspaceId: string): string {
  const others = this.getOpenWorkspaces()
    .filter(ws => ws.id !== activeWorkspaceId)
    .map(ws => `- **${ws.name}**: ${ws.description || ws.path}` +
      (ws.contextHints?.length ? `\n  Context: ${ws.contextHints.join('; ')}` : ''))
    .join('\n');

  if (!others) return basePrompt;

  return basePrompt + `\n\n## Open Workspaces\n\nThe following workspaces are also open. ` +
    `You can reference concepts from them but file operations are scoped to the current workspace.\n\n` +
    others;
}
```

### 6.2 Cross-Workspace References

`@ws:global/finance/portfolio.json` syntax. Implemented as a PI extension that:
1. Intercepts `tool_call` events for `read` and `bash`
2. Resolves `@ws:` prefixed paths to the target workspace's absolute path
3. Confirms cross-workspace writes with the user

### 6.3 Workspace Inference

When creating a new session with an initial message:
1. Keyword match against workspace `contextHints` and `tags`
2. `@` file reference match against workspace file trees
3. Recent session affinity (most recently used workspace)
4. Fallback → scratchpad (or picker if multiple strong matches)

---

## 7. Slash Commands

Implemented as a PI extension loaded from `~/.sero-ui/agent/extensions/`:

| Command | Handler | Description |
|---------|---------|-------------|
| `/workspace list` | Extension | List all known workspaces |
| `/workspace open {id}` | Extension + IPC | Add workspace to composite |
| `/workspace close {id}` | Extension + IPC | Remove from composite |
| `/workspace info` | Extension | Show current session's workspace |
| `/cd {path}` | Extension | Change cwd within workspace (updates tool resolution) |
| `/pwd` | Extension | Print workspace-relative cwd |
| `/fork {workspaceId}` | Extension + PI SDK | Fork session to another workspace |
| `/sessions` | Extension | List active sessions |
| `/pin @path` | Extension | Pin file to session context |

Some commands (workspace open/close) send IPC to Electron to update UI state.
This is done via a Sero-specific extension that uses `pi.exec()` or a custom
IPC bridge tool.

---

## 8. Implementation Phases

### Phase 1: Data Layer & Workspace Manager

**Files:**
- `electron/workspace.ts` — WorkspaceManager class
- `electron/ipc/workspace.ts` — workspace IPC handlers
- `src/types/ipc.ts` — add workspace types + IPC channels
- `src/stores/workspace.ts` — workspace Zustand store
- `src/types/electron.d.ts` — add workspace API types
- `electron/preload.ts` — expose workspace API

**Tasks:**
1. Define `WorkspaceRegistry`, `WorkspaceConfig`, `WorkspaceInfo` types in `ipc.ts`
2. Implement `WorkspaceManager` (load/save registry, read configs, ensure defaults)
3. Register workspace IPC handlers (list, create, remove, addFolder, open, close)
4. Expose via preload: `window.sero.workspace.*`
5. Create `workspace.ts` Zustand store
6. On app startup: `WorkspaceManager.ensureDefaults()` creates scratchpad + global
7. Wire into `electron/ipc/index.ts`

**Acceptance:** `window.sero.workspace.list()` returns scratchpad + global.
Adding a folder via `addFolder` registers it and creates `.sero-workspace.json`.

---

### Phase 2: Agent Pool

**Files:**
- `electron/ipc/agent.ts` — replace singleton with AgentPool
- `src/types/ipc.ts` — add `sessionId` to all AgentStreamEvents
- `src/stores/agent.ts` — multi-session agent state

**Tasks:**
1. Create `AgentPool` class with shared infrastructure (auth, models, settings)
2. `open(sessionId, sessionPath, workspaceId)` — creates per-workspace AgentSession
3. `prompt(sessionId, text)` — routes to correct session
4. `abort(sessionId)` / `close(sessionId)` — scoped lifecycle
5. All stream events tagged with `sessionId`
6. Update agent store: `agents: Record<string, AgentInstance>`, `focusedSessionId`
7. Update `initEventListener` to route events by `sessionId`

**Acceptance:** Can open two sessions in different workspaces simultaneously.
Prompting one doesn't affect the other. Events route correctly.

---

### Phase 3: Session–Workspace Binding

**Files:**
- `electron/ipc/sessions.ts` — workspace-scoped session creation and listing
- `src/stores/sessions.ts` — `sessionsByWorkspace` grouping
- `src/types/ipc.ts` — `workspaceId` on `SeroSessionInfo`

**Tasks:**
1. `sessions:create` takes `workspaceId`, uses workspace path as cwd
2. `sessions:list` accepts optional `workspaceId` filter; returns sessions
   with `workspaceId` derived from cwd→workspace mapping
3. Store changes: `sessionsByWorkspace: Record<string, SeroSessionInfo[]>`
4. `createSession` defaults to `scratchpad` when no workspace specified
5. `useSessionAgent` hook updated for multi-agent: focuses session, opens
   AgentSession if needed

**Acceptance:** Creating a session under "Sero Dev" stores it with the
workspace's cwd. Listing sessions groups them correctly by workspace.

---

### Phase 4: Sidebar Tree View

**Files:**
- `src/components/layout/MainSidebar.tsx` — workspace→session tree
- New: `src/components/layout/WorkspaceTree.tsx` — tree component

**Tasks:**
1. Replace `SessionList` with `WorkspaceTree` component
2. Workspace headers: name, expand/collapse, session count, active indicator
3. Sessions nested under workspace headers
4. Active agent indicator (dot/spinner) on workspace headers with streaming sessions
5. `+` button on workspace header creates session in that workspace
6. `[+ Add Workspace]` button opens native folder picker
7. Search filters across both workspace names and session titles
8. Click session → `setActiveSession` + `focusSession` in agent store
9. Highlight focused session distinctly

**Acceptance:** Sidebar shows tree of workspaces with nested sessions. Clicking
a session opens it in the ChatPanel. Active streaming shown with indicator.

---

### Phase 5: Remove ProjectBar, Update Shell

**Files:**
- `src/components/apps/coding/CodingWorkspace.tsx` — remove ProjectBar
- `src/components/apps/coding/ProjectBar.tsx` — delete file
- `src/components/layout/StatusBar.tsx` — workspace info
- `src/components/layout/TitleBar.tsx` — workspace name
- `src/components/layout/ChatPanel.tsx` — workspace badge, multi-agent

**Tasks:**
1. Delete `ProjectBar.tsx`
2. Remove ProjectBar from CodingWorkspace layout
3. CodingWorkspace fills its space (ActivityBar + Sidebar + Editor area)
4. StatusBar: show active workspace name, path, active agent count
5. TitleBar: show active workspace name in center
6. ChatPanel header: show workspace badge next to "Agent"
7. ChatPanel reads from `agents[focusedSessionId]` for messages/streaming
8. Prompt input routes to `sendPrompt(focusedSessionId, text)`

**Acceptance:** Full workspace-aware shell. Switching sessions in sidebar
updates ChatPanel, StatusBar, and TitleBar. No ProjectBar.

---

### Phase 6: Composite Environment & Cross-Workspace

**Files:**
- `electron/ipc/agent.ts` — composite prompt injection in AgentPool
- New: `~/.sero-ui/agent/extensions/sero-workspace.ts` — PI extension

**Tasks:**
1. `AgentPool.buildCompositePrompt()` — injects open workspace summaries
2. PI extension for `@ws:` cross-workspace path resolution
3. `tool_call` hook intercepts `read`/`write` with `@ws:` paths
4. Cross-workspace write confirmation via `ctx.ui.confirm()`
5. Workspace inference on session creation (keyword/tag matching)
6. Slash commands: `/workspace list`, `/workspace info`, `/cd`, `/pwd`

**Acceptance:** Agent in one workspace can read files from another open
workspace via `@ws:` prefix. System prompt mentions other open workspaces.

---

### Phase 7: Session Lifecycle & Polish

**Tasks:**
1. Session fork: `/fork {workspaceId}` creates branched session in target workspace
2. Session suspend/resume (resource management — dispose AgentSession, preserve .jsonl)
3. Auto-suspend after inactivity timeout (configurable)
4. Keyboard shortcut: ⌘K workspace picker (command palette style)
5. Workspace settings UI (edit `.sero-workspace.json` fields)
6. Drag-and-drop folder onto sidebar to add workspace
7. Workspace remove confirmation dialog
8. Empty state improvements (onboarding for first-run)

---

## 9. Migration from Current State

### What Gets Deleted
- `src/components/apps/coding/ProjectBar.tsx`

### What Gets Renamed/Moved
- Nothing — new files are additive

### What Gets Modified (summary)

| File | Change |
|------|--------|
| `src/types/ipc.ts` | Add workspace types/channels, `sessionId` on events, `workspaceId` on sessions |
| `src/types/electron.d.ts` | Add `SeroWorkspaceAPI` to `SeroAPI` |
| `electron/preload.ts` | Expose `window.sero.workspace.*` |
| `electron/main.ts` | Init WorkspaceManager on startup |
| `electron/ipc/index.ts` | Register workspace handlers |
| `electron/ipc/agent.ts` | Singleton → AgentPool |
| `electron/ipc/sessions.ts` | Workspace-scoped creation/listing |
| `src/stores/app.ts` | Minor: remove anything that moves to workspace store |
| `src/stores/agent.ts` | Multi-session pool |
| `src/stores/sessions.ts` | Grouped by workspace |
| `src/components/layout/MainSidebar.tsx` | Tree view |
| `src/components/layout/ChatPanel.tsx` | Multi-agent, workspace badge |
| `src/components/layout/StatusBar.tsx` | Workspace info |
| `src/components/layout/TitleBar.tsx` | Workspace name |
| `src/components/apps/coding/CodingWorkspace.tsx` | Remove ProjectBar |
| `src/hooks/useSessionAgent.ts` | Multi-agent bridge |

### Data Migration
- Existing sessions (under `~/.sero-ui/agent/sessions/`) remain valid
- Sessions created before workspaces existed will show under scratchpad
  (their cwd is `os.homedir()` which maps to scratchpad)
- No breaking changes to session .jsonl format (PI SDK handles this)

---

## 10. Open Questions (for later phases)

1. **Resource limits** — how many simultaneous AgentSessions before memory pressure?
   Start with no limit; add LRU eviction if needed.
2. **Workspace templates** — predefined structures for common use cases.
   Defer to Phase 7+.
3. **Remote workspaces** — workspace roots on remote filesystems.
   Defer; depends on container/SSH work.
4. **Session archiving** — move old sessions out of active listing.
   Defer; search + scroll is fine initially.
5. **Multi-window** — multiple Electron windows, each with their own composite.
   Defer; single window for now.

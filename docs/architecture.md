# Architecture

## Shell Layout

```
┌─────────────────────────────────────────────────────────────┐
│  TitleBar (⊞ sidebar toggle … workspace name … ⌘K … ⊟ chat)│
├──────────┬──────────────────────────────┬─┬─────────────────┤
│  Main    │                              │║│                 │
│  Sidebar │     Active App               │║│  Chat Panel     │
│  (apps   │     (CodingWorkspace / etc.) │║│  (global agent) │
│  + wksp  │                              │║│                 │
│    tree) │                              │║│                 │
├──────────┴──────────────────────────────┴─┴─────────────────┤
│  StatusBar (workspace · path · agents active)                │
└─────────────────────────────────────────────────────────────┘
```

The shell is always present: TitleBar, StatusBar. The MainSidebar (left) and
ChatPanel (right) are independently collapsible via toggle buttons in the
TitleBar.

The active app and ChatPanel sit inside a `ResizablePanelGroup` in `App.tsx`.
When the chat is collapsed, the panel group is replaced with a plain flex
container so the app fills the full width.

## Workspaces

Workspaces are the foundational organising unit. A workspace is a bounded
context — a project, a life domain, or a collection of related work — with its
own root directory and `.sero-workspace.json` config.

- **External paths** — workspaces point to real directories on disk
- **Two defaults** — scratchpad (ad-hoc) and global (cross-cutting data)
- **Composite environment** — multiple workspaces open simultaneously
- **Session binding** — every session belongs to exactly one workspace

```
~/.sero-ui/
├── agent/
│   ├── workspaces.json       # Registry of all known workspaces
│   └── sessions/             # All sessions (grouped by workspace cwd)
└── workspaces/
    ├── scratchpad/           # Default: ad-hoc tasks
    └── global/               # Default: personal data
```

See `docs/ideas/multi-workspace-spec.md` for the full specification.

## CodingWorkspace

```
┌────┬──────┬──────────────────────────────────┐
│ A  │ Side │                                  │
│ c  │ bar  │     Editor area (Dockview)       │
│ t  │      │     (empty placeholder)          │
│ .  │      │                                  │
└────┴──────┴──────────────────────────────────┘
```

Self-contained. Has its own ActivityBar (Explorer, Search, Source Control)
and CodingSidebar. No ProjectBar — workspaces replace project tabs (AD-010).
State is local (`useState`) — will extract to a Zustand store when real
functionality requires it.

## ChatPanel

Shell-level — persists across all apps. Uses ai-elements:
- `Conversation` + `ConversationContent` — auto-scrolling message container
- `Message` + `MessageContent` + `MessageResponse` — markdown + code blocks
- `PromptInput` + `PromptInputTextarea` + `PromptInputSubmit` — chat input

Reads from the **focused agent instance** in the multi-session agent pool.
Shows a workspace badge in the header.

## Component Map

```
src/
  App.tsx                    Shell — ResizablePanelGroup(ActiveApp, ChatPanel)

  components/
    layout/
      TitleBar.tsx           Drag region, sidebar toggle, workspace name
      MainSidebar.tsx        Apps list + WorkspaceTree
      WorkspaceTree.tsx      Workspace → session tree view with active indicators
      ChatPanel.tsx          Agent chat (ai-elements), multi-agent aware
      StatusBar.tsx          Workspace info, active agent count

    apps/coding/
      CodingWorkspace.tsx    Self-contained coding app (no ProjectBar)
      ActivityBar.tsx        Icon strip (Explorer, Search, Git)
      CodingSidebar.tsx      Panel content per activity

    ai-elements/             Vercel ai-elements (48 components, source in project)
    ui/                      shadcn/ui primitives (57 components)

  stores/
    app.ts                   Shell-level Zustand store
    workspace.ts             Workspace registry + composite environment
    sessions.ts              Sessions grouped by workspace
    agent.ts                 Multi-session agent pool

  hooks/
    useSessionAgent.ts       Bridges session selection → agent lifecycle

electron/
  main.ts                    Electron main process + workspace init
  preload.ts                 Preload script (window.sero)
  workspace.ts               WorkspaceManager (registry + config)
  env.ts                     .env loader
  ipc/
    index.ts                 IPC handler registry
    workspace.ts             Workspace IPC handlers
    sessions.ts              Session IPC handlers (workspace-scoped)
    agent.ts                 AgentPool — multiple simultaneous AgentSessions
```

## State Management

### Shell (Zustand: `src/stores/app.ts`)

| State             | Type             | Description                           |
| ----------------- | ---------------- | ------------------------------------- |
| `mainSidebarOpen` | `boolean`        | MainSidebar visibility                |
| `chatPanelOpen`   | `boolean`        | ChatPanel visibility                  |
| `activeApp`       | `AppId`          | Which app is mounted in the main area |
| `theme`           | `'dark'|'light'` | Theme, synced to `<html>` class       |

### Workspaces (Zustand: `src/stores/workspace.ts`)

| State              | Type             | Description                               |
| ------------------ | ---------------- | ----------------------------------------- |
| `workspaces`       | `WorkspaceInfo[]`| All registered workspaces                 |
| `openWorkspaceIds` | `string[]`       | IDs in the composite environment          |
| `activeWorkspaceId`| `string \| null` | Currently focused workspace               |

### Sessions (Zustand: `src/stores/sessions.ts`)

| State             | Type                | Description                           |
| ----------------- | ------------------- | ------------------------------------- |
| `sessions`        | `SeroSessionInfo[]` | All sessions (have `workspaceId`)     |
| `activeSessionId` | `string \| null`    | Currently selected session            |
| `searchQuery`     | `string`            | Filter for session list               |

### Agent Pool (Zustand: `src/stores/agent.ts`)

| State              | Type                            | Description                    |
| ------------------ | ------------------------------- | ------------------------------ |
| `agents`           | `Record<string, AgentInstance>` | Active agents keyed by session |
| `focusedSessionId` | `string \| null`                | Which agent shows in ChatPanel |

Each `AgentInstance` tracks: sessionId, sessionPath, workspaceId, messages,
isStreaming, error.

### CodingWorkspace (local `useState`)

| State          | Type          | Description                         |
| -------------- | ------------- | ----------------------------------- |
| `activePanel`  | `CodingPanel` | Which activity bar item is selected |
| `sidebarOpen`  | `boolean`     | CodingSidebar visibility            |

## Agent Architecture

```
┌─ Electron Main Process ─────────────────────────────────────┐
│                                                              │
│  WorkspaceManager (singleton)                                │
│    └─ workspaces.json registry                               │
│    └─ .sero-workspace.json configs                           │
│                                                              │
│  AgentPool                                                   │
│    ├─ Shared: AuthStorage, ModelRegistry, SettingsManager     │
│    ├─ Session A → AgentSession (cwd: /path/to/sero-dev)      │
│    ├─ Session B → AgentSession (cwd: ~/.sero-ui/workspaces/scratchpad) │
│    └─ Session C → AgentSession (cwd: /path/to/trading)       │
│                                                              │
│  Each AgentSession has:                                      │
│    - workspace-scoped tools (createCodingTools(cwd))          │
│    - workspace-scoped ResourceLoader (skills, AGENTS.md)      │
│    - its own SessionManager (persists to .jsonl)              │
│                                                              │
│  Events tagged with sessionId → IPC → renderer               │
└──────────────────────────────────────────────────────────────┘

┌─ Renderer ───────────────────────────────────────────────────┐
│                                                              │
│  Agent Store                                                 │
│    agents: {                                                 │
│      "session-a": { messages, isStreaming, workspaceId, ... }│
│      "session-b": { messages, isStreaming, workspaceId, ... }│
│    }                                                         │
│    focusedSessionId: "session-a"                             │
│                                                              │
│  ChatPanel reads from agents[focusedSessionId]               │
│  Sidebar shows streaming indicators per session              │
└──────────────────────────────────────────────────────────────┘
```

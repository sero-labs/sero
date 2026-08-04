# Architecture

## Shell Layout

```
┌─────────────────────────────────────────────────────────────┐
│ TitleBar: [win ctrl] ⊞ ◀▶ Explorer·Workspace★  [chips]  ⟳ git profile ⌘K ⊟  [win ctrl] │
├──────────┬──────────────────────────────┬─┬─────────────────┤
│  Main    │                              │║│                 │
│  Sidebar │     Active App               │║│  Chat Panel     │
│  (apps   │     (ExplorerWorkspace / etc.) │║│  (global agent) │
│  + wksp  │                              │║│                 │
│    tree) │                              │║│                 │
├──────────┴──────────────────────────────┴─┴─────────────────┤
│  StatusBar (workspace · path · agents active · zoom)         │
└─────────────────────────────────────────────────────────────┘
```

The shell is always present: TitleBar (40px), StatusBar (24px). The
MainSidebar (left) and ChatPanel (right) are independently collapsible via
toggle buttons in the TitleBar.

Both bars render at a constant physical size regardless of app zoom: they
carry the `chrome-zoom-invariant` class, which counter-scales against the
`--zoom-factor` CSS variable (`apps/desktop/src/styles/global.css`) set by
`useZoomStore` (`src/stores/zoom.ts`). Only the active app content scales
with `⌘+` / `⌘-` / `⌘0` (accelerators in the View menu,
`electron/features/updater/menu.ts`); a zoom control (− % +) lives in the
StatusBar. Zoom factor persists as `zoomFactor` in `layout.json`.

### Window frame

The native window frame differs per platform (`apps/desktop/electron/app-main.ts`,
constants in `electron/chrome.ts`):

- **macOS** — `titleBarStyle: 'hiddenInset'`, native traffic lights; the
  TitleBar reserves a 78px spacer on the left.
- **Windows** — `titleBarStyle: 'hidden'` with a native `titleBarOverlay`
  (height 40px); the TitleBar reserves a 138px spacer on the right for the
  overlay buttons.
- **Linux** — `frame: false`; the TitleBar renders custom window controls
  (`src/components/layout/titlebar/WindowControls.tsx`) on the right, driven
  by the `sero:window:*` IPC channels exposed as `window.sero.window`.

The active app and ChatPanel sit inside a `ResizablePanelGroup` in `App.tsx`.
When the chat is collapsed, the panel group is replaced with a plain flex
container so the app fills the full width.

## Workspaces

Workspaces are the foundational organising unit. A workspace is a bounded
context — a project, a life domain, or a collection of related work — with its
own root directory and `.sero-workspace.json` config.

- **External paths** — workspaces point to real directories on disk
- **One default** — global (cross-cutting data)
- **Composite environment** — multiple workspaces open simultaneously
- **Session binding** — every session belongs to exactly one workspace
- **Open/closed** — purely visual; controls sidebar visibility, persisted in
  registry. All workspaces start open. Closing hides from sidebar; re-add via
  folder picker to reopen. No separate "closed workspaces" UI section.
- **Runtime mode** — workspaces prefer Apple Container or Docker/Podman-backed runtimes
  by default, but can run in host mode on macOS/Linux as a supported fallback
  when containers are unavailable or disabled.
- **Collapsed/expanded** — tree node chevron state persisted in localStorage

For runtime setup and host-mode limitations, see
[`docs/sero.md`](sero.md),
[`docs/features/docker-runtime.md`](features/docker-runtime.md), and
[`docs/guides/macos-containers.md`](guides/macos-containers.md).

```
~/.sero-ui/
├── agent/
│   ├── workspaces.json       # Registry: id, path, open (boolean)
│   └── sessions/             # All sessions (flat, mapped to workspaces by cwd)
└── workspaces/
    └── global/               # Default: personal data
```

See `docs/ideas/multi-workspace-spec.md` for the full specification.

## ExplorerWorkspace

```
┌────┬──────┬──────────────────────────────────┐
│ A  │ Side │                                  │
│ c  │ bar  │     Editor area (Dockview)       │
│ t  │      │     (empty placeholder)          │
│ .  │      │                                  │
└────┴──────┴──────────────────────────────────┘
```

Self-contained. Has its own ActivityBar (Explorer, Search, Source Control)
and ExplorerSidebar. No ProjectBar — workspaces replace project tabs (AD-010).
State is local (`useState`) — will extract to a Zustand store when real
functionality requires it.

## ChatPanel

Shell-level — persists across all apps. Uses ai-elements:
- `Conversation` + `ConversationContent` — auto-scrolling message container
- `Message` + `MessageContent` + `MessageResponse` — markdown + code blocks
- `PromptInput` + `PromptInputTextarea` + `PromptInputSubmit` — chat input

Reads from the **focused agent instance** in the multi-session agent pool.
Shows a workspace badge in the header. Keyed on `sessionId` so switching
sessions remounts instantly (no scroll animation). Uses `initial="instant"`
for immediate scroll-to-bottom on load; streaming content scrolls smoothly.

When collaboration UI is visible, the panel swaps to an internal vertical
`ResizablePanelGroup`: the main conversation stays on top while the
collaboration activity/details section becomes a resizable lower tray. The
tray uses the same layout persistence pipeline as the shell sidebars, so the
last collaboration tray size is restored from layout state.

## Component Map

```
src/
  App.tsx                    Shell — ResizablePanelGroup(ActiveApp, ChatPanel)

  components/
    layout/
      shell/
        TitleBar.tsx          Drag region, platform window-control area, composes titlebar/*
        MainSidebar.tsx       Apps list + WorkspaceTree
        ChatPanel.tsx         Agent chat (ai-elements), multi-agent aware
        StatusBar.tsx         Workspace info, active agent count, zoom control
      titlebar/
        WindowControls.tsx    Linux custom minimize/maximize/close (sero:window:* IPC)
        NavButtons.tsx        Back/forward buttons, bound to navigation.ts
        TitleBarBreadcrumb.tsx App icon + name · workspace, pin/unpin star
        ShortcutChips.tsx     Pinned-app icon chips, centered in the bar
      workspace/
        WorkspaceTree.tsx     Workspace → session tree view with active indicators

    apps/explorer/
      ExplorerWorkspace.tsx    Self-contained explorer app (no ProjectBar)
      ActivityBar.tsx        Icon strip (Explorer, Search, Git)
      ExplorerSidebar.tsx      Panel content per activity

    ai-elements/             Vercel ai-elements (48 components, source in project)
    ui/                      shadcn/ui primitives (57 components)

  stores/
    app.ts                   Shell-level Zustand store (barrel over stores/app/)
    workspace.ts             Workspace registry + composite environment
    sessions.ts              Sessions grouped by workspace
    agent.ts                 Multi-session agent pool
    navigation.ts            Back/forward app history (useNavigationStore)
    zoom.ts                  Page zoom + zoom-invariant chrome (useZoomStore)

  hooks/
    useSessionAgent.ts       Bridges session selection → agent lifecycle
    useKeyboardShortcuts.ts  ⌘[ / ⌘] navigation, mouse buttons 4/5, other shell shortcuts

  lib/
    open-app.ts              setActiveApp, navigateBack/navigateForward helpers

electron/
  main.ts                    Electron main process + workspace init
  app-main.ts                BrowserWindow creation; per-platform frame/titleBarStyle
  chrome.ts                  Shared chrome constants (bar height, colors)
  preload.ts                 Preload script (window.sero, incl. window.sero.window)
  workspace.ts               WorkspaceManager (registry + config + composite env)
  sero-extension.ts          Inline PI extension factory (composite prompt, @ws:, commands)
  env.ts                     .env loader
  features/updater/menu.ts   Application menu — View menu zoom accelerators (⌘+/⌘-/⌘0)
  ipc/
    index.ts                 IPC handler registry
    workspace.ts             Workspace IPC handlers + native folder picker
    sessions.ts              Session IPC handlers (workspace-scoped)
    agent.ts                 AgentPool — multiple simultaneous AgentSessions
    platform/system/window.ts  sero:window:* handlers (minimize/maximize/close, overlay colors)
```

## State Management

### Shell (Zustand: `src/stores/app.ts`)

| State              | Type             | Description                                              |
| ------------------ | ---------------- | --------------------------------------------------------- |
| `mainSidebarOpen`  | `boolean`        | MainSidebar visibility                                    |
| `chatPanelOpen`    | `boolean`        | ChatPanel visibility                                      |
| `activeApp`        | `AppId`          | Which app is mounted in the main area                     |
| `theme`            | `'dark'|'light'` | Theme, synced to `<html>` class                            |
| `favouriteApps`    | `string[]`       | Apps pinned in the MainSidebar                             |
| `chromeShortcuts`  | `string[]`       | Apps pinned as icon chips in the TitleBar (max 8, first run seeds from `dashboard` + `favouriteApps`) |

### Navigation (Zustand: `src/stores/navigation.ts`)

| State     | Type          | Description                                                |
| --------- | ------------- | ------------------------------------------------------------ |
| `entries` | `NavEntry[]`  | Capped 50-entry history of visited apps (session-only)       |
| `index`   | `number`      | Cursor into `entries`                                         |

`push`/`back`/`forward` back the TitleBar's back/forward buttons
(`src/components/layout/titlebar/NavButtons.tsx`), the `⌘[` / `⌘]`
shortcuts, and mouse buttons 4/5 (`src/hooks/useKeyboardShortcuts.ts`).
`setActiveApp(app, { skipHistory? })` in `src/lib/open-app.ts` pushes new
entries; history-driven navigation passes `skipHistory: true`.

### Zoom (Zustand: `src/stores/zoom.ts`)

| State    | Type     | Persisted             | Description                          |
| -------- | -------- | ---------------------- | ------------------------------------- |
| `factor` | `number` | `zoomFactor` (layout.json) | Page zoom applied via `webFrame.setZoomFactor` |

Driven by the View menu's `⌘+` / `⌘-` / `⌘0` accelerators
(`electron/features/updater/menu.ts`) and the StatusBar zoom control.

### Workspaces (Zustand: `src/stores/workspace.ts`)

| State              | Type             | Persisted          | Description                          |
| ------------------ | ---------------- | ------------------ | ------------------------------------ |
| `workspaces`       | `WorkspaceInfo[]`| registry (main)    | All registered workspaces            |
| `openWorkspaceIds` | `string[]`       | registry (`open`)  | IDs visible in sidebar               |
| `collapsedIds`     | `string[]`       | localStorage       | IDs with collapsed tree nodes        |
| `activeWorkspaceId`| `string \| null` | localStorage       | Currently focused workspace          |

### Sessions (Zustand: `src/stores/sessions.ts`)

| State             | Type                | Persisted    | Description                      |
| ----------------- | ------------------- | ------------ | -------------------------------- |
| `sessions`        | `SeroSessionInfo[]` | .jsonl (main)| All sessions (have `workspaceId`)|
| `activeSessionId` | `string \| null`    | localStorage | Currently selected session       |
| `searchQuery`     | `string`            | —            | Filter for session list          |

### Agent Pool (Zustand: `src/stores/agent.ts`)

| State              | Type                            | Description                    |
| ------------------ | ------------------------------- | ------------------------------ |
| `agents`           | `Record<string, AgentInstance>` | Active agents keyed by session |
| `focusedSessionId` | `string \| null`                | Which agent shows in ChatPanel |

Each `AgentInstance` tracks: sessionId, sessionPath, workspaceId, messages,
isStreaming, error.

### ExplorerWorkspace (local `useState`)

| State          | Type          | Description                         |
| -------------- | ------------- | ----------------------------------- |
| `activePanel`  | `ExplorerPanel` | Which activity bar item is selected |
| `sidebarOpen`  | `boolean`     | ExplorerSidebar visibility            |

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
│    ├─ Session B → AgentSession (cwd: ~/.sero-ui/workspaces/global) │
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

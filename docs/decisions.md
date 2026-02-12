# Architecture Decisions

## AD-001: Shell + Mountable Apps

The main sidebar selects which app fills the main area. CodingWorkspace is one
app; Calendar, Todos, etc. are future apps. Each app is a self-contained
component — the shell doesn't know about project tabs or file explorers.

## AD-002: CodingWorkspace Owns Its Layout

Project tabs, activity bar, and sidebar are internal to the coding app. State
is local (`useState`) until we need persistence, then we'll add a dedicated
store.

## AD-003: Global Resizable Chat Panel

The agent chat is shell-level, not per-app. It persists across app switches.
Collapsible via PanelRight toggle in TitleBar. When collapsed, the
`ResizablePanelGroup` is replaced with a plain flex container.

**react-resizable-panels v4 gotchas:**
- Use string percentages: `defaultSize="30%"`, `minSize="300px"`, `maxSize="50%"`
- Override Group's inline `width: 100%` when it's a flex child:
  `style={{ flex: '1 1 0%', minWidth: 0, width: 'auto' }}`

## AD-004: Electron Window

```typescript
titleBarStyle: 'hiddenInset',
trafficLightPosition: { x: 12, y: 12 },
backgroundColor: '#0a0a0b',
```

Custom TitleBar provides drag region (`-webkit-app-region: drag`). Interactive
elements opt out with `no-drag`. 78px left spacer for traffic lights.

## AD-005: Theme System

Dark-first. `<html class="dark">` toggles dark/light. Two layers of CSS
variables in `global.css`:
- **Sero tokens** (`--bg-base`, `--bg-surface`, `--text-primary`, etc.)
- **shadcn/ui tokens** (`--background`, `--foreground`, `--primary`, etc.)

Zustand store manages state and applies the class.

## AD-006: ai-elements for Chat UI

Source lives in `src/components/ai-elements/` (not node_modules). Depends on
shadcn primitives. Currently using Conversation, Message, PromptInput.
Will integrate with Pi agent session via Vercel AI SDK `useChat` hook.

## AD-007: Build Pipeline

| Target   | Tool    | Entry                | Output                    | Format |
| -------- | ------- | -------------------- | ------------------------- | ------ |
| Renderer | Vite 6  | `src/main.tsx`       | `dist/renderer/`          | ESM    |
| Main     | esbuild | `electron/main.ts`   | `dist/electron/main.mjs`  | ESM    |
| Preload  | esbuild | `electron/preload.ts`| `dist/electron/preload.js`| CJS    |

Preload must be CJS. `electron`, `node-pty`, `@mariozechner/*` are external.
`scripts/dev.sh` starts Vite first, waits for :5173, then launches Electron.

## AD-008: Preload API (`window.sero`)

Minimal — exposes `platform: string`. All IPC via `contextBridge` with
`contextIsolation: true` and `nodeIntegration: false`. Will expand for
filesystem, PTY, container lifecycle, and agent session bridge.

## AD-009: Incremental Development

Components start as named placeholders. Get layout and data flow right first,
fill in real functionality one piece at a time.

## AD-010: Multi-Workspace Architecture

Workspaces are Sero's foundational organising unit, replacing project tabs
(ProjectBar is removed). A workspace is a bounded context with its own root
directory, `.sero-workspace.json` config, and PI SDK skill/extension discovery.

- **External paths** — workspaces point to real directories on disk (like PI's
  `cwd`). Dev projects stay in `~/Dev/...`, not inside `~/.sero-ui/`.
- **Workspace = PI SDK cwd** — each workspace maps to
  `createAgentSession({ cwd: workspace.path })` with `createCodingTools(cwd)`.
- **Two default workspaces** — `scratchpad` (ad-hoc) and `global` (cross-cutting
  personal data), created on first run under `~/.sero-ui/workspaces/`.
- **Composite environment** — multiple workspaces open simultaneously, summaries
  injected into system prompt for cross-workspace awareness.

See `docs/ideas/multi-workspace-spec.md` for the full implementation plan.

## AD-011: Multiple Simultaneous AgentSessions

Singleton `AgentSession` replaced by `AgentPool` — a `Map<sessionId, AgentSession>`
in the Electron main process. Shared infrastructure (AuthStorage, ModelRegistry,
SettingsManager) created once; per-session resources (ResourceLoader, tools,
SessionManager) scoped to the session's workspace cwd.

All `AgentStreamEvent`s tagged with `sessionId` so the renderer routes events
to the correct store entry. Active agents indicated in the sidebar.

## AD-012: Session–Workspace Binding

Every session is permanently bound to one workspace at creation. The binding
is implicit: PI SDK's `SessionManager.create(workspacePath, sessionDir)` stamps
the workspace path as `cwd` in the session header. Sessions are grouped in the
UI by mapping cwd → workspace.

New sessions default to `scratchpad` unless the user explicitly selects a
workspace (VSCode-style folder picker).

## AD-013: ChatPanel Stays Global, Sessions Route Context

ChatPanel remains shell-level (per AD-003). It shows whichever session is
focused (`focusedSessionId` in agent store). Selecting a session in a different
workspace changes the ChatPanel's content and the agent's context, but the
panel itself doesn't move or duplicate.

## AD-014: Composite Environment via Inline Extension Factory

Cross-workspace awareness is injected via an inline PI SDK extension factory
(`createSeroExtensionFactory` in `electron/sero-extension.ts`) passed to each
session's `DefaultResourceLoader.extensionFactories`. The factory has closure
access to the `WorkspaceManager` and provides:

- `before_agent_start` — injects open workspace summaries into system prompt
- `input` event — expands `@ws:id/path` references to absolute paths
- `/workspace` command — list, info, open, close
- `/pwd` command — print workspace-relative cwd

The composite environment state (which workspaces are open) is tracked in both
the renderer store and the main-process `WorkspaceManager`, synced via IPC.

## AD-015: Native Folder Picker for Workspace Addition

Adding a workspace uses Electron's `dialog.showOpenDialog` via a dedicated
`sero:workspace:pick-folder` IPC channel. This gives the native macOS folder
picker instead of a text input. The picked path is registered as a workspace
with auto-generated `.sero-workspace.json` if none exists.

# Architecture Decisions

## AD-001: Shell + Mountable Apps

The main sidebar selects which app fills the main area. ExplorerWorkspace is one
app; Calendar, Todos, etc. are future apps. Each app is a self-contained
component — the shell doesn't know about project tabs or file explorers.

## AD-002: ExplorerWorkspace Owns Its Layout

Project tabs, activity bar, and sidebar are internal to the explorer app. State
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

Preload must be CJS. `electron`, `node-pty`, `@earendil-works/*` are external.
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
- **Default workspace** — `global` (cross-cutting personal data), created on first run under `~/.sero-ui/workspaces/`.
- **Composite environment** — multiple workspaces open simultaneously, summaries
  injected into system prompt for cross-workspace awareness.
- **Open/closed is visual only** — the registry `open` flag controls sidebar
  visibility. All new workspaces start open. Closing removes from sidebar;
  re-add via folder picker to reopen. No "closed workspaces" UI section — it
  was removed as redundant (the folder picker already handles reopening).
- **Collapsed/expanded state** — tree node chevron state persisted in
  `localStorage` (`sero:workspace:collapsed`), separate from open/close.

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

New sessions default to `global` unless the user explicitly selects a
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

## AD-016: Persisted UI State

Selection and layout state survives reload:

| What                        | Where                        | Key                        |
| --------------------------- | ---------------------------- | -------------------------- |
| Active workspace ID         | `localStorage`               | `sero:workspace:active`    |
| Active session ID           | `localStorage`               | `sero:session:active`      |
| Collapsed workspace nodes   | `localStorage`               | `sero:workspace:collapsed` |
| Workspace open/closed       | `workspaces.json` (`open`)   | —                          |

On startup, `useSessionAgent` detects the restored `activeSessionId`, waits
for `loadSessions` to populate the session list, then calls `agent.open` to
hydrate the ChatPanel. The `Conversation` component uses `key={sessionId}` +
`initial="instant"` so switching sessions shows the latest messages immediately
without scroll animation.

**Auth:** Sero reads OAuth tokens directly from Pi's managed auth store at
`PI_CODING_AGENT_DIR/auth.json` (`~/.sero-ui/agent/auth.json` in Sero's default
profile). No separate Sero auth file — Pi CLI handles `/login` and token
refresh, and both environments share the same underlying credential model.

## AD-017: Session Deletion Confirmation

Session delete uses a Radix popover (not `window.confirm`) for inline
confirmation. Small "Delete this session?" popover with Cancel/Delete buttons,
positioned next to the trash icon. Consistent with the app's UI language and
avoids blocking native dialogs.

## AD-018: Native macOS Container Integration

Every workspace gets a dedicated Linux VM via Apple's Containerization
framework (`container` CLI v0.8.0+). One container per workspace, shared by
all sessions in that workspace.

**Architecture:** The Pi SDK `AgentSession` runs on the Electron host process
(managing auth, models, extensions, session persistence). All tool execution
(bash, read, write, edit, ls, read_terminal) is proxied into the container
via `container exec`. The `DefaultResourceLoader` still reads from the host
filesystem (bind mount makes files visible both sides).

**Lifecycle:** Lazy creation — containers start on first `agent.open()`, not
on workspace open. Containers stop on app quit. Orphaned containers are
cleaned up on startup.

**Key design:**
- `electron/container/` — self-contained module: types, lifecycle, files,
  terminal, image, tools, system-prompt, file-watcher
- `ContainerManager` singleton in shared-infra, used by agent pool and
  terminal IPC handlers
- Workspace files bind-mounted: `<workspace.path>` → `/workspace`
- SSH agent forwarding enabled (`--ssh` on `container run`)
- Ghost container recovery follows the protocol in `docs/libs/container.md`
- Terminal via `node-pty` → `container exec -it` → xterm.js in ExplorerWorkspace
- Container status indicator in WorkspaceTree (dot: none/starting/running/error)
- File watcher on host-side bind-mount dirs for future file tree integration
- System prompt injected via `before_agent_start` hook with container-specific
  instructions (0.0.0.0 binding, setsid for background processes, etc.)
- Fallback: if container fails to start, session uses host-side tools

## AD-019: Centralized Dev Server Management

Dev servers started by the agent inside containers are registered with a
host-side `DevServerRegistry` so the user can see, stop, restart, and open
them from the UI without going through the agent.

**Architecture:**
- `DevServerRegistry` (in `electron/container/dev-server-registry.ts`) is an
  in-memory registry keyed by `${workspaceId}:${port}`. Not persisted — servers
  are ephemeral (tied to container lifetime).
- `register_dev_server` agent tool — the agent calls this after starting a dev
  server and confirming it's listening. Provides name, port, command, framework.
- The registry cross-references `PortScanner` for liveness: every 5s it checks
  if the registered port is still in the scanner's detected list. Status
  transitions (running → stopped) are pushed to the renderer.
- **Stop** = `fuser -k <port>/tcp` inside the container.
- **Restart** = stop + re-run the original command (via `setsid`).
- System prompt instructs the agent to always call `register_dev_server` after
  starting a dev server.

**UI:**
- `DevServerIndicator` in the StatusBar — shows running/total count with a
  green dot when servers are active.
- Click opens a popover listing all servers with name, URL, framework badge,
  status dot, and hover controls (open in browser, stop, restart, remove).
- Events pushed via `sero:dev-server:event` IPC channel keep the renderer
  store (`src/stores/dev-server.ts`) in real-time sync.

## AD-020: Tool Bridge — All App Tools via sero-cli

**Problem:** Each extension tool registers its own JSON schema in the API
request. With 15+ extensions, tool schemas alone consumed ~3,000–5,000 tokens
per turn — before the user even sent a message. Combined with the system
prompt, a "tell me a joke" session started at 13k+ tokens.

**Decision:** All app/extension tools are bridged into the single `sero-cli`
tool at runtime. In addition, extension slash commands are exposed as CLI
commands for agent use while remaining available to the user as slash
commands.

**Mechanism:**
- `bridgeExtensionTools()` runs during `DefaultResourceLoader` setup.
- The generic schema bridge (`electron/cli/schema-bridge.ts`) converts a
  tool's TypeBox schema into CLI-style arg parsing (positionals + `--flags`).
- Array/object parameters accept JSON strings and are parsed automatically.
- Plugin tools are bridged **manifest-first** via `sero.plugin.bridgeTools`:
  - `undefined` / `true` → bridge all tools from that plugin
  - `false` → bridge none
  - `string[]` → bridge only selected tool names
- Bridged tools and bridged extension commands resolve against the
  **current session's loaded extension instance** at execute time, not the
  first session that registered the command.
- Bridged execution contexts include a narrow execution-scoped
  `sessionRuntime` capability (`sendUserMessage`, `sendMessage`) for
  current-session side effects without exposing raw `pi`.
- **Single-command bridged results preserve rich content** (`text` + `image`
  blocks) and `details` through `sero-cli`.
- **Multi-command CLI batches stay text-only by design.** If any bridged
  command in a batch returns non-text blocks, `sero-cli` returns the combined
  textual transcript plus `details.richOutputFallback = true` and a fallback
  notice telling the agent/user to rerun the image-producing command alone.

**Result:** Only 6 tool schemas in the API request (bash, read, write, edit,
browser, sero-cli) instead of 16+. Saves ~2,000–3,000 tokens per session.

**Rules:**
- **All app/extension tools MUST use `pi.registerTool()`** — never add them
  as `customTools` in `createAgentSession()` (those bypass the bridge).
- **Plugin authors do not edit a central allowlist** just to bridge a normal
  plugin tool. Use `sero.plugin.bridgeTools` only when you need to opt out or
  bridge selectively.
- **Tools that need session side effects** must depend on execution-scoped
  runtime capabilities, not on registration-scoped captured extension objects.
- **Core coding tools** (bash, read, write, edit, automation_browser) remain standalone
  because models are trained to use them with structured parameters.
- Tools work unchanged in the **Pi CLI** — the bridge is Sero-only.

## AD-021: Subagent Orchestration System

**Problem:** The main agent's context window gets polluted when handling complex
multi-part tasks. No way to delegate specialist work to isolated agents or
parallelise independent subtasks.

**Decision:** In-process subagent system using transient `AgentSession` instances
via the Pi SDK. Markdown-first agent definitions, three execution modes
(single/parallel/chain), and a desktop UI panel for monitoring.

**Key design choices:**

- **In-process sessions, not subprocesses** — Reuses SharedInfra,
  ContainerManager, and prompt infrastructure. No IPC overhead.
- **Global-only agents** — `.md` files in `~/.sero-ui/agent/agents/`. Simpler
  discovery model; project-scoped agents deferred to v2.
- **Dynamic discovery** — Agent files are re-read on every tool call. Agents
  added mid-session are immediately available.
- **`subagent` is standalone** — Deliberate exception to AD-020. Registered via
  `pi.registerTool()` (not bridged into `sero-cli`) so the main agent can pass
  structured nested parameters directly.
- **No recursion** — Subagents cannot spawn further subagents or call
  `create_agent`. Child sessions use a reduced extension factory.
- **Reduced child extension factory** — Injects Sero CLI + container prompt
  blocks only. No external extension package loading in v1.
- **Snapshot + events for UI** — Renderer uses mount-time snapshot hydration plus
  live IPC events. Mirrors the user-feedback pattern.
- **Orchestration in explorer sidebar** — Uses the existing `ActivityBar` +
  `ExplorerSidebar` structure. No new shell-level panel.

**Concurrency model:**
- `maxConcurrent` (default: 4) — per-invocation fan-out cap
- `maxTotal` (default: 8) — global active child session cap
- `AbortController` cascade from parent session

**References:**
- Design spec: [docs/subagent-design-spec.md](subagent-design-spec.md)
- PRD: [docs/subagent-prd.md](subagent-prd.md)
- E2E test procedures: [docs/testing/e2e-subagent-testing.md](testing/e2e-subagent-testing.md)

## AD-022: Multi-Profile System

**Problem:** Sero is a single-user app with all state under `~/.sero-ui/`.
Users who want separate environments for work, personal, and research
contexts must share workspaces, sessions, auth tokens, and settings.

**Decision:** Profile system that maps each profile to an independent
`SERO_HOME` directory. Profiles are registered in a fixed-location
`~/.sero-ui/profiles.json` file. Switching profiles restarts the app.

**Key design choices:**

- **Profile = SERO_HOME** — Existing architecture already resolves all state
  from `SERO_HOME`. Changing this one variable at startup scopes everything:
  workspaces, sessions, auth, settings, layout, app state, skills, etc.
  Zero changes needed to existing data-flow code.
- **Fixed registry location** — `~/.sero-ui/profiles.json` is the one file
  read before anything else. It must live at a known path because we don't
  know the profile (and thus `SERO_HOME`) until we read it.
- **Restart-based switching** — `app.relaunch()` + `app.exit()`. Lazy
  singletons in `shared-infra.ts` (AuthStorage, ModelRegistry, etc.) are
  initialised once and never reset. A clean restart is the only safe way to
  ensure no stale state leaks between profiles.
- **Automatic migration** — Existing `~/.sero-ui/` installations are silently
  enrolled as a "Default" profile. No data moved, no manual action needed.
- **Profile-scoped localStorage** — All `localStorage`/`sessionStorage` keys
  are prefixed with `sero:p:<profileId>:` to prevent cross-contamination.
  Legacy un-prefixed keys are auto-migrated on first read.
- **Per-profile Chromium userData** — `app.setPath('userData')` routes to
  `~/Library/Application Support/sero/profiles/<profileId>/`, isolating
  cookies, DOM storage, and caches.
- **Name ≠ folder** — Profile `name` is a user-editable display label,
  independent of the filesystem path. A profile named "Work" can live at
  `/data/sero-work/`.

**What's NOT profile-scoped:**
- Electron binary and app code (shared)
- Volta/Node.js toolchain (shared)
- The `profiles.json` registry itself (shared)

See [docs/profiles.md](profiles.md) for the full user guide.

## AD-023: Supported Desktop Platforms

**Decision:** Sero supports Apple Silicon macOS, Linux x64/arm64, and Windows x64.
macOS on Intel CPUs is explicitly unsupported and must not appear as a planned
or pending Sero target. Windows ARM64 is not supported today, but may be
revisited as a future target when runner, packaging, and browser-pack validation
exist.

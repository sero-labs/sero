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
in the Electron main process. Shared infrastructure is created once; per-session
resources (ResourceLoader, tools, SessionManager) are scoped to the session's
workspace cwd. AD-026 replaces the original auth and registry pair with one
shared `ModelRuntime`.

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
  singletons in `shared-infra.ts` (`ModelRuntime`, settings, and managers) are
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

## AD-024: Unified Git Layer

**Problem:** Six overlapping git/GitHub subsystems grew independently: a
jj-vocabulary core layer (the only one that is container-aware and injects
Sero's GitHub token), a raw-exec worktree layer for background loops, the
sero-git-plugin's own complete git stack (also run in-process by electron
main), three GitHub credential postures (Sero OAuth vs ambient `gh login` vs
anonymous), two renderer repo-state caches, two PR composers, and renderer-side
remote-connect policy keyed on error-message strings. Full audit:
`docs/features/vcs-unification.md`.

**Decision:** One main-process module (`electron/features/git/`) owns git
execution, local operations, checkpoints/snapshots, worktrees, GitHub, and repo
state. Everything else — renderer, plugins, CLI, agent tools, background
loops — is a consumer.

- **Plain git vocabulary everywhere.** The jj terms (changeId, bookmark,
  op log, abandon, squash) were renaming, not abstraction, and jj support was
  removed. "Checkpoint" and "snapshot" remain as Sero product concepts.
- **One spawn seam.** GitExecutor (evolved GitRunner) is the only place that
  spawns `git` or `gh`, addressing repos by workspaceId (runtime-routed) or
  explicit path (worktrees) — auth env injection in both modes.
- **GitHub = `gh` CLI only, through GitExecutor.** Sero's OAuth token is
  injected as `GH_TOKEN` (env wins over gh's own login), so signed-in users get
  one credential everywhere and ambient `gh login` is a uniform fallback.
  Device-flow auth acquisition stays REST in the auth manager.
- **sero-git-plugin is a pure consumer**: it keeps the UI, widgets, `/git`
  command, and `git_manager` tool registration; the host owns the service,
  state.json writing, and invalidation.
- **One repo-state cache** (GitStateService, push-model state.json) feeds the
  titlebar, explorer, and plugin UI alike.
- **Remote-connect/publish policy lives in main** as atomic operations; the
  renderer holds presentation state only.

**Rules:**
- Never spawn `git`/`gh` outside GitExecutor for workspace/worktree repos.
  (Documented one-offs: plugin installFromGit, orchestrator catalog cache,
  container provisioning, plugin discovery search.)
- New git features extend GitService/GitHubService — never a parallel helper.
- Repo state reaches UIs only through GitStateService.

## AD-025: Git UI Ownership — The Plugin Owns Git

**Problem:** AD-024 unified the git *infrastructure*; the UI stayed split. Git
work is served by four surfaces with three data paths and two visual systems, and
there is no general way for a plugin to contribute a view to a host surface —
so git components accumulated in the host by default. Full UX spec: wayfinder
map `sero-labs/sero#294`. Full UX spec: `docs/features/git-ux.md`.

**Decision:** The **plugin owns every git view and the renderer-side repo cache.
The host owns the git *service* (AD-024) and the extension points views mount
into.** No git UI and no git state live in `apps/desktop`.

- **Views are contributed, not imported.** Both git surfaces — the full-screen
  Git app and the Explorer's Git view — ship from `sero-git-plugin` and mount
  through the same mechanism as `sero.app.search` → `GraphifySearch`: a manifest
  slot, a selector, and a mount that wraps the federated component in
  `AppProvider` + `PluginStyleScope`. The host contributes the *slot*, never the
  content.
- **One state path: `useVcsStore` moves into the plugin.** The three renderer
  paths (`useAppState` + `gitApp.run`, `useVcsStore` + `window.sero.vcs`, bare
  `window.sero.vcs.pr*`) collapse into one store, owned by `sero-git-plugin`,
  calling `window.sero.vcs` directly. Nothing is published for it: **no vcs hook
  in `@sero-ai/app-runtime`**, so no public API surface to keep stable and no
  version floor for repo data.
- **Nothing is lost by moving it.** Every action outside the cached reads is the
  same shape — call the bridge, then refresh (`undo`, `restoreCheckpoint`,
  `createCheckpoint`, `fetch`, `push` …). The pagination, working-copy status,
  branch/remote lists and diff cache move as-is; the ref-counted pushed-state
  subscription moves with them, started by the plugin instead of the explorer's
  lifecycle wiring.
- **Two host consumers are dealt with, not worked around.** The status bar's
  branch picker is **deleted** (superseded by the Git app; unused). Checkpoint
  restore — undoing a chat turn — calls `window.sero.vcs` **directly**: three
  one-shot calls in a dialog that gain nothing from a cache, and this keeps a
  host feature from depending on the git plugin being installed.
- **Views own their own view state.** A contributed view unmounts when hidden.
  Data survives it — plugin code runs in the host's JS realm and the federated
  module stays loaded, so the plugin's store outlives its views exactly as a host
  store would. Only position is lost, and the plugin keeps it: the graph divider
  in its persisted app state (per workspace, per #302), selection and scroll
  offset in a memory cache. The host does **not** hold contributed views
  mounted-while-hidden — that would bind every contributed view of every plugin
  to staying in memory, keep invisible subscriptions running, and mask staleness
  bugs until a restart.
- **`@pierre/diffs` and `@pierre/trees` move to the plugin** and come out of
  `apps/desktop`. All host usage is five files in one folder
  (`components/apps/explorer/editor/`); nothing else consumes them. The library
  renders into a shadow root and injects its own styles there, so the plugin
  build's CSS scoping neither reaches nor breaks it, and design-token alignment
  still works through inherited custom properties.

**Rules:**
- Never add a git component or git state to `apps/desktop`. A new git surface is
  a plugin contribution plus, if no slot fits, a new slot.
- **`sero-git-plugin` holds the only renderer-side cache of repo state.** Other
  renderer code needing a git operation calls `window.sero.vcs` directly for
  one-shot work and does not cache the result. A second cache is the defect
  AD-024 removed in main and this decision removes in the renderer.
- A module-scoped view cache **must** be keyed by workspace or cleared on
  workspace change. The host already discards its diff on workspace change for
  this reason; an unkeyed cache shows the previous workspace's state
  (`GraphifySearch`'s is unkeyed — the example of the bug, not the pattern).
- The `@sero-ai/app-runtime` release for this work carries `editorThemeId` on the
  plugin context and open-file-**and-switch-view**, and nothing about vcs. Any
  later addition is a version bump plus a `requiredHostCapabilities` floor,
  because external plugins pin the package.

## AD-026: One Host-Owned Pi Model Runtime

**Decision:** The desktop main process owns one asynchronous Pi `ModelRuntime`
for each Sero process. Main sessions, app sessions, subagents, tool-catalog
sessions, and isolated background completions use this runtime. Plugins receive
Pi's `ModelRegistry` facade. They do not receive the raw runtime or credential
store.

- Runtime files are `<SERO_HOME>/agent/auth.json` and
  `<SERO_HOME>/agent/models.json`.
- Credential secrets stay in Electron main. Renderer APIs receive status only.
- Stored API keys use the provider-owned `ModelRuntime.login(..., 'api_key')`
  flow. `setRuntimeApiKey()` is only for temporary process overrides and must
  not replace profile credential storage.
- Provider registration is host-global because all sessions share the runtime.
  Re-registering the same provider updates the host registration. Explicit
  `unregisterProvider()` removes it globally. A session dispose does not remove
  providers. Plugin code must unregister only when it intentionally disables
  the provider for the whole host.
- Background plugin work requests the narrow Sero isolated-completion service
  through the extension event bus. The service does not expose the runtime.
- Each session still owns its messages, tools, resource loader, and persistence.

Pi SDK packages use workspace catalogs. The strict development version is
`0.83.0`, and packages that exchange Pi objects require `>=0.83.0` peers.

## AD-027: Agent Plugins Are a Separate Host-Owned Subsystem

**Decision:** Sero supports the portable Agent Plugins v1 format through a
separate Electron-owned registry and lifecycle. Agent Plugins are not Sero
plugins, Pi packages, or sidebar apps.

- Installed package content is immutable under
  `<SERO_AGENT_DIR>/agent-plugins/<install-id>/`.
- Writable state is under
  `<SERO_AGENT_DIR>/agent-plugin-data/<install-id>/` and survives updates.
- `<SERO_AGENT_DIR>/agent-plugins.json` owns provenance, enablement,
  executable approval, diagnostics, and optional CLI exposure.
- The host validates the bundled v1 schemas and package boundaries before a
  component reaches Pi or MCP. It never retrieves schemas while it loads a
  package.
- Valid Agent Skills enter Pi through the resource-loader override and active
  session reload. Sero does not add the package to Pi settings or create a
  synthetic `package.json`.
- The MCP app reads an effective, read-only Agent Plugin source. Portable
  definitions never enter the user's raw MCP config. Runtime identities use
  `agent-plugin:<install-id>:<server-name>`.
- Namespaced CLI exposure is Sero-owned and off by default. Skill commands load
  instructions into the current agent. MCP commands call the existing MCP
  runtime and cannot bypass approval, auth, lifecycle, exclusions, or scope.

**Rules:**

- Use the full term **Agent Plugin** in types, code, and product copy.
- A package with both contracts remains two independent installations.
- Local stdio execution needs explicit approval. An update that changes the
  executable definition needs renewed approval.
- Keep `PLUGIN_ROOT` immutable and `PLUGIN_DATA` persistent. Expand only the
  two exact v1 placeholders in `args`, `env` values, and `cwd`.
- Invalid skills and MCP entries fail independently. A fatal manifest error is
  the only portable error that blocks all components.

## AD-028: Agent Rooms Are a Mode of Sero Orchestrator

**Problem:** Sero has single chats, transient subagent fan-out, and two fixed
collaboration engines (`CollaborationEngine`, `DebateEngine`). None of them give
a durable team that keeps long-running sessions, communicates while work
continues, waits without holding an execution slot, and survives a restart.
Building that as a separate runtime would duplicate the Orchestrator's
scheduler, limits, recovery, worktrees, artifacts, and delivery.

**Decision:** Agent Rooms are a second **mode** inside
`sero-orchestrator-plugin`, not a new plugin, app, or host runtime.

- The product has two modes: **Workflow** (the current LLM-authored step graph)
  and **Room** (a persistent Conductor-led team).
- Both modes share the plugin's management infrastructure — coordinator,
  limits, locks, reconcile, split store, workspace placement, artifacts,
  attention, delivery.
- Their **domain records stay separate**. Workflow records are plans, steps,
  activations, and attempts. Room records are blueprints, members, mandates,
  messages, and revisions. A shared interface must not force one mode to carry
  a field only the other mode uses.
- A Room is never encoded as a Workflow graph, and a Workflow never becomes a
  Room.

**Rules:**

- Room code lives under `runtime/rooms/` and `shared/room-*`. It does not grow
  `runtime/coordinator.ts` (already at the 500-line limit).
- Room mode does not add a second scheduler, limit engine, Git layer, model
  runtime, or transcript store.
- The internal `Loop` naming for Workflow records stays for now. The
  user-facing terms are **Workflow** and **Room**. The rename is tracked debt,
  not a prerequisite — see AD-028 naming note in
  `docs/features/agent-rooms/architecture.md`.
- The Conductor coordinates within a user-approved operating envelope. It
  cannot raise permissions, spend, team size, workspace authority, or delivery
  authority. It can only request those from the user.
- `CollaborationEngine` and `DebateEngine` are removed only after Room mode is
  proven on real scenarios. Sero does not build a dual-runtime parity
  framework.

**References:** `docs/features/agent-rooms/spec.md`,
`docs/features/agent-rooms/architecture.md`.

## AD-029: Host-Issued Persistent Agent Sessions

**Problem:** Room members need normal persistent Pi sessions — created once,
reopened after idle time or a restart, compacted in place. Pi already provides
all of that through `SessionManager.create` / `SessionManager.open`. What does
not exist is a way for a plugin runtime to ask for one. Today a background
runtime can only run a transient structured subagent
(`host.subagents.runStructured`), and every real session is constructed inside
Electron main. Letting a plugin construct sessions itself would hand it the
model runtime, the credential store, and unchecked filesystem authority.

**Decision:** The host gains one narrow, generic capability —
`appRuntime.persistentSessions` — that creates and drives persistent Pi
sessions **on behalf of** a plugin runtime, under a **host-issued grant**.

- The capability is **generic**. Its identifiers — `owner`, `scope`, `subject`
  — are opaque strings. It does not import, parse, or depend on any Room domain
  type. Room mode passes its Room ID and member ID as values; another product
  could pass anything else.
- The plugin **never constructs a session**. It sends a request; the host
  validates and constructs.
- Every request carries a `grantId`. The host resolves the grant from its own
  store. It never trusts an envelope supplied only by the request.
- The host validates, per request: grant exists, is live, and belongs to the
  calling plugin; session path resolves inside the grant's approved directory;
  working directory is an approved workspace or worktree; the model is
  available through the one host `ModelRuntime` (AD-026); tools, skills, and
  permissions are a subset of the grant; the live session count is within the
  grant's cap.
- Operations are `create`, `open`, `prompt`, `steer`, `abort`, `subscribe`,
  `compact`, `getContextUsage`, `getSessionUsage`, `dispose`.
- Grants are **revocable**. Revoking a grant aborts and disposes its live
  sessions and fails every later request against it.
- Member sessions use a **filtered resource profile** — project context files,
  the approved prompt and mandate, selected skills, approved platform tools,
  the AD-020 `sero-cli` bridge, and only the plugin extensions that supply an
  approved capability. Third-party session-lifecycle hooks are off. The host
  enforces the profile from the grant; the plugin cannot widen it.

**Gating:** The first release is **built-in plugins only**, enforced in the
host by package provenance, not by manifest declaration.

- `SERO_HOST_CAPABILITIES` is a *compatibility* list. It tells a plugin whether
  this host build supports a capability. It grants nothing. Adding
  `appRuntime.persistentSessions` there does **not** authorise anyone.
- Authorisation is a separate host check: the app's `packagePath` must not be
  an installed-plugin path (`isInstalledPluginPackagePath`), **and** its app ID
  must be on an explicit built-in allowlist. Both must pass.
- Installing an external plugin — from npm, git, or a local path — can never
  obtain this capability, whatever its manifest declares.

**Rules:**

- Renderer code never receives the capability, a grant, a session handle, or
  credentials.
- `SessionManager.inMemory` is not used for a persistent-session subject.
- Session files stay in the normal Pi JSONL format under the normal Sero
  session root. Sero does not copy, rebuild, or replay their transcripts.
- The capability adds no second `ModelRuntime`, credential store, or session
  persistence system.
- A defective or compromised built-in plugin must not be able to exceed its
  grant. Every deny path is tested.

**References:** `docs/features/agent-rooms/architecture.md` §3–§5.

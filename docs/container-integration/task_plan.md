# Task Plan: macOS Container Integration for Sero Workspaces

## Goal
Move all workspace tool execution into native macOS containers (Apple Containerization framework) so every workspace runs in an isolated Linux VM with bind-mounted host files, interactive terminals, and full network access — while the Pi SDK AgentSession orchestration remains on the Electron host.

## Answers (from user interview)
1. **Agent execution model**: (A) Host orchestration — AgentSession on host, all tool execution containerised
2. **Container scope**: (A) One container per workspace, shared by all sessions in that workspace
3. **Terminal UI**: (A) Inside CodingWorkspace as a bottom panel (VS Code-style), per-workspace, multiple terminals per container
4. **Tool replacement**: (B) Hybrid — container tools for bash/read/write/edit/ls, but Pi SDK resource discovery (skills, prompts, AGENTS.md) still reads from host via bind mount
5. **File watcher**: (A) Include — full working implementation, UI for tree later

## Current Phase
Phase 1

## Phases

### Phase 1: ContainerManager — Core Infrastructure
Create the container management layer in the Electron main process.

**Files to create:**
- `electron/container/types.ts` — shared types, constants, helpers
- `electron/container/lifecycle.ts` — system management, create/start/stop/delete, ghost recovery
- `electron/container/files.ts` — read/write/list files inside containers
- `electron/container/terminal.ts` — TerminalManager (node-pty → container exec -it)
- `electron/container/terminal-buffer.ts` — ring buffer for agent's read_terminal tool
- `electron/container/index.ts` — ContainerManager orchestrator (composes above)
- `electron/container/image.ts` — image build/check logic

**Key design decisions:**
- Container naming: `sero-<workspaceId>` (one per workspace)
- Workspace files bind-mounted: `<workspace.path>` → `/workspace`
- SSH agent forwarding: `--ssh` flag on `container run`
- Default resources: 2 CPUs, 1024MB RAM
- Ghost container recovery following docs/libs/container.md protocol
- Lazy start: container created on first agent prompt, not on workspace open

**Adapted from ref impl:**
- `container-manager/` structure maps directly
- Ghost detection + recovery (isGhostError, clearGhostContainer, restartSystem)
- XPC error recovery (isXpcError → ensureSystemRunning → retry)
- Write via stdin pipe (not shell escaping)
- Terminal via `node-pty.spawn('container', ['exec', '-it', ...])`

- **Status:** pending

### Phase 2: Container Tools — Agent Tool Definitions
Create container-proxied tool definitions that replace `createCodingTools()`.

**Files to create:**
- `electron/container/tools.ts` — createContainerTools() returning ToolDefinition[]

**Tools to implement:**
- `bash` — `container exec <cid> sh -c <cmd>` with timeout, env var injection
- `read` — cat with offset/limit support via sed/tail
- `write` — stdin-piped write with mkdir -p
- `edit` — read → string replace → write (atomic)
- `ls` — `ls -la` with path resolution
- `read_terminal` — reads from TerminalOutputBuffer (agent can see dev server logs)

**Key differences from ref impl:**
- No separate `read_skill` tool — Pi SDK handles skill discovery via host-side ResourceLoader
- Tool definitions use Pi SDK's `ToolDefinition` type (same as ref impl)
- Tools are created per-workspace (not per-session), since container is per-workspace

- **Status:** pending

### Phase 3: Agent Pool Integration — Wire Container Tools into Sessions
Modify the existing agent pool (`electron/ipc/agent.ts`) to use container tools when a workspace has a running container.

**Files to modify:**
- `electron/ipc/agent.ts` — swap `createCodingTools(wsPath)` for `createContainerTools()`
- `electron/ipc/shared-infra.ts` — add ContainerManager to shared infra
- `electron/ipc/index.ts` — register new container + terminal IPC handlers

**Files to create:**
- `electron/ipc/container.ts` — container lifecycle IPC handlers
- `electron/ipc/terminal.ts` — terminal IPC handlers (create/write/resize/dispose)
- `electron/container/system-prompt.ts` — container-aware system prompt builder

**Key design:**
- ContainerManager is a singleton in main process (like WorkspaceManager)
- On `agent.open()`: ensure container is running for the workspace → create session with container tools
- Container lifecycle is lazy: first `agent.open()` triggers container creation
- System prompt override tells agent about container environment (0.0.0.0 binding, setsid, /workspace, etc.)
- Hybrid tool model: container tools for execution, but `DefaultResourceLoader` still reads from host `wsPath` for skills/prompts/AGENTS.md discovery

- **Status:** pending

### Phase 4: IPC + Preload + Types — Full Layer Update
Update all IPC layers so container and terminal data flows correctly between main ↔ renderer.

**Files to modify:**
- `src/types/ipc.ts` — add container state, terminal types, new IPC channels
- `src/types/electron.d.ts` — add container + terminal API types to SeroAPI
- `electron/preload.ts` — expose container + terminal APIs on window.sero

**New IPC channels:**
```
sero:container:status      — get container state for a workspace
sero:container:inspect     — detailed container info (IP, resources)
sero:terminal:create       — create terminal session in workspace container
sero:terminal:write        — send input to terminal
sero:terminal:resize       — resize terminal
sero:terminal:dispose      — close terminal
sero:terminal:data         — main→renderer push: terminal output
```

- **Status:** pending

### Phase 5: Container Status UI — WorkspaceTree Indicator
Add a discrete container status indicator next to workspace names in the WorkspaceTree.

**Files to modify:**
- `src/components/layout/WorkspaceTree.tsx` — add container status indicator
- `src/stores/workspace.ts` — add container status tracking per workspace

**Files to create:**
- `src/stores/container.ts` — Zustand store for container states per workspace

**UI design:**
- Small dot/icon next to workspace name in WorkspaceTree
- States: none (no container), starting (spinner), running (green dot), stopped (grey dot), error (red dot)
- Container IP shown on hover tooltip
- Container starts automatically on first prompt — user sees "starting" → "running" transition

- **Status:** pending

### Phase 6: Terminal UI — CodingWorkspace Integration
Add terminal panel to CodingWorkspace with xterm.js, connected to the workspace's container.

**Files to create:**
- `src/components/apps/coding/TerminalPanel.tsx` — xterm.js terminal component
- `src/components/apps/coding/TerminalTabs.tsx` — multi-terminal tab management
- `src/stores/terminal.ts` — Zustand store for terminal state (tabs, active terminal)

**Files to modify:**
- `src/components/apps/coding/CodingWorkspace.tsx` — add bottom terminal panel (collapsible)
- `src/components/apps/coding/ActivityBar.tsx` — add terminal icon

**Key design:**
- Bottom panel in CodingWorkspace (like VS Code), collapsible
- Multiple terminals per workspace (tabs)
- Each terminal is a PTY session: `container exec -it -w /workspace sero-<wsId> /bin/bash`
- xterm.js with @xterm/addon-fit for auto-resize, @xterm/addon-web-links for clickable URLs
- Terminal data flows: xterm.js → IPC → node-pty → container exec ↔ container exec → node-pty → IPC → xterm.js
- Terminal output buffer feeds the agent's `read_terminal` tool

- **Status:** pending

### Phase 7: File Watcher — Host-Side Workspace Monitoring
Set up file watching on host-side bind-mount directories so future file tree components have real-time data.

**Files to create:**
- `electron/container/file-watcher.ts` — FileWatcherManager using fs.watch (macOS FSEvents)

**Files to modify:**
- `electron/main.ts` — instantiate FileWatcherManager, wire to container lifecycle
- `electron/ipc/index.ts` — register file watcher IPC handlers
- `src/types/ipc.ts` — add file watcher IPC channels and event types
- `electron/preload.ts` — expose file watcher events

**Key design:**
- Watches host workspace directory (bind mount target)
- Uses Node's `fs.watch({ recursive: true })` which uses macOS FSEvents
- Debounced (150ms) to batch rapid changes
- Only active workspace's watcher runs (pause/resume on tab switch)
- Sends `filetree:changed` events to renderer with affected directory paths
- Maps host paths to container paths (`/workspace/...`)

- **Status:** pending

### Phase 8: App Startup + Shutdown — Lifecycle Hooks
Wire container lifecycle into Electron app startup and shutdown.

**Files to modify:**
- `electron/main.ts` — add container system check on boot, graceful shutdown, orphan cleanup

**Startup sequence:**
1. Existing: `bootstrapAgentDir()`, `workspaceManager.init()`, etc.
2. New: `containerManager.ensureSystemRunning()` — verify container API server
3. New: `containerManager.ensureImage()` — build sero-node:latest if missing
4. New: `cleanupOrphanedContainers()` — stop/remove sero-* containers not in registry

**Shutdown sequence (before-quit):**
1. Dispose all agent sessions (existing)
2. Dispose all terminals (new)
3. Dispose file watchers (new)
4. Stop all sero-* containers (new)
5. `app.exit(0)`

- **Status:** pending

### Phase 9: Testing & Verification
End-to-end verification that the full flow works.

- [ ] Container creates and starts on first agent prompt
- [ ] Agent bash tool executes inside container
- [ ] Agent can read/write/edit files inside container (visible on host via bind mount)
- [ ] Terminal opens inside container, interactive shell works
- [ ] Multiple terminals per workspace
- [ ] Container status indicator shows correctly in WorkspaceTree
- [ ] SSH agent forwarding works (git clone private repo)
- [ ] Dev server started inside container is accessible via container IP
- [ ] Container stops on app quit
- [ ] Container restarts on next app launch (for same workspace)
- [ ] Ghost container recovery works
- [ ] File watcher detects changes from container
- [ ] Orphaned container cleanup on startup
- **Status:** pending

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| One container per workspace | Simpler resource management, sessions share state naturally, matches ref impl |
| Host-side AgentSession | Keeps Pi SDK infra (auth, models, settings, extensions) on host where it's managed. Only tool execution enters the container. |
| Hybrid tool model | Container tools for execution (bash, read, write, edit, ls, read_terminal), but DefaultResourceLoader reads from host bind-mount for skills/prompts/AGENTS.md |
| Lazy container start | Don't start containers until first agent prompt — saves resources for workspaces user hasn't interacted with |
| Bind mount workspace dirs | Files persist on host even if container is destroyed. Host file watcher works. |
| SSH agent forwarding | Enables git clone/push/pull with private repos inside container |
| `setsid` for background processes | Prevents zombie processes when agent starts dev servers |
| `tini` as PID 1 | Proper zombie reaping inside container (already in Dockerfile) |
| Container files in electron/container/ | Keeps container concerns separate from agent/workspace code |

## File Size Budget
All new files must stay under 500 LOC per AGENTS.md rules. The ref impl's files are already well-split:
- types.ts: ~50 LOC
- lifecycle.ts: ~200 LOC
- files.ts: ~100 LOC
- terminal.ts: ~120 LOC
- terminal-buffer.ts: ~40 LOC
- index.ts: ~150 LOC
- tools.ts: ~250 LOC
- system-prompt.ts: ~80 LOC

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- Container CLI is at `/usr/local/bin/container` (v0.8.0)
- `sero-node:latest` image already built
- xterm.js + node-pty already in dependencies
- esbuild config already externalises node-pty
- Container API server is already running

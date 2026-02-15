# Progress: Container Integration

## Session 1 — Analysis & Planning
- Read all reference implementation files
- Read all current Sero architecture
- Verified container CLI (v0.8.0), sero-node:latest image, xterm/node-pty deps
- Conducted interview — 5 critical architecture questions answered
- Created planning files

## Session 2 — Full Implementation (Phases 1–8)

### Phase 1: ContainerManager ✅
Created `electron/container/` with 7 files:
- `types.ts` (74 LOC) — constants, interfaces, helpers
- `lifecycle.ts` (294 LOC) — system mgmt, create/start/stop/delete, ghost recovery
- `files.ts` (128 LOC) — read/write/list files via container exec + stdin pipe
- `terminal-buffer.ts` (37 LOC) — ring buffer for agent read_terminal
- `terminal.ts` (143 LOC) — TerminalManager (node-pty → container exec -it)
- `image.ts` (79 LOC) — image exists check + build from Dockerfile
- `index.ts` (209 LOC) — ContainerManager orchestrator

### Phase 2: Container Tools ✅
- `tools.ts` (276 LOC) — bash, read, write, edit, ls, read_terminal

### Phase 3: Agent Pool Integration ✅
- `system-prompt.ts` (52 LOC) — container-aware system prompt block
- `electron/ipc/container.ts` (38 LOC) — container status/inspect IPC
- `electron/ipc/terminal.ts` (83 LOC) — terminal create/write/resize/dispose IPC
- Modified `electron/ipc/agent.ts` — ensure container on agent.open, use container tools
- Modified `electron/ipc/shared-infra.ts` — export containerManager singleton
- Modified `electron/ipc/index.ts` — register new handlers
- Modified `electron/sero-extension.ts` — inject container prompt via before_agent_start

### Phase 4: IPC + Preload + Types ✅
- Modified `src/types/ipc.ts` — ContainerInfo, container/terminal/filetree IPC channels, container events in AgentStreamEvent
- Modified `src/types/electron.d.ts` — SeroContainerAPI, SeroTerminalAPI, SeroFiletreeAPI
- Modified `electron/preload.ts` — expose container, terminal, filetree on window.sero

### Phase 5: Container Status UI ✅
- Created `src/stores/container.ts` (106 LOC) — container state per workspace
- Modified `src/stores/agent.ts` — handle container_starting/ready/error events
- Modified `src/components/layout/WorkspaceTree.tsx` — ContainerIndicator component

### Phase 6: Terminal UI ✅
- Created `src/stores/terminal.ts` (147 LOC) — terminal tab management
- Created `src/components/apps/coding/TerminalPanel.tsx` (172 LOC) — xterm.js
- Created `src/components/apps/coding/TerminalTabs.tsx` (105 LOC) — tab bar
- Modified `src/components/apps/coding/CodingWorkspace.tsx` — bottom terminal panel
- Modified `src/components/apps/coding/ActivityBar.tsx` — terminal icon at bottom

### Phase 7: File Watcher ✅
- Created `electron/container/file-watcher.ts` (178 LOC) — FSEvents-based watcher

### Phase 8: App Startup + Shutdown ✅
- Modified `electron/main.ts`:
  - Import containerManager + FileWatcherManager
  - ensureSystemRunning() on boot
  - ensureImage() on boot (build sero-node if missing)
  - cleanupOrphanedContainers() on boot
  - File watcher IPC handlers
  - Graceful shutdown: dispose terminals, file watchers, stop all containers

### Verification ✅
- TypeScript typecheck: 0 errors
- Electron build (main + preload): success
- Vite renderer build: success
- All new files under 500 LOC limit

## Files Created (16)
```
electron/container/types.ts
electron/container/lifecycle.ts
electron/container/files.ts
electron/container/terminal-buffer.ts
electron/container/terminal.ts
electron/container/image.ts
electron/container/index.ts
electron/container/tools.ts
electron/container/system-prompt.ts
electron/container/file-watcher.ts
electron/ipc/container.ts
electron/ipc/terminal.ts
src/stores/container.ts
src/stores/terminal.ts
src/components/apps/coding/TerminalPanel.tsx
src/components/apps/coding/TerminalTabs.tsx
```

## Files Modified (13)
```
electron/main.ts
electron/ipc/agent.ts (+46 lines)
electron/ipc/shared-infra.ts (+5 lines)
electron/ipc/index.ts (+4 lines)
electron/sero-extension.ts (+12 lines)
electron/preload.ts (+70 lines)
src/types/ipc.ts (+35 lines)
src/types/electron.d.ts (+40 lines)
src/components/layout/WorkspaceTree.tsx (+25 lines)
src/components/apps/coding/CodingWorkspace.tsx (rewrite)
src/components/apps/coding/ActivityBar.tsx (rewrite)
src/components/apps/coding/CodingSidebar.tsx (+1 line)
src/stores/agent.ts (+12 lines)
```

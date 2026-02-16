# Task Plan: FileTree + Editor + LSP Integration

**Goal:** Port the FileTree, Monaco Editor (with tabs), and LSP subsystem from the old sero-ai branch into the current Sero desktop app's CodingWorkspace.

**Key Decisions:**
- **Dual-mode file I/O** — container paths when containerized, host filesystem when not
- **Simple layout** — no Dockview; FileTree sidebar + tab bar + Monaco editor
- **FileTree in Explorer panel** — replaces the CodingSidebar placeholder when panel=explorer
- **New IPC channels** for editor state persistence
- **Port FileWatcherManager** as a dedicated module
- **Full LSP** — completions, hover, go-to-definition, diagnostics in one pass

**Concept mapping (old → new):**
- `projectId` → `workspaceId`
- `useProjectStore` → `useContainerStore` / `useActiveWorkspace`
- `window.sero.container.readFile` → new dual-mode `window.sero.editor.readFile` (routes to container or host)
- `window.sero.filetree.*` → new IPC channels
- `window.sero.lsp.*` → new IPC channels
- `window.sero.persistence.saveEditorState` → new IPC channels
- Container path `/workspace` → dual: `/workspace` (container) or host absolute path

---

## Phase 1: IPC Types & Channels
**Status:** `complete`
**Files:**
- `apps/desktop/src/types/ipc.ts` — add IPC channel constants for `editor`, `filetree`, `lsp`
- `apps/desktop/src/types/electron.d.ts` — add `SeroEditorAPI`, `SeroFileTreeAPI`, `SeroLspAPI` interfaces

**Details:**
Add to `IpcChannels`:
```
editor: {
  readFile, writeFile, listFiles, saveState, loadState
}
filetree: {
  watch, unwatch, onChanged
}
lsp: {
  start, stop, request, notify, hasServer, notification (push), serverStopped (push)
}
```

The `editor.readFile/writeFile/listFiles` channels will be **dual-mode** — the main process handler decides whether to go through the container or hit the host filesystem based on `workspaceManager.isContainerEnabled(workspaceId)`.

---

## Phase 2: Preload Bridge
**Status:** `complete`
**Files:**
- `apps/desktop/electron/preload.ts` — add `editor`, `filetree`, `lsp` sections

**Details:**
Wire all new IPC channels through `contextBridge.exposeInMainWorld`. Mirrors old preload structure but uses new channel names. Push channels (`filetree:changed`, `lsp:notification`, `lsp:serverStopped`) use `ipcRenderer.on` with cleanup returns.

---

## Phase 3: Dual-Mode File I/O IPC Handlers
**Status:** `complete`
**Files:**
- `apps/desktop/electron/ipc/editor.ts` — **new file**, IPC handlers for `editor:*`

**Details:**
Each handler receives `workspaceId` and checks `workspaceManager.isContainerEnabled(workspaceId)`:
- **Container mode:** delegates to `containerManager.readFile/writeFile/listFiles`
- **Host mode:** uses `fs.readFile/writeFile` and `fs.readdir` on `workspaceManager.getPath(workspaceId)`

For host-mode `listFiles`, replicate the same `{ name, type, size }` shape that the container version returns.

Also handle `editor:saveState` and `editor:loadState` — persist `{ openTabs, activeTab }` per workspace to `~/.sero-ui/agent/editor-state/<workspaceId>.json`.

Register in `apps/desktop/electron/ipc/index.ts`.

---

## Phase 4: FileWatcherManager
**Status:** `complete`
**Files:**
- `apps/desktop/electron/file-watcher.ts` — **new file**, ported from old sero-ai

**Details:**
Port `FileWatcherManager` from the old codebase. It watches the **host-side** workspace directory (which is the bind-mount source for containers, or the direct workspace path for non-container workspaces).

Key adaptations:
- Use `workspaceManager.getPath(workspaceId)` to resolve the host directory
- Debounce filesystem events, emit changed directories
- Forward `filetree:changed` events to renderer via `BrowserWindow.webContents.send`

Register `filetree:watch`, `filetree:unwatch` IPC handlers. Wire into `apps/desktop/electron/ipc/index.ts`.

---

## Phase 5: LSP Subsystem (Electron Side)
**Status:** `complete`
**Files:**
- `apps/desktop/electron/lsp/types.ts` — **new file**, JSON-RPC types + server configs
- `apps/desktop/electron/lsp/json-rpc.ts` — **new file**, Content-Length parser + encoder
- `apps/desktop/electron/lsp/lsp-process.ts` — **new file**, single server process manager
- `apps/desktop/electron/lsp/lsp-manager.ts` — **new file**, orchestrator across workspaces

**Details:**
Port all 4 files from old `electron/lsp/`. Adaptations:
- `projectId` → `workspaceId` everywhere
- Import container types from `../container/types` (new path)
- `LspManager` constructor takes `containerManager` (same pattern)
- `lsp-process.ts` spawns inside containers via `container exec -i`
- `ContainerManager` reference comes from `shared-infra.ts` singleton

Register LSP IPC handlers in a new `apps/desktop/electron/ipc/lsp.ts`:
- `lsp:start`, `lsp:stop`, `lsp:request`, `lsp:notify`, `lsp:hasServer`
- Forward `lsp:notification` and `lsp:serverStopped` push events
- Wire into `apps/desktop/electron/ipc/index.ts`

Lifecycle: instantiate `LspManager` in `main.ts` or `shared-infra.ts`, dispose on `before-quit`.

---

## Phase 6: LSP Client (Renderer Side)
**Status:** `complete`
**Files:**
- `apps/desktop/src/lsp/lsp-conversions.ts` — **new file**, LSP ↔ Monaco type converters
- `apps/desktop/src/lsp/use-lsp.ts` — **new file**, React hook for Monaco LSP integration

**Details:**
Port both files from old `src/lsp/`. Adaptations:
- `useProjectStore` status check → `useContainerStore` for container status, or a new "workspace ready" check for non-container workspaces
- `useLsp` hook: only attempt LSP start when workspace has a container running (LSP servers run inside containers). For non-containerized workspaces, LSP is a no-op initially (future: host-side LSP).
- `window.sero.lsp.*` calls already match the new preload API from Phase 2

---

## Phase 7: FileTree Component
**Status:** `complete`
**Files:**
- `apps/desktop/src/components/apps/coding/file-tree/FileTree.tsx` — **new file**
- `apps/desktop/src/components/apps/coding/file-tree/file-icons.tsx` — **new file**
- `apps/desktop/src/components/apps/coding/file-tree/file-tree-ops.ts` — **new file**
- `apps/desktop/src/components/apps/coding/file-tree/file-tree-context-menu.tsx` — **new file**

**Details:**
Port from old `src/components/panels/FileTree.tsx` + `file-tree/` directory. Adaptations:
- `projectId` → `workspaceId` prop
- `window.sero.container.readFile/listFiles` → `window.sero.editor.readFile/listFiles`
- `window.sero.filetree.*` stays the same (new IPC from Phase 2)
- `ROOT_ID` = `/workspace` for container workspaces, host absolute path for non-container
  - Root ID passed as prop from parent, resolved by workspace type
- File-tree-ops `moveItem`/`renameItem` use `window.sero.editor.*` for dual-mode
- UI components use existing shadcn/ui `Tree` from `@/components/ui/tree`

**Note:** Check if `@/components/ui/tree` exists. If not, create it from the headless-tree primitives (the old code imported from `@/components/ui/tree`).

---

## Phase 8: Editor Components
**Status:** `complete`
**Files:**
- `apps/desktop/src/components/apps/coding/editor/EditorPanel.tsx` — **new file**
- `apps/desktop/src/components/apps/coding/editor/EditorTabBar.tsx` — **new file**
- `apps/desktop/src/components/apps/coding/editor/editor-panel.css` — **new file** (if needed)

**Details:**
Port `EditorPanel.tsx` and `EditorTabBar.tsx` from old code. Adaptations:
- `projectId` → `workspaceId`
- `useProjectStore` status → `useContainerStore` status for container, always "ready" for host
- `window.sero.container.readFile/writeFile` → `window.sero.editor.readFile/writeFile`
- `window.sero.persistence.saveEditorState/loadEditorState` → `window.sero.editor.saveState/loadState`
- `useLsp` hook import from `@/lsp/use-lsp`
- CSS: convert old `EditorPanel.css` class-based styles → Tailwind classes where practical

The EditorPanel does **not** render its own FileTree sidebar — that lives in CodingSidebar. EditorPanel receives `openTab(path)` calls from the parent.

Split: FileTree raises `onFileSelect(path)` → CodingWorkspace state → EditorPanel `activeTab`.

---

## Phase 9: Wire Into CodingWorkspace
**Status:** `complete`
**Files:**
- `apps/desktop/src/components/apps/coding/CodingWorkspace.tsx` — **modify**
- `apps/desktop/src/components/apps/coding/CodingSidebar.tsx` — **modify**
- `apps/desktop/src/stores/coding-ui.ts` — **modify** (add editor state if needed)

**Details:**
- **CodingWorkspace** becomes the state coordinator:
  - Owns `tabs`, `activeTab`, `dirtyPaths` state (or delegates to a Zustand store)
  - Renders `EditorPanel` in the main content area (replacing the placeholder)
  - Passes `openTab` callback down to CodingSidebar → FileTree
  - Passes `onPathChanged`, `onDeleted` from FileTree to EditorPanel for tab renames/closes
  - Resolves `rootPath` for the FileTree: `/workspace` if container, `workspaceManager.getPath()` if host

- **CodingSidebar** renders `FileTree` when `activePanel === 'explorer'`
  - Other panels remain placeholders

- **coding-ui store** may need an `editorRootPath` field per workspace

---

## Phase 10: Electron Main Wiring
**Status:** `complete`
**Files:**
- `apps/desktop/electron/main.ts` — instantiate LspManager, FileWatcherManager
- `apps/desktop/electron/ipc/index.ts` — register new handler modules
- `apps/desktop/electron/ipc/shared-infra.ts` — export workspaceManager if needed

**Details:**
- Import and instantiate `LspManager(containerManager)` and `FileWatcherManager()` in main.ts
- Pass `mainWindow` to FileWatcherManager for push events
- Register `registerEditorHandlers()`, `registerLspHandlers()`, `registerFileTreeHandlers()` in the IPC index
- Dispose LSP + file watcher on `before-quit`
- Expose `workspaceManager` from shared-infra for the editor IPC handlers

---

## Phase 11: Testing & Verification
**Status:** `complete`
**Details:**
- Build electron: `node scripts/build-electron.mjs`
- Start dev: `bash scripts/dev.sh`
- Verify: FileTree loads workspace files
- Verify: Clicking a file opens it in Monaco editor tab
- Verify: Cmd+S saves back to file (container or host)
- Verify: Dirty indicator on unsaved tabs
- Verify: Tab close (Cmd+W and click X)
- Verify: LSP completions appear for .ts/.tsx files (container workspace only)
- Verify: Diagnostics (red squiggles) show for type errors
- Verify: Hover shows type info
- Verify: File tree auto-refreshes on external changes
- Verify: Non-container workspace file tree works with host filesystem

---

## Dependency Graph

```
Phase 1 (types) ──→ Phase 2 (preload) ──→ Phase 3 (editor IPC)
                                       ──→ Phase 4 (file watcher)
                                       ──→ Phase 5 (LSP electron) ──→ Phase 6 (LSP renderer)
                                       
Phase 3 + 4 ──→ Phase 7 (FileTree component)
Phase 3 + 6 ──→ Phase 8 (Editor component)
Phase 7 + 8 ──→ Phase 9 (Wire into CodingWorkspace)
Phase 5 ──→ Phase 10 (Main wiring)
All ──→ Phase 11 (Testing)
```

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| 500 LOC limit — EditorPanel was 270 LOC in old code, could grow | Keep tab state logic in a hook or store; keep EditorPanel as pure renderer |
| Tree UI component may not exist at `@/components/ui/tree` | Check first; port or create headless-tree wrapper if missing |
| LSP only works inside containers (spawns via `container exec`) | Document as known limitation; non-container workspaces get no LSP for now |
| `preload.ts` already at 264 lines — adding 3 sections may push limits | Keep each section compact; preload is mostly boilerplate |
| `ipc.ts` already at 422 lines — adding channels may exceed 500 | May need to split IPC types into separate files |
| Host-mode listFiles needs to replicate container format exactly | Unit-test the shape; use same `{ name, type, size }` interface |

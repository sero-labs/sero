# Findings: FileTree + Editor + LSP Integration

## Architecture Gaps Identified

### 1. Missing IPC Surface
The current Sero has `ContainerManager.readFile/writeFile/listFiles` implemented but **zero** preload bridge for these. The `SeroContainerAPI` in `electron.d.ts` only exposes `status()` and `inspect()`. All file I/O and LSP need new IPC plumbing.

### 2. Dual-Mode File Access Pattern
```
Editor IPC handler:
  if (await workspaceManager.isContainerEnabled(workspaceId))
    → containerManager.readFile(workspaceId, containerPath)
  else
    → fs.readFile(path.join(workspaceManager.getPath(workspaceId), relativePath))
```

**Key insight:** Container workspaces use absolute paths from `/workspace` root. Host workspaces use paths relative to the workspace directory. The FileTree root ID and all path resolution must account for this.

**Resolution:** The `editor.*` IPC handlers will normalize: container mode uses `/workspace`-prefixed paths as-is; host mode joins `workspacePath + relativePath`. The renderer always works with `/workspace`-prefixed paths for consistency — the main process translates.

### 3. WorkspaceManager Accessibility
`workspaceManager` is created in `main.ts` but NOT exported from `shared-infra.ts`. The editor IPC handlers need it. Options:
- Export from `shared-infra.ts` (like `containerManager`)
- Pass as parameter to handler registration

Decision: Export from `shared-infra.ts` — consistent with existing `containerManager` pattern.

### 4. Dependencies Already Present
```json
"@headless-tree/core": "^1.6.3",
"@headless-tree/react": "^1.6.3",
"@monaco-editor/react": "^4.7.0",
"monaco-editor": "^0.52.2",
```
No new npm dependencies needed. ✅

### 5. UI Tree Component
The old FileTree imports `Tree`, `TreeItem`, `TreeItemLabel`, `TreeDragLine` from `@/components/ui/tree`. Need to verify if this exists in current codebase.

**Check result:** Need to verify — may need to create this shadcn-style wrapper.

### 6. LSP Limitation
LSP servers spawn inside containers via `container exec -i`. **Non-containerized workspaces will NOT have LSP support** in this iteration. The `useLsp` hook will gracefully no-op when container is not running.

### 7. FileWatcher Host Path Resolution
The old `FileWatcherManager` watched directories on the **host filesystem** (the bind-mount source). In the new Sero:
- Container workspaces: watch `workspaceManager.getPath(workspaceId)` (host path, which is bind-mounted to `/workspace`)
- Non-container workspaces: watch `workspaceManager.getPath(workspaceId)` (same call, different path)

Both cases resolve to the same `workspaceManager.getPath()` call. ✅

### 8. Old EditorPanel Structure
The old `EditorPanel` renders both the FileTree sidebar AND the Monaco editor. In the new design, these are split:
- FileTree → CodingSidebar (Explorer panel)
- EditorPanel → main content area of CodingWorkspace

State coordination (tabs, activeTab, dirty paths) needs to live in CodingWorkspace or a shared store, with callbacks flowing to both components.

### 9. Editor State Persistence Location
New path: `~/.sero-ui/agent/editor-state/<workspaceId>.json`
Contents: `{ openTabs: string[], activeTab: string | null }`
Managed by the new `editor:saveState` / `editor:loadState` IPC handlers.

### 10. File Line Count Concerns
| File | Current LOC | Projected After Changes |
|------|------------|------------------------|
| `src/types/ipc.ts` | 422 | ~480 (adding channel constants) |
| `electron/preload.ts` | 264 | ~350 (adding 3 API sections) |
| `CodingWorkspace.tsx` | 102 | ~150 (state + wiring, editor body extracted) |
| `CodingSidebar.tsx` | 28 | ~50 (FileTree in explorer) |

All comfortably under 500 LOC limit. ✅

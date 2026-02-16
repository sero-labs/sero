# Progress: FileTree + Editor + LSP Integration

## Session 1 — Analysis & Planning

**Date:** 2026-02-16
**Status:** Planning complete

### Completed
- [x] Read all 6 old sero-ai source files
- [x] Read all relevant current Sero files (CodingWorkspace, preload, IPC types, container manager, stores)
- [x] Identified all architectural gaps
- [x] Resolved 6 critical design questions with user
- [x] Created 11-phase task plan
- [x] Documented findings and risk register

### Key Decisions Made
1. Dual-mode file I/O (container + host filesystem)
2. Simple layout (no Dockview)
3. FileTree in Explorer sidebar panel
4. New IPC channels for editor state persistence
5. Port FileWatcherManager as dedicated module
6. Full LSP port in one pass

### Files Analyzed
**Old sero-ai (6 files):**
- `src/components/panels/EditorPanel.tsx` (270 LOC)
- `src/components/panels/FileTree.tsx` (290 LOC)
- `electron/preload.ts` (290 LOC)
- `electron/main.ts` (220 LOC)
- `electron/lsp/lsp-manager.ts` (150 LOC)
- `electron/ipc-handlers.ts` (380 LOC)

**Additional old files discovered and read:**
- `src/lsp/use-lsp.ts` (210 LOC)
- `src/lsp/lsp-conversions.ts` (180 LOC)
- `electron/lsp/lsp-process.ts` (250 LOC)
- `electron/lsp/types.ts` (120 LOC)
- `electron/lsp/json-rpc.ts` (70 LOC)
- `src/components/panels/file-tree/` (3 files, not yet read in detail)
- `src/components/panels/EditorTabBar.tsx` (not yet read in detail)

**Current Sero (key files):**
- `apps/desktop/src/components/apps/coding/CodingWorkspace.tsx`
- `apps/desktop/src/components/apps/coding/CodingSidebar.tsx`
- `apps/desktop/src/components/apps/coding/ActivityBar.tsx`
- `apps/desktop/electron/preload.ts`
- `apps/desktop/electron/container/files.ts`
- `apps/desktop/electron/container/index.ts`
- `apps/desktop/electron/ipc/container.ts`
- `apps/desktop/electron/ipc/shared-infra.ts`
- `apps/desktop/electron/workspace.ts`
- `apps/desktop/src/types/ipc.ts`
- `apps/desktop/src/types/electron.d.ts`
- `apps/desktop/src/stores/coding-ui.ts`
- `apps/desktop/src/stores/container.ts`

### Next Steps
- Begin Phase 1: Add IPC types and channels
- Check if `@/components/ui/tree` exists in current codebase

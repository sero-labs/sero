# Task Plan: Implement Sero Apps System (sero-apps.md)

## Goal
Implement the full Sero Apps architecture: file-backed app state, IPC layer,
app runtime hooks, app discovery, module federation, and a working Todo
extension with both Pi CLI extension and federated React UI.

## Current Phase
Complete

## Phases

### Phase 1: Todo Extension — Pi Extension (packages/pi-todo-extension)
- [x] package.json (Pi manifest + sero app manifest)
- [x] shared/types.ts (TodoState shape)
- [x] extension/index.ts (todo tool + /todos command, file-based state)
- [x] README.md
- **Status:** complete

### Phase 2: AppStateManager + IPC (Sero main process)
- [x] electron/app-state.ts (generic file watcher + atomic read/write)
- [x] electron/ipc/app-state.ts (IPC handlers)
- [x] Update src/types/ipc.ts (app state channels + types)
- [x] Update electron/preload.ts (expose appState API)
- [x] Update src/types/electron.d.ts (Window type)
- [x] Update electron/ipc/index.ts (register handlers)
- **Status:** complete

### Phase 3: App Runtime Package (packages/app-runtime)
- [x] packages/app-runtime/package.json
- [x] packages/app-runtime/src/index.ts (useAppState, useAppInfo, useAgentPrompt)
- [x] packages/app-runtime/src/context.ts (AppProvider + context)
- [x] packages/app-runtime/tsconfig.json
- **Status:** complete

### Phase 4: App Discovery + Registry
- [x] electron/app-discovery.ts (scan Pi packages for sero.app manifest)
- [x] electron/ipc/apps.ts (IPC for discovered apps)
- [x] Update src/types/ipc.ts (SeroAppManifest type)
- [x] Update electron/preload.ts (expose apps.discover API)
- [x] Update src/types/electron.d.ts (SeroAppsAPI)
- [x] Update src/stores/app.ts (dynamic app registry from discovery)
- [x] Update electron/ipc/index.ts
- [x] Update electron/main.ts (init discovery + protocol)
- **Status:** complete

### Phase 5: Todo UI + Module Federation
- [x] packages/pi-todo-extension/ui/TodoApp.tsx (React component)
- [x] packages/pi-todo-extension/ui/vite.config.ts (MF remote)
- [x] packages/pi-todo-extension/ui/tsconfig.json
- [x] Update sero vite.config.ts (MF host plugin via @module-federation/vite)
- [x] src/lib/federation.ts (dynamic remote loading via MF runtime)
- [x] src/components/apps/SeroAppMount.tsx (mount federated apps)
- [x] Update App.tsx (discovery on startup + federated app mounting)
- [x] Update MainSidebar.tsx (dynamic app list from discovery)
- [x] electron/ext-protocol.ts (sero-ext:// protocol for serving extension assets)
- [x] src/types/module-federation.d.ts (MF runtime type declarations)
- **Status:** complete

### Phase 6: Integration + Verification
- [x] Electron build succeeds
- [x] Typecheck (renderer) passes
- [x] All files under 500 LOC
- [x] TitleBar updated for new app store shape
- **Status:** complete

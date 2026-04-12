# Facts — apps/desktop/electron/ipc

_Last reviewed: 2026-04-12_

## What this code does
This folder is the Electron main-process IPC surface for desktop. It registers
all channel handlers for agent/session orchestration, workspace/profile lifecycle,
container/terminal/editor operations, auth/integrations, subagents, plugins,
VCS, collaboration, and platform UI services.

## Shape & metrics
- Total files: 69
- Total LOC: 8,602
- Largest file: `apps/desktop/electron/ipc/agent/core/agent.ts` (498 LOC)
- Files over 500 LOC: none
- Near-cap files (≥450 LOC):
  - `apps/desktop/electron/ipc/agent/core/agent.ts` (498)
  - `apps/desktop/electron/ipc/agent/core/agent-helpers.ts` (453)
- External dependencies of note:
  - Pi SDK session/runtime (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-agent-core`)
  - shared infra singletons (`@electron/shared/infra/shared-infra`)
  - workspace/container systems (AD-018 paths)
  - gateway/subagent bridges (AD-021)
- Upstream callers:
  - Registered once via `registerAllIpcHandlers()` (`electron/ipc/index.ts`) from
    `electron/main.ts:244`
- Downstream dependencies:
  - `electron/preload/**` bridge methods and `window.sero` APIs
  - renderer stores/components using corresponding preload contracts

## Architectural notes
- This folder is the main-process leg of the 4-layer IPC rule; contract drift here
  directly breaks renderer-preload-main alignment.
- AD-018, AD-020, and AD-021 are all represented in this layer (container exec,
  tool bridge/session routing, subagent lifecycle).
- Handler registration is broad and modular, but type coupling still routes through
  `@/types/ipc` in most modules instead of narrower channel/type entrypoints.

## Surprising discoveries
- `@/types/ipc` is imported in 48/69 IPC files, while only one file imports
  `@/types/ipc-channels` directly (`apps/desktop/electron/ipc/apps/git-app.ts:3`).
- `any`/`as any` usage remains in core IPC boundaries (agent, imagegen, LSP, google):
  e.g. `agent/core/agent-helpers.ts:288,422-440`, `agent/core/agent.ts:156,393`,
  `agent/handlers/imagegen.ts:28,61,107,114`, `editor/lsp.ts:51`,
  `integrations/google-api.ts:73,79`.
- Main-process broadcast loops (`BrowserWindow.getAllWindows()`) are duplicated
  across many files (16 occurrences), creating repeated event-fanout boilerplate.

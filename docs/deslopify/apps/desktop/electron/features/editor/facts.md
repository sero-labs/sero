# Facts — apps/desktop/electron/features/editor

_Last reviewed: 2026-04-12_

## What this code does
`electron/features/editor` is the main-process owner for Sero's language-server runtime. It starts container-backed LSP processes, frames JSON-RPC over stdio, translates process lifecycle events into app-level events, and exposes the server capabilities needed by the renderer-side Monaco integration.

## Shape & metrics
- Total files: 4
- Largest file: `apps/desktop/electron/features/editor/lsp/lsp-process.ts` (256 LOC)
- Files over 500 LOC: None
- External dependencies of note: Node `child_process`, Node `events`, `@electron/features/container`
- Upstream callers: `apps/desktop/electron/shared/infra/shared-infra.ts`, `apps/desktop/electron/ipc/editor/lsp.ts`
- Downstream dependencies: `apps/desktop/src/lsp/use-lsp.ts`, Monaco completion/hover/definition/diagnostic flows

## Architectural notes
- This directory is an AD-018 consumer: language servers run inside the per-workspace container, not in the renderer and not directly on the host.
- It is part of the same four-layer contract spine as `src/lsp`, preload, and `electron/ipc/editor/lsp.ts`, so any drift here quickly becomes a renderer-facing regression.
- The current configuration only supports one server family (`typescript-language-server`), but the structure implies future multi-language growth.

## Surprising discoveries
- The manager is small, but `startServer()` is not startup-idempotent: duplicate renderer calls before initialization can create multiple `LspServerProcess` instances for the same workspace/language.
- The main-process config already carries a language/extension mapping, but the renderer redefines the same routing logic instead of consuming one canonical source.
- Server installation is still runtime-mutable (`npm install -g ...` inside the container) rather than pinned through an image/toolchain policy, so reproducibility is weaker than the rest of the container story suggests.

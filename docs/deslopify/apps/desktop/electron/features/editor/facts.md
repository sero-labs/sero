# Facts — apps/desktop/electron/features/editor

_Last reviewed: 2026-04-16_

## What this code does
`electron/features/editor` is the main-process owner for Sero's language-server runtime. It starts container-backed LSP processes, frames JSON-RPC over stdio, translates process lifecycle events into app-level events, and exposes the server capabilities needed by the renderer-side Monaco integration.

## Shape & metrics
- Total files: 5
- Largest file: `apps/desktop/electron/features/editor/lsp/lsp-process.ts` (285 LOC)
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

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 4 (unchanged)
- Largest file: `apps/desktop/electron/features/editor/lsp/lsp-process.ts` (303 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder

### What changed
- `LspManager` now deduplicates in-flight startup by workspace/language so rapid renderer remounts cannot orphan duplicate server processes.
- `lsp-process.ts` now parses initialize/configuration payloads through explicit helpers instead of `as any` reads.

### Still outstanding
- Canonical language-routing metadata is still duplicated across renderer and main layers.
- Server-initiated request handling still uses a `switch` instead of a documented adapter table.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 4 (unchanged)
- Largest file: `apps/desktop/electron/features/editor/lsp/lsp-process.ts` (303 LOC, unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder (unchanged)

### What changed
- Main-process LSP config now derives `extensions`, `monacoLanguageIds`, and `languageIdMap` from shared renderer-safe routing metadata in `src/lsp/language-routing.ts`.
- Exported canonical routing maps from `src/lsp/language-routing.ts` so renderer and electron flows consume one source of truth for TypeScript-family language IDs.
- Added focused electron coverage to guard that `findConfigByLanguageId()` stays aligned with the shared routing metadata.

### Still outstanding
- **Medium** — Server-initiated request handling still uses a `switch` instead of a documented adapter table.
- **Low** — LSP runtime install policy/version pinning is still undecided.

## Post-fix snapshot — 2026-04-16 (adapter table + install policy)

### Metrics after fixes
- Total files: 5 (was 4)
- Largest file: `apps/desktop/electron/features/editor/lsp/lsp-process.ts` (285 LOC, was 303)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder (unchanged)

### What changed
- Extracted server-initiated request handling into `server-request-handlers.ts` with one explicit adapter table for supported request methods.
- Updated `lsp-process.ts` to resolve server requests through the adapter table and centralize unhandled-method logging behind a one-time-per-method guard.
- Chose to retain runtime container-side LSP installs but pinned versions in `types.ts` (`typescript-language-server@4.4.0`, `typescript@5.9.3`) and added focused coverage for the pinned install command.

### Still outstanding
- None — all tracked plan items for this folder are now cleared.

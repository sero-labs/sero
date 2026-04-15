# Facts — apps/desktop/src/lsp

_Last reviewed: 2026-04-15_

## What this code does
`src/lsp` is the renderer-side Monaco/LSP bridge. It converts protocol payloads into Monaco-friendly shapes, starts the correct workspace language server through `window.sero.lsp`, opens/closes/syncs documents, and applies diagnostics back onto Monaco models.

## Shape & metrics
- Total files: 2
- Largest file: `apps/desktop/src/lsp/use-lsp.ts` (299 LOC)
- Files over 500 LOC: None
- External dependencies of note: `monaco-editor`, `src/stores/container`, preload `window.sero.lsp`
- Upstream callers: `apps/desktop/src/components/apps/explorer/editor/EditorPanel.tsx`
- Downstream dependencies: `electron/ipc/editor/lsp.ts`, `electron/features/editor/lsp/*`, Monaco provider APIs

## Architectural notes
- This directory is the renderer half of the same contract spine as `electron/features/editor` and the LSP IPC bridge, so duplicated language-routing logic here is high drift risk.
- It is a direct consumer of AD-018 because the hook only activates when the workspace container is running and all document traffic goes through the container-backed main-process server.
- `use-lsp.ts` currently owns both provider registration and per-document lifecycle, which makes the hook act more like a singleton service than a normal React hook.

## Surprising discoveries
- `use-lsp.ts` uses module-level registries (`registeredLanguages`, `uriRegistry`) plus five separate effects, so most of the complexity is hidden outside the hook's public API.
- The renderer redefines supported language IDs and extension mappings even though the main-process LSP config already owns that information.
- Diagnostics routing still scans all Monaco models on each notification instead of maintaining a direct URI → model lookup.

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 2 (unchanged)
- Largest file: `apps/desktop/src/lsp/use-lsp.ts` (300 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 new High-priority import-rule violations

### What changed
- `use-lsp.ts` now uses a top-level Monaco namespace type import instead of an inline `typeof import('monaco-editor')` expression.

### Still outstanding
- `use-lsp.ts` still hides provider registration, document sync, and diagnostics ownership behind one singleton-style hook.
- Renderer/main language-routing metadata is still duplicated until the shared contract lands.

## Post-fix snapshot — 2026-04-15

### Metrics after fixes
- Total files: 5 (was 2)
- Largest file: `apps/desktop/src/lsp/lsp-conversions.ts` (240 LOC; was `use-lsp.ts` at 300 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: the pre-existing diagnostics `params.diagnostics as never[]` cast remains pending the next tracked item

### What changed
- Split `use-lsp.ts` into `provider-registry.ts`, `document-sync.ts`, and `diagnostics.ts`, leaving `use-lsp.ts` as an 87-line composition hook over the renderer LSP lifecycle.
- Narrowed the Monaco/editor surface used by the renderer bridge so the singleton ownership modules depend only on provider registration, model-marker, and model-change APIs they actually consume.
- Added `use-lsp.test.tsx` coverage for server startup, provider registration, didOpen/didChange/didSave/didClose notifications, and diagnostics marker application across the extracted module seams.

### Still outstanding
- Renderer/main language-routing metadata is still duplicated until the shared contract lands.
- Diagnostics still scan all Monaco models per notification and retain the existing `as never[]` cast until the next Medium cleanup lands.
- `lsp-conversions.ts` still carries inline local protocol interfaces, which remains the Low follow-up.

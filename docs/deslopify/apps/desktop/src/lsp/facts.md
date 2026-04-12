# Facts — apps/desktop/src/lsp

_Last reviewed: 2026-04-12_

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

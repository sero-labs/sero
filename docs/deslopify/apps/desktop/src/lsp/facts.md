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

## Post-fix snapshot — 2026-04-15 (shared language-routing extraction)

### Metrics after fixes
- Total files: 6 source files (was 5)
- Largest file: `apps/desktop/src/lsp/lsp-conversions.ts` (218 LOC; was 240 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: the pre-existing diagnostics `params.diagnostics as never[]` cast remains pending the next tracked item

### What changed
- Added `language-routing.ts` as the canonical renderer metadata owner for Monaco language inference, LSP didOpen language IDs, and LSP provider/server routing language IDs.
- Removed duplicated extension-language maps from `lsp-conversions.ts`, `editor/editor-panel-shared.ts`, and `vcs/vcs-utils.ts` so editor + diff + document-sync now derive from one shared module.
- Added `language-routing.test.ts` and rebased `use-lsp.test.tsx` assertions onto the canonical routing IDs to lock in shared-map behavior.

### Still outstanding
- Renderer/main language-routing metadata remains duplicated with `electron/features/editor/lsp/types.ts`; the renderer side is now consolidated and ready for the cross-layer extraction tracked under the electron editor plan.
- Diagnostics still scan all Monaco models per notification and retain the existing `as never[]` cast until the next Medium cleanup lands.
- `lsp-conversions.ts` still carries inline local protocol interfaces, which remains the Low follow-up.

## Post-fix snapshot — 2026-04-15 (typed diagnostics routing)

### Metrics after fixes
- Total files: 7 source files (was 6)
- Largest file: `apps/desktop/src/lsp/lsp-conversions.ts` (218 LOC; unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: diagnostics routing no longer uses `params.diagnostics as never[]`; only Low protocol-shape follow-up remains

### What changed
- Added `diagnostics-routing.ts` as a workspace-scoped URI → Monaco model registry so diagnostics can target the active model directly.
- Updated `document-sync.ts` to register and remove diagnostics routes alongside didOpen/didClose lifecycle notifications.
- Updated `diagnostics.ts` to parse publishDiagnostics payloads through typed guards and apply markers via direct route lookup instead of scanning `monaco.editor.getModels()`.
- Expanded `use-lsp.test.tsx` to assert diagnostics updates no longer call Monaco model scanning APIs.

### Still outstanding
- Renderer/main language-routing metadata remains duplicated with `electron/features/editor/lsp/types.ts`; the renderer side is now consolidated and ready for the cross-layer extraction tracked under the electron editor plan.
- `lsp-conversions.ts` still carries inline local protocol interfaces, which remains the Low follow-up.

## Post-fix snapshot — 2026-04-15 (explorer/editor shared-routing re-review)

### Metrics after fixes
- Total files: 7 source files (unchanged)
- Largest file: `apps/desktop/src/lsp/lsp-conversions.ts` (218 LOC; unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: none in the shared-routing path; only the Low protocol-shape follow-up remains

### What changed
- Re-reviewed explorer editor + VCS language-inference surfaces (`editor-panel-shared.ts`, `vcs-utils.ts`) after the shared routing extraction; both now remain thin wrappers over `getMonacoLanguageIdFromPath()` with no local extension maps.
- Added `apps/desktop/src/components/apps/explorer/explorer-language-routing.test.ts` to lock editor + diff language inference onto the canonical renderer routing contract.

### Still outstanding
- Renderer/main language-routing metadata remains duplicated with `electron/features/editor/lsp/types.ts`; the renderer side is consolidated and ready for the cross-layer extraction tracked under the electron editor plan.
- `lsp-conversions.ts` still carries inline local protocol interfaces, which remains the Low follow-up.

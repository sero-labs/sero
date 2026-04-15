# Refactoring Plan — apps/desktop/src/lsp

_Plan drafted: 2026-04-12_

## Executive Summary
`src/lsp` is small, but it is doing singleton-service work inside a React hook. The only immediate High-priority finding is a renderer import-rule violation (`typeof import('monaco-editor')` inline in `use-lsp.ts`), but the more important medium-term problem is that provider registration, URI routing, diagnostics, and language routing are all coupled together behind module-level mutable state. The goal is to make this bridge more canonical, less stateful, and easier to evolve when the editor feature adds more languages.

## Issues Found (prioritized)
- **High** — `use-lsp.ts` uses an inline dynamic type import instead of a top-level type import — `apps/desktop/src/lsp/use-lsp.ts:18` declares `type Monaco = typeof import('monaco-editor')`. Project guidance explicitly bans inline `import('...')` type expressions in favor of top-level `import type`, so this should be cleaned up before more LSP types accumulate around it. Effort: **S**.

- **Medium** — `useLsp` hides singleton-style global state and too many responsibilities behind one hook — `apps/desktop/src/lsp/use-lsp.ts:23-27` and `apps/desktop/src/lsp/use-lsp.ts:152-290` combine global provider registration, URI routing, server startup, document open/close, didChange/didSave, diagnostics subscriptions, and server-stop cleanup. This is difficult to test, difficult to reason about across workspaces, and easy to break during editor refactors. Effort: **M**.

- **Medium** — Renderer language routing is duplicated instead of derived from one canonical contract — `apps/desktop/src/lsp/lsp-conversions.ts:222-239` redefines supported Monaco language IDs and extension mappings that already exist in `apps/desktop/electron/features/editor/lsp/types.ts:25-41`, while explorer/editor utilities add more copies in `apps/desktop/src/components/apps/explorer/editor/EditorPanel.tsx:39-65` and `apps/desktop/src/components/apps/explorer/vcs/vcs-utils.ts:61-75`. This guarantees drift the next time another language is added. Effort: **S**.

- **Medium** — Diagnostics application is broader and weaker than it needs to be — `apps/desktop/src/lsp/use-lsp.ts:267-277` scans every Monaco model on each `publishDiagnostics` notification and uses `convertDiagnostics(params.diagnostics as never[])` to punch through typing. The runtime work is small today, but it couples diagnostics to global Monaco state and keeps another avoidable cast in a core bridge. Effort: **S**.

- **Low** — LSP protocol shapes are still maintained as inline local interfaces in the conversion layer — `apps/desktop/src/lsp/lsp-conversions.ts:10-45`. That is acceptable at the current size, but if more request/response types are added the file will become a local protocol shadow rather than a focused conversion utility. Effort: **M**.

## Proposed Refactoring
1. **Fix the import-rule violation first.**
   - Replace `type Monaco = typeof import('monaco-editor')` with a top-level type import pattern.
   - Keep runtime Monaco loading unchanged; this is purely a contract cleanup.

2. **Split `useLsp` into service modules plus a thin composition hook.**
   - Target structure:
     - `src/lsp/provider-registry.ts` — one-time Monaco provider registration
     - `src/lsp/document-sync.ts` — didOpen/didChange/didClose/didSave lifecycle
     - `src/lsp/diagnostics.ts` — diagnostics subscription + marker application
     - `src/lsp/use-lsp.ts` — compose the above and expose the current public API
   - This keeps React-specific lifecycle code separate from singleton registry mechanics.

3. **Move language-routing metadata to one shared renderer-safe contract.**
   - Extract supported language IDs / extension maps into a canonical module shared by `src/lsp`, explorer/editor helpers, and the main-process LSP feature.
   - Derive `getLspServerLanguage`, `getLspLanguageIdFromPath`, editor language inference, and diff language inference from that same contract.
   - This aligns with the monorepo rule to import canonical types/contracts instead of duplicating them.

4. **Tighten diagnostics routing and clear stale markers explicitly.**
   - Maintain a direct URI → Monaco model lookup instead of scanning `monaco.editor.getModels()` on every notification.
   - Remove the `as never[]` cast by typing the diagnostics payload properly.
   - Clear markers on document close and server-stop paths so stale diagnostics do not survive beyond the document/session lifecycle.

5. **Keep protocol-shape growth under control.**
   - If more converters are added, move the inline LSP protocol interfaces into a focused `lsp-protocol.ts` module or adopt a renderer-safe shared package for the small subset Sero actually uses.
   - Keep `lsp-conversions.ts` about conversion logic, not about being an ad hoc protocol schema dump.

## Benefits & Trade-offs
- Benefits: cleaner renderer/main contract ownership, easier testing, simpler future language expansion, and less hidden global state inside a hook that looks deceptively local.
- Trade-offs: more modules in a currently small area and a little extra indirection when tracing Monaco provider registration.

## Dependencies & Risks
- Canonical routing extraction should happen together with `electron/features/editor` cleanup so renderer/main mappings are not split twice.
- Provider-registry extraction must preserve Monaco's “register once” behavior; careless refactoring could double-register providers.
- Diagnostics cleanup must respect Monaco model lifetime so markers are not removed for still-open documents.

## Next Steps
1. ~~Replace the inline Monaco type import with a top-level type import.~~ ✅ 2026-04-12 (`4350404d`)
2. ~~Split `use-lsp.ts` into provider-registry, document-sync, and diagnostics modules.~~ ✅ 2026-04-15 (`4d41d04e`)
3. ~~Extract shared language-routing metadata and remove duplicated maps from explorer/LSP/editor code.~~ ✅ 2026-04-15 (`3fba69f2`)
4. ~~Replace model scanning + `as never[]` with typed diagnostics routing.~~ ✅ 2026-04-15 (`b9232367`)
5. ~~Re-review explorer/editor surfaces after the shared routing contract lands.~~ ✅ 2026-04-15 (`f393a1d4`)
6. ~~Move inline renderer LSP protocol interfaces into a focused `lsp-protocol.ts` module and rebase diagnostics/conversion code on that shared contract.~~ ✅ 2026-04-15 (`f10c9cd4`)

## Execution log
- 2026-04-12 — `4350404d` — `fix(desktop): harden wave d high-priority runtime paths`
  - Replaced the inline `typeof import('monaco-editor')` type expression in `use-lsp.ts` with a top-level Monaco namespace type import.
- 2026-04-15 — `4d41d04e` — `refactor(desktop): split renderer lsp runtime ownership`
  - Split `use-lsp.ts` into `provider-registry.ts`, `document-sync.ts`, and `diagnostics.ts`, narrowed the renderer-facing Monaco/editor seam, and added focused lifecycle coverage in `use-lsp.test.tsx`.
- 2026-04-15 — `3fba69f2` — `refactor(lsp): centralize renderer language routing metadata`
  - Added `language-routing.ts` as the canonical renderer language map, rebased explorer editor/diff helpers and LSP document-sync/provider registration onto it, and added focused routing coverage in `language-routing.test.ts`.
- 2026-04-15 — `b9232367` — `refactor(lsp): route diagnostics through typed model registry`
  - Added workspace-scoped diagnostics URI→model routing, removed publishDiagnostics model scans/`as never[]`, and locked in the no-scan behavior with a focused `use-lsp.test.tsx` assertion.
- 2026-04-15 — `f393a1d4` — `test(lsp): lock explorer language-routing contract`
  - Re-reviewed explorer editor + diff language inference surfaces after the shared routing extraction and added `explorer-language-routing.test.ts` to pin both wrappers to the canonical `getMonacoLanguageIdFromPath()` contract.
- 2026-04-15 — `f10c9cd4` — `refactor(lsp): extract renderer protocol shape contracts`
  - Added `lsp-protocol.ts` as the canonical renderer protocol-shape owner and rebased `lsp-conversions.ts` + `diagnostics.ts` to remove local inline interface shadow copies.

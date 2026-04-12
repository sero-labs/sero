# Refactoring Plan — apps/desktop/electron/features/editor

_Plan drafted: 2026-04-12_

## Executive Summary
This area is compact, but it carries disproportionate risk because it owns the main-process half of the Monaco↔LSP bridge. Two High-priority issues stand out: concurrent `startServer()` calls are not deduplicated, and `lsp-process.ts` still uses `any` casts at the protocol boundary. The goal is to make LSP startup idempotent, keep the protocol layer strictly typed, and establish one canonical language-routing contract before more languages are added.

## Issues Found (prioritized)
- **High** — `LspManager.startServer()` is not concurrency-safe for the same workspace/language pair — `apps/desktop/electron/features/editor/lsp/lsp-manager.ts:23-69` only short-circuits when an existing server is already `initialized`. If a second caller arrives while the first startup is still in flight, the method creates a second `LspServerProcess`, overwrites the map entry, and leaves the first process/event wiring outside the manager's ownership. In a renderer that can remount editor/LSP surfaces quickly, this is a real lifecycle bug. Effort: **M**.

- **High** — Protocol-boundary `any` casts remain in `lsp-process.ts` — `apps/desktop/electron/features/editor/lsp/lsp-process.ts:187` and `apps/desktop/electron/features/editor/lsp/lsp-process.ts:221` use `as any` to read initialize results and `workspace/configuration` params. That violates the monorepo's no-type-escape rule and weakens one of the most failure-prone renderer↔main boundaries. Effort: **S**.

- **Medium** — Canonical language/config routing is duplicated across main and renderer layers — `apps/desktop/electron/features/editor/lsp/types.ts:25-41` defines the supported language server config and extension mapping, while `apps/desktop/src/lsp/lsp-conversions.ts:222-239` repeats a second renderer-owned map. This is exactly the kind of contract drift that Wave A/B tried to reduce. Effort: **S**.

- **Medium** — Server-initiated request handling is permissive and masks capability drift — `apps/desktop/electron/features/editor/lsp/lsp-process.ts:216-229` answers `workspace/configuration`, `client/registerCapability`, and `window/workDoneProgress/create` with stub values, then returns `null` for everything else after a log line. Unsupported protocol growth will fail unclearly rather than through an explicit adapter contract. Effort: **M**.

- **Low** — Runtime install policy is underspecified and unpinned — `apps/desktop/electron/features/editor/lsp/types.ts:30` installs `typescript-language-server` and `typescript` with a floating `npm install -g` command inside the workspace container. This weakens reproducibility and makes it harder to reason about server-version regressions across workspaces/profiles. Effort: **S**.

## Proposed Refactoring
1. **Make LSP startup idempotent and share in-flight work.**
   - Add a second map keyed by `workspaceId + language` for startup promises or explicit server states (`starting | ready | failed`).
   - Return the in-flight promise when the same server is already starting.
   - Ensure failure paths clean both the process map and the promise/state map.
   - This aligns with AD-018's runtime-lifecycle expectations and avoids duplicate container exec processes.

2. **Replace protocol `any` casts with explicit result/request shapes.**
   - Define small local interfaces for the `initialize` result and the `workspace/configuration` request params.
   - Use narrow parsing helpers (`isInitializeResult`, `getWorkspaceConfigurationItems`) instead of `as any`.
   - Keep these types close to the protocol adapter so they do not become another mega-barrel.

3. **Promote one canonical language-routing/config surface.**
   - Move the language/extension metadata into a shared renderer-safe module (`@sero/common` or a focused `src/types/lsp.ts`-style contract) consumed by both `electron/features/editor` and `src/lsp`.
   - Keep the main-process-only fields (install/check command) adjacent, but derive renderer-visible language IDs from the same source.
   - This follows the “import canonical types/contracts instead of re-declaring them” rule from the project guidance.

4. **Turn server-request handling into an explicit adapter table.**
   - Replace the `switch` in `handleServerRequest()` with a map of supported handlers.
   - For unsupported methods, either return a structured JSON-RPC error or centralize an explicit “not implemented” path with rate-limited logging.
   - Document which server-initiated requests are intentionally supported for Sero's current Monaco integration.

5. **Document and tighten install ownership.**
   - Decide whether LSP binaries are expected to be runtime-installed or container-image-managed.
   - If runtime install stays, pin versions in `installCommand` and add comments/tests around upgrade expectations.
   - If toolchain ownership moves into the container image, follow the AGENTS rule about rebuilding `sero-node:latest` after Dockerfile/tool changes.

## Benefits & Trade-offs
- Benefits: reliable LSP startup, stricter protocol typing, less renderer/main drift when adding languages, and clearer debugging when a server asks for unsupported capabilities.
- Trade-offs: some additional adapter code and one cross-layer contract move, plus careful regression testing around startup/teardown timing.

## Dependencies & Risks
- Startup deduping must stay coordinated with `src/lsp/use-lsp.ts`, which may currently assume repeated `start()` calls are cheap.
- Shared language-config extraction crosses renderer/main boundaries and should be done with a renderer-safe module, not by importing Electron code into the renderer.
- Install-policy changes may require container-image rebuild discipline if the team decides to stop doing runtime installs.

## Next Steps
1. ~~Add an in-flight startup map to `LspManager` and make `startServer()` idempotent.~~ ✅ 2026-04-12 (`4350404d`)
2. ~~Remove the two `as any` casts from `lsp-process.ts` with explicit protocol helpers.~~ ✅ 2026-04-12 (`4350404d`)
3. Extract canonical language-routing metadata into a shared renderer-safe contract.
4. Refactor server-initiated request handling into a documented adapter table.
5. Decide whether LSP binary versions are pinned at runtime or moved into the container image/toolchain.

## Execution log
- 2026-04-12 — `4350404d` — `fix(desktop): harden wave d high-priority runtime paths`
  - Made `LspManager.startServer()` share in-flight startup work per workspace/language.
  - Replaced the remaining protocol-boundary `any` casts in `lsp-process.ts` with explicit parsing helpers.

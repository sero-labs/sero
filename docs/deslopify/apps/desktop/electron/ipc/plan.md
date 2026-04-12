# Refactoring Plan — apps/desktop/electron/ipc

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/ipc` is broad but mostly well-partitioned by domain. The biggest debt is
contract hygiene: repeated `any`/`as any` in core handler paths, high coupling to the
`@/types/ipc` mega-barrel, and two near-cap core agent files that are one feature
away from violating the 500 LOC rule. The plan focuses on tightening type safety and
decoupling channel imports before this layer becomes brittle.

## Issues Found (prioritized)
- **High** — Type-safety escape hatches (`any` / `as any`) remain in critical IPC paths —
  `apps/desktop/electron/ipc/agent/core/agent-helpers.ts:288,422-440`,
  `apps/desktop/electron/ipc/agent/core/agent.ts:156,393`,
  `apps/desktop/electron/ipc/agent/handlers/imagegen.ts:28,61,107,114`,
  `apps/desktop/electron/ipc/editor/lsp.ts:51`, and
  `apps/desktop/electron/ipc/integrations/google-api.ts:73,79` bypass strict contracts at
  core renderer↔main boundaries. Effort: **M**.

- **Medium** — Core agent IPC files are near cap and overloaded —
  `apps/desktop/electron/ipc/agent/core/agent.ts:1-498` and
  `apps/desktop/electron/ipc/agent/core/agent-helpers.ts:1-453` are close to hard-limit
  breach and combine many responsibilities (pool lifecycle, context overrides, message
  conversion, command shaping, private SDK access). Effort: **M**.

- **Medium** — IPC modules are tightly coupled to `@/types/ipc` instead of narrow channels/types —
  48 files import `IpcChannels` from `@/types/ipc` (examples:
  `agent/core/agent.ts:11`, `workspace/workspace.ts:9`, `platform/system/net.ts:15`) while
  the dedicated channel module is largely unused. This amplifies blast radius of type-barrel edits.
  Effort: **M**.

- **Medium** — Main-process sync filesystem calls appear in handler paths that can run on demand —
  `agent/handlers/prompts.ts:16,61,68`, `agent/handlers/sessions.ts:13,125`,
  `gateway/gateway-ops.ts:13,79,119`, and `apps/apps.ts:10,84,94` use sync fs APIs, increasing
  risk of UI hitching under heavy activity. Effort: **M**.

- **Medium** — Private SDK internals are mutated directly for context overrides —
  `agent/core/agent-helpers.ts:420-440` (`_baseSystemPrompt`) and
  `agent/core/agent-context-overrides.ts:111` (`_rewriteFile`) depend on non-public SDK fields,
  creating upgrade fragility. Effort: **M**.

- **Low** — Event fanout boilerplate is duplicated across many modules —
  repeated `BrowserWindow.getAllWindows()` loops (e.g. `agent/core/agent.ts:99`,
  `integrations/plugins.ts:19`, `container/terminal.ts:18`, `subagent/subagent.ts:33`) add
  mechanical noise and inconsistent error handling. Effort: **S**.

## Proposed Refactoring
1. **Remove `any`/unsafe casts from high-risk IPC boundaries first.**
   - Replace loose imagegen and google/LSP payloads with explicit interfaces.
   - Introduce narrow type guards where SDK unions are broad.
   - Keep unavoidable SDK-private escapes isolated behind a single helper with strong comments/tests.

2. **Split near-cap core agent files by responsibility.**
   - `agent.ts`: isolate session lifecycle, prompt/steer handlers, and utility handlers into
     dedicated modules under `agent/core/handlers/`.
   - `agent-helpers.ts`: move context-editor private SDK helpers and message conversion helpers
     into separate files.

3. **Decouple channel constants from the mega-barrel.**
   - Migrate `IpcChannels` imports to `@/types/ipc-channels` across IPC handlers.
   - Keep payload imports from focused type modules (`@/types/agent`, `@/types/vcs`, etc.) as available.

4. **Replace sync fs APIs in handler hot paths with async equivalents.**
   - Prompts/apps discovery and session-header writes should avoid sync operations inside IPC handlers.
   - Preserve atomic-write semantics where required.

5. **Stabilize private SDK-field access.**
   - Encapsulate `_baseSystemPrompt` / `_rewriteFile` interactions in a single adapter with explicit
     version guard + fallback behavior.
   - This keeps AD-020/AD-021 session behavior intact while reducing upgrade risk.

6. **Introduce a shared IPC event broadcaster helper.**
   - Centralize `BrowserWindow` fanout logic (optional logger + destroyed-window guards), then reuse
     across gateway/subagent/plugins/terminal/debug/collaboration handlers.

## Benefits & Trade-offs
- Benefits: better type reliability at the highest-risk boundary, lower regression risk on SDK upgrades,
  easier review of IPC changes, and fewer accidental cap breaches.
- Trade-offs: medium refactor churn across many files and potential temporary merge friction while
  import paths and shared helpers are being normalized.

## Dependencies & Risks
- Depends on Wave A `src/types` + `preload` cleanup to avoid conflicting import strategy changes.
- Tightening types may surface latent mismatches in renderer/preload callers that were previously hidden.
- Refactoring private SDK access requires careful regression checks around context editor + session persistence.

## Next Steps
1. Fix High: remove/contain `any` escape hatches in core IPC handlers.
2. Split `agent/core/agent.ts` and `agent/core/agent-helpers.ts` before they exceed 500 LOC.
3. Migrate IPC handler channel imports to `@/types/ipc-channels`.
4. Convert sync fs handler operations to async where practical.
5. Start Wave A step 4: `deslopify apps/desktop/electron/features/workspace`.

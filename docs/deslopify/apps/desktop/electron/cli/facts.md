# Facts — apps/desktop/electron/cli

_Last reviewed: 2026-04-13_

## What this code does
This folder is the AD-020 bridge that collapses built-in app commands, bridged extension tools, and bridged slash commands into the single `sero-cli` tool. It builds the CLI prompt block, resolves session-scoped tool/command bindings at execute time, enforces per-turn command budgets, and provides the built-in desktop control surfaces (`app`, `workspace`, `vcs`, `editor`, `devserver`, `google`, etc.) that agent sessions, subagents, and container-backed sessions all rely on.

## Shape & metrics
- Total files: 34
- Total LOC: 3,862
- Largest file: `apps/desktop/electron/cli/core/tool.ts` (474 LOC)
- Files over 500 LOC: none
- Near-cap files:
  - `apps/desktop/electron/cli/core/tool.ts` (474)
  - `apps/desktop/electron/cli/commands/integrations/google.ts` (441)
  - `apps/desktop/electron/cli/commands/apps/app-control.ts` (436)
  - `apps/desktop/electron/cli/core/schema-bridge.ts` (403)
- External dependencies of note:
  - Pi SDK `ToolDefinition` / `ExtensionContext`
  - Electron `BrowserWindow` / `webContents.executeJavaScript()`
  - shared infra singletons (`workspaceManager`, `containerManager`, VCS/artifact managers)
  - plugin bridge policy in `electron/features/plugins/bridge-policy`
  - host/container `gog` execution for Google auth/Gmail/Calendar flows
- Upstream callers: 26 importers outside this folder. Runtime-critical callers are `apps/desktop/electron/ipc/agent/core/agent.ts`, `apps/desktop/electron/features/apps/extensions/create-sero-extension.ts`, `apps/desktop/electron/features/subagent/runtime/{runner,loader}.ts`, and `apps/desktop/electron/features/container/tools/tools.ts`.
- Downstream dependencies: every bridged extension tool/command, session-scoped `sessionRuntime` side effects, CLI prompt generation, and per-turn command budgeting.
- Test coverage note: 17 focused test files live under `apps/desktop/electron/__tests__/cli/**`.

## Architectural notes
- This is the practical center of AD-020. `bridgeExtensionTools()` mutates loaded extension tool/command maps, caches session-local copies in `bridges/extension-session-bridge.ts`, and relies on execute-time resolution instead of registration-time closure capture.
- `core/tool.ts` owns the behavior-sensitive runtime rules: multi-command batching, timeout budgets, rate limiting, legacy image fallback, and the narrow `sessionRuntime` capability used by bridged tools.
- `core/schema-bridge.ts` is the generic tool-to-CLI adapter. It performs schema introspection, arg coercion, help generation, tool execution, and bridged slash-command wrapping in one place.
- `commands/apps/app-control.ts` reimplements the same renderer-control path that already exists in `apps/desktop/electron/ipc/apps/app-control.ts`: both call renderer globals through `webContents.executeJavaScript()` and depend on `window.__appControl` / `window.sero.appControl` being present.
- `commands/integrations/google.ts` is the only built-in CLI surface that dynamically switches between host execution and container execution based on workspace/container state.
- Turn budgets are keyed by workspace + turn id in `bridges/agent-bridge.ts`, not by command name.

## Runtime-sensitive surfaces
- Multi-command batches intentionally degrade to text-only output when any command emits rich/image content; future cleanup must preserve `details.richOutputFallback` and the user-facing fallback notice.
- Interactive commands (`question`, `questionnaire`, `interview`, and CLI confirmation prompts) intentionally bypass per-command and batch timeouts.
- Session-local tool/command resolution must stay scoped to the active session; cleanup here must not accidentally reuse another session's extension closures.
- `app-control` and `gog-runner` are especially behavior-sensitive:
  - `app-control` depends on renderer globals, timing, screenshots, and recording state.
  - `gog-runner` depends on Sero-managed Google credentials and the host-vs-container execution split.

## Surprising discoveries
- There are no 500+ LOC violations, but four separate modules above 400 LOC all sit directly on the AD-020 runtime path.
- The CLI already has unusually strong direct test coverage for a main-process runtime seam, which makes targeted refactors much safer than this file layout suggests.
- The remaining type escape hatches are concentrated exactly where the bridge crosses boundaries: schema walking, bridged command context assembly, tool-update forwarding, and `gog` exec error handling.
- `commands/apps/app-control.ts` duplicates a host-side renderer bridge that the IPC layer already implements, so app automation fixes currently have two main-process copies to keep in sync.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total files: 35 (was 34)
- Total LOC: 4,057 (was 3,862)
- Largest file: `apps/desktop/electron/cli/core/tool.ts` (494 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining on the High boundary seam: 0 in `core/schema-bridge.ts`, `core/tool.ts`, and `lib/gog-runner.ts`

### What changed
- Added `core/bridge-context.ts` to own typed live/fallback `ExtensionContext` and `ExtensionCommandContext` assembly for bridged tools and slash commands.
- Replaced schema `any` walking with typed helpers for `properties`, `required`, `anyOf`, and nested array/object help generation.
- Replaced tool-update and gog exec-failure casts with typed adapters/normalizers and revalidated the bridge with focused CLI tests.

### Still outstanding
- `core/tool.ts` is now 494 LOC and still needs the planned runtime-concern split (Medium).
- `app-control` duplicate host service extraction remains pending (Medium).
- `google.ts` and `app-control.ts` remain near-cap router files (Medium).

## Post-fix snapshot — 2026-04-14

### Metrics after fixes
- Total files: 46 (was 35)
- Total LOC: 4,126 (was 4,057)
- Largest file: `apps/desktop/electron/cli/core/schema-bridge.ts` (427)
- Files over 500 LOC: none
- Remaining type escape hatches on the bridge seam: 0

### What changed
- Split the AD-020 batch runtime into `core/batch-executor.ts` and `core/invocation-context.ts`, reducing `core/tool.ts` to a thin composition root.
- Split the Google CLI router into focused auth/Gmail/Calendar modules while preserving the public `google` command surface.
- Introduced a shared host-owned `features/apps/app-control/host-service.ts` and rebased both CLI and IPC app-control flows onto it.
- Split the CLI app-control command into focused navigation, screenshot, interaction, recording, and shared helper modules; added direct host-service coverage alongside the existing CLI test suite.

### Still outstanding
- Low-only follow-up: decide whether shared CLI flag parsing should stay long-flags-only or gain scoped short-flag support so command-local cleanup hacks disappear.

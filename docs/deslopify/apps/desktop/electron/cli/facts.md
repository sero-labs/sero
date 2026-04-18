# Facts — apps/desktop/electron/cli

_Last reviewed: 2026-04-18_

## What this code does
This folder is the AD-020 bridge that collapses built-in platform commands plus manifest-driven app/plugin tools and bridged slash commands into the single `sero-cli` tool. It owns schema-to-CLI translation, per-command batching/timeout behavior, session-scoped runtime forwarding, and the process-global app-command registry that active sessions reload after plugin install/update.

## Shape & metrics
- Total files: 46
- Total LOC: 4,249
- Largest file: `apps/desktop/electron/cli/core/schema-bridge.ts` (471 LOC)
- Files over 500 LOC: none
- Near-cap files:
  - `apps/desktop/electron/cli/core/schema-bridge.ts` (471)
- External dependencies of note:
  - Pi SDK `ToolDefinition` / `ExtensionContext`
  - shared infra singletons (`workspaceManager`, `containerManager`)
  - session bridge/runtime hooks in `apps/desktop/electron/cli/bridges/*.ts`
  - plugin lifecycle + discovery metadata in `apps/desktop/electron/features/{plugins,apps/discovery}/**`
  - plugin contract types in `packages/common/src/plugins.ts`
- Upstream callers of note:
  - `apps/desktop/electron/ipc/agent/core/{agent.ts,agent-prompt.ts,agent-session-open.ts}`
  - `apps/desktop/electron/features/apps/extensions/create-sero-extension.ts`
  - `apps/desktop/electron/features/subagent/runtime/{loader,runner}.ts`
  - `apps/desktop/electron/features/container/tools/tools.ts`
- Downstream dependencies:
  - every bridged app/plugin tool and slash command
  - CLI prompt generation and help output
  - execution-scoped `sessionRuntime` side effects (`sendUserMessage`, `sendMessage`)
  - plugin install/update hot-load expectations for bridged commands
- Test coverage note: 18 focused test files live under `apps/desktop/electron/__tests__/cli/**`.

## Architectural notes
- `bridgeExtensionTools()` in `apps/desktop/electron/cli/index.ts` now treats app/plugin commands as derived session state: it records live session tools/commands in `bridges/extension-session-bridge.ts`, tags bridged app commands with session-extension ownership metadata, and replaces the registry’s app-command slice per session reload instead of relying on first-registration wins.
- `CliRegistry` now owns provenance-aware app-command lifecycle state (`core/registry.ts`), so session teardown and plugin/session reloads can remove or replace app-owned commands without disturbing builtin commands.
- The bridge supports custom tool-level CLI metadata (`definition.cli`) in `core/schema-bridge.ts`, and both normal bridged tools plus custom CLI bridges now re-resolve the live session tool definition at execute time.
- Session teardown now uses `clearBridgedExtensionSessionStateForSession()` so closing a session removes its cached extension resources and its session-owned CLI commands together.
- The broader host/plugin compatibility contract now lives alongside this seam: shared plugin metadata includes `requiredHostCapabilities`, discovery surfaces `hostCompatibility`, and the plugin manager reconciles install/load activation against the runtime host version + capability set.

## Runtime-sensitive surfaces
- Multi-command batches intentionally degrade to text-only output when any command emits rich/image content; cleanup must preserve `details.richOutputFallback` and the existing fallback notice.
- Interactive commands (`question`, `questionnaire`, `interview`, and CLI confirmation prompts) intentionally bypass per-command and batch timeouts.
- Session-local tool/command resolution must stay scoped to the active session; cleanup here must not reintroduce first-session closure capture.
- Plugin install/update promises immediate hot-loading of bridged CLI commands in docs (`docs/plugins/technical.md:354-357`), so command-registration freshness is now a user-visible contract, not just an internal convenience.
- Plugin-owned commands that emit follow-up chat messages rely on execution-scoped `sessionRuntime`; any registry/lifecycle refactor must preserve that narrow runtime path.
- External-plugin compatibility is now more sensitive after the Google cutover because some old shell-specific bridges are gone; unsupported hosts need a fail-closed path instead of relying on reviewer coordination.

## Surprising discoveries
- The platform fix needed a generic prerequisite outside `electron/cli`: a renderer-safe app-tool bridge (`appAgent.invokeTool` / `useAppTools().run(...)`) had to land first so external plugins can depend on a durable host capability instead of bespoke preload seams.
- The cleanest way to make bridged app commands truthful was not “re-register when missing”; it was to model them as per-session derived state and let the registry own replace/remove semantics explicitly.
- Compatibility enforcement is not just an install-time check. Existing installed plugins also needed startup/load reconciliation so incompatible packages stay visible in discovery but are removed from the active package list until the host matches their contract.
- The host-side renderer store needed a small follow-up too: unsupported plugin apps must stay browseable in the App Store while being hidden from the active sidebar/preload path so the UI fails closed instead of loading broken remotes.

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

## Post-review snapshot — 2026-04-18 (Google migration follow-up planning)

### Metrics after review
- Total files: 39
- Total LOC: 3,518
- Largest file: `apps/desktop/electron/cli/core/schema-bridge.ts` (459 LOC)
- Files over 500 LOC: none

### What changed
- Re-reviewed the AD-020 bridge after the Google external-plugin cutover and found two host-owned platform follow-ups that are broader than the Google plugin itself.
- Confirmed that custom bridged plugin commands are not truly hot-swappable after install/update because the registry keeps the first captured `cli.execute` closure even though normal bridged tools already re-resolve live definitions.
- Confirmed that host/plugin compatibility metadata (`minSeroVersion`) is still declarative only, with no enforced version/capability gate during install/load.
- Reopened the CLI deslopify plan as the home for a separate platform hardening pass before the Google PR pair is re-reviewed for merge.

### Still outstanding
- Add provenance-aware app-command lifecycle management so process-global app/plugin CLI registrations can be updated or removed safely after session/plugin reloads.
- Add a real host/plugin compatibility contract (runtime host version + enforced capability/version checks) before relying on external plugin migrations that remove old shell-owned seams.
- Re-review the Google migration PRs after those core fixes land and integrate the final compatibility declaration there.

## Post-fix snapshot — 2026-04-18 (platform hardening landed)

### Metrics after fixes
- Total files: 46 (was 39 at review time)
- Total LOC: 4,249 (was 3,518)
- Largest file: `apps/desktop/electron/cli/core/schema-bridge.ts` (471 LOC)
- Files over 500 LOC: none
- Focused CLI test files: 18 (was 17)

### What changed
- Added the generic app-tool bridge prerequisite across `packages/common`, `packages/app-runtime`, preload, and app-agent IPC so plugins can depend on a stable `appAgent.invokeTool` host capability.
- Reworked `CliRegistry` into a provenance-aware overlay for session-owned app commands, and updated `bridgeExtensionTools()` to replace/remove each session’s app-command slice deterministically.
- Made custom tool-level CLI bridges resolve live `definition.cli` handlers at execution time, eliminating stale captured closures after plugin/session reloads.
- Added focused regressions for custom bridge override/update/removal plus compatibility enforcement (`custom-tool-cli-bridge`, `plugin-compatibility`, `plugin-manager`, and updated app-discovery/app-store tests).
- Added the host/plugin compatibility contract: `requiredHostCapabilities`, runtime host-version evaluation, install/load enforcement, startup activation reconciliation, and renderer-visible unsupported-plugin state.
- Updated plugin docs so the hot-load and compatibility guarantees match the runtime again.

### Still outstanding
- The separate Google integration/re-review pass is still pending on the external migration branches; this core pass only lands the host/platform contract they now depend on.

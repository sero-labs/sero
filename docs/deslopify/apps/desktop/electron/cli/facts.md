# Facts — apps/desktop/electron/cli

_Last reviewed: 2026-04-18_

## What this code does
This folder is the AD-020 bridge that collapses built-in platform commands plus manifest-driven app/plugin tools and bridged slash commands into the single `sero-cli` tool. It owns schema-to-CLI translation, per-command batching/timeout behavior, session-scoped runtime forwarding, and the process-global app-command registry that active sessions reload after plugin install/update.

## Shape & metrics
- Total files: 39
- Total LOC: 3,518
- Largest file: `apps/desktop/electron/cli/core/schema-bridge.ts` (459 LOC)
- Files over 500 LOC: none
- Near-cap files:
  - `apps/desktop/electron/cli/core/schema-bridge.ts` (459)
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
- Test coverage note: 17 focused test files live under `apps/desktop/electron/__tests__/cli/**`.

## Architectural notes
- `bridgeExtensionTools()` in `apps/desktop/electron/cli/index.ts:187-225` still mutates extension tool maps during resource loading, caches session-local copies in `bridges/extension-session-bridge.ts:1-109`, and registers app/plugin commands into one process-global `CliRegistry`.
- The bridge now supports custom tool-level CLI metadata (`definition.cli`) in `core/schema-bridge.ts:344-427`, which lets plugins override builtin command names/help/summary and provide raw-args execution paths.
- Normal bridged tool execution already re-resolves the live session tool definition at execute time (`core/schema-bridge.ts:402-410`), but the custom CLI bridge path still executes the handler captured when the command was first registered (`core/schema-bridge.ts:392-399`).
- Plugin install/uninstall currently reloads active session resource loaders (`apps/desktop/electron/ipc/integrations/plugins.ts:23-45`, `apps/desktop/electron/ipc/agent/core/agent.ts:54-56`) and clears plugin-policy caches (`apps/desktop/electron/features/plugins/manager.ts:295-330`), but there is no symmetrical rebuild/removal step for process-global app-source CLI registrations.
- Plugin compatibility metadata is shared and parsed (`packages/common/src/plugins.ts:19-28`, `apps/desktop/electron/features/apps/discovery/index.ts:175-223`) but still not enforced during install/load.

## Runtime-sensitive surfaces
- Multi-command batches intentionally degrade to text-only output when any command emits rich/image content; cleanup must preserve `details.richOutputFallback` and the existing fallback notice.
- Interactive commands (`question`, `questionnaire`, `interview`, and CLI confirmation prompts) intentionally bypass per-command and batch timeouts.
- Session-local tool/command resolution must stay scoped to the active session; cleanup here must not reintroduce first-session closure capture.
- Plugin install/update promises immediate hot-loading of bridged CLI commands in docs (`docs/plugins/technical.md:354-357`), so command-registration freshness is now a user-visible contract, not just an internal convenience.
- Plugin-owned commands that emit follow-up chat messages rely on execution-scoped `sessionRuntime`; any registry/lifecycle refactor must preserve that narrow runtime path.
- External-plugin compatibility is now more sensitive after the Google cutover because some old shell-specific bridges are gone; unsupported hosts need a fail-closed path instead of relying on reviewer coordination.

## Surprising discoveries
- The generic AD-020 bridge is only half-dynamic today: plain bridged tools resolve live session definitions at execute time, but custom `tool.cli.execute` handlers remain sticky after first registration.
- `docs/plugins/technical.md:354-357` and `docs/plugins/guide.md:465-466` currently overstate plugin hot-update behavior: resource reloads happen, but process-global custom app commands can still serve stale help/execution after plugin reinstall/update.
- `minSeroVersion` is parsed and surfaced for search/display, but install/load paths do not enforce it, and the desktop host version is still `0.1.0` in `apps/desktop/package.json:3`, which makes cross-repo migrations difficult to gate safely.
- The global CLI registry stores app commands in a flat namespace keyed only by command name, so plugin-origin commands need explicit provenance/ownership semantics if they are going to become truly upsertable/removable.

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

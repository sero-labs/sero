# Refactoring Plan — apps/desktop/electron/cli

_Plan drafted: 2026-04-13_

## Executive Summary
The original AD-020 cleanup goals for `electron/cli` were completed, but the Google external-plugin PR review surfaced two deeper platform issues that belong here, not in the plugin repo: app/plugin CLI commands with custom bridge handlers are not truly hot-swappable after install/update, and host/plugin compatibility metadata is still parse-only instead of enforced. The goal of this follow-up is to make app-source CLI registrations truthful derived state again, then add a real host/plugin compatibility contract so external plugin migrations fail closed instead of relying on branch coordination.

## Issues Found (prioritized)
- **High** — ~~Custom bridged plugin commands are not truly hot-swappable after install/update — `apps/desktop/electron/cli/index.ts:202-215` skips re-registering any existing app command unless it is overriding a builtin, while `apps/desktop/electron/cli/core/schema-bridge.ts:392-399` executes the `cli.execute` closure captured at registration time instead of re-resolving the live tool definition. Plugin install/uninstall only reloads session resources and clears bridge-policy caches (`apps/desktop/electron/ipc/integrations/plugins.ts:23-45`, `apps/desktop/electron/features/plugins/manager.ts:295-330`), so custom app/plugin commands can keep stale help text and stale execution behavior after hot updates even though the docs promise bridged CLI commands refresh immediately (`docs/plugins/technical.md:354-357`).~~ ✅ 2026-04-18 (`def00edf`) — session-owned app commands now use provenance-aware replace/remove semantics, and custom `definition.cli` bridges re-resolve the live tool definition at execute time.

- **High** — ~~Host/plugin compatibility metadata is declarative only and currently fails open — plugin metadata only models `minSeroVersion` and bridge policy in shared types (`packages/common/src/plugins.ts:19-28`), app discovery only parses and surfaces those fields (`apps/desktop/electron/features/apps/discovery/index.ts:175-223`), and plugin install finalization has no compatibility gate before registering the app and hot-loading resources (`apps/desktop/electron/features/plugins/manager.ts:292-330`). Combined with the desktop app still reporting `0.1.0` in `apps/desktop/package.json:3`, external plugin migrations that depend on new host capabilities have no reliable fail-closed path.~~ ✅ 2026-04-18 (`60d716bd`) — shared plugin metadata now includes `requiredHostCapabilities`, discovery surfaces runtime compatibility, install/load paths enforce the host contract, and incompatible installed plugins are reconciled out of the active package list.

- **Medium** — ~~The process-global CLI registry has no provenance-aware lifecycle for app/plugin command ownership — app commands are stored in a flat registry keyed only by command name (`apps/desktop/electron/cli/core/registry.ts:12-24`), while session-local tool definitions are tracked separately in `apps/desktop/electron/cli/bridges/extension-session-bridge.ts:9-109`. That split was sufficient when app commands were mostly static wrappers, but it is now the reason custom plugin commands become sticky and why uninstall/removal lacks a first-class registry cleanup path.~~ ✅ 2026-04-18 (`def00edf`) — `CliRegistry` now manages session-extension ownership metadata and explicit replace/remove lifecycles for app commands.

- **Medium** — ~~Plugin hot-reload guarantees are stronger in docs than in runtime verification — the plugin system docs explicitly say install/update reloads plugin-local extensions, prompts, skills, tools, and bridged CLI commands immediately (`docs/plugins/technical.md:354-357`, `docs/plugins/guide.md:465-466`), but the current test surface only validates normal bridge override registration and live non-custom tool resolution (`apps/desktop/electron/__tests__/cli/custom-tool-cli-bridge.test.ts`, `apps/desktop/electron/__tests__/cli/extension-session-bridge.test.ts`). There is no regression coverage for reinstall/update of a custom bridged plugin command without desktop restart.~~ ✅ 2026-04-18 (`def00edf`, `60d716bd`) — added focused hot-update/uninstall/compatibility regressions and updated the plugin docs to match the runtime contract.

- **Low** — ~~Shared CLI flag parsing is narrower than the command surface now expects — `apps/desktop/electron/cli/lib/utils.ts:13-42` only understands `--long` flags, which already forced one local workaround in `apps/desktop/electron/cli/commands/vcs/vcs.ts:46-56` to strip accidental `-m`. That is not breaking the bridge today, but it is already producing command-local parsing hacks.~~ Deferred — the Google review did not add pressure here, and the more urgent lifecycle/compatibility work should land first.

- **Medium** — ~~The core AD-020 runtime was concentrated in two near-cap orchestration files — `apps/desktop/electron/cli/core/tool.ts` and `apps/desktop/electron/cli/core/schema-bridge.ts`.~~ ✅ 2026-04-14 (`a917905a`) — extracted batch execution and invocation/session-runtime ownership out of `core/tool.ts`.

- **Medium** — ~~`app-control` duplicated the existing host-side renderer automation bridge and timing heuristics.~~ ✅ 2026-04-14 (`06b1b653`) — moved CLI + IPC onto a shared host-owned app-control service.

- **Medium** — ~~Two built-in command routers were near-cap switch forests (`google.ts`, `app-control.ts`).~~ ✅ 2026-04-14 (`a917905a`, `06b1b653`) — split the Google and app-control routers into focused modules.

## Proposed Refactoring
1. **Make app/plugin CLI registrations provenance-aware and upsertable.**
   - Add explicit ownership metadata to app-source CLI commands (for example: command name + source kind + plugin/app owner identity).
   - Extend the CLI registry with app-command replace/remove semantics instead of the current flat “first registration wins unless overriding a builtin” rule.
   - Keep builtin commands protected by explicit override policy, but treat app/plugin commands as derived runtime state that can be refreshed safely.
   - Target structure:
     - `core/registry.ts` gains owner-aware register/update/remove APIs for `source: 'app'`
     - `index.ts` / bridge layer uses those APIs when `bridgeExtensionTools()` runs
     - uninstall/resource-reload paths can remove stale app-owned commands deterministically
   - This preserves AD-020 while aligning the registry with the real source of truth: live extension resources, not first-load closures.

2. **Resolve custom CLI bridges from the live session tool definition at execute time.**
   - Add a helper in the bridge layer that resolves the active tool definition for a command name before execution, then reads the live `definition.cli` metadata if present.
   - Keep the current static registration object only as a fallback for command discovery/help when no live session entry exists.
   - Preserve the normal bridged-tool behavior that already re-resolves live definitions (`schema-bridge.ts:402-410`) and make the custom-bridge path consistent with it.
   - This prevents custom handlers like the Google `google` command from staying pinned to the first loaded plugin instance.

3. **Refresh the app-command slice explicitly on plugin/session lifecycle changes.**
   - Revisit the plugin install/uninstall/resource-reload path so app-owned CLI command registrations are rebuilt when active session loaders reload.
   - Prefer a single helper that derives the process-global app-command slice from active sessions, instead of letting stale commands linger across install/update/uninstall.
   - Validate the full lifecycle:
     - initial plugin install
     - plugin reinstall/update with the same command name
     - uninstall/removal
     - session close/open after plugin change
   - This should be implemented generically, not as a Google-specific special case.

4. **Add a real host/plugin compatibility contract.**
   - Keep `minSeroVersion`, but make it real: derive the runtime host version from the desktop app/Electron runtime and enforce it during install/load.
   - Add explicit host capability declarations to plugin metadata (for example a `requiredHostCapabilities` array) so external plugins can depend on specific platform seams like `appAgent.invokeTool` or custom tool-level CLI bridging without guessing by version alone.
   - Target structure:
     - shared plugin types in `packages/common/src/plugins.ts`
     - app discovery parsing/validation in `features/apps/discovery/index.ts`
     - compatibility evaluation helper under `features/plugins/` or `features/apps/discovery/`
     - install/load enforcement in `features/plugins/manager.ts`
     - renderer-facing install/discovery UI can surface supported vs unsupported plugin state cleanly
   - This aligns with Sero’s plugin docs and removes the need to coordinate multi-repo migrations by hand.

5. **Use the Google migration as the first integration target after the core fix.**
   - After the platform work lands, rebase the Sero and Google plugin branches.
   - Update the Google plugin manifest to declare the final compatibility contract.
   - Re-run hot-update/install tests proving `sero google ...` help and behavior refresh without desktop restart.
   - Re-review the Google PR pair only after the platform fixes are integrated, so the migration is judged against the final host contract instead of an implicit one.

## Benefits & Trade-offs
- Benefits:
  - restores truthfulness between live plugin resources and the process-global CLI command surface
  - removes a class of stale hot-update bugs for every future external plugin, not just Google
  - gives external plugin migrations a fail-closed compatibility mechanism
  - makes AD-020 documentation accurate again
- Trade-offs:
  - touches behavior-sensitive plugin/session lifecycle seams, not just local CLI code
  - requires new owner/provenance concepts in the CLI registry
  - adds product/UI decisions for how unsupported plugins are surfaced at install/browse/load time
  - will force a small follow-up integration pass in the Google migration PRs after the platform work lands

## Dependencies & Risks
- The registry refresh work must preserve session correctness: bridged execution still has to use the current session’s loaded tool/command definitions and current `sessionRuntime`.
- Rebuilding/removing app-owned commands must not accidentally remove builtin commands or break command-group/help ordering.
- Capability/version gating is a semantic change, not just cleanup: installs that previously succeeded may now be blocked explicitly, so the UI/error copy must be actionable.
- The compatibility contract should avoid duplicating unstable internals. Prefer durable host capabilities over plugin-specific one-offs.
- If host versioning remains `0.1.0` forever, `minSeroVersion` will stay meaningless; the runtime host version source needs to become trustworthy before external plugin gating is useful.
- Plugin docs currently promise hot-update behavior that runtime does not fully provide. The docs should be updated in the same change set that makes the runtime truthful again.

## Next Steps
1. ~~Introduce a small design note for app-command provenance and compatibility metadata shape before coding the refactor.~~ ✅ 2026-04-18 — the landed owner metadata + compatibility helper modules became the design note in code.
2. Land the CLI/app-command lifecycle hardening first:
   - [x] app-source commands become replaceable/removable by owner
   - [x] custom bridged commands resolve live `cli.execute` handlers
   - [x] hot-update regressions cover reinstall/update/uninstall without restart
3. Land the compatibility contract second:
   - [x] real host version source
   - [x] `minSeroVersion` enforcement
   - [x] explicit host capability declarations and enforcement
   - [x] unsupported-plugin UX/error handling
4. Once the core work lands, return to `docs/deslopify/plugins/sero-google-plugin/plan.md` and complete the planned integration/re-review phase.
5. Verification checklist for this platform pass:
   - [x] install a plugin that exposes a custom bridged command, update it in place, and confirm `sero help <command>` plus execution both reflect the new version without restarting Sero
   - [x] uninstall that plugin and confirm the bridged command disappears cleanly
   - [x] verify ordinary non-custom bridged tools still resolve the live session definition
   - [x] verify supported plugins install/load normally under the new compatibility contract
   - [x] verify incompatible plugins fail closed with actionable guidance during install/load

## Execution log
- `8d8f7648` — `refactor(cli): harden AD-020 bridge typing`
- `a917905a` — `refactor(cli): split batch runtime and google router`
- `06b1b653` — `refactor(app-control): centralize host app control service`
- 2026-04-18 — Planning refresh after related Google PR review: identified two platform-owned follow-ups (custom app-command hot-update staleness and unenforced host/plugin compatibility), reopened this folder plan as the tracking home for the separate core fix, and deferred Google PR merge/re-review until this pass lands.
- `768fae67` — `feat(app-runtime): add generic app-tool bridge`
- `def00edf` — `refactor(cli): refresh bridged app commands`
- `60d716bd` — `fix(plugins): enforce host compatibility`

# Facts — plugins/sero-google-plugin

_Last reviewed: 2026-04-18_

## What this code does
`plugins/sero-google-plugin/` is an external Sero integrations plugin that exposes Gmail and Google Calendar to both the agent and the federated React UI. The package already owns the app manifest, widgets, shared state shape, and the `gmail` / `gcal` extension tools, but the desktop shell still owns the plugin’s OAuth flow, gog credential provisioning, direct UI execution bridge, and the richer built-in `sero google ...` CLI surface.

## Shape & metrics
- Total tracked files: 24 (excluding `node_modules/`, `dist/`, and `package-lock.json`)
- Total tracked LOC: 3,433
- Largest file: `plugins/sero-google-plugin/extension/index.ts` (335 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC): none
- Test surface: none — no plugin-local `*test*` files are present today
- External dependencies of note:
  - Pi extension/runtime APIs (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui`)
  - `@sero-ai/app-runtime` file-backed state bridge (`packages/app-runtime/src/use-app-state.ts:19-99`)
  - gogcli / `gog` on the host machine
  - Google OAuth endpoints + localhost loopback callback server
  - Desktop-only Google bridge surfaces: `window.sero.google` and `window.sero.pluginConfig` (`plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:30-34`)
- Upstream callers / consumers of note:
  - Generic plugin platform: app discovery, Module Federation remote loading, and app-agent session loading (`apps/desktop/electron/ipc/agent/handlers/app-agent.ts:116-149`)
  - Google UI path: `apps/desktop/electron/preload/integrations/google-imagegen.ts:33-45`, `apps/desktop/electron/preload/api.ts:19-20,63-65`, `apps/desktop/src/types/electron-apps.d.ts:65-75`, `apps/desktop/src/types/ipc-channels.ts:385-396`
  - Host Google runtime: `apps/desktop/electron/ipc/integrations/google-api.ts:80-110`, `apps/desktop/electron/features/auth/google/**/*.ts`, `apps/desktop/electron/cli/lib/gog-runner.ts:68-148`, `apps/desktop/electron/cli/commands/integrations/google.ts:49-95`
- Downstream dependencies:
  - Global app state at `$SERO_HOME/apps/google/state.json` or workspace-local fallback via `resolveStatePath()` (`plugins/sero-google-plugin/extension/index.ts:22-39`)
  - Plugin config at `$SERO_AGENT_DIR/plugin-config/sero-google-plugin.json` (`apps/desktop/electron/features/auth/google/config.ts:25-37`)
  - gog keyring password + client bucket semantics (`apps/desktop/electron/features/auth/google/gog-keyring.ts:34-82`)
  - Current built-in `sero google` command contract, which is broader than the plugin’s own tools (`apps/desktop/electron/cli/commands/integrations/google.ts:49-95`)

## Architectural notes
- The plugin already gets the core plugin-platform basics right: standard `sero.app` / `sero.plugin` manifest, relative production `base: './'`, `pi.registerTool()` usage, and `useAppState()` for file-backed UI state (`plugins/sero-google-plugin/package.json:18-77`, `plugins/sero-google-plugin/ui/GoogleApp.tsx:21-24`, `packages/app-runtime/src/use-app-state.ts:19-99`).
- The biggest ownership break is the renderer path. The UI does not invoke plugin-owned tools or commands; it calls a dedicated shell API instead (`plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:30-34`). That forces Google-specific preload, IPC, and type declarations into the core desktop app (`apps/desktop/electron/preload/integrations/google-imagegen.ts:33-45`, `apps/desktop/src/types/electron-apps.d.ts:65-75`, `apps/desktop/src/types/ipc-channels.ts:385-396`).
- Google domain logic currently exists in three parallel runtimes:
  1. plugin extension tools writing app state (`plugins/sero-google-plugin/extension/index.ts:89-329`)
  2. renderer-side direct gog JSON mapping (`plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:178-250`)
  3. host-owned `sero google` CLI + auth/runtime helpers (`apps/desktop/electron/cli/commands/integrations/google.ts:49-95`, `apps/desktop/electron/cli/lib/gog-runner.ts:68-148`, `apps/desktop/electron/features/auth/google/**/*.ts`)
- The host auth/runtime path is profile-aware and migration-aware. It chooses a per-profile gog client bucket (`apps/desktop/electron/features/auth/google/gog-keyring.ts:64-75`) and preserves the buggy-password migration path (`apps/desktop/electron/features/auth/google/status.ts:52-89`). The plugin extension’s own gog runner does not currently participate in that contract (`plugins/sero-google-plugin/extension/gogcli.ts:70-78`).
- The app-agent infrastructure is already app-scoped: each app gets a dedicated session that loads only that app’s own extensions and skills (`apps/desktop/electron/ipc/agent/handlers/app-agent.ts:136-149`). That is the obvious generic foundation for a future plugin-owned tool-execution bridge.

## Runtime-sensitive surfaces
- **AD-022 profile isolation:** current host auth stores Google tokens in a per-profile gog client bucket, not just a shared default bucket (`apps/desktop/electron/features/auth/google/gog-keyring.ts:64-75`). Any migration that drops that behavior risks stranding tokens for non-default profiles.
- **Legacy keyring migration:** the host still carries recovery logic for the previous buggy profile-scoped keyring password (`apps/desktop/electron/features/auth/google/status.ts:52-89`). A plugin-owned rewrite must preserve or explicitly retire that migration path.
- **AD-018 container behavior:** the built-in CLI runner can execute `gog` inside workspace containers or on the host (`apps/desktop/electron/cli/lib/gog-runner.ts:113-148`). The plugin extension currently runs gog only via host `execFile()` (`plugins/sero-google-plugin/extension/gogcli.ts:75-89`).
- **AD-020 command/tool ownership:** today the plugin contributes `gmail` and `gcal`, while the shell separately exposes a broader built-in `google` command family. Removing the shell command without a plugin-owned parity plan would be a user-visible contract change.
- **State-truthfulness:** both the UI and the extension write `.sero/apps/google/state.json`, but they do not shape Gmail/Calendar payloads identically. Cleanup must converge these paths instead of moving the mismatch to a different folder.

## Surprising discoveries
- The plugin is only partially self-contained today. The desktop shell still ships a Google-only preload API, dedicated IPC channels, a Google auth manager, and a built-in Google CLI even though the plugin already exists.
- The plugin extension and the renderer produce different state richness from the same gog payloads. For example, the tool path writes thread messages without `bodyHtml` (`plugins/sero-google-plugin/extension/index.ts:144-153`), while the UI path parses full HTML bodies (`plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:196-204` + `plugins/sero-google-plugin/ui/components/gmail-parser.ts:67-91`). Calendar event shaping diverges similarly (`plugins/sero-google-plugin/extension/index.ts:236-248` vs `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:207-225`).
- The plugin extension’s gog runner does not pass `--client`, does not ensure OAuth credentials are imported, and therefore does not obviously align with the profile-aware host auth/runtime contract (`plugins/sero-google-plugin/extension/gogcli.ts:70-78` vs `apps/desktop/electron/cli/lib/gog-runner.ts:70-92`).
- The existing app-agent architecture already loads only app-local extensions, which means the shell is missing a generic “invoke my app’s tool directly” capability more than it is missing Google-specific business logic.

## Post-fix snapshot — 2026-04-17

### Metrics after fixes
- Total files: 24 (unchanged from the 2026-04-17 review; the external plugin package is still not present in this checkout)
- Largest file: `plugins/sero-google-plugin/extension/index.ts` (335 LOC, unchanged in this docs-only phase)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: not re-audited in this docs-only phase because no source files changed

### What changed
- Locked Phase 0 on the CLI parity path: Phase 5 must preserve the public `sero google ...` contract by moving it behind a plugin-owned `google` tool/command surface rather than narrowing to `gmail` / `gcal`.
- Documented the behavior checklist that later phases must preserve: auth event types, `getGoogleClientName()` / `--client` profile isolation semantics, legacy buggy-keyring migration, and current host-versus-container execution expectations.
- Recorded the shell-owned Google surfaces that stay in place until the final cutover (`window.sero.google`, `IpcChannels.google.*`, `SeroGoogleAPI`, and the built-in Google CLI files).
- Confirmed a current execution prerequisite: this monorepo checkout contains the shell owners but not the external `plugins/sero-google-plugin/` source package, so later implementation phases require that package to be present before code migration can start.

### Still outstanding
- Phase 1 remains the next implementation step: add the generic app-tool execution bridge in core without introducing new Google-specific preload or IPC seams.
- The external `plugins/sero-google-plugin/` source package must be available in the working tree before Phases 2–6 can be executed.
- Plugin-local regression coverage still does not exist; that remains a later migration requirement from the original plan.

## Post-fix snapshot — 2026-04-17 (Phase 1)

### Metrics after fixes
- Total plugin files: 24 (unchanged; Phase 1 landed entirely in core)
- Largest plugin file: `plugins/sero-google-plugin/extension/index.ts` (335 LOC, unchanged)
- Files over 500 LOC in the touched core surface: none
- Shared contract additions: new neutral `@sero/common` app-tool result types plus new `@sero-ai/app-runtime` `useAppTools()` hook

### What changed
- Added a generic app-local tool execution seam in core: `window.sero.appAgent.invokeTool(appId, workspaceId, toolName, params)` plus `useAppTools().run(toolName, params)` for federated UIs.
- Routed tool resolution through the app’s isolated session/extension loader in `apps/desktop/electron/ipc/agent/handlers/app-agent.ts`, so direct UI tool calls reuse the same app-scoped session that already powers `useAI()`.
- Normalized tool outputs into a shared `AppToolResult` contract (`text`, `content`, `details`, `isError`) so plugins can consume deterministic results without inventing plugin-specific preload types.
- Added focused regression coverage in `apps/desktop/src/lib/app-runtime.test.tsx` and `apps/desktop/electron/__tests__/ipc/app-agent-tool-execution.test.ts` proving a federated UI can call an app-local extension tool without a bespoke preload namespace.
- Kept the change generic: no new Google-specific preload objects, IPC channels, or desktop-only Google bridge types were introduced.

### Still outstanding
- Phase 2 still requires the external Google plugin source package to be available for real auth/runtime migration work; this phase only added the core bridge prerequisite.
- The Google UI still depends on `window.sero.google` today; that rebase stays in Phase 4.
- Plugin-local migration tests for Google auth/state parity still do not exist and remain required before later cutover phases.

## Post-fix snapshot — 2026-04-18 (Phase 2)

### Metrics after fixes
- Total plugin files: 38 (was 24; added 9 plugin-owned auth/runtime modules and 5 focused regression tests in the external plugin repo)
- Largest plugin file: `plugins/sero-google-plugin/extension/index.ts` (335 LOC, unchanged)
- Files over 500 LOC: none
- Type escape hatches remaining: untouched gog JSON mapping still uses `any` in `extension/index.ts` and `ui/hooks/useGoogleApi.ts`; Phase 2 added no new escape hatches

### What changed
- Added plugin-owned Google auth/runtime modules under `plugins/sero-google-plugin/extension/google/` for environment/profile discovery, OAuth config, loopback callback handling, gog path/runtime execution, keyring/client buckets, credential import, migration/status helpers, and a reusable `GoogleAuthManager`.
- Rebased `plugins/sero-google-plugin/extension/gogcli.ts` on the new modules so Gmail/Calendar tool execution now honors profile-aware `--client` selection, stable keyring password derivation, credential import, and legacy buggy-keyring migration before gog runs.
- Added plugin-local auth/runtime regression coverage in `plugins/sero-google-plugin/extension/__tests__/google-{auth,config,credentials,keyring,status}.test.ts`, including focused validation for default/non-default profile client buckets, loopback login flow wiring, and legacy token migration discoverability.
- Kept the shell-owned Google auth/runtime code in place in the monorepo; this phase only moved ownership into the external plugin repo and did not start the UI or shell cutover yet.
- Executed the phase as a cross-repo pass: implementation landed in `../plugins/sero-google-plugin`, while tracking docs stayed in this monorepo.

### Still outstanding
- Phase 3 still needs to make the plugin’s Gmail/Calendar state shaping canonical; `extension/index.ts` and `ui/hooks/useGoogleApi.ts` still maintain separate mapping logic today.
- Phase 4 still needs to rebase the UI off `window.sero.google` and onto the generic app-tool bridge.
- CLI parity (`sero google ...`) and final shell-glue deletion remain later migration phases.

## Post-fix snapshot — 2026-04-18 (Phase 3)

### Metrics after fixes
- Total plugin files: 39 (was 38; added one shared canonical state-mapper module and one focused regression file while deleting the old renderer-only Gmail parser)
- Largest plugin file: `plugins/sero-google-plugin/extension/index.ts` (310 LOC, down from 335)
- Files over 500 LOC: none
- Type escape hatches remaining: legacy `any` use is now confined to untouched Phase 4 surfaces only; the Phase 3 mappers/hook/index changes landed without new escape hatches

### What changed
- Added `plugins/sero-google-plugin/shared/google-state.ts` as the canonical Gmail/Calendar state-shaping owner for thread summaries, full Gmail message bodies/HTML, calendar attendees, reminders, links, visibility, and source metadata.
- Rebased `plugins/sero-google-plugin/extension/index.ts` on those helpers so agent-triggered tool executions now write the richer `GoogleAppState` shape instead of the older truncated thread/event payloads.
- Rebased `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts` on the same helpers so UI-triggered fetches produce the same state shape as agent-triggered fetches without keeping a second raw gog JSON mapper in the renderer.
- Deleted `plugins/sero-google-plugin/ui/components/gmail-parser.ts`; Gmail body parsing now lives in the canonical shared mapper instead of a renderer-only utility.
- Added focused regression coverage in `plugins/sero-google-plugin/extension/__tests__/google-state.test.ts` for canonical Gmail HTML-body mapping and Calendar attendee/reminder/link metadata shaping.

### Still outstanding
- Phase 4 still needs to replace `window.sero.google` usage with the generic app-tool bridge; Phase 3 only unified the shaping contract, not the execution path.
- Phase 5 still needs to preserve the public `sero google ...` CLI contract from the plugin side.
- Phase 6 still owns deletion of the remaining Google-specific shell preload/IPC/runtime glue after the plugin path is fully green.

## Post-fix snapshot — 2026-04-18 (Phase 4)

### Metrics after fixes
- Total plugin files: 44 (was 39; added internal auth/state helper modules plus focused UI regression coverage in the external plugin repo)
- Largest plugin file: `plugins/sero-google-plugin/ui/hooks/useGoogleApi.test.tsx` (333 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: none found in the Phase 4 surface; no `@ts-ignore`, `@ts-expect-error`, `as any`, or double-cast escapes were added

### What changed
- Rebased `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts` off `window.sero.google` and onto the generic app-agent tool bridge by resolving `appAgent.invokeTool(...)` from app context instead of assuming a Google-specific preload namespace.
- Added plugin-owned state/auth helpers in `plugins/sero-google-plugin/extension/{app-state.ts,tool-results.ts}` and a new internal `plugins/sero-google-plugin/extension/google/auth-tool.ts` so the UI now uses plugin-owned auth/config handlers for status, login, logout, and credential saving.
- Extended `plugins/sero-google-plugin/extension/index.ts` with consistent error-prefixed tool results plus a new `gcal` `range` action, letting refresh/mail/calendar UI flows execute entirely through plugin tools while leaving the public CLI-migration work for Phase 5.
- Restricted manifest-driven CLI bridging to `gmail` / `gcal` in `plugins/sero-google-plugin/package.json`, keeping the new `google_auth` tool UI-internal until the Phase 5 parity tool lands.
- Added focused UI regression coverage in `plugins/sero-google-plugin/ui/hooks/useGoogleApi.test.tsx` and `plugins/sero-google-plugin/ui/components/CalendarView.test.tsx`, and disabled Module Federation only during Vitest runs in `vite.config.ts` so external-plugin UI tests can execute without HTTP remote imports.
- Updated the plugin README to document the generic app-tool bridge runtime and the new calendar date-range action.
- Executed the phase as a cross-repo pass: implementation landed in `../plugins/sero-google-plugin`, while tracking docs stayed in this monorepo.

### Still outstanding
- Phase 5 still needs to land the plugin-owned `google` tool/command surface that preserves the public `sero google ...` CLI contract chosen in Phase 0.
- Phase 6 still needs to delete the remaining Google-specific shell preload/IPC/runtime glue after the plugin path is fully green.

## Post-fix snapshot — 2026-04-18 (Phase 5)

### Metrics after fixes
- Total plugin files: 52 (was 44; added a dedicated plugin-owned Google CLI parity surface, container-aware CLI runtime helpers, focused CLI regressions, and README coverage in the external plugin repo)
- Largest plugin file: `plugins/sero-google-plugin/extension/google/cli-handlers.ts` (450 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: none found in the Phase 5 surface; the new shell bridge and plugin CLI modules landed without `@ts-ignore`, `@ts-expect-error`, `as any`, or double-cast escapes

### What changed
- Added a plugin-owned `google` tool in `plugins/sero-google-plugin/extension/google/cli-tool.ts` with custom CLI bridge metadata so AD-020 now exposes the plugin as the public `sero google ...` command while still allowing plain Pi tool execution through structured params.
- Added plugin-owned Google CLI parity modules in `plugins/sero-google-plugin/extension/google/{cli-types,cli-helpers,cli-runtime,cli-handlers}.ts`, conservatively porting the shell auth/Gmail/Calendar command parsing and keeping container-vs-host gog execution semantics aligned with the existing shell behavior.
- Updated `plugins/sero-google-plugin/package.json` and `README.md` so the plugin manifest now bridges `google` alongside `gmail` / `gcal`, and the docs explicitly describe the preserved `sero google auth|gmail|calendar ...` contract.
- Extended the desktop CLI bridge in `apps/desktop/electron/cli/core/schema-bridge.ts` and `apps/desktop/electron/cli/index.ts` with custom tool-level CLI metadata plus opt-in builtin override support, then kept the legacy shell Google command registered as a hidden `google-builtin` fallback in `apps/desktop/electron/cli/commands/integrations/google.ts` for validation while the plugin-owned command takes over the public name.
- Added focused regressions in `apps/desktop/electron/__tests__/cli/custom-tool-cli-bridge.test.ts` and `plugins/sero-google-plugin/extension/__tests__/google-cli-{handlers,runtime,tool}.test.ts` covering builtin override behavior, auth/Gmail/Calendar forwarding, structured tool execution, and host-vs-container CLI runtime routing.
- Executed the phase as a cross-repo pass: implementation landed in `../plugins/sero-google-plugin` (`0617efd`) plus the desktop shell CLI bridge (`287835c7`), while tracking docs stayed in this monorepo.

### Still outstanding
- Phase 6 still needs to delete the remaining Google-specific shell preload/IPC/runtime glue after the plugin path is fully green.
- The legacy shell Google CLI files remain intentionally present as a hidden validation fallback (`google-builtin`) until the final shell-glue deletion phase retires them outright.

## Post-fix snapshot — 2026-04-18 (Phase 6)

### Metrics after fixes
- Total plugin files: 52 (unchanged from Phase 5; Phase 6 landed entirely in the desktop shell)
- Largest plugin file: `plugins/sero-google-plugin/extension/google/cli-handlers.ts` (450 LOC, unchanged)
- Files over 500 LOC: none
- Dedicated shell-owned Google runtime owners in the monorepo: 0 remaining (Phase 6 deleted the last preload, IPC, auth-runtime, and shell-CLI Google files)

### What changed
- Deleted the remaining shell-owned Google runtime surfaces in `apps/desktop/`: the bespoke preload bridge, `IpcChannels.google.*`, `SeroGoogleAPI` declarations, the Google IPC handler, the host auth/runtime modules under `electron/features/auth/google/`, and the legacy shell Google CLI files plus `google-builtin` fallback.
- Split the surviving image-generation preload bridge into `apps/desktop/electron/preload/integrations/imagegen.ts`, keeping imagegen functional after removing the old mixed `google-imagegen.ts` owner.
- Updated focused shell regressions so the imagegen preload path is still covered and custom CLI override coverage no longer depends on a deleted Google builtin command.
- Revalidated the cutover with desktop plugin/discovery/preload/CLI regressions, external-plugin Google CLI + UI tests, monorepo `pnpm typecheck`, and `../plugins/sero-google-plugin` `pnpm typecheck`.

### Still outstanding
- The plan’s final manual verification checklist is still pending: default/non-default profile sign-in smoke tests, legacy token discovery revalidation, and UI-vs-agent Gmail/Calendar parity checks were not re-run in this Phase 6 shell-only pass.

## Post-fix snapshot — 2026-04-18 (Phase 7 code pass)

### Metrics after fixes
- Total plugin files: 59 (was 56 by the earlier Phase 7 snapshot; added a dedicated CLI output formatter/helper plus focused regression coverage in the external plugin repo)
- Largest plugin source file: `plugins/sero-google-plugin/extension/google/cli-handlers.ts` (456 LOC, down from the earlier 472-line Phase 7 snapshot and still under the 500-LOC cap)
- Files over 500 LOC: none
- Type escape hatches remaining: none found in the Phase 7 surface; the runtime/auth/CSP fixes plus the new CLI summary layer landed without `@ts-ignore`, `@ts-expect-error`, `as any`, or double-cast escapes

### What changed
- Reworked the plugin-owned CLI runtime so fresh host sessions resolve Gmail/Calendar accounts from persisted auth state when in-memory auth email is cold, while preserving profile-aware `--client` behavior and avoiding unnecessary auto-resolution for operator auth-management commands.
- Chose and implemented the container-backed CLI parity contract: try the workspace container first, then fall back to host gog execution when the shipped container image does not provide gogcli; also updated the plugin README with the new operator/manual smoke guidance.
- Added Google CLI access-mode guardrails so agent-facing `google auth ...` commands fail closed with operator-only guidance instead of surfacing low-level keyring/token-management failures, while operator terminal usage remains available for OAuth setup and manual recovery.
- Added `plugins/sero-google-plugin/ui/components/mail-html.ts` and rebased `ui/components/MailThread.tsx` onto it so remote email fonts/images/styles are stripped or normalized before sandboxed iframe render, preventing renderer CSP violations while preserving readable message content.
- Added `plugins/sero-google-plugin/extension/google/cli-output.ts` and rebased the Gmail/Calendar CLI handlers onto it so JSON-heavy commands now produce concise agent-readable text summaries in normal tool output while preserving the raw gog JSON in `details` for drill-down.
- Extended that summary layer across the remaining Gmail/Calendar JSON subcommands too: sends, label mutations/listing, draft listing/create/send, single-event create/update/respond, and free/busy checks now all return readable text instead of dumping raw JSON into the main agent response.
- Added focused regressions in `plugins/sero-google-plugin/extension/__tests__/google-cli-{runtime,handlers,tool,output}.test.ts` and `plugins/sero-google-plugin/ui/components/mail-html.test.ts` covering fresh-session host parity, container→host fallback, blocked agent auth-management flows, representative HTML email fixtures with remote assets, and the expanded human-readable CLI summary contract.
- Added `plugins/sero-google-plugin/extension/google/cli-followup.ts` plus bridged session-runtime forwarding in `cli-tool.ts` so successful agent-facing `sero google ...` runs now emit the same summary text as a follow-up assistant message, not only inside the tool-call card details.

### Still outstanding
- Phase 7 manual smoke is still pending: re-run `sero google gmail ...` / `sero google calendar ...` parity against a real authenticated profile in both host-mode and container-backed workspaces.
- Revalidate Google mail-thread rendering in-app and confirm the renderer CSP console noise is gone for representative HTML-heavy Gmail messages.

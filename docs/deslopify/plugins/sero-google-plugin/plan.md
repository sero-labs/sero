# Refactoring Plan — plugins/sero-google-plugin

_Plan drafted: 2026-04-17_

## Executive Summary
A fully self-contained Google plugin is **feasible, but not by simply moving the current files**. The plugin already owns the app manifest, shared state, widgets, and agent tools, so most Google domain logic can live there. The blocker is architectural: the renderer currently depends on a dedicated `window.sero.google` API, while the desktop shell still owns OAuth, profile-aware gog client selection, container-aware CLI execution, and the public `sero google ...` command family. The right outcome is a generic app-owned tool execution bridge in core, then a migration of Google auth/runtime logic into the plugin, followed by deletion of the Google-specific shell glue.

## Issues Found (prioritized)
- **High** — Google UI execution still depends on a dedicated core bridge instead of plugin-owned tools — `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:30-34` reaches straight into `window.sero.google` and `window.sero.pluginConfig`, which forces Google-specific preload/IPC/type plumbing into the desktop shell (`apps/desktop/electron/preload/integrations/google-imagegen.ts:33-45`, `apps/desktop/electron/preload/api.ts:19-20,63-65`, `apps/desktop/src/types/ipc-channels.ts:385-396`, `apps/desktop/src/types/electron-apps.d.ts:65-75`, `apps/desktop/electron/ipc/integrations/google-api.ts:80-110`). This is the main ownership violation preventing a truly self-contained external plugin. Effort: **L**.

- **High** — Google behavior is split across three independent runtimes with already-divergent outputs — the plugin extension maps Gmail/Calendar payloads into state in `plugins/sero-google-plugin/extension/index.ts:118-153,236-286`, the renderer maps the same gog JSON separately in `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:178-250`, and the shell exposes a third Google runtime via `apps/desktop/electron/cli/lib/gog-runner.ts:68-148` plus `apps/desktop/electron/cli/commands/integrations/google.ts:49-95`. This is not just duplication: the extension path omits fields like `bodyHtml`, rich attendee formatting, reminder metadata, and organizer-derived calendar IDs that the UI path depends on. Effort: **L**.

- **High** — The plugin’s own tools do not currently honor the shell’s profile-aware Google auth contract — `plugins/sero-google-plugin/extension/gogcli.ts:70-78` injects only `GOG_KEYRING_PASSWORD` and optional `--account`, while the host-managed path also imports OAuth credentials on demand and pins execution to the active profile’s gog client bucket via `--client` (`apps/desktop/electron/cli/lib/gog-runner.ts:70-92`, `apps/desktop/electron/features/auth/google/gog-keyring.ts:64-75`, `apps/desktop/electron/ipc/integrations/google-api.ts:86-91`). On AD-022 multi-profile setups, that is a real semantic mismatch, not a cosmetic difference. Effort: **M**.

- **Medium** — The built-in `sero google` CLI is a second public contract that the plugin does not currently replace — the shell still registers a broad `google` command family with auth, Gmail, and Calendar subcommands (`apps/desktop/electron/cli/commands/integrations/google.ts:49-95`), but the plugin only contributes `gmail` / `gcal` tools and matching lightweight slash commands (`plugins/sero-google-plugin/extension/index.ts:89-329`). Removing the shell code without deciding what replaces `sero google auth ...` / `sero google calendar ...` would be a visible regression. Effort: **M**.

- **Medium** — The migration currently has no plugin-local regression safety net — `plugins/sero-google-plugin/package.json:8-11` exposes `dev`, `build`, and `typecheck`, but no test script, while the behavior-sensitive code to be moved sits in `plugins/sero-google-plugin/extension/gogcli.ts:65-104`, `plugins/sero-google-plugin/extension/index.ts:89-329`, and `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:63-250`. There are no plugin-local `*test*` files covering auth callback behavior, keyring/client selection, or state truthfulness today. That makes a delete-the-core-path move too risky to do blind. Effort: **M**.

## Proposed Refactoring
1. **Add a generic app-owned tool execution bridge in the shell.**
   - This is the prerequisite for full self-containment.
   - Target structure:
     - extend the existing app-agent/app-runtime seam with a deterministic tool execution API, e.g. `appTools.run(appId, workspaceId, toolName, params)` or an equivalent `appAgent.invokeTool(...)` shape.
     - resolve tools against the app’s dedicated session/resource loader, reusing the already-isolated app-session machinery in `apps/desktop/electron/ipc/agent/handlers/app-agent.ts:116-149`.
     - keep it generic: no Google-specific channel names, no Google-specific preload objects.
   - Why: plugin UIs need a way to run their own extension tools directly without going through a bespoke `window.sero.<plugin>` API or an LLM prompt.
   - Alignment: preserves AD-020 because tools still register normally with `pi.registerTool()`; this only changes how the UI invokes its own app-local tools.

2. **Move Google auth/runtime ownership into plugin-local extension modules.**
   - Create focused modules under the plugin, for example:
     - `plugins/sero-google-plugin/extension/google/auth.ts`
     - `plugins/sero-google-plugin/extension/google/credentials.ts`
     - `plugins/sero-google-plugin/extension/google/keyring.ts`
     - `plugins/sero-google-plugin/extension/google/runtime.ts`
     - `plugins/sero-google-plugin/extension/google/status.ts`
   - Port the existing shell logic conservatively, especially:
     - profile-aware gog client naming (`getGoogleClientName()` semantics)
     - stable keyring password behavior
     - buggy-password migration / token recovery
     - credential import before gog execution
   - Avoid a “clean rewrite” here. The current host code encodes runtime knowledge that must survive the move.

3. **Collapse Gmail/Calendar state shaping onto one plugin-owned source of truth.**
   - Stop maintaining separate renderer-side and extension-side mappers.
   - Preferred target shape:
     - tools/actions write the full canonical `GoogleAppState` payload
     - the UI reads and renders that state via `useAppState()`
     - the generic tool bridge returns status/errors, but the state file remains the live data contract
   - Concretely:
     - remove the raw gog JSON mapping from `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:178-250`
     - upgrade the extension’s state writes so they include the richer fields the UI currently synthesizes (`bodyHtml`, richer attendee info, reminders, links, visibility, etc.)
   - This keeps agent-triggered changes and UI-triggered changes truthful to each other.

4. **Decide and implement the plugin-owned CLI surface before deleting the shell command.**
   - There are two viable paths:
     - **Parity path (preferred):** add a plugin-owned `google` tool with `service` / `action` parameters so AD-020 bridges it into `sero google ...` and the public command contract survives.
     - **Narrowing path:** explicitly retire `sero google ...` and keep only bridged `gmail` / `gcal` tools, with docs/help updates and a migration note.
   - Do not delete `apps/desktop/electron/cli/commands/integrations/google*.ts` until this decision is made and validated.

5. **Rebase the UI off `window.sero.google`, then delete Google-specific shell glue.**
   - Once the generic app-tool bridge exists and the plugin owns auth/runtime logic:
     - remove Google-specific preload wiring from `apps/desktop/electron/preload/integrations/google-imagegen.ts` and `apps/desktop/electron/preload/api.ts`
     - remove the Google IPC channel block from `apps/desktop/src/types/ipc-channels.ts`
     - remove `SeroGoogleAPI` from `apps/desktop/src/types/electron-apps.d.ts`
     - delete `apps/desktop/electron/ipc/integrations/google-api.ts`
     - delete `apps/desktop/electron/features/auth/google/**/*.ts`
     - delete `apps/desktop/electron/cli/lib/gog-runner.ts` and `apps/desktop/electron/cli/commands/integrations/google*.ts` only after CLI parity/narrowing is complete
   - Keep `plugin-config` only if it stays generic. That is plugin infrastructure, not Google-specific logic.

6. **Add focused migration tests before the cutover.**
   - Minimum coverage should include:
     - default-profile auth + logout
     - non-default-profile auth using the correct client bucket
     - legacy buggy-password token migration recovery
     - canonical Gmail thread mapping including HTML bodies
     - canonical Calendar event mapping including reminders/links/attendees
     - CLI parity or deprecation behavior for `sero google ...`
   - This is mandatory because the migration changes runtime ownership, not just file locations.

## Benefits & Trade-offs
- Benefits:
  - removes a large Google-only seam from the desktop shell
  - makes install/uninstall truthfully self-contained for Google integration
  - unifies agent, UI, and CLI behavior on one plugin-owned runtime
  - reduces future drift between renderer state, auth behavior, and gog execution policy
- Trade-offs:
  - requires a small platform capability addition in core before the Google code can move cleanly
  - migration touches behavior-sensitive auth/keyring code, not just module boundaries
  - if CLI parity is required, the plugin’s extension surface will grow before the shell shrinks

## Dependencies & Risks
- **Hard prerequisite:** a generic app-owned tool execution API. Without it, the renderer can only use bespoke shell APIs or LLM prompts, neither of which satisfies the “self-contained plugin” goal.
- **Behavior risk:** profile-aware gog client naming and buggy-keyring migration must be preserved exactly or existing authenticated profiles will appear signed out.
- **Behavior risk:** the current shell CLI can execute inside containers (`apps/desktop/electron/cli/lib/gog-runner.ts:113-148`). If the migrated plugin chooses host-only gog execution instead, that is a deliberate semantic change and needs explicit validation.
- **Behavior risk:** removing the shell’s `google` command without a plugin-owned equivalent changes the public command contract.
- **Refactor risk:** `apps/desktop/electron/preload/integrations/google-imagegen.ts` currently combines Google and imagegen. Deleting the Google part must not regress the unrelated image generation bridge.
- **Ecosystem risk:** the plugin is external to the monorepo root today, so any “move shared code into core and import it from both places” strategy must account for publish/install reality. Prefer plugin-owned code plus generic shell capabilities over new private cross-repo imports.

## Next Steps

### Execution protocol
- [x] Work strictly in phase order. Do not start a later phase until the current phase is complete.
- [x] Land each phase in its **own commit**. Do not batch multiple phases into one commit.
- [x] Before committing **any** phase, run the relevant tests for the touched code and run `pnpm typecheck` from the monorepo root.
- [x] Do not commit if tests or `pnpm typecheck` are failing.
- [x] When a phase is fully finished, mark that phase’s `Phase N complete` checkbox as done **in the same change/commit that completes the phase**.
- [x] Keep this checklist current as implementation progresses.

### Phase 0 — Lock scope and migration policy

Phase 0 policy lock (2026-04-17):
- **Chosen CLI strategy:** preserve `sero google ...` via a plugin-owned `google` tool/command surface bridged through AD-020 in Phase 5. Narrowing to `gmail` / `gcal` only is explicitly rejected for this migration because it would retire an existing public shell contract before parity exists.
- **Behavior checklist to preserve:**
  - auth progress events remain `browser` / `waiting` / `success` / `error` and continue to drive the same UI states;
  - profile-aware gog client selection continues to use `getGoogleClientName()` / `--client` semantics so AD-022 profile isolation remains intact;
  - legacy buggy-keyring migration/recovery remains in place until migrated tokens are revalidated after the cutover;
  - host-vs-container execution semantics must stay equivalent to today’s shell behavior, so the current host-only plugin runner is not sufficient for the cutover by itself.
- **Shell-owned Google surfaces slated for end-of-migration removal only:**
  - `window.sero.google` in `apps/desktop/electron/preload/integrations/google-imagegen.ts` + `apps/desktop/electron/preload/api.ts`
  - `IpcChannels.google.*` in `apps/desktop/src/types/ipc-channels.ts`
  - `SeroGoogleAPI` in `apps/desktop/src/types/electron-apps.d.ts`
  - built-in `sero google` CLI files in `apps/desktop/electron/cli/commands/integrations/google*.ts` and `apps/desktop/electron/cli/lib/gog-runner.ts`
- **Phase guardrail:** this checkout currently contains the shell-owned Google runtime surfaces but not the external `plugins/sero-google-plugin/` source package itself, so later implementation phases must not start until that package is available in the working tree.

- [x] Phase 0 complete
- [x] Decide the public command strategy up front.
  - [x] **Preferred:** preserve `sero google ...` by adding a plugin-owned `google` tool/command surface. Chosen 2026-04-17.
  - ⊘ **Alternative:** explicitly narrow the contract to `gmail` / `gcal` only. Rejected 2026-04-17 — it would remove the existing public `sero google ...` contract before parity lands.
- [x] Freeze the behavior that must survive the move.
  - [x] Auth event types stay `browser` / `waiting` / `success` / `error`.
  - [x] Profile-aware gog client selection behavior is documented.
  - [x] Legacy buggy-keyring migration behavior is documented.
  - [x] Host-vs-container execution expectations are documented.
- [x] Record the exact shell-owned Google surfaces to retire only at the end.
  - [x] `window.sero.google`
  - [x] `IpcChannels.google.*`
  - [x] `SeroGoogleAPI`
  - [x] built-in `sero google` CLI files
- [x] Exit criteria confirmed.
  - [x] CLI parity vs narrowing has been chosen.
  - [x] A behavior checklist exists for auth, CLI, and UI flows.
  - [x] No deletion work starts before this decision is made.

### Phase 1 — Add the generic app-tool execution bridge in core
- [x] Phase 1 complete
- [x] Extend the app-agent/app-runtime seam with a generic tool invocation API, e.g. `appTools.run(...)` or `appAgent.invokeTool(...)`.
- [x] Resolve invoked tools against the app’s dedicated session/resource loader in `apps/desktop/electron/ipc/agent/handlers/app-agent.ts:116-149`.
- [x] Add the four-layer plumbing together.
  - [x] renderer/app-runtime contract
  - [x] preload bridge
  - [x] IPC handler
  - [x] main-process app-session execution path
- [x] Add focused regression coverage proving a plugin UI can invoke one of its own extension tools without a bespoke preload namespace.
- [x] Exit criteria confirmed.
  - [x] A plugin UI can call an app-local tool directly.
  - [x] No Google-specific preload or IPC additions were needed.
  - [x] Type contracts are shared and compile cleanly.

### Phase 2 — Port Google auth/runtime into plugin-local modules
- [x] Phase 2 complete
- [x] Create plugin-owned extension modules for auth/runtime concerns.
  - [x] OAuth config
  - [x] loopback callback flow
  - [x] credential import
  - [x] gog runtime execution
  - [x] keyring/client-bucket helpers
  - [x] migration/status helpers
- [x] Port the current host logic conservatively from `apps/desktop/electron/features/auth/google/**/*.ts`.
- [x] Preserve these semantics exactly.
  - [x] `--client` selection for active profile
  - [x] stable keyring password derivation
  - [x] legacy buggy-password migration/recovery
  - [x] credentials import before gog execution
- [x] Keep host auth code in place during this phase; do **not** delete it until plugin parity is verified.
- [x] Exit criteria confirmed.
  - [x] Plugin-owned auth/runtime modules can reproduce current host behavior.
  - [x] Default and non-default profile auth behavior is covered by focused automated smoke tests for client-bucket resolution and loopback login.
  - [x] Legacy migrated tokens are still discoverable.

### Phase 3 — Make plugin state shaping canonical
- [ ] Phase 3 complete
- [ ] Extract canonical Gmail/Calendar mappers into plugin-owned helpers.
- [ ] Upgrade plugin tool writes so `GoogleAppState` includes the richer fields the UI currently synthesizes.
  - [ ] Gmail HTML body support
  - [ ] richer attendee/status display data
  - [ ] reminders, links, visibility, source metadata
- [ ] Remove duplicated raw gog JSON shaping from `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:178-250`.
- [ ] Keep `useAppState()` as the single reactive data contract for the UI.
- [ ] Exit criteria confirmed.
  - [ ] Agent-triggered and UI-triggered fetches produce the same state shape.
  - [ ] The UI no longer contains a second Gmail/Calendar mapping implementation.

### Phase 4 — Rebase the UI onto generic plugin-owned execution
- [ ] Phase 4 complete
- [ ] Replace `window.sero.google` usage in `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:30-34` with the generic app-tool bridge plus generic plugin-config access if still needed.
- [ ] Make UI actions call plugin-owned tools/auth handlers instead of shell-owned Google IPC handlers.
- [ ] Keep the federated UI surface unchanged for users.
  - [ ] sign-in
  - [ ] refresh
  - [ ] mail
  - [ ] calendar
  - [ ] widgets
- [ ] Add focused UI regression coverage for:
  - [ ] sign-in state transitions
  - [ ] expired-session recovery
  - [ ] inbox/thread fetch flows
  - [ ] calendar fetch/detail flows
- [ ] Exit criteria confirmed.
  - [ ] The plugin UI no longer imports or assumes `window.sero.google`.
  - [ ] The Google plugin still works when installed externally.

### Phase 5 — Land the CLI migration
- [ ] Phase 5 complete
- [ ] Implement the chosen CLI strategy from Phase 0.
  - [ ] **Parity path:** add a plugin-owned `google` tool/command contract that AD-020 can bridge into `sero google ...`.
  - [ ] **Narrowing path:** remove the shell command and update docs/help/migration notes accordingly.
- [ ] Verify auth, Gmail, and Calendar command behavior against the current shell implementation.
- [ ] Keep `apps/desktop/electron/cli/commands/integrations/google*.ts` and `apps/desktop/electron/cli/lib/gog-runner.ts` until parity/narrowing is validated.
- [ ] Exit criteria confirmed.
  - [ ] The public CLI contract is explicitly preserved or explicitly retired.
  - [ ] Help output and docs match runtime behavior.

### Phase 6 — Delete Google-specific shell glue
- [ ] Phase 6 complete
- [ ] Remove Google-specific preload wiring from:
  - [ ] `apps/desktop/electron/preload/integrations/google-imagegen.ts`
  - [ ] `apps/desktop/electron/preload/api.ts`
- [ ] Remove Google-specific type and channel declarations from:
  - [ ] `apps/desktop/src/types/ipc-channels.ts`
  - [ ] `apps/desktop/src/types/electron-apps.d.ts`
- [ ] Delete runtime owners only after the plugin path is green.
  - [ ] `apps/desktop/electron/ipc/integrations/google-api.ts`
  - [ ] `apps/desktop/electron/features/auth/google/**/*.ts`
  - [ ] shell Google CLI files, if Phase 5 makes them obsolete
- [ ] Revalidate that the remaining imagegen preload path still works after the Google split.
- [ ] Exit criteria confirmed.
  - [ ] The shell contains no Google-specific runtime surface beyond generic plugin infrastructure.
  - [ ] The plugin remains fully functional after a fresh install.

### Final verification checklist
- [ ] Sign in from the Google UI on the default profile, then run plugin tools and confirm they use the same account.
- [ ] Repeat on a non-default profile and confirm the account stays isolated to that profile.
- [ ] Validate that previously migrated/legacy gog tokens are still discovered after the move.
- [ ] Trigger Gmail thread fetches from both the UI and the agent and confirm the resulting state includes HTML bodies and identical thread metadata.
- [ ] Trigger Calendar fetches from both the UI and the agent and confirm attendees/reminders/links stay identical.
- [ ] Smoke-test the chosen CLI contract (`sero google ...` parity or documented removal) on both host-mode and container-backed workspaces.
- [ ] Run the relevant tests for all touched code.
- [ ] Run `pnpm typecheck` from the monorepo root before calling the migration complete.

## Execution log
- 2026-04-17 — Completed Phase 0 as a docs-only policy lock: chose the CLI parity path, documented the auth/profile/container behavior that later phases must preserve, recorded the shell-owned Google surfaces that stay until final cutover, and noted that later implementation phases require the external plugin source package to be available in the working tree.
- 2026-04-17 — Completed Phase 1 in core only: added a generic `appAgent.invokeTool(...)` / `useAppTools().run(...)` seam, normalized app-tool result typing in shared contracts, wired preload + IPC + app-session execution together, and added focused regressions proving a federated UI can call an app-local extension tool without a bespoke preload namespace.
- 2026-04-18 — Completed Phase 2 in the external plugin repo (`../plugins/sero-google-plugin`) via commit `9ccc9fa`: ported the shell Google auth/runtime stack into plugin-owned `extension/google/` modules, rebased `extension/gogcli.ts` on the new profile-aware client/keyring helpers, and added focused regressions for loopback login, credential import, client-bucket resolution, and buggy-keyring migration.

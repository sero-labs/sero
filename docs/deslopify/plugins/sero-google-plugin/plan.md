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
- [x] Use subagents (if available) for tasks that are independent and parallelizable
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
- [x] Phase 3 complete
- [x] Extract canonical Gmail/Calendar mappers into plugin-owned helpers.
- [x] Upgrade plugin tool writes so `GoogleAppState` includes the richer fields the UI currently synthesizes.
  - [x] Gmail HTML body support
  - [x] richer attendee/status display data
  - [x] reminders, links, visibility, source metadata
- [x] Remove duplicated raw gog JSON shaping from `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:178-250`.
- [x] Keep `useAppState()` as the single reactive data contract for the UI.
- [x] Exit criteria confirmed.
  - [x] Agent-triggered and UI-triggered fetches produce the same state shape.
  - [x] The UI no longer contains a second Gmail/Calendar mapping implementation.

### Phase 4 — Rebase the UI onto generic plugin-owned execution
- [x] Phase 4 complete
- [x] Replace `window.sero.google` usage in `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:30-34` with the generic app-tool bridge plus generic plugin-config access if still needed.
- [x] Make UI actions call plugin-owned tools/auth handlers instead of shell-owned Google IPC handlers.
- [x] Keep the federated UI surface unchanged for users.
  - [x] sign-in
  - [x] refresh
  - [x] mail
  - [x] calendar
  - [x] widgets
- [x] Add focused UI regression coverage for:
  - [x] sign-in state transitions
  - [x] expired-session recovery
  - [x] inbox/thread fetch flows
  - [x] calendar fetch/detail flows
- [x] Exit criteria confirmed.
  - [x] The plugin UI no longer imports or assumes `window.sero.google`.
  - [x] The Google plugin still works when installed externally.

### Phase 5 — Land the CLI migration
- [x] Phase 5 complete
- [x] Implement the chosen CLI strategy from Phase 0.
  - [x] **Parity path:** add a plugin-owned `google` tool/command contract that AD-020 can bridge into `sero google ...`.
  - ⊘ **Narrowing path:** remove the shell command and update docs/help/migration notes accordingly. Rejected by the Phase 0 policy lock and not executed in this migration.
- [x] Verify auth, Gmail, and Calendar command behavior against the current shell implementation.
- [x] Keep `apps/desktop/electron/cli/commands/integrations/google*.ts` and `apps/desktop/electron/cli/lib/gog-runner.ts` until parity/narrowing is validated.
- [x] Exit criteria confirmed.
  - [x] The public CLI contract is explicitly preserved or explicitly retired.
  - [x] Help output and docs match runtime behavior.

### Phase 6 — Delete Google-specific shell glue
- [x] Phase 6 complete
- [x] Remove Google-specific preload wiring from:
  - [x] `apps/desktop/electron/preload/integrations/google-imagegen.ts`
  - [x] `apps/desktop/electron/preload/api.ts`
- [x] Remove Google-specific type and channel declarations from:
  - [x] `apps/desktop/src/types/ipc-channels.ts`
  - [x] `apps/desktop/src/types/electron-apps.d.ts`
- [x] Delete runtime owners only after the plugin path is green.
  - [x] `apps/desktop/electron/ipc/integrations/google-api.ts`
  - [x] `apps/desktop/electron/features/auth/google/**/*.ts`
  - [x] shell Google CLI files, if Phase 5 makes them obsolete
- [x] Revalidate that the remaining imagegen preload path still works after the Google split.
- [x] Exit criteria confirmed.
  - [x] The shell contains no Google-specific runtime surface beyond generic plugin infrastructure.
  - [x] The plugin remains fully functional after a fresh install.

### Phase 7 — Post-cutover bugfixes from manual QA

Manual QA follow-up findings (2026-04-18):
- default-profile `sero google auth list` surfaced a low-level gog keyring unwrap/integrity error in agent-visible output instead of staying behind an operator-only/auth-management boundary;
- host-mode fresh sessions failed to auto-resolve the active Google account for Gmail/Calendar CLI parity, so `sero google gmail ...` / `sero google calendar ...` required manual `--account` even after the UI had already authenticated;
- container-backed workspaces failed the CLI parity smoke because the plugin runtime tried to execute `gog` inside the container even though the shipped `sero-node` image does not currently install gogcli;
- Gmail HTML rendering in `ui/components/MailThread.tsx` triggered renderer CSP violations from remote fonts/images/styles embedded in email HTML.

- [x] Phase 7 complete
- [x] Fix cold-session host CLI account resolution.
  - [x] Make the plugin-owned host CLI runtime resolve the active Google account from persisted auth/keyring state when `getGoogleAuthManager().getEmail()` is empty in a fresh session.
  - [x] Preserve the current profile-aware `--client` behavior while removing the need for manual `--account` in fresh host-mode sessions.
  - [x] Add focused regression coverage for fresh-session `sero google gmail ...` and `sero google calendar ...` calls with no warmed in-memory auth email.
- [x] Close the container-backed CLI parity gap.
  - [x] Decide the production contract explicitly:
    - [x] **Preferred:** fall back to host gog execution when the workspace is container-backed but gog is unavailable in the container.
    - ⊘ **Alternative:** install gogcli in `apps/desktop/images/Dockerfile.sero-node`, rebuild `sero-node:latest`, and recreate affected workspace containers. Rejected 2026-04-18 — Phase 7 keeps the shipped container image unchanged and restores parity via host fallback when gog is absent in the container.
  - [x] Implement the chosen contract without regressing default-profile auth/keyring behavior.
  - [x] Add focused regression coverage for the chosen container path and update operator docs/manual smoke instructions to match it.
- [x] Guard auth-management surfaces from agent exposure.
  - [x] Restrict the bridged agent-facing Google CLI surface so auth-management subcommands that touch keyring/token internals (`auth list`, credential import/setup-only flows, etc.) fail closed or stay operator-only.
  - [x] Preserve the human/operator setup path needed to configure OAuth and recover auth manually.
  - [x] Add focused regression coverage proving blocked auth-management commands do not expose low-level gog/keyring failure text to the agent.
- [x] Fix the Gmail HTML/CSP issue.
  - [x] Reproduce the CSP violations caused by remote assets embedded in rendered Gmail HTML.
  - [x] Sanitize or normalize `bodyHtml` before iframe render so remote fonts/images/styles that violate the renderer CSP no longer trigger console noise while readable email content is preserved.
  - [x] Add focused UI regression coverage using representative HTML email fixtures with remote asset references.
  - [x] Revalidate mail-thread rendering manually and confirm the CSP console noise is gone for the Google mail view.
- [x] Exit criteria confirmed.
  - [x] Host-mode `sero google ...` parity works in a fresh session without requiring explicit `--account`.
  - [x] Container-backed workspaces follow the chosen gog execution contract and pass manual CLI parity smoke.
  - [x] Agent-visible Google command flows no longer expose low-level auth-management/keyring failure surfaces.
  - [x] Gmail HTML remains readable without CSP violations caused by embedded remote assets.

### Phase 8 — Refresh plugin README for the post-cutover reality

- [x] Phase 8 complete
- [x] Audit the current README against the shipped plugin behavior and Phase 0–7 migration outcomes.
  - [x] Remove stale wording that still reflects pre-cutover shell-owned Google behavior or incomplete CLI/chat-output semantics.
  - [x] Confirm the README matches the current external-plugin install path and package layout.
- [x] Refresh install + prerequisite instructions.
  - [x] Document gogcli host installation clearly, including the expected `gog` binary requirement and the supported lookup paths.
  - [x] Document the current container-backed contract accurately: CLI attempts container parity first, then falls back to host gog execution when gogcli is unavailable in the shipped container image.
  - [x] Confirm whether any explicit rebuild/recreate guidance is still needed for container-backed workspaces and only include it if it reflects the current production contract.
- [x] Refresh authentication/setup instructions.
  - [x] Document the supported OAuth setup path(s) clearly: plugin config / env expectations plus the recommended in-app Google sign-in flow.
  - [x] Explain the operator-only boundary for `sero google auth ...` management commands vs agent-facing Gmail/Calendar flows.
  - [x] Make the profile-scoped/authenticated-account behavior understandable for users without leaking low-level keyring implementation detail into the README.
- [x] Refresh usage documentation.
  - [x] Update the Sero CLI examples so they reflect the current preserved `sero google ...` contract and the new human-readable/follow-up chat behavior.
  - [x] Ensure the tool/action tables still match the shipped `gmail`, `gcal`, and `google` behaviors after Phase 7 follow-up fixes.
  - [x] Call out any important runtime distinctions between operator terminal usage, agent usage, and the federated UI.
- [x] Validate the README update.
  - [x] Re-read the final README against the live installed plugin behavior after Phase 7.
  - [x] Keep the README concise and user-facing; move implementation-only detail out unless it materially helps setup/recovery.
  - [x] If README examples or setup steps changed materially, add a short note in the execution log/facts snapshot when the phase lands.
- [x] Exit criteria confirmed.
  - [x] A fresh user can install gogcli, configure/authenticate Google, and use the plugin by following the README alone.
  - [x] The README no longer contradicts the post-cutover CLI/runtime/auth behavior.
  - [x] Operator-only vs agent-facing guidance is explicit and accurate.

### Phase 9 — Integrate core plugin-platform hardening and re-review

PR review follow-up blockers (2026-04-18):
- custom bridged plugin commands were not truly hot-swappable after plugin install/update because the host CLI registry kept the first captured `cli.execute` closure and did not rebuild app-source command registrations deterministically;
- host/plugin compatibility metadata was still parse-only and unenforced in the Sero shell, so this migration depended on reviewer coordination instead of a real fail-closed version/capability gate.

- [x] Phase 9 complete
- [x] Land the separate core/platform follow-up tracked in `docs/deslopify/apps/desktop/electron/cli/plan.md` before merging the Google PR pair.
- [x] Integrate the desktop-shell branch and the external Google plugin branch onto that core change.
- [x] Integrate the final host contract into the Google plugin.
  - [x] Confirm plugin reinstall/update refreshes `sero google ...` help text and execution behavior without restarting Sero.
  - [x] Declare and satisfy the final host compatibility contract in the plugin manifest/docs (`minSeroVersion` plus `requiredHostCapabilities` for `appAgent.invokeTool` and `tool.cli`).
- [x] Re-review both related branches after the integration pass.
  - [x] Re-run targeted desktop CLI/plugin hot-load regressions.
  - [x] Re-run external-plugin Google CLI/UI tests plus monorepo/plugin typechecks.
  - [x] Refresh README or migration notes only where the final core contract changes user-facing install/setup behavior.
- [x] Exit criteria confirmed.
  - [x] The Google PR pair no longer depends on unstated platform assumptions.
  - [x] Plugin install/update refreshes the bridged `google` command truthfully on the live host.
  - [x] Unsupported Sero hosts are blocked cleanly by the final compatibility contract instead of failing at runtime.

### Final verification checklist
- [ ] Sign in from the Google UI on the default profile, then run plugin tools and confirm they use the same account.
- [ ] Repeat on a non-default profile and confirm the account stays isolated to that profile.
- [ ] Validate that previously migrated/legacy gog tokens are still discovered after the move.
- [ ] Trigger Gmail thread fetches from both the UI and the agent and confirm the resulting state includes HTML bodies and identical thread metadata.
- [ ] Trigger Calendar fetches from both the UI and the agent and confirm attendees/reminders/links stay identical.
- [x] Verify a fresh install/update of the Google plugin refreshes `sero google` help + execution without restarting Sero after the core app-command lifecycle fix lands. Confirmed 2026-04-18 by editing the plugin CLI summary, reinstalling the local plugin via the renderer console, and observing the updated `sero help google` output without restarting Sero.
- [x] Verify the plugin declares and passes the final host compatibility gate on supported Sero builds and is blocked cleanly on unsupported ones.
- [x] Smoke-test the chosen CLI contract (`sero google ...` parity or documented removal) on both host-mode and container-backed workspaces.
- [x] Run the relevant tests for all touched code.
- [x] Run `pnpm typecheck` from the monorepo root before calling the migration complete.

## Execution log
- 2026-04-17 — Completed Phase 0 as a docs-only policy lock: chose the CLI parity path, documented the auth/profile/container behavior that later phases must preserve, recorded the shell-owned Google surfaces that stay until final cutover, and noted that later implementation phases require the external plugin source package to be available in the working tree.
- 2026-04-17 — Completed Phase 1 in core only: added a generic `appAgent.invokeTool(...)` / `useAppTools().run(...)` seam, normalized app-tool result typing in shared contracts, wired preload + IPC + app-session execution together, and added focused regressions proving a federated UI can call an app-local extension tool without a bespoke preload namespace.
- 2026-04-18 — Completed Phase 2 in the external plugin repo (`../plugins/sero-google-plugin`) via commit `9ccc9fa`: ported the shell Google auth/runtime stack into plugin-owned `extension/google/` modules, rebased `extension/gogcli.ts` on the new profile-aware client/keyring helpers, and added focused regressions for loopback login, credential import, client-bucket resolution, and buggy-keyring migration.
- 2026-04-18 — Completed Phase 3 in the external plugin repo (`../plugins/sero-google-plugin`) via commit `704425f`: extracted canonical Gmail/Calendar state mappers into `shared/google-state.ts`, rebased both the extension and `ui/hooks/useGoogleApi.ts` onto those helpers so UI-triggered and agent-triggered fetches write the same `GoogleAppState` shape, and deleted the old renderer-only `ui/components/gmail-parser.ts` duplication.
- 2026-04-18 — Completed Phase 4 in the external plugin repo (`../plugins/sero-google-plugin`) via commit `f6de64b`: replaced `window.sero.google` with generic `appAgent.invokeTool(...)` calls in `ui/hooks/useGoogleApi.ts`, added a plugin-owned internal `google_auth` tool plus a date-range `gcal` action so sign-in/refresh/mail/calendar flows all execute through plugin-owned handlers, and added focused UI regressions for auth transitions, expired-session recovery, inbox/thread fetches, and calendar detail behavior.
- 2026-04-18 — Completed Phase 5 across the desktop shell + external plugin repo via commits `0617efd` (`refactor(google-plugin): preserve sero google cli parity`) and `287835c7` (`refactor(cli): hand off google command parity to plugin tools`): added custom tool-level CLI bridge metadata so a plugin-owned `google` tool can replace the builtin `sero google ...` command while preserving the existing help text, registered a hidden `google-builtin` shell fallback for validation, implemented plugin-owned Google auth/Gmail/Calendar CLI handlers with container-aware runtime parity, and added focused regressions for bridge override behavior plus auth/Gmail/Calendar command forwarding.
- 2026-04-18 — Completed Phase 6 in the desktop shell: deleted the last Google-specific preload, IPC, auth-runtime, and shell-CLI owners; split the surviving image-generation preload bridge into `apps/desktop/electron/preload/integrations/imagegen.ts`; removed the legacy `google-builtin` fallback now that plugin CLI parity is live; and revalidated the cutover with desktop preload/CLI/plugin-discovery regressions, external-plugin Google CLI/UI tests, and clean typechecks in both the monorepo and `../plugins/sero-google-plugin`.
- 2026-04-18 — Added Phase 7 as a post-cutover bugfix batch after manual QA found four follow-ups: fresh-session host CLI account auto-resolution drift, container-backed gog parity ambiguity, agent-visible auth-management leakage through the bridged `google` command, and Gmail HTML rendering that triggers renderer CSP violations from embedded remote assets.
- 2026-04-18 — Landed the Phase 7 code pass in the external plugin repo (`../plugins/sero-google-plugin`) via commit `16c53ac` (`fix(google-plugin): close post-cutover qa gaps`): fresh host sessions now resolve Gmail/Calendar accounts from persisted auth state without manual `--account`, container-backed CLI parity falls back to host gog execution when the shipped container image lacks gogcli, agent-facing `google auth ...` commands fail closed behind operator-only guidance, and `MailThread.tsx` now sanitizes remote HTML email assets before iframe render with focused CLI/UI regressions. Remaining Phase 7 work is manual smoke: re-run host/container CLI parity against a real authenticated profile and confirm the Google mail view is free of CSP console noise in-app.
- 2026-04-18 — Landed a follow-up Phase 7 polish pass in the external plugin repo (`../plugins/sero-google-plugin`) via commit `e81bac9` (`fix(google-plugin): summarize cli output for agents`): checked how other Sero CLI commands behave and aligned Google with the same pattern by adding a dedicated CLI output formatter so JSON-heavy Gmail/Calendar commands now emit concise text summaries in normal tool output while preserving raw gog JSON in `details` for drill-down.
- 2026-04-18 — Landed a second Phase 7 CLI polish pass in the external plugin repo (`../plugins/sero-google-plugin`) via commit `6ddfb1e` (`fix(google-plugin): summarize remaining cli json output`): extended the human-readable summary layer across the remaining JSON-heavy Gmail/Calendar subcommands so sends, label mutations/listing, drafts, single-event mutations, and free/busy checks now surface useful text in the main agent response instead of only in tool-call details.
- 2026-04-18 — Landed a third Phase 7 CLI polish pass in the external plugin repo (`../plugins/sero-google-plugin`) via commit `f340786` (`fix(google-plugin): emit cli summaries as follow-up messages`): checked the live chat behavior and found the summary text was still trapped inside the tool card UI, then wired successful agent-facing `sero google ...` executions to send the same summary as a follow-up assistant message through the bridged session runtime.
- 2026-04-18 — Final Phase 7 manual validation confirmed: host/container CLI smoke passed after the follow-up-message fix, and in-app Gmail rendering no longer emits CSP console noise. Marked Phase 7 complete while leaving the broader migration-level final verification checklist unchanged where it was not explicitly re-run in this pass.
- 2026-04-18 — Added Phase 8 as a docs-focused follow-up to refresh `sero-google-plugin/README.md` for the post-cutover plugin reality: current gogcli install expectations, container fallback behavior, authentication guidance, operator-vs-agent boundaries, and the preserved `sero google ...` contract all need one final README-specific pass.
- 2026-04-18 — Completed Phase 8 in the external plugin repo by rewriting `../plugins/sero-google-plugin/README.md` around the post-cutover reality: host `gog` install + lookup paths, plugin-config/env OAuth setup, the recommended in-app sign-in flow, profile-scoped account behavior, container-first then host-fallback CLI execution, preserved `sero google ...` parity, follow-up chat summaries for agent-facing Gmail/Calendar commands, and explicit operator-only guidance for `sero google auth ...`. Revalidated with `../plugins/sero-google-plugin` `pnpm test`, `../plugins/sero-google-plugin` `pnpm typecheck`, and monorepo `pnpm typecheck`.
- 2026-04-18 — README polish follow-up: rewrote the same Phase 8 README again in a more public-facing end-user voice, leading with install/setup/everyday usage and moving runtime details into short Profiles, Container-backed workspaces, Troubleshooting, and Pi-specific sections so it reads like a user guide instead of migration notes.
- 2026-04-18 — Related PR review uncovered two host-owned platform blockers outside the Google plugin itself: custom bridged plugin commands are still sticky across hot updates, and host/plugin compatibility metadata is not yet enforced. Added Phase 9 to defer merge/re-review until the separate core follow-up in `docs/deslopify/apps/desktop/electron/cli/plan.md` lands and the Google PR pair can be rebased onto the final host contract.
- 2026-04-18 — Completed Phase 9 after integrating `origin/main` commit `c97d6199` / PR #146 into the desktop-shell branch, updating the external plugin manifest with `requiredHostCapabilities` (`appAgent.invokeTool`, `tool.cli`), and rerunning the focused desktop/plugin regression suites plus monorepo/plugin typechecks.
- 2026-04-18 — Manual integration smoke confirmed the live hot-update contract on the integrated branches: after editing the plugin-owned Google CLI summary and reinstalling the local plugin from the renderer console, `sero help google` reflected the new text immediately without restarting Sero.
- 2026-04-18 — Landed a post-review hardening follow-up in the external plugin repo via commits `c8d97a0` (`fix(google-plugin): restore secure config writes and auth cleanup`) and `5f6615d` (`fix(google-plugin): make cli follow-up delivery non-fatal`): restored locked-down OAuth config file permissions for `save_config`, ensured failed browser launch always closes the Google OAuth loopback server, and made agent follow-up summary delivery best-effort so successful Gmail/Calendar commands are not misreported as failures when session follow-up messaging rejects.
- 2026-04-18 — Landed a host cleanup follow-up in the monorepo: removed stale static `gmail` / `gcal` ownership from `apps/desktop/electron/cli/index.ts`, repointed legacy/profile-copy Google config handling from dead `agent/google-auth.json` paths to the plugin-owned `agent/plugin-config/sero-google-plugin.json` contract, and added focused profile migration/copy regressions plus clean monorepo typecheck coverage.

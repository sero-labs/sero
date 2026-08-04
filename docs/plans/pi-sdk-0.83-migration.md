# Pi SDK 0.83 migration plan

Status: review remediation complete

Related issue: [#345](https://github.com/sero-labs/sero/issues/345)

Baseline Sero commit: `c6ec5f4c1`

Target published Pi release: `0.83.0`

Latest Pi source and changelogs:

`/Users/danielcarter/Documents/Dev/projects/backup/pi-mono`

External plugin repositories:

`/Users/danielcarter/Documents/Dev/projects/sero/plugins`

## Goal

Update all Sero Pi SDK dependencies from `0.80.6` to `0.83.0`. Preserve all current Sero behavior. Move the desktop host from the removed `AuthStorage` and session `ModelRegistry` APIs to one host-owned `ModelRuntime`.

The migration must cover:

- the Sero desktop host,
- shared packages,
- built-in plugins,
- plugin templates,
- external Git-only plugin repositories,
- authentication and model refresh,
- all agent session creation paths,
- isolated background completions.

## Non-goals

- Do not target unreleased Pi APIs from the local `pi-mono` main branch.
- Do not change the user-facing authentication design unless the new Pi contract requires it.
- Do not give plugins direct access to the host `ModelRuntime`.
- Do not merge conversations, tools, resource loaders, or session state between agent sessions.
- Do not publish external plugins to npm.
- Do not replace current background session behavior with direct model completion until parity is proven.

## Confirmed decisions

1. The desktop host owns one shared asynchronous `ModelRuntime`.
2. Main sessions, app sessions, subagents, and temporary host sessions use that runtime.
3. Extensions continue to receive the public `ModelRegistry` compatibility facade.
4. Plugins do not receive the raw host runtime.
5. Isolated background work uses a narrow Sero completion service. The first migration keeps an isolated `AgentSession` for behavior parity.
6. `ModelRegistry.complete()` can be used later for simple one-request work only after parity tests pass.
7. `packages/common` must not use an independent hard-coded Pi version.
8. All Pi versions and peer minimums must be managed from workspace catalogs.
9. External plugin source and lockfiles must be tested against `0.83.0`, even though the plugins are not published.

## Current baseline

### Dependency state

- The strict workspace Pi catalog uses `0.80.6`.
- The peer catalog permits `>=0.80.6`.
- `packages/common` directly uses `pi-agent-core@0.82.1`.
- The lockfile contains more than one Pi version.
- Pi `0.83.0` requires Node `>=22.19.0`.

The direct `packages/common` pin started in commit `e6c560028` on 30 May 2026. PR #344 changed it from `0.82.0` to `0.82.1` in commit `7b3a2215b` on 4 August 2026.

### Measured `0.83.0` typecheck baseline

An isolated worktree test produced:

- 45 desktop errors in 14 files,
- 4 direct `packages/extension-runtime` errors,
- further memory plugin errors from the old runtime API and mixed Pi type identities,
- a successful `packages/common` typecheck.

The largest desktop error groups were:

- authentication and provider discovery,
- shared AI infrastructure,
- session model access,
- manual extension contexts,
- old `createAgentSession()` options.

No use of the TypeBox APIs removed in Pi `0.83.0` was found in Sero or the external plugins.

## Required invariants

These rules apply to every phase:

- There must be one effective Pi version in the Sero lockfile.
- The desktop host must own credentials and the model runtime.
- A custom provider registered through an extension must work in every intended session path.
- Sessions must not share messages, tools, resource loaders, or persistence.
- Authentication secrets must not cross Electron window boundaries.
- A successful credential change must not become a failed login because a later remote model refresh fails.
- Model refresh must be awaited when a caller needs the new snapshot.
- Temporary sessions must not load project instructions, skills, themes, prompt templates, or extensions.
- Temporary sessions must always be disposed.
- No Sero feature may require users to recreate profiles or credentials.

## Phase 0: prepare tests and dependency alignment

### Checklist

- [x] Record the current passing root typecheck and relevant test commands before changing dependencies.
- [x] Add or identify tests for shared infrastructure initialization.
- [x] Add or identify tests for custom provider visibility across session paths.
- [x] Change the strict Pi catalog entries to `0.83.0`.
- [x] Remove the Pi holdback comment from `pnpm-workspace.yaml`.
- [x] Raise the Pi peer catalog minimum to `>=0.83.0` for packages that exchange Pi objects.
- [x] Move `packages/common` from its hard-coded dependency to a peer dependency using `catalog:peer`.
- [x] Add `pi-agent-core` to `packages/common` development dependencies using `catalog:`.
- [x] Keep canonical Pi types. Do not create a local copy of `ThinkingLevel`.
- [x] Regenerate `pnpm-lock.yaml`.
- [x] Check all Pi resolutions with `pnpm why`.
- [x] Set CI Node versions to at least `22.19.0` if any workflow can resolve an older Node 22 release.

### Main files

- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `packages/common/package.json`
- `packages/extension-runtime/package.json`
- built-in plugin `package.json` files
- plugin template `package.json`
- `.github/workflows/*.yml`

### Acceptance criteria

- [x] `packages/common` cannot drift from the host Pi version during local development.
- [x] Published `packages/common` asks its host for the canonical Pi type package.
- [x] `pnpm why` does not show an old Pi runtime under a built-in plugin.
- [x] The expected migration type errors are reproducible and no unrelated dependency error is introduced.

## Phase 1: create the shared host `ModelRuntime`

### Design

Replace the current `AuthStorage` plus `ModelRegistry.create()` setup with one asynchronous `ModelRuntime.create()` call. Cache the initialization promise so concurrent callers cannot create separate runtimes.

The shared infrastructure should expose only the objects needed by host code. Expected shape:

- `modelRuntime`,
- extension-facing `modelRegistry` when required,
- `settingsManager`,
- selected model snapshot.

Do not expose credential storage as a separate mutable public object.

### Checklist

- [x] Add asynchronous shared runtime initialization.
- [x] Use `SERO_AGENT_DIR/auth.json` and `SERO_AGENT_DIR/models.json` through supported `ModelRuntime` options.
- [x] Keep model network access disabled during critical startup unless an existing flow requires it.
- [x] Restore cached model state before initial model selection.
- [x] Create or obtain the extension-facing `ModelRegistry` facade from the same runtime.
- [x] Preserve default thinking-level setup.
- [x] Preserve first available model selection.
- [x] Make failed initialization retryable. Do not retain a rejected promise forever.
- [x] Update synchronous callers to await shared infrastructure where required.
- [x] Remove all public `AuthStorage` imports.

### Main files

- `apps/desktop/electron/shared/infra/ai-infra.ts`
- `apps/desktop/electron/shared/infra/shared-infra.ts`
- `apps/desktop/electron/shared/infra/model-selection.ts`
- related infrastructure tests

### Acceptance criteria

- [x] Concurrent calls receive the same runtime instance.
- [x] The runtime uses `~/.sero-ui/agent/`, not `~/.pi/agent/`.
- [x] Existing `auth.json`, `models.json`, and settings remain usable.
- [x] Built-in and configured models are present after initialization.
- [x] Initial model selection still works.
- [x] A failed initialization can succeed on a later call.

## Phase 2: migrate every session creation path

### Checklist

- [x] Replace `authStorage` and `modelRegistry` session options with `modelRuntime`.
- [x] Migrate main workspace session creation.
- [x] Migrate per-app session creation.
- [x] Migrate subagent session creation.
- [x] Migrate subagent tool-catalog warm-up.
- [x] Replace host reads of `session.modelRegistry` with `session.modelRuntime` or a facade derived from the same runtime.
- [x] Replace old model lookup calls with `ModelRuntime.getModel()` and related current APIs.
- [x] Preserve session model restoration.
- [x] Preserve model switching and model tier resolution.
- [x] Add `scopedModels` to all manually built `ExtensionContext` objects.
- [x] Use the live session context when one exists.
- [x] Avoid a second fallback runtime in synchronous CLI context code.

### Main files

- `apps/desktop/electron/ipc/agent/core/agent-session-open.ts`
- `apps/desktop/electron/ipc/agent/handlers/app-agent.ts`
- `apps/desktop/electron/features/subagent/runtime/runner.ts`
- `apps/desktop/electron/features/subagent/runtime/tool-catalog.ts`
- `apps/desktop/electron/ipc/agent/core/agent-session-model-sync.ts`
- `apps/desktop/electron/ipc/agent/core/agent-model-context.ts`
- `apps/desktop/electron/ipc/agent/core/agent-helpers.ts`
- `apps/desktop/electron/ipc/agent/core/agent-prompt.ts`
- `apps/desktop/electron/cli/core/bridge-context.ts`
- `apps/desktop/electron/cli/core/invocation-context.ts`
- `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`

### Acceptance criteria

- [x] Main, app, subagent, and warm-up sessions use the same runtime.
- [x] Each session has separate messages, tools, resource loading, and persistence.
- [x] Existing sessions restore their saved provider and model when available.
- [x] Model switching and scoped models work.
- [x] CLI fallback contexts are valid against Pi `0.83.0`.
- [x] No old session option or `session.modelRegistry` access remains.

## Phase 3: migrate authentication and model refresh

### Design

Use providers from `ModelRuntime.getProviders()`. Inspect each provider's supported authentication methods. Adapt Pi's provider-neutral `AuthInteraction` protocol to the existing Electron IPC protocol.

Pi interaction methods:

- `prompt(AuthPrompt)`,
- `notify(AuthEvent)`,
- optional cancellation signal.

Sero must continue to route all login events only to the window that started the flow.

### Checklist

- [x] Remove `getOAuthProviders()` and `OAuthProviderId` usage.
- [x] Build OAuth and API-key provider lists from runtime provider metadata.
- [x] Map `auth_url`, `device_code`, `info`, and `progress` notifications to Sero IPC events.
- [x] Map text, secret, select, and manual-code prompts to Sero IPC requests.
- [x] Respect both login cancellation and per-prompt cancellation.
- [x] Use `ModelRuntime.login()` for interactive login.
- [x] Use `ModelRuntime.logout()` for logout.
- [x] Use persistent `ModelRuntime.login(..., 'api_key')` and `logout()` for
  saved API-key changes. Reserve transient `setRuntimeApiKey()` and
  `removeRuntimeApiKey()` for process-only overrides, as required by the
  published `0.83.0` contract.
- [x] Use supported credential status and listing APIs for the settings UI.
- [x] Preserve environment-key detection and display.
- [x] Preserve `auth.json` permission repair and `0600` hardening.
- [x] Await refresh when the new model snapshot is required.
- [x] Handle provider refresh errors separately from credential mutation success.
- [x] Add a bounded or cancellable background refresh after credential changes.
- [x] Update all old direct credential reload sites.

### Main files

- `apps/desktop/electron/ipc/platform/auth/auth.ts`
- `apps/desktop/electron/shared/auth/provider-catalog.ts`
- `apps/desktop/electron/ipc/platform/auth/auth-model-refresh.ts`
- `apps/desktop/electron/ipc/agent/core/model-availability-refresh.ts`
- `apps/desktop/electron/ipc/agent/handlers/models.ts`
- `apps/desktop/electron/ipc/agent/handlers/local-models.ts`
- `apps/desktop/electron/features/onboarding/provider-health.ts`
- related authentication and model availability tests

### Acceptance criteria

- [x] Stored API keys can be added, replaced, and removed.
- [x] Environment credentials are shown but are not overwritten.
- [x] OAuth callback, device-code, manual-code, prompt, select, and cancellation flows work.
- [x] Authentication events go only to the initiating window.
- [x] Logout updates model availability.
- [x] A successful credential mutation remains successful if remote refresh later fails.
- [x] Refresh failure messages identify the affected provider.
- [x] No stale refresh can overwrite a newer result.
- [x] `auth.json` remains mode `0600` after each write.

## Phase 4: implement the isolated completion boundary

### Design

Keep the raw `ModelRuntime` inside the desktop host. Expose a narrow Sero completion service to code that needs an isolated background request.

The first implementation must preserve the current isolated `AgentSession` behavior:

- in-memory session,
- no tools,
- no extensions,
- no skills,
- no prompt templates,
- no themes,
- no project context files,
- explicit system prompt,
- explicit thinking level,
- caller cancellation,
- guaranteed disposal.

Do not expose `ModelRuntime` through `ExtensionContext` or a plugin API. If plugin code needs the service, route the request through a Sero-owned host boundary.

Keep `ModelRegistry.complete()` as a possible later optimization. It must not replace the session path in this migration unless tests prove equal prompt, reasoning, retry, cancellation, auth, and custom provider behavior.

### Checklist

- [x] Define a narrow isolated completion request and result contract.
- [x] Keep Pi SDK types canonical where they cross the contract.
- [x] Implement the host service with the shared runtime.
- [x] Preserve the current system-prompt isolation.
- [x] Preserve timeout and abort behavior.
- [x] Preserve provider-neutral thinking-level behavior.
- [x] Preserve agent-level retry behavior where the current session provides it.
- [x] Ensure temporary sessions do not trigger extension lifecycle hooks.
- [x] Ensure temporary sessions never write a session file.
- [x] Dispose the session on success, error, and cancellation.
- [x] Migrate desktop adhoc completion calls.
- [x] Migrate memory consolidation.
- [x] Migrate memory format migration.
- [x] Migrate memory shutdown summaries.
- [x] Update `packages/extension-runtime` exports and tests.

### Main files

- `packages/extension-runtime/src/isolated-completion.ts`
- `packages/extension-runtime/src/index.ts`
- `packages/extension-runtime/src/__tests__/isolated-completion.test.ts`
- `apps/desktop/electron/features/agent/assistants/adhoc-agent.ts`
- `plugins/sero-memory-plugin/extension/consolidation.ts`
- `plugins/sero-memory-plugin/extension/migration.ts`
- `plugins/sero-memory-plugin/extension/session-lifecycle.ts`
- Sero host capability or IPC files selected for the narrow service

### Acceptance criteria

- [x] A built-in provider completes successfully.
- [x] An extension-registered faux provider completes successfully.
- [x] The selected thinking level reaches the provider.
- [x] `APPEND_SYSTEM.md` and other project instructions are absent.
- [x] No extension or memory lifecycle hook runs.
- [x] No tool is available.
- [x] No session file is created.
- [x] Cancellation stops the active request.
- [x] Timeout reports the current Sero timeout error.
- [x] The temporary session is disposed on all exit paths.
- [x] Existing memory fallback behavior remains unchanged.

## Phase 5: verify custom provider propagation

This is the required vertical validation before broad cleanup.

### Checklist

- [x] Register a faux provider through the same path as an extension.
- [x] Use it from a main workspace session.
- [x] Use it from a per-app session where the provider should be visible.
- [x] Use it from a subagent.
- [x] Use it from isolated background completion.
- [x] Verify resolved API key, headers, base URL, and stream function.
- [x] Reload extensions and confirm provider state is correct.
- [x] Remove or disable the provider and confirm no stale registration remains.
- [x] Test two live sessions while provider registration changes.

### Acceptance criteria

- [x] All intended session paths dispatch through the same registered provider implementation.
- [x] No path silently creates a fresh default runtime.
- [x] Provider removal does not leave a stale selectable model.
- [x] One session cannot remove a provider still owned by another active registration without an explicit ownership policy.

## Phase 6: built-in plugins and templates

### Checklist

- [x] Update Pi peer dependencies in all built-in plugins.
- [x] Update the plugin skill example and package template.
- [x] Confirm all extension entry points are included in typecheck scripts.
- [x] Typecheck each built-in extension.
- [x] Run each plugin test suite.
- [x] Build each plugin.
- [x] Confirm Pi dependencies remain external in extension bundles.
- [x] Check memory plugin use of `getApiKeyAndHeaders()` against `0.83.0`.
- [x] Check user-feedback TUI components against `pi-tui@0.83.0`.
- [x] Check provider registration in all built-in extensions.

### Acceptance criteria

- [x] Every built-in plugin passes typecheck, test, and build.
- [x] No plugin bundle contains a private Pi runtime.
- [x] No plugin uses a removed Pi export.
- [x] A plugin created from the template typechecks against `0.83.0`.

## Phase 7: external plugin repositories

External plugins are Git-only. Update and commit each repository separately. Do not publish them to npm.

### Repositories

- [x] `sero-alibaba-plugin`
- [x] `sero-calc-plugin`
- [x] `sero-daily-quote-plugin`
- [x] `sero-google-plugin`
- [x] `sero-humanizer-plugin`
- [x] `sero-imagegen-plugin`
- [x] `sero-kanban-plugin`
- [x] `sero-logbook-plugin`
- [x] `sero-loom-plugin`
- [x] `sero-notes-plugin`
- [x] `sero-plan-mode-plugin`
- [x] `sero-research-plugin`
- [x] `sero-signal-desk-plugin`
- [x] `sero-slopzilla-plugin`
- [x] `sero-starling-plugin`
- [x] `sero-tetris-plugin`
- [x] `sero-todo-plugin-main`
- [x] `sero-weight-tracker-plugin`

### Per-repository checklist

- [x] Read the repository instructions before editing.
- [x] Confirm the package manager.
- [x] Keep one lockfile format. `sero-research-plugin` currently has both npm and pnpm lockfiles.
- [x] Update the lockfile against Pi `0.83.0`.
- [x] Update peer minimums where the source now requires `0.83.0`.
- [x] Add an extension TypeScript configuration if missing.
- [x] Ensure `typecheck` includes extension and runtime source, not only UI source.
- [x] Search for removed Pi exports and old session options.
- [x] Search for removed TypeBox APIs.
- [x] Run typecheck.
- [x] Run tests.
- [x] Run build.
- [x] Confirm Pi stays external in extension bundles.
- [x] Commit with a Conventional Commit message.

### Special checks

- [x] `sero-alibaba-plugin`: update its stale installed `0.78.0` state and test provider registration plus one faux dispatch.
- [x] `sero-imagegen-plugin`: verify `ctx.modelRegistry.getApiKeyForProvider()` behavior.
- [x] `sero-google-plugin`: run extension and runtime typechecks and authentication tests.
- [x] `sero-kanban-plugin`: run all background runtime tests.
- [x] `sero-plan-mode-plugin`: run its separate extension TypeScript configuration.
- [x] `sero-logbook-plugin`, `sero-research-plugin`, and `sero-signal-desk-plugin`: preserve the selected pnpm workflow.

### Acceptance criteria

- [x] Every external repository has one current lockfile.
- [x] Every extension source is typechecked.
- [x] Every repository passes its available typecheck, tests, and build.
- [x] No external extension bundles Pi.
- [x] All external plugins load in the migrated Sero host.

## Phase 8: final validation and documentation

### Automated checks

Run focused diagnostics before broad builds:

```bash
pnpm --filter @sero-ai/common typecheck
pnpm --filter @sero-ai/extension-runtime typecheck
pnpm --filter @sero-ai/extension-runtime test
pnpm --filter @sero/desktop typecheck
pnpm --filter './plugins/**' --if-present typecheck
pnpm typecheck
pnpm test
pnpm build
```

Also run focused desktop tests for:

- shared infrastructure,
- authentication IPC,
- model availability refresh,
- session model synchronization,
- app agents,
- subagents,
- custom provider propagation,
- isolated completion,
- memory consolidation and shutdown summaries.

Use React Doctor after changes to the authentication React UI. Run Pi Lens diagnostics on all edited source files before completion.

### Manual acceptance checklist

- [x] Start Sero with an existing profile and credentials.
- [x] Open an existing workspace session.
- [x] Restore its saved model.
- [x] Send and stream a prompt.
- [x] Switch model and thinking level.
- [x] Add, replace, and remove an API key.
- [x] Complete one browser OAuth flow.
- [x] Cancel one OAuth flow.
- [x] Complete one device-code or manual-code flow where available.
- [x] Confirm model availability changes after login and logout.
- [x] Load a `models.json` custom model.
- [x] Load the Alibaba custom provider.
- [x] Run a main session with the custom provider.
- [x] Run a subagent with the custom provider.
- [x] Run a per-app agent.
- [x] Run memory consolidation.
- [x] Run an adhoc background completion.
- [x] Confirm project `APPEND_SYSTEM.md` does not affect the background result.
- [x] Confirm no duplicate memory lifecycle run occurs.
- [x] Load representative built-in plugins.
- [x] Load representative external plugins.

### Documentation checklist

- [x] Update `apps/docs-site` pages that describe authentication, providers, plugin dependencies, or Node requirements.
- [x] Update the plugin guide and template if the peer dependency policy changes.
- [x] Update comments that refer to `AuthStorage` or the old registry ownership model.
- [x] Update issue #345 with the final scope or link it to split implementation issues.
- [x] Record any intentional behavior difference in `docs/decisions.md` if required.

### Final acceptance criteria

- [x] `pnpm typecheck` passes with zero errors.
- [x] Root tests and production builds pass.
- [x] No `AuthStorage` root import remains.
- [x] No `CreateAgentSessionOptions.authStorage` or `.modelRegistry` use remains.
- [x] No host code reads `session.modelRegistry`.
- [x] No direct hard-coded Pi version remains outside approved catalog definitions.
- [x] The lockfile has no unintended old Pi runtime.
- [x] Existing profiles and credentials work without manual migration.
- [x] Main, app, subagent, warm-up, and isolated session paths work.
- [x] Built-in and external custom providers work.
- [x] Authentication events remain private to the initiating window.
- [x] All touched source files remain below 500 lines.

## Phase 9: review remediation

This phase addresses the findings recorded after the first migration review.

### Implementation checklist

- [x] Limit API-key setup to the curated providers that Sero can configure.
- [x] Reject API-key login flows that request unsupported extra fields.
- [x] Register isolated-completion hosts for main and subagent sessions.
- [x] Give Scheduler sessions a stable runtime and isolated-completion host.
- [x] Reconcile model selections and live sessions after partial refresh errors.
- [x] Keep auth IPC handlers available when auth-file permission repair fails.
- [x] Keep unrelated provider and availability errors from blocking the Local Models editor.
- [x] Settle prompts whose cancellation signal is already aborted.
- [x] Permit network catalog refresh after credential changes.
- [x] Scope prompt responses and cancellation to the initiating window.
- [x] Declare the Pi SDK minimum Node.js version in the root package manifest.
- [x] Remove the unused provider environment-key helper.
- [x] Filter curated built-in API-key providers against the runtime provider list.
- [x] Correct memory shutdown-summary indentation.

### Verification checklist

- [x] Add focused regression tests for provider filtering and API-key prompts.
- [x] Add focused regression tests for auth cancellation, window isolation, and permission failures.
- [x] Add focused regression tests for partial model refresh and Local Models access.
- [x] Add focused regression tests for subagent and Scheduler isolated-completion host wiring.
- [x] Run focused desktop, Scheduler, memory, subagent, and extension-runtime tests.
- [x] Run focused desktop and Scheduler typechecks.
- [x] Run the complete local CI command.
- [x] Inspect the final diff, diagnostics, file sizes, and working tree.

## Phase 10: second review remediation

This phase addresses the findings from the draft PR re-review.

### Implementation checklist

- [x] Keep OAuth credentials separate from API-key status and removal controls.
- [x] Refresh the cached Scheduler model runtime before each run.
- [x] Keep package-declared API-key providers in the auth catalog before registration.
- [x] Report SDK registry errors when Local Models saves an invalid configuration.
- [x] Settle and clear cancelled login attempts before any follow-up prompt.
- [x] Make the common package Pi core peer optional for its type-only import.
- [x] Bump `@sero-ai/common` to `0.9.1` for publication.
- [x] Remove the unused Local Models infrastructure import.

### Verification checklist

- [x] Add focused regression tests for all applicable re-review findings.
- [x] Run focused desktop and Scheduler tests.
- [x] Run the root typecheck and complete local CI command.
- [x] Inspect the final diff, diagnostics, file sizes, and working tree.

## Phase 11: third review remediation

This phase addresses the follow-up findings from the draft PR review.

### Implementation checklist

- [x] Return Local Models runtime refresh problems as non-blocking save warnings.
- [x] Keep the renderer config in sync after a Local Models save warning.
- [x] Register package provider authentication before an agent session starts.
- [x] Detect package provider environment keys before extension registration.
- [x] Keep builtin provider catalog entries authoritative over package manifests.
- [x] Isolate Scheduler provider registrations with one model runtime per run.
- [x] Restore the required Pi core peer for the source-published common package.
- [x] Bump `@sero-ai/common` to `0.9.2` for the peer metadata correction.

### Verification checklist

- [x] Add focused regressions for Local Models warnings and renderer state.
- [x] Add focused regressions for pre-session package provider auth and environment status.
- [x] Add focused regressions for builtin catalog protection and Scheduler runtime isolation.
- [x] Run the focused desktop, Scheduler, and package typechecks and tests.
- [x] Smoke-test package provider auth against the published Pi `ModelRuntime`.
- [x] Pack common and compile a clean consumer with its required peer.
- [x] Run React Doctor for the changed renderer code.
- [x] Run the root typecheck and complete local CI command.
- [x] Inspect the final diff, diagnostics, file sizes, and working tree.

## Phase 12: fourth review remediation

This phase addresses the final API-key status finding from the draft PR review.

### Implementation checklist

- [x] Keep externally configured API keys visible after extension registration changes their SDK source.
- [x] Keep onboarding provider health marked as environment-configured for model configuration keys and commands.
- [x] Share the external API-key status rule across Settings and onboarding.
- [x] Remove the unused package provider environment-variable helper.

### Verification checklist

- [x] Add focused regressions for command-configured API keys in Settings and onboarding.
- [x] Run the desktop tests and root typecheck.
- [x] Run the complete local CI command.
- [x] Inspect the final diff, diagnostics, file sizes, and working tree.

## Risk register

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Multiple Pi copies remain in the lockfile | Private class types become incompatible; providers use different state | Align strict and peer catalogs; inspect `pnpm why`; test bundle externals |
| Shared runtime initialization races | Sessions use different runtimes | Cache one initialization promise and test concurrent calls |
| Extension provider ownership is global | One session can remove a provider used by another | Add registration ownership tests and an explicit host policy |
| OAuth event mapping is incomplete | Login stalls or cannot be cancelled | Test every `AuthPrompt` and `AuthEvent` variant |
| Refresh is not awaited | UI reads stale models | Await refresh where a fresh snapshot is required |
| Remote refresh failure masks login success | User repeats a successful login | Separate credential success from catalog refresh status |
| Direct completion changes agent behavior | Background output or retries change | Keep isolated `AgentSession` for the first migration |
| Plugin typecheck covers UI only | Broken extension code reaches Git | Add extension typechecks to each repository |
| CI uses an old Node 22 minor | Pi fails at install or runtime | Pin Node to `>=22.19.0` |
| Source main differs from published `0.83.0` | Implementation uses unreleased contracts | Build against npm `0.83.0`; use local changelogs only as reference |

## Suggested commit sequence

Use Conventional Commits. Keep each commit typecheckable where practical.

1. `chore(deps): align pi sdk catalogs for 0.83`
2. `refactor(agent): initialize shared pi model runtime`
3. `refactor(agent): migrate session creation to model runtime`
4. `refactor(auth): adopt pi provider authentication runtime`
5. `refactor(agent): migrate isolated background completions`
6. `test(agent): cover shared custom provider propagation`
7. `chore(plugins): align built-in pi sdk peers`
8. `docs: update pi sdk and plugin requirements`

External plugin repositories should each use their own migration commit, for example:

`chore(deps): validate pi sdk 0.83 compatibility`

## New-session handoff

Start the implementation session with this instruction:

> Implement `docs/plans/pi-sdk-0.83-migration.md` in order. Start with Phase 0 and the shared-runtime vertical validation. Use the published `@earendil-works/*@0.83.0` packages, not unreleased local source APIs. Preserve current behavior. Run focused typechecks after each phase and root `pnpm typecheck` before completion. Update the checklist in the plan as work is completed. Do not update external plugin repositories until the Sero host and built-in plugins pass.

Before the first edit, re-check:

- the current npm version of all four Pi packages,
- the current branch and working tree,
- issue #345 for new comments,
- released changelog entries after `0.80.6`,
- current Pi `ModelRuntime`, `AuthInteraction`, `ModelRegistry`, and `createAgentSession` declarations.

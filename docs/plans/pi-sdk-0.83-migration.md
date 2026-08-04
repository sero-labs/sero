# Pi SDK 0.83 migration plan

Status: ready for implementation

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

- [ ] Record the current passing root typecheck and relevant test commands before changing dependencies.
- [ ] Add or identify tests for shared infrastructure initialization.
- [ ] Add or identify tests for custom provider visibility across session paths.
- [ ] Change the strict Pi catalog entries to `0.83.0`.
- [ ] Remove the Pi holdback comment from `pnpm-workspace.yaml`.
- [ ] Raise the Pi peer catalog minimum to `>=0.83.0` for packages that exchange Pi objects.
- [ ] Move `packages/common` from its hard-coded dependency to a peer dependency using `catalog:peer`.
- [ ] Add `pi-agent-core` to `packages/common` development dependencies using `catalog:`.
- [ ] Keep canonical Pi types. Do not create a local copy of `ThinkingLevel`.
- [ ] Regenerate `pnpm-lock.yaml`.
- [ ] Check all Pi resolutions with `pnpm why`.
- [ ] Set CI Node versions to at least `22.19.0` if any workflow can resolve an older Node 22 release.

### Main files

- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `packages/common/package.json`
- `packages/extension-runtime/package.json`
- built-in plugin `package.json` files
- plugin template `package.json`
- `.github/workflows/*.yml`

### Acceptance criteria

- [ ] `packages/common` cannot drift from the host Pi version during local development.
- [ ] Published `packages/common` asks its host for the canonical Pi type package.
- [ ] `pnpm why` does not show an old Pi runtime under a built-in plugin.
- [ ] The expected migration type errors are reproducible and no unrelated dependency error is introduced.

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

- [ ] Add asynchronous shared runtime initialization.
- [ ] Use `SERO_AGENT_DIR/auth.json` and `SERO_AGENT_DIR/models.json` through supported `ModelRuntime` options.
- [ ] Keep model network access disabled during critical startup unless an existing flow requires it.
- [ ] Restore cached model state before initial model selection.
- [ ] Create or obtain the extension-facing `ModelRegistry` facade from the same runtime.
- [ ] Preserve default thinking-level setup.
- [ ] Preserve first available model selection.
- [ ] Make failed initialization retryable. Do not retain a rejected promise forever.
- [ ] Update synchronous callers to await shared infrastructure where required.
- [ ] Remove all public `AuthStorage` imports.

### Main files

- `apps/desktop/electron/shared/infra/ai-infra.ts`
- `apps/desktop/electron/shared/infra/shared-infra.ts`
- `apps/desktop/electron/shared/infra/model-selection.ts`
- related infrastructure tests

### Acceptance criteria

- [ ] Concurrent calls receive the same runtime instance.
- [ ] The runtime uses `~/.sero-ui/agent/`, not `~/.pi/agent/`.
- [ ] Existing `auth.json`, `models.json`, and settings remain usable.
- [ ] Built-in and configured models are present after initialization.
- [ ] Initial model selection still works.
- [ ] A failed initialization can succeed on a later call.

## Phase 2: migrate every session creation path

### Checklist

- [ ] Replace `authStorage` and `modelRegistry` session options with `modelRuntime`.
- [ ] Migrate main workspace session creation.
- [ ] Migrate per-app session creation.
- [ ] Migrate subagent session creation.
- [ ] Migrate subagent tool-catalog warm-up.
- [ ] Replace host reads of `session.modelRegistry` with `session.modelRuntime` or a facade derived from the same runtime.
- [ ] Replace old model lookup calls with `ModelRuntime.getModel()` and related current APIs.
- [ ] Preserve session model restoration.
- [ ] Preserve model switching and model tier resolution.
- [ ] Add `scopedModels` to all manually built `ExtensionContext` objects.
- [ ] Use the live session context when one exists.
- [ ] Avoid a second fallback runtime in synchronous CLI context code.

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

- [ ] Main, app, subagent, and warm-up sessions use the same runtime.
- [ ] Each session has separate messages, tools, resource loading, and persistence.
- [ ] Existing sessions restore their saved provider and model when available.
- [ ] Model switching and scoped models work.
- [ ] CLI fallback contexts are valid against Pi `0.83.0`.
- [ ] No old session option or `session.modelRegistry` access remains.

## Phase 3: migrate authentication and model refresh

### Design

Use providers from `ModelRuntime.getProviders()`. Inspect each provider's supported authentication methods. Adapt Pi's provider-neutral `AuthInteraction` protocol to the existing Electron IPC protocol.

Pi interaction methods:

- `prompt(AuthPrompt)`,
- `notify(AuthEvent)`,
- optional cancellation signal.

Sero must continue to route all login events only to the window that started the flow.

### Checklist

- [ ] Remove `getOAuthProviders()` and `OAuthProviderId` usage.
- [ ] Build OAuth and API-key provider lists from runtime provider metadata.
- [ ] Map `auth_url`, `device_code`, `info`, and `progress` notifications to Sero IPC events.
- [ ] Map text, secret, select, and manual-code prompts to Sero IPC requests.
- [ ] Respect both login cancellation and per-prompt cancellation.
- [ ] Use `ModelRuntime.login()` for interactive login.
- [ ] Use `ModelRuntime.logout()` for logout.
- [ ] Use `setRuntimeApiKey()` and `removeRuntimeApiKey()` for API-key changes.
- [ ] Use supported credential status and listing APIs for the settings UI.
- [ ] Preserve environment-key detection and display.
- [ ] Preserve `auth.json` permission repair and `0600` hardening.
- [ ] Await refresh when the new model snapshot is required.
- [ ] Handle provider refresh errors separately from credential mutation success.
- [ ] Add a bounded or cancellable background refresh after credential changes.
- [ ] Update all old direct credential reload sites.

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

- [ ] Stored API keys can be added, replaced, and removed.
- [ ] Environment credentials are shown but are not overwritten.
- [ ] OAuth callback, device-code, manual-code, prompt, select, and cancellation flows work.
- [ ] Authentication events go only to the initiating window.
- [ ] Logout updates model availability.
- [ ] A successful credential mutation remains successful if remote refresh later fails.
- [ ] Refresh failure messages identify the affected provider.
- [ ] No stale refresh can overwrite a newer result.
- [ ] `auth.json` remains mode `0600` after each write.

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

- [ ] Define a narrow isolated completion request and result contract.
- [ ] Keep Pi SDK types canonical where they cross the contract.
- [ ] Implement the host service with the shared runtime.
- [ ] Preserve the current system-prompt isolation.
- [ ] Preserve timeout and abort behavior.
- [ ] Preserve provider-neutral thinking-level behavior.
- [ ] Preserve agent-level retry behavior where the current session provides it.
- [ ] Ensure temporary sessions do not trigger extension lifecycle hooks.
- [ ] Ensure temporary sessions never write a session file.
- [ ] Dispose the session on success, error, and cancellation.
- [ ] Migrate desktop adhoc completion calls.
- [ ] Migrate memory consolidation.
- [ ] Migrate memory format migration.
- [ ] Migrate memory shutdown summaries.
- [ ] Update `packages/extension-runtime` exports and tests.

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

- [ ] A built-in provider completes successfully.
- [ ] An extension-registered faux provider completes successfully.
- [ ] The selected thinking level reaches the provider.
- [ ] `APPEND_SYSTEM.md` and other project instructions are absent.
- [ ] No extension or memory lifecycle hook runs.
- [ ] No tool is available.
- [ ] No session file is created.
- [ ] Cancellation stops the active request.
- [ ] Timeout reports the current Sero timeout error.
- [ ] The temporary session is disposed on all exit paths.
- [ ] Existing memory fallback behavior remains unchanged.

## Phase 5: verify custom provider propagation

This is the required vertical validation before broad cleanup.

### Checklist

- [ ] Register a faux provider through the same path as an extension.
- [ ] Use it from a main workspace session.
- [ ] Use it from a per-app session where the provider should be visible.
- [ ] Use it from a subagent.
- [ ] Use it from isolated background completion.
- [ ] Verify resolved API key, headers, base URL, and stream function.
- [ ] Reload extensions and confirm provider state is correct.
- [ ] Remove or disable the provider and confirm no stale registration remains.
- [ ] Test two live sessions while provider registration changes.

### Acceptance criteria

- [ ] All intended session paths dispatch through the same registered provider implementation.
- [ ] No path silently creates a fresh default runtime.
- [ ] Provider removal does not leave a stale selectable model.
- [ ] One session cannot remove a provider still owned by another active registration without an explicit ownership policy.

## Phase 6: built-in plugins and templates

### Checklist

- [ ] Update Pi peer dependencies in all built-in plugins.
- [ ] Update the plugin skill example and package template.
- [ ] Confirm all extension entry points are included in typecheck scripts.
- [ ] Typecheck each built-in extension.
- [ ] Run each plugin test suite.
- [ ] Build each plugin.
- [ ] Confirm Pi dependencies remain external in extension bundles.
- [ ] Check memory plugin use of `getApiKeyAndHeaders()` against `0.83.0`.
- [ ] Check user-feedback TUI components against `pi-tui@0.83.0`.
- [ ] Check provider registration in all built-in extensions.

### Acceptance criteria

- [ ] Every built-in plugin passes typecheck, test, and build.
- [ ] No plugin bundle contains a private Pi runtime.
- [ ] No plugin uses a removed Pi export.
- [ ] A plugin created from the template typechecks against `0.83.0`.

## Phase 7: external plugin repositories

External plugins are Git-only. Update and commit each repository separately. Do not publish them to npm.

### Repositories

- [ ] `sero-alibaba-plugin`
- [ ] `sero-calc-plugin`
- [ ] `sero-daily-quote-plugin`
- [ ] `sero-google-plugin`
- [ ] `sero-humanizer-plugin`
- [ ] `sero-imagegen-plugin`
- [ ] `sero-kanban-plugin`
- [ ] `sero-logbook-plugin`
- [ ] `sero-loom-plugin`
- [ ] `sero-notes-plugin`
- [ ] `sero-plan-mode-plugin`
- [ ] `sero-research-plugin`
- [ ] `sero-signal-desk-plugin`
- [ ] `sero-slopzilla-plugin`
- [ ] `sero-starling-plugin`
- [ ] `sero-tetris-plugin`
- [ ] `sero-todo-plugin-main`
- [ ] `sero-weight-tracker-plugin`

### Per-repository checklist

- [ ] Read the repository instructions before editing.
- [ ] Confirm the package manager.
- [ ] Keep one lockfile format. `sero-research-plugin` currently has both npm and pnpm lockfiles.
- [ ] Update the lockfile against Pi `0.83.0`.
- [ ] Update peer minimums where the source now requires `0.83.0`.
- [ ] Add an extension TypeScript configuration if missing.
- [ ] Ensure `typecheck` includes extension and runtime source, not only UI source.
- [ ] Search for removed Pi exports and old session options.
- [ ] Search for removed TypeBox APIs.
- [ ] Run typecheck.
- [ ] Run tests.
- [ ] Run build.
- [ ] Confirm Pi stays external in extension bundles.
- [ ] Commit with a Conventional Commit message.

### Special checks

- [ ] `sero-alibaba-plugin`: update its stale installed `0.78.0` state and test provider registration plus one faux dispatch.
- [ ] `sero-imagegen-plugin`: verify `ctx.modelRegistry.getApiKeyForProvider()` behavior.
- [ ] `sero-google-plugin`: run extension and runtime typechecks and authentication tests.
- [ ] `sero-kanban-plugin`: run all background runtime tests.
- [ ] `sero-plan-mode-plugin`: run its separate extension TypeScript configuration.
- [ ] `sero-logbook-plugin`, `sero-research-plugin`, and `sero-signal-desk-plugin`: preserve the selected pnpm workflow.

### Acceptance criteria

- [ ] Every external repository has one current lockfile.
- [ ] Every extension source is typechecked.
- [ ] Every repository passes its available typecheck, tests, and build.
- [ ] No external extension bundles Pi.
- [ ] All external plugins load in the migrated Sero host.

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

- [ ] Start Sero with an existing profile and credentials.
- [ ] Open an existing workspace session.
- [ ] Restore its saved model.
- [ ] Send and stream a prompt.
- [ ] Switch model and thinking level.
- [ ] Add, replace, and remove an API key.
- [ ] Complete one browser OAuth flow.
- [ ] Cancel one OAuth flow.
- [ ] Complete one device-code or manual-code flow where available.
- [ ] Confirm model availability changes after login and logout.
- [ ] Load a `models.json` custom model.
- [ ] Load the Alibaba custom provider.
- [ ] Run a main session with the custom provider.
- [ ] Run a subagent with the custom provider.
- [ ] Run a per-app agent.
- [ ] Run memory consolidation.
- [ ] Run an adhoc background completion.
- [ ] Confirm project `APPEND_SYSTEM.md` does not affect the background result.
- [ ] Confirm no duplicate memory lifecycle run occurs.
- [ ] Load representative built-in plugins.
- [ ] Load representative external plugins.

### Documentation checklist

- [ ] Update `apps/docs-site` pages that describe authentication, providers, plugin dependencies, or Node requirements.
- [ ] Update the plugin guide and template if the peer dependency policy changes.
- [ ] Update comments that refer to `AuthStorage` or the old registry ownership model.
- [ ] Update issue #345 with the final scope or link it to split implementation issues.
- [ ] Record any intentional behavior difference in `docs/decisions.md` if required.

### Final acceptance criteria

- [ ] `pnpm typecheck` passes with zero errors.
- [ ] Root tests and production builds pass.
- [ ] No `AuthStorage` root import remains.
- [ ] No `CreateAgentSessionOptions.authStorage` or `.modelRegistry` use remains.
- [ ] No host code reads `session.modelRegistry`.
- [ ] No direct hard-coded Pi version remains outside approved catalog definitions.
- [ ] The lockfile has no unintended old Pi runtime.
- [ ] Existing profiles and credentials work without manual migration.
- [ ] Main, app, subagent, warm-up, and isolated session paths work.
- [ ] Built-in and external custom providers work.
- [ ] Authentication events remain private to the initiating window.
- [ ] All touched source files remain below 500 lines.

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

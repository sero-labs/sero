# Facts — apps/desktop/electron/shared

_Last reviewed: 2026-04-12_

## What this code does
This folder is the Electron main-process shared foundation layer: singleton infra bootstrap (`ensureInfra` + cross-feature managers), auth/provider catalog helpers, model/settings read-write utilities, media capture/encoding helpers, and small runtime utilities (native PTY loader, secret redaction, user-feedback event bus).

## Shape & metrics
- Total files: 15
- Total LOC: 1,611
- Largest file: `apps/desktop/electron/shared/infra/shared-infra.ts` (258 LOC)
- Files over 500 LOC: none
- External dependencies of note:
  - Pi SDK core infra (`AuthStorage`, `ModelRegistry`, `SettingsManager`, session/model types)
  - Electron media/runtime APIs (`BrowserWindow`, `screen`, `nativeImage`)
  - Host process primitives (`child_process` ffmpeg execution, sync filesystem reads/writes)
  - Cross-feature singletons (`container`, `workspace`, `subagent`, `gateway`, `vcs`, `lsp`)
- Upstream callers:
  - 53 runtime files import `@electron/shared/**` (63 including tests)
  - Heavy consumers include IPC auth/agent/workspace handlers, CLI command modules, and container tool paths
- Downstream dependencies:
  - `@electron/platform/env` for profile-scoped paths (`SERO_AGENT_DIR`)
  - `@electron/features/{container,workspace,subagent,gateway,vcs,profile}` from `shared-infra`
  - `@/types/ipc` model-tier contracts from settings/provider helpers

## Architectural notes
- `shared-infra.ts` is a central composition root for AD-018/AD-021-adjacent services; many runtime paths assume its singleton lifecycle and side effects are stable.
- Settings helpers are profile-scoped via `SERO_AGENT_DIR` (AD-022 profile isolation behavior).
- Provider metadata is assembled from built-ins + package/plugin manifests, bridging platform discovery (`builtin-resources`) into auth/provider UI surfaces.

## Surprising discoveries
- `readSettings()` silently returns `{}` on parse/read errors (`shared/settings/settings-helpers.ts:15-20`), and multiple call sites write the returned object back (`ipc/workspace/profiles.ts:168-169`, `features/onboarding/preflight.ts:101-116`), creating a settings-clobber risk on malformed JSON.
- Shared default model caching is one-shot (`shared/infra/shared-infra.ts:119,196`), while auth flows only refresh `modelRegistry` (`ipc/platform/auth/auth.ts:116`), leaving `infra.model` consumers (notably `ipc/agent/handlers/app-agent.ts:152`) at risk of stale defaults.
- User-feedback bus singleton key/initialization is duplicated in two modules (`shared/lib/user-feedback-bus.ts:13` and `plugins/sero-user-feedback-plugin/shared/emitter.ts:11`), with manual “must match” comments instead of a shared source.
- `getPackageProviderManifests()` is currently dead private code (`shared/providers/package-provider-manifests.ts:185`).

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 15 (unchanged)
- Largest file: `apps/desktop/electron/shared/infra/shared-infra.ts` (264 LOC)
- Files over 500 LOC: none

### What changed
- Added `refreshInfraModelSelection()` so shared infra can re-pick the cached default model after
  auth-driven model-registry refreshes.
- Wired auth mutation paths to refresh both `modelRegistry` and the cached `infra.model` selection,
  keeping app-agent consumers aligned with newly available credentials/models.

### Still outstanding
- `shared-infra.ts` is still a broad composition root and has not yet been split into registrars.
- Provider-manifest cache cleanup and user-feedback bus deduplication are still pending.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 17 (was 15)
- Total LOC: 1,657 (was 1,611)
- Largest file: `apps/desktop/electron/shared/media/image-resize.ts` (217 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: 0

### What changed
- Hardened `settings-helpers.ts` into an explicit read-result boundary with actionable malformed-file errors, and updated onboarding/profile mutators to abort instead of rewriting broken `settings.json` files.
- Split shared infra ownership into `infra/shared-infra.ts` + focused `infra/{singletons,runtime-settings}.ts` registrars while preserving the exported singleton API used by IPC, CLI, and feature code.
- Removed the dead provider-manifest helper, switched provider-manifest caching to explicit invalidation with a safety TTL, and wired cache invalidation through settings/plugin mutations.
- Deduplicated the user-feedback bus singleton factory through shared `@sero-ai/common` ownership so host/plugin code no longer maintain mirrored emitter bootstraps.

### Still outstanding
- None.

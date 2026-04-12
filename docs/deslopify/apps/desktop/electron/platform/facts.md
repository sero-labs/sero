# Facts — apps/desktop/electron/platform

_Last reviewed: 2026-04-12_

## What this code does
This folder is the Electron host platform boundary: profile-aware environment bootstrap (`SERO_HOME`/`PI_CODING_AGENT_DIR`), custom protocol handlers for extension assets, builtin package/plugin discovery for dev+packaged runtime, renderer CSP enforcement, git-command safety classification, and desktop notification dispatch.

## Shape & metrics
- Total files: 6
- Total LOC: 795
- Largest file: `apps/desktop/electron/platform/env/index.ts` (186 LOC)
- Files over 500 LOC: none
- External dependencies of note:
  - Electron platform APIs (`protocol`, `net.fetch`, `session.webRequest`, `Notification`)
  - Sync filesystem path/manifest reads (`readFileSync`, `readdirSync`, `realpathSync`)
  - Profile migration/registry layer (`features/profile/{migration,manager}`)
- Upstream callers:
  - 39 runtime files import `@electron/platform/**` (40 including tests)
  - Main bootstrap entrypoint consumes env/protocol/CSP directly (`apps/desktop/electron/main.ts:2-3,25,31-32,39,220,266`)
- Downstream dependencies:
  - App/plugin discovery + install lifecycle (`features/apps/discovery`, `features/plugins/manager`)
  - Shared settings/provider layers via `SERO_AGENT_DIR`
  - IPC auth/theme/debug surfaces that depend on environment and security policies

## Architectural notes
- `env/index.ts` is a startup-critical root (runs before SDK imports) and effectively defines AD-022 profile scoping at process boot.
- `ext-protocol.ts` is the serving boundary for federated plugin assets and therefore a key security gate for path traversal/symlink checks.
- `csp.ts` applies one global CSP policy across all renderer responses via `session.defaultSession.webRequest.onHeadersReceived`.

## Surprising discoveries
- `script-src` includes `'unsafe-inline'` unconditionally (`platform/security/csp.ts:37`), despite comments describing the need as dev-driven, and `frame-src`/`child-src` allow broad `http:`/`https:` in all environments (`csp.ts:99-111`).
- Extension asset registry has add-only APIs (`platform/protocols/ext-protocol.ts:24-32`) with no removal counterpart, while plugin install flow registers manifests (`features/plugins/manager.ts:311`), creating stale-memory risk after uninstall/reload.
- Builtin package detection logic is duplicated in runtime and build pipeline (`platform/protocols/builtin-resources.ts:31-44` and `apps/desktop/scripts/build-electron.mjs:35-48`) with a manual “keep in sync” comment.
- Environment resolution performs migration/registry work synchronously during module initialization (`platform/env/index.ts:43-53,118-130`), which is acceptable today but concentrates startup coupling in one import side effect.

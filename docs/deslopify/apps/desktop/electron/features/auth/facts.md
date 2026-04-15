# Facts — apps/desktop/electron/features/auth

_Last reviewed: 2026-04-15_

## What this code does
This feature owns the app-level GitHub and Google auth/runtime integration: GitHub device-flow login plus repo-creation helpers for VCS workflows, and Google OAuth + gog keyring integration for Gmail/Calendar-style plugin commands with profile-aware token migration.

## Shape & metrics
- Total files: 4
- Largest file: `apps/desktop/electron/features/auth/google/auth-manager.ts` (418 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC): `apps/desktop/electron/features/auth/google/auth-manager.ts` (418)
- External dependencies of note: Electron `safeStorage`/`shell`, GitHub OAuth endpoints, `gh` CLI, `gog` CLI + file keyring, profile registry, workspace/container-aware `GitRunner`
- Upstream callers: `apps/desktop/electron/shared/infra/shared-infra.ts`, `apps/desktop/electron/ipc/integrations/github.ts`, `apps/desktop/electron/ipc/integrations/google-api.ts`, `apps/desktop/electron/features/vcs/core/git-runner.ts`, `apps/desktop/electron/cli/lib/gog-runner.ts`, auth tests
- Downstream dependencies: repo publish/bootstrap flows, host/container git auth injection, Google plugin command execution, per-profile gog client naming and migration

## Architectural notes
- GitHub auth still carries a legacy root-file shim, but the active write path is profile-scoped under `SERO_AGENT_DIR`.
- Google auth owns both the live OAuth flow and the migration path out of the previous buggy profile-scoped keyring-password scheme into per-profile client buckets.
- `gog` binary/PATH discovery is duplicated across this feature, `ipc/integrations/google-api.ts`, and `cli/lib/gog-runner.ts`, so auth runtime assumptions are spread across three layers.
- GitHub repo creation logic includes its own GitHub URL normalization helpers while renderer publish/origin UI has its own parallel copies.

## Runtime-sensitive surfaces
- Secret persistence is a high-risk boundary: GitHub tokens, Google refresh tokens, and gog credentials must remain profile-scoped and non-leaky.
- GitHub device-flow polling/cancellation behavior directly controls user-visible login and failure semantics.
- `GitHubRepoOps` changes both remote GitHub state and local git remote/bootstrap state; success-path semantics matter as much as error handling.
- Google’s per-profile client naming and migration logic is coupled to AD-022 profile isolation; path or client-name drift would strand credentials.

## Surprising discoveries
- `GitHubAuthManager` advertises encrypted token storage but intentionally falls back to base64-only persistence when `safeStorage` is unavailable.
- `GoogleAuthManager` bundles status caching, buggy-keyring migration, loopback callback-server setup, and gog credential import in one near-cap file.
- The user-facing “Google OAuth not configured” error still hardcodes the default-root plugin-config path instead of using profile-scoped guidance.

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 4 (unchanged)
- Largest file: `apps/desktop/electron/features/auth/google/auth-manager.ts` (418 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder

### What changed
- GitHub token persistence now requires Electron `safeStorage`; when secure storage is unavailable, login fails instead of writing a base64-only token file.
- Cached GitHub auth is no longer decrypted through a plaintext fallback path.

### Still outstanding
- GitHub device-flow polling still treats most non-2xx responses as indefinite retry conditions.
- `GoogleAuthManager` remains the near-cap multi-responsibility hotspot in this feature.

## Post-fix snapshot — 2026-04-15

### Metrics after fixes
- Total files: 4 (unchanged)
- Largest file: `apps/desktop/electron/features/auth/google/auth-manager.ts` (418 LOC, unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder (unchanged)

### What changed
- GitHub device-flow polling now parses token endpoint responses even when GitHub returns non-2xx statuses.
- Only `authorization_pending` and `slow_down` continue polling; transport failures, malformed payloads, and non-2xx responses without OAuth error fields now fail fast with explicit errors.
- Added focused auth-manager coverage for terminal non-2xx failures, non-2xx `authorization_pending` retries, and transport-failure handling.

### Still outstanding
- `GoogleAuthManager` remains the near-cap multi-responsibility hotspot in this feature.
- Auth runtime helper dedupe (`gog` discovery and GitHub URL normalization) is still pending.
- Google OAuth setup guidance still references the default-root plugin-config path instead of profile-scoped instructions.

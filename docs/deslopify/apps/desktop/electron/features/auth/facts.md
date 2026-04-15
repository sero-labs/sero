# Facts — apps/desktop/electron/features/auth

_Last reviewed: 2026-04-15_

## What this code does
This feature owns the app-level GitHub and Google auth/runtime integration: GitHub device-flow login plus repo-creation helpers for VCS workflows, and Google OAuth + gog keyring integration for Gmail/Calendar-style plugin commands with profile-aware token migration.

## Shape & metrics
- Total files: 10
- Largest file: `apps/desktop/electron/features/auth/github/auth-manager.ts` (373 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC): none
- External dependencies of note: Electron `safeStorage`/`shell`, GitHub OAuth endpoints, `gh` CLI, `gog` CLI + file keyring, profile registry, workspace/container-aware `GitRunner`
- Upstream callers: `apps/desktop/electron/shared/infra/shared-infra.ts`, `apps/desktop/electron/ipc/integrations/github.ts`, `apps/desktop/electron/ipc/integrations/google-api.ts`, `apps/desktop/electron/features/vcs/core/git-runner.ts`, `apps/desktop/electron/cli/lib/gog-runner.ts`, auth tests
- Downstream dependencies: repo publish/bootstrap flows, host/container git auth injection, Google plugin command execution, per-profile gog client naming and migration

## Architectural notes
- GitHub auth still carries a legacy root-file shim, but the active write path is profile-scoped under `SERO_AGENT_DIR`.
- Google auth owns both the live OAuth flow and the migration path out of the previous buggy profile-scoped keyring-password scheme into per-profile client buckets.
- gog binary resolution/PATH expansion now flows through one canonical runtime helper (`google/gog-runtime.ts`) reused by auth, IPC, and CLI command execution.
- GitHub remote URL parsing/normalization now comes from shared `@sero/common` helpers consumed by both electron repo-ops and renderer publish/origin workflows.

## Runtime-sensitive surfaces
- Secret persistence is a high-risk boundary: GitHub tokens, Google refresh tokens, and gog credentials must remain profile-scoped and non-leaky.
- GitHub device-flow polling/cancellation behavior directly controls user-visible login and failure semantics.
- `GitHubRepoOps` changes both remote GitHub state and local git remote/bootstrap state; success-path semantics matter as much as error handling.
- Google’s per-profile client naming and migration logic is coupled to AD-022 profile isolation; path or client-name drift would strand credentials.

## Surprising discoveries
- `GitHubAuthManager` still carries the legacy root-file cleanup shim even though active auth persistence is now profile-scoped under `SERO_AGENT_DIR`.
- Google auth migration behavior depends on both profile-registry scanning and single-token fallback semantics; this is now easier to review after modularization but still easy to regress if moved without tests.
- The user-facing “Google OAuth not configured” guidance was previously hardcoded in `auth-manager.ts`; it now resolves through a profile-scoped helper in `google/config.ts`.

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

## Post-fix snapshot — 2026-04-15 (Google modularization)

### Metrics after fixes
- Total files: 9 (was 4)
- Largest file: `apps/desktop/electron/features/auth/github/auth-manager.ts` (373 LOC; was `google/auth-manager.ts` at 418 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder (unchanged)

### What changed
- Split Google auth runtime ownership into focused modules: `google/{config,credentials,oauth-loopback,status,types}.ts`.
- Reduced `google/auth-manager.ts` from 418 → 182 lines and kept it as the composition root for status/login/logout orchestration.
- Added focused helper coverage in `electron/__tests__/features/auth/google/{credentials,status}.test.ts` to lock migration and credential-import semantics.

### Still outstanding
- Auth runtime helper dedupe (`gog` discovery and GitHub URL normalization) is still pending.
- Google OAuth setup guidance still references the default-root plugin-config path instead of profile-scoped instructions.

## Post-fix snapshot — 2026-04-15 (helper dedupe)

### Metrics after fixes
- Total files: 10 (was 9)
- Largest file: `apps/desktop/electron/features/auth/github/auth-manager.ts` (373 LOC; unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder (unchanged)

### What changed
- Added `google/gog-runtime.ts` as the canonical gog binary/PATH helper and reused it from auth keyring, Google IPC execution, and CLI gog runner.
- Added canonical GitHub URL helpers in `@sero/common` and reused them from `features/auth/github/repo-ops.ts` plus renderer git-remote workflow helpers.
- Removed duplicated per-layer gog path probing and GitHub URL normalization regexes.

### Still outstanding
- Google OAuth setup guidance still references the default-root plugin-config path instead of profile-scoped instructions.

## Post-fix snapshot — 2026-04-15 (profile-scoped guidance)

### Metrics after fixes
- Total files: 10 (unchanged)
- Largest file: `apps/desktop/electron/features/auth/github/auth-manager.ts` (373 LOC; unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder (unchanged)

### What changed
- Added canonical Google OAuth setup guidance helpers in `google/config.ts` that derive the plugin-config path from `SERO_AGENT_DIR`.
- Replaced the hardcoded `~/.sero-ui/agent/...` guidance string in `google/auth-manager.ts` with profile-scoped helper output.
- Added focused coverage in `electron/__tests__/features/auth/google/config.test.ts` for profile-scoped path/message generation.

### Still outstanding
- None for this folder-level plan.

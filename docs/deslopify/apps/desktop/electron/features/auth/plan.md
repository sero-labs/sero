# Refactoring Plan — apps/desktop/electron/features/auth

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/features/auth` is operationally important and generally effective, but it contains one clear High-risk security compromise plus a few medium-priority maintainability drifts. The High issue is GitHub token persistence falling back to base64-only storage when `safeStorage` is unavailable. After that, the biggest wins are splitting the near-cap Google auth manager into clearer pieces and making auth/runtime helper ownership less duplicated across auth, IPC, CLI, and renderer publish flows.

## Issues Found (prioritized)
- **High** — GitHub token persistence silently falls back to base64-only storage — `apps/desktop/electron/features/auth/github/auth-manager.ts:270-277` writes the token as `Buffer.from(token).toString('base64')` when `safeStorage` is unavailable, and `apps/desktop/electron/features/auth/github/auth-manager.ts:292-302` reads it back the same way. For a repo-scoped GitHub token in a macOS desktop app, this is effectively plaintext secret storage. Effort: **S**.

- **Medium** — `GoogleAuthManager` is a near-cap multi-responsibility hub — `apps/desktop/electron/features/auth/google/auth-manager.ts:70-408` combines cached status reads, buggy-keyring migration, profile-registry scanning, loopback callback-server setup, token exchange, gog credential import, and client-credential provisioning. This is already hard to review and will get riskier as profile/auth flows evolve. Effort: **M**.

- **Medium** — GitHub device-flow polling hides non-2xx failures until the code expires — `apps/desktop/electron/features/auth/github/auth-manager.ts:209-245`, especially `apps/desktop/electron/features/auth/github/auth-manager.ts:234`, treats every non-OK token response as “keep polling.” Network proxy failures, transient GitHub outages, and rate-limit responses become opaque timeouts instead of actionable auth errors. Effort: **S**.

- **Low** — Auth runtime helpers are duplicated across layers — `apps/desktop/electron/features/auth/google/gog-keyring.ts:29-37` duplicates gog binary discovery that also exists in `apps/desktop/electron/ipc/integrations/google-api.ts:48-57` and `apps/desktop/electron/cli/lib/gog-runner.ts:49-58`, while `apps/desktop/electron/features/auth/github/repo-ops.ts:253-344` carries GitHub URL normalization logic parallel to the renderer publish/origin flows already flagged in `src/components/layout`. Effort: **M**.

- **Low** — Google OAuth setup guidance still hardcodes the default-root config path — `apps/desktop/electron/features/auth/google/auth-manager.ts:248` tells users to edit `~/.sero-ui/agent/plugin-config/sero-google-plugin.json`, which is wrong for non-default profiles under AD-022. Effort: **S**.

## Proposed Refactoring
1. **Require encrypted GitHub token storage or fail closed.**
   - On this macOS-targeted app, do not silently persist a repo-scoped token in base64-only form.
   - Preferred shape: if `safeStorage` is unavailable, abort persistence and surface an explicit auth/storage error so the user can reconnect once secure storage is available.
   - If the team needs a fallback for non-macOS development, gate it behind an explicit dev-only path with loud warnings rather than the production default.

2. **Split `GoogleAuthManager` by responsibility.**
   - Target structure could be:
     - `google/status.ts` — cached status lookup + accessible-email discovery
     - `google/migration.ts` — buggy-keyring migration helpers
     - `google/oauth-loopback.ts` — callback server + code exchange
     - `google/credentials.ts` — gog client credential provisioning/import
   - Keep `GoogleAuthManager` as a thin coordinator/composition root.

3. **Make GitHub device-flow failure handling explicit.**
   - Parse non-OK token responses and map known GitHub failure states into user-visible errors instead of endless polling.
   - Preserve retry behavior for `authorization_pending` / `slow_down`, but treat transport failures, bad responses, and hard denial as explicit terminal states.

4. **Extract shared auth/runtime helpers to canonical modules.**
   - Centralize gog binary/PATH discovery in one shared helper used by auth, IPC, and CLI surfaces.
   - Pull GitHub remote URL normalization into a shared VCS/auth helper so `repo-ops` and renderer publish/origin flows stop drifting independently.

5. **Fix profile-scoped user guidance.**
   - Replace the hardcoded Google plugin-config path with `SERO_AGENT_DIR`-derived guidance or a UI-only instruction that points users to the Google plugin setup form.

## Benefits & Trade-offs
- Benefits: tighter secret handling, clearer auth ownership boundaries, better error visibility during GitHub login, and less duplicated runtime helper logic.
- Trade-offs: secure-storage hardening may surface environment issues that were previously hidden, and splitting Google auth will touch several imports/tests at once.

## Dependencies & Risks
- Secure-storage hardening is a real behavior change: users on environments without `safeStorage` support will get a visible error instead of silent persistence.
- Extracting shared gog/GitHub helper modules touches IPC/CLI and renderer publish flows, so the migration should happen in one coordinated pass.
- Splitting `GoogleAuthManager` must preserve the fragile migration behavior for legacy buggy keyring passwords and per-profile client buckets.

## Next Steps
1. ~~Fix the High issue first: stop base64-only GitHub token persistence in production paths.~~ ✅ 2026-04-12 (`4350404d`)
2. ~~Add explicit non-2xx GitHub device-flow error handling.~~ ✅ 2026-04-15 (`1fde9d04`)
3. ~~Split `GoogleAuthManager` into focused modules before it grows further.~~ ✅ 2026-04-15 (`3dffc820`)
4. Deduplicate gog binary/PATH discovery and GitHub URL-normalization helpers.
5. Replace hardcoded default-root guidance with profile-scoped instructions.
6. Verification checklist:
   - GitHub login/logout still works, including cancel + reconnect.
   - GitHub token storage fails safely when secure storage is unavailable.
   - Repo creation still bootstraps origin/push/default-branch behavior correctly.
   - Google login still imports tokens into the correct per-profile gog client bucket.
   - Existing buggy-keyring migration path still recovers previously stranded tokens.

## Execution log
- 2026-04-12 — `4350404d` — `fix(desktop): harden wave d high-priority runtime paths`
  - GitHub auth now fails closed when Electron secure storage is unavailable instead of persisting repo-scoped tokens with base64-only encoding.
- 2026-04-15 — `1fde9d04` — `fix(auth): surface github device-flow polling failures`
  - GitHub device-flow polling now treats transport/non-JSON/non-2xx unexpected responses as terminal errors while preserving retry for `authorization_pending` and `slow_down`.
- 2026-04-15 — `3dffc820` — `refactor(auth): modularize google auth manager`
  - Split Google auth runtime responsibilities into focused `config`, `credentials`, `oauth-loopback`, `status`, and `types` modules while keeping `GoogleAuthManager` as the composition root.
  - Added focused coverage for extracted credentials and migration/status helpers under `electron/__tests__/features/auth/google/`.

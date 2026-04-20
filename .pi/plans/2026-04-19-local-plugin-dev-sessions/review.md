# Code Review

**Reviewed:** Local Plugin Development in Sero (`main` merge-base `936e969` → `HEAD`)
**Verdict:** NEEDS CHANGES

## Summary
The feature is largely well-structured: the dev-session lifecycle is isolated from installs, the Admin UI split landed cleanly, and the test coverage is broad. However, two lifecycle issues remain in the risky paths this feature is centered on: startup currently blocks on dev-server health checks, and detached host dev servers are not cleaned up or validated strongly enough, which can leave stale processes behind and let later sessions bind to the wrong localhost remote.

## Findings

### [P1] Persisted dev sessions can stall startup/discovery for ~20s per unhealthy UI plugin
**File:** `apps/desktop/electron/features/plugins/dev-sessions/manager.ts:337-391`
**Issue:** `bootstrapPersistedSessions()` awaits `ensurePluginDevServer()` for each persisted session, and `ensurePluginDevServer()` waits up to 20 seconds for health (`dev-server.ts:6-8`, `127-145`, `176-239`). `apps.discover` explicitly awaits `pluginDevSessionManager.initialize()` before returning manifests (`apps/desktop/electron/ipc/apps/apps.ts:30-34`), so the first renderer discovery can hang behind one timeout per broken/offline dev server. The plan/spec explicitly called for kicking off dev-server startup asynchronously and avoiding startup blocking; this implementation does the opposite.
**Suggested Fix:** Bootstrap persisted sessions in two phases: synchronously validate/project built/backend-capable sessions so discovery can return immediately, then start or probe host dev servers asynchronously and publish a follow-up plugin-change event when a session upgrades to `dev-server` mode.

### [P1] Detached plugin dev servers are never cleaned up, so stale processes can survive app quit and hijack later sessions
**Files:** `apps/desktop/electron/features/plugins/dev-sessions/dev-server.ts:72-99, 204-210`, `apps/desktop/electron/main.ts:386-421`
**Issue:** Dev servers are spawned with `detached: true` and `child.unref()`, but graceful shutdown never calls `stopAllPluginDevServers()` (or any manager dispose hook). That leaves `pnpm run dev` processes running after Sero exits. On the next launch, `ensurePluginDevServer()` accepts any responder on `http://127.0.0.1:<devPort>/mf-manifest.json` as healthy before checking whether it belongs to this source tree, so a stale/orphaned server can be treated as the current session’s live UI. This is exactly the kind of install/dev-session confusion the feature is trying to avoid, and it will be very hard for plugin authors to diagnose.
**Suggested Fix:** Stop all managed plugin dev servers during app shutdown/profile teardown, and tighten the health check so an already-running server is only reused when it can be matched to the expected session/plugin (or otherwise force a restart of the managed process).

### [P2] The new tests miss the two highest-risk lifecycle regressions above
**Files:** `apps/desktop/electron/__tests__/features/plugins/dev-sessions/dev-server.test.ts`, `apps/desktop/electron/__tests__/features/plugins/dev-sessions/manager.test.ts`
**Issue:** Coverage is good on happy-path start/fallback/refresh, but there is no test proving that initialization does not block on dev-server timeout, no shutdown test proving dev servers are terminated, and no dev-server test covering an unrelated process already listening on the declared port. Those are the exact behaviors most likely to regress in production local-authoring flows.
**Suggested Fix:** Add tests for (1) bootstrap/init completing without waiting for long dev-server health failures, (2) shutdown invoking plugin-dev-server cleanup, and (3) refusing to reuse an unrelated pre-existing localhost MF server for a different session.

## What's Good
- The feature keeps dev sessions, installs, and attached folders as separate concepts in both data model and Admin UI.
- `remoteEntryOverride` is threaded through discovery, preload, and runtime loading cleanly instead of adding more renderer-side heuristics.
- Main-process coverage is substantial across conflicts, refresh behavior, projection, fallback modes, and install-policy interactions.
- The Admin panel refactor was worthwhile: the resulting sections are clearer and avoid growing the previous 500-LOC file further.

## Test Results
- `pnpm typecheck` ✅
- `pnpm test` ⚠️ exited with code 1 and no output from the root script in this repo
- `pnpm --filter @sero/desktop test -- --runInBand ...` ✅ (Vitest run completed successfully; all desktop tests passed in this invocation)

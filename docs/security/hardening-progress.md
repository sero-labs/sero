# Security Hardening — Progress Log

## Session: 2026-03-09

### Phase 1a: auth.json Permissions (Item 2)
- **Status:** ✅ complete
- **Files modified:**
  - `electron/env.ts` — added `AUTH_JSON_PATH` export
  - `electron/ipc/auth.ts` — added `hardenAuthJsonPermissions()` after SDK writes + `repairAuthJsonPermissionsOnStartup()` on handler registration

### Phase 1b: Container Exec --env (Item 4)
- **Status:** ✅ complete
- **Files modified:**
  - `electron/container/index.ts` — replaced `envPrefix` string concatenation with `--env` CLI flags; replaced `shQuoteValue()` with `isValidEnvName()` validation

### Phase 1c: OAuth Targeted Send (Item 6)
- **Status:** ✅ complete
- **Files modified:**
  - `electron/ipc/auth.ts` — `sendAuthEvent()` now targets `loginOriginWebContents` (the IPC sender) instead of broadcasting to all windows; falls back to focused window if originator is destroyed

### Phase 2a: Idempotency Keys (Item 5)
- **Status:** ✅ complete
- **Files modified:**
  - `electron/gateway/request-handler.ts` — added `idempotencyStore` Map with 5-min TTL, check/update logic in prompt case, `disposeIdempotencyStore()` export
  - `electron/gateway/index.ts` — calls `disposeIdempotencyStore()` on shutdown

### Phase 2b: Cost Caps (Item 3)
- **Status:** ✅ complete
- **Files modified:**
  - New `electron/gateway/cost-tracker.ts` — `CostTracker` class with per-session/per-day accumulators, model pricing tiers, configurable limits from `gateway-config.json`
  - `electron/gateway/index.ts` — added `costTracker` field, passes to `routeAgentRequest()`
  - `electron/gateway/request-handler.ts` — cost limit check before prompt, active session tracking
  - `electron/gateway/agent-bridge.ts` — extracts token usage from `message_end` events, feeds to cost tracker
  - `electron/ipc/gateway.ts` — wires `setGatewayCostTracker()` on gateway start
  - `electron/ipc/shared-infra.ts` — passes `configDir` to `GatewayServer`

### Phase 3: Pre-Commit Secret Scanning
- **Status:** ✅ complete
- **Files modified:**
  - New `.gitleaks.toml` — config with allowlists for test fixtures
  - New `.husky/pre-commit` — runs `gitleaks detect --staged`
  - `package.json` — added `husky` devDep + `prepare` script

### Deferred TODOs
- **Status:** ✅ complete
  - `electron/gateway/auth.ts` — added TODO comment for per-workspace token scoping

---

## Verification
- `pnpm typecheck` — 23/23 tasks passed, zero errors
- All modified files under 500 LOC
- `gitleaks detect --no-git` — no leaks found

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none) | — | — |

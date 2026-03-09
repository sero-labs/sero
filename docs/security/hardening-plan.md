# Security Hardening — Implementation Plan

> **Source:** `docs/security/outstanding-hardening.md`
> **Date:** 2026-03-09
> **Scope:** 5 of 6 numbered findings + 2 additional items

---

## Triage Summary

| # | Finding | Severity | Effort | Decision |
|---|---------|----------|--------|----------|
| 1 | Per-Workspace Access Control | Critical | High | **DEFERRED** — single-user + secret token + localhost is sufficient for now |
| 2 | `auth.json` File Permissions | High | Low | **DO NOW** |
| 3 | Cost Caps for Gateway Sessions | High | Medium | **DO NOW** |
| 4 | Shell Command Concatenation | Medium | Low | **DO NOW** — container CLI supports `--env` flags |
| 5 | Idempotency Key Enforcement | Medium | Low | **DO NOW** |
| 6 | OAuth Events Broadcast | Medium | Low | **DO NOW** |
| — | Pre-Commit Secret Scanning | Rec. | Low | **DO NOW** |
| — | Structured Audit Log | Partial | Medium | **DEFER** — nice-to-have, not blocking |
| — | IPC Zod Validation | Rec. | High | **DEFER** — touches many handlers, needs careful rollout |
| — | Extension Sandboxing | Rec. | Very High | **DEFER** — architectural research needed |

---

## Phase 1 — Quick Wins (Items 2, 4, 6)

Minimal-risk, self-contained fixes. No new files needed.

### 1a. `auth.json` Permissions (Item 2)
- **File:** `electron/ipc/auth.ts`
- **File:** `electron/env.ts` — export `AUTH_JSON_PATH`
- **What:**
  - Export `AUTH_JSON_PATH = path.join(SERO_AGENT_DIR, 'auth.json')` from `env.ts`
  - After every `authStorage.set()` and `authStorage.login()` call, run
    `fs.chmodSync(AUTH_JSON_PATH, 0o600)`
  - On app startup (in `registerAuthHandlers()`), check if `auth.json` exists
    and repair permissions if they're not `0600`. Log a warning.
- **Risk:** None — chmod is idempotent

### 1b. Container Exec `--env` Flags (Item 4)
- **File:** `electron/container/index.ts` — `exec()` method
- **What:**
  - Replace the `envPrefix` string concatenation with `--env KEY=VALUE` args
    passed to `container exec` before the container ID
  - The container CLI (`v0.8.0+`) supports `-e, --env <env>` flags (confirmed
    via `container exec --help`)
  - Remove `shQuoteValue()` — no longer needed when using `--env` flags
    (the container CLI handles the value directly, no shell interpolation)
  - Keep the `sh -c <command>` part unchanged — the command itself is
    intentionally a shell string from the agent
- **Before:**
  ```
  container exec [-w cwd] <cid> sh -c "export HOST=0.0.0.0 HTTP_PROXY=...;command"
  ```
- **After:**
  ```
  container exec --env HOST=0.0.0.0 --env HTTP_PROXY=... [-w cwd] <cid> sh -c "command"
  ```
- **Risk:** Low — `--env` is the intended API. Test with proxy + GitHub auth vars.

### 1c. OAuth Targeted Send (Item 6)
- **File:** `electron/ipc/auth.ts`
- **What:**
  - In `ipcMain.handle(IpcChannels.auth.login, ...)`, capture the originating
    `BrowserWindow` from `_event.sender` (the `webContents` that sent the IPC)
  - Replace `sendAuthEvent()` broadcast (`BrowserWindow.getAllWindows()`) with
    a targeted send to `event.sender.send(...)` (or find its parent window)
  - Add a fallback: if the originating webContents is destroyed mid-flow,
    send to `BrowserWindow.getFocusedWindow()` or log a warning
- **Risk:** Low — Sero currently has one window, so behavior is identical.
  The fix prevents leaks if multiple windows are added later.

---

## Phase 2 — Idempotency + Cost Caps (Items 5, 3)

### 2a. Idempotency Key Enforcement (Item 5)
- **File:** `electron/gateway/request-handler.ts` — `routeAgentRequest()`
- **What:**
  - Add a `Map<string, { timestamp: number; status: 'pending' | 'done' }>`
    as module-level state (or pass it in)
  - In the `prompt` case, before processing:
    - If `idempotencyKey` is present and status is `done` → return cached OK
    - If status is `pending` → return error "request in progress"
    - Otherwise → record as `pending`, proceed, mark `done` on success
  - Add a cleanup `setInterval` (every 60s) to evict entries older than 5min
  - Clean up the interval on gateway stop
- **Risk:** Very low — only affects requests that include the optional key

### 2b. Cost Caps for Gateway Sessions (Item 3)
- **New file:** `electron/gateway/cost-tracker.ts`
  - `CostTracker` class with per-session and per-day accumulators
  - Model → pricing tier lookup (Claude Opus, Sonnet, GPT-4, etc.)
  - `recordUsage(sessionId, model, inputTokens, outputTokens)` method
  - `checkLimits(sessionId): { allowed: boolean; reason?: string }` method
- **File:** `electron/gateway/agent-bridge.ts`
  - Extract `input_tokens` / `output_tokens` from `agent_end` events
  - Call `costTracker.recordUsage()` when usage data is available
- **File:** `electron/gateway/request-handler.ts`
  - Before processing `prompt`, call `costTracker.checkLimits(sessionId)`
  - If limit exceeded, return error with `cost_limit_exceeded` message
- **File:** `electron/gateway/protocol.ts`
  - Document `cost_limit_exceeded` as a known error type (comment only,
    the error message string is enough)
- **Config:** `~/.sero-ui/gateway-config.json`
  - Default limits: `maxCostPerSession: 5.00`, `maxCostPerDay: 50.00`,
    `maxConcurrentSessions: 3`
  - Load at gateway start; create with defaults if missing
- **Risk:** Medium — needs correct token→cost mapping. Use conservative
  estimates. Log costs for manual verification initially.

---

## Phase 3 — Pre-Commit Secret Scanning

### 3a. Gitleaks Pre-Commit Hook
- **New file:** `.gitleaks.toml` — config (allow known test fixtures)
- **Install:** `brew install gitleaks` (or document as requirement)
- **New file:** `.husky/pre-commit` (or `.pre-commit-config.yaml`)
  - Run `gitleaks detect --staged --verbose`
- **Package change:** Add `husky` + `prepare` script to root `package.json`
- **Risk:** None — only affects commits, not runtime

---

## Deferred Items (with TODOs)

### Item 1: Per-Workspace Access Control
- Add a `// TODO(security): Per-workspace token scoping — see docs/security/outstanding-hardening.md #1`
  comment in `electron/gateway/auth.ts`
- Revisit if/when Sero supports multi-user or untrusted client scenarios

### Structured Audit Log
- Not blocking; current inline logging is adequate for single-user
- Revisit when gateway sees production external traffic

### IPC Zod Validation
- Zod is already a dependency
- Large surface area — should be done as a dedicated sweep, not mixed
  into this hardening pass

### Extension Sandboxing
- Architectural research needed — `<webview>` sandbox has significant
  implications for the app-runtime hooks and module federation
- Prototype separately

---

## Execution Order

```
Phase 1a (auth.json perms)      ~15 min   ← start here
Phase 1b (container --env)      ~20 min
Phase 1c (OAuth targeted send)  ~15 min
── typecheck + test ──
Phase 2a (idempotency)          ~20 min
Phase 2b (cost caps)            ~45 min
── typecheck + test ──
Phase 3  (gitleaks)             ~15 min
── final typecheck ──
```

**Total estimated effort: ~2.5 hours**

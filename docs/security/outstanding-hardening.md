# Security Hardening — Outstanding Items

> **Date:** 2026-03-09
> **Status:** 13 of 19 findings from the initial audit have been fixed.
> This document details the 6 remaining open items with implementation
> requirements, affected files, and suggested approaches.

---

## 1. Per-Workspace Access Control on Gateway

**Finding:** F-03 (Critical) — Flat access model: any authenticated gateway
client can access ALL workspaces and ALL sessions.

**Risk:** A compromised web-chat session or Discord channel can read/modify
any workspace, not just the one it was intended for.

### Current Behaviour

- A single 32-byte token (`~/.sero-ui/gateway-token`) grants access to
  everything.
- `GatewayConnectRequest` accepts `clientType` and `clientId` but no
  workspace scope.
- `handleRequest()` in `gateway/index.ts` routes `prompt`, `steer`,
  `abort`, `list_sessions` to any `workspaceId` the client provides.

### What Needs to Change

1. **Token scoping model** — Replace the single token with per-workspace
   tokens, or add a scope claim:
   - Option A: **Multi-token file** — `gateway-tokens.json` maps
     `{ workspaceId: token }`. The `connect` request includes a
     `workspaceScope` field. `GatewayAuth.validate()` returns the
     allowed workspace IDs.
   - Option B: **JWT-style scoped tokens** — Sign a JWT with
     `{ sub: clientId, workspaces: ["ws-1", "ws-2"], exp: ... }`.
     Validate signature + claims on connect. More complex but supports
     expiry and revocation.
   - Recommendation: **Option A** for simplicity. Sero is single-user;
     JWT is overkill.

2. **Enforce scope in `handleRequest()`** — After auth, store allowed
   workspace IDs on the `ConnectedClient`. Reject `prompt`,
   `list_sessions`, and `steer`/`abort` if the `workspaceId` is not in
   the client's scope.

3. **Update `list_workspaces`** — Filter results to only return
   workspaces the client is authorized for.

4. **Update Discord adapter** — `DiscordAdapterConfig.defaultWorkspaceId`
   should be the only workspace the Discord token is scoped to.

### Files to Modify

| File | Change |
|------|--------|
| `electron/gateway/auth.ts` | Support multi-token lookup; return scope |
| `electron/gateway/index.ts` | Store scope on `ConnectedClient`; enforce in `handleRequest()` |
| `electron/gateway/protocol.ts` | Add `workspaceScope?: string` to `GatewayConnectRequest` |
| `electron/gateway/channels/discord.ts` | Pass workspace scope on internal auth |
| `electron/ipc/gateway.ts` | Expose token management IPC for the settings UI |

---

## 2. `auth.json` File Permissions (0o600)

**Finding:** F-05 (High) — API keys stored via Pi SDK's `AuthStorage` in
`auth.json` do not have explicit `0600` file permissions.

**Risk:** On multi-user systems, other users could read API keys.

### Current Behaviour

- `AuthStorage` is provided by `@mariozechner/pi-ai` (external dependency).
- Sero calls `infra.authStorage.set(providerId, { type: 'api_key', key })`
  in `electron/ipc/auth.ts:237`.
- The SDK writes `auth.json` using default Node.js `fs.writeFile`
  permissions (typically `0o644`).
- The gateway token file already uses `{ mode: 0o600 }` (in
  `gateway/auth.ts:41`), so the pattern exists.

### What Needs to Change

1. **Upstream PR to `@mariozechner/pi-ai`** — Add `{ mode: 0o600 }` to
   the `AuthStorage.save()` method's `fs.writeFileSync` / `writeFile`
   call. This is the correct fix since the SDK owns the file.

2. **Fallback: post-write permission repair** — If the upstream change
   is slow, add a wrapper in `electron/ipc/auth.ts` that calls
   `fs.chmodSync(authJsonPath, 0o600)` after every `authStorage.set()`
   or `authStorage.login()` call. The path can be derived from
   `SERO_AGENT_DIR + '/auth.json'`.

3. **Startup check** — On app launch, verify `auth.json` permissions
   and repair if wrong. Log a warning if repaired.

### Files to Modify

| File | Change |
|------|--------|
| `electron/ipc/auth.ts` | Add post-write `chmod 0o600` after `authStorage.set()` and `authStorage.login()` |
| `electron/env.ts` | Export `AUTH_JSON_PATH` constant for reuse |
| Upstream `@mariozechner/pi-ai` | PR to add `mode: 0o600` to `AuthStorage.save()` |

---

## 3. Cost Caps for Gateway Sessions

**Finding:** F-09 (High) — No cost limits for gateway-initiated sessions.
A compromised or malicious client can run unlimited expensive prompts.

**Risk:** Financial — unbounded API spend via Anthropic/OpenAI.

### What Needs to Change

1. **Cost tracking** — The agent session already receives
   `usage` data in response events (`input_tokens`, `output_tokens`).
   Add a per-session and per-day cost accumulator in the gateway or
   agent bridge.

2. **Configuration** — Add a `gateway-config.json` file (or extend
   the existing gateway config) with:
   ```json
   {
     "maxCostPerSession": 5.00,
     "maxCostPerDay": 50.00,
     "maxConcurrentSessions": 3
   }
   ```

3. **Enforcement** — Before relaying a `prompt` request, check:
   - Session cost < `maxCostPerSession`
   - Daily cost < `maxCostPerDay`
   - Active session count < `maxConcurrentSessions`
   If exceeded, return an error response and do not forward to the agent.

4. **Cost estimation** — Use approximate per-token pricing:
   - Claude Opus: ~$15/M input, ~$75/M output
   - Claude Sonnet: ~$3/M input, ~$15/M output
   - Map model ID → pricing tier in a lookup table.

### Files to Modify

| File | Change |
|------|--------|
| `electron/gateway/index.ts` | Add cost accumulator; check limits before `prompt` |
| `electron/gateway/agent-bridge.ts` | Extract token usage from agent events; report to gateway |
| `electron/gateway/protocol.ts` | Add `cost_limit_exceeded` error type |
| New: `electron/gateway/cost-tracker.ts` | Per-session and per-day cost tracking |
| New: `~/.sero-ui/gateway-config.json` | User-configurable cost limits |

---

## 4. Shell Command Concatenation in Container Exec

**Finding:** F-10 (Medium) — User-provided `command` from the agent's
`bash` tool is concatenated directly into `sh -c` at
`container/index.ts:227`.

**Risk:** While the container is a sandbox, the concatenation pattern
`${envPrefix}${command}` means env variable injection could theoretically
manipulate the shell context. The container barrier is the primary
defence, but defence-in-depth applies.

### Current Code

```typescript
// container/index.ts:226-227
const envPrefix = envParts.join(' ') + ';';
args.push(cid, 'sh', '-c', `${envPrefix}${command}`);
```

Environment values are quoted with `shQuoteValue()` (single-quote
wrapping with escape), which is correct. The `command` itself is
intentionally passed unescaped because it IS a shell command from the
agent. The real concern is the `envPrefix` concatenation.

### What Needs to Change

1. **Separate env and command** — Instead of concatenating env vars
   into the `sh -c` string, use `container exec --env KEY=VALUE` flags
   if the container CLI supports them. Check `container exec --help`
   for `--env` / `-e` support.

2. **If `--env` is not supported** — Refactor to use a wrapper script
   approach: write a small shell script to a temp file inside the
   container, then `container exec sh /tmp/sero-cmd-XXXX.sh`. This
   avoids the concatenation entirely.

3. **Validate env variable names** — Before building `envPrefix`,
   validate that env var names match `^[A-Z_][A-Z0-9_]*$`. Reject
   names containing shell metacharacters.

### Files to Modify

| File | Change |
|------|--------|
| `electron/container/index.ts` | Refactor `exec()` to use `--env` flags or wrapper script |

---

## 5. Idempotency Key Not Enforced

**Finding:** F-11 (Medium) — `GatewayPromptRequest` defines an
`idempotencyKey?: string` field, but the gateway server ignores it.

**Risk:** Network retries can cause duplicate prompt execution,
wasting tokens and producing confusing duplicate responses.

### What Needs to Change

1. **Idempotency store** — Add a `Map<string, { timestamp: number; status: 'pending' | 'done' }>` to
   `GatewayServer`. Key = idempotency key, TTL = 5 minutes.

2. **Check before processing** — In the `prompt` case of
   `handleRequest()`:
   - If `idempotencyKey` is present and already in the store with
     status `done`, return the cached response.
   - If status is `pending`, return a "request in progress" error.
   - Otherwise, record it as `pending` and proceed.

3. **Mark done** — After the prompt completes (on `agent_end` event),
   update the entry to `done`.

4. **Cleanup** — Periodically remove entries older than 5 minutes.

### Files to Modify

| File | Change |
|------|--------|
| `electron/gateway/index.ts` | Add idempotency store and check/update logic |
| `electron/gateway/protocol.ts` | No change needed (field already defined) |

---

## 6. OAuth Events Broadcast to All Windows

**Finding:** F-12 (Medium) — `sendAuthEvent()` in `electron/ipc/auth.ts`
broadcasts OAuth events (including login progress, tokens, error messages)
to ALL `BrowserWindow` instances.

**Risk:** If Sero ever opens multiple windows (e.g., a detached chat
panel, DevTools window, or a `<webview>` for extensions), OAuth events
containing sensitive data (URLs with auth codes, progress messages with
provider names) would leak to unintended contexts.

### Current Code

```typescript
// electron/ipc/auth.ts:63-66
function sendAuthEvent(event: OAuthEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.auth.event, event);
  }
}
```

### What Needs to Change

1. **Target the originating window** — Track which `BrowserWindow`
   initiated the login flow. Pass the `webContents.id` or
   `BrowserWindow` reference from the `ipcMain.handle` callback's
   `_event` parameter.

2. **Send only to that window** — Replace the broadcast with a
   targeted `win.webContents.send()` to the originating window only.

3. **Fallback** — If the originating window is closed during the flow,
   send to the focused window or log a warning.

### Files to Modify

| File | Change |
|------|--------|
| `electron/ipc/auth.ts` | Store originating `webContents.id`; replace `getAllWindows()` broadcast with targeted send |

---

## Additional Deferred Items

These were identified during hardening but not tracked as numbered
findings:

### Structured Audit Log File (F-18 partial)

Auth failure logging was added inline, but a structured audit log file
(`~/.sero-ui/gateway-audit.log`) with JSON entries for all gateway
operations (prompt, steer, abort, connect, disconnect) is still needed.

**Approach:** Create `electron/gateway/audit-log.ts` that appends
newline-delimited JSON to the audit file. Rotate when file exceeds
10 MB. Include: timestamp, client IP, client type, operation, workspace
ID, session ID, success/failure.

### Pre-Commit Secret Scanning (Recommendation #15)

Add a `gitleaks` or `trufflehog` pre-commit hook to prevent secrets
from being committed to the repository.

**Approach:** Add `.pre-commit-config.yaml` with the `gitleaks` hook,
or add a `husky` pre-commit hook that runs
`gitleaks detect --source . --verbose`.

### IPC Input Validation with Zod (Recommendation #9)

All IPC handlers accept unvalidated parameters from the renderer. A
compromised or buggy renderer could send malformed data.

**Approach:** Add `zod` as a dependency. Create a shared
`electron/ipc/schemas.ts` with Zod schemas for each IPC handler's
parameters. Validate at the top of each `ipcMain.handle` callback.
Start with security-sensitive handlers: `auth.setApiKey`,
`auth.login`, `editor.readFile`, `editor.writeFile`, `net.fetch`.

### Extension Sandboxing (Recommendation #16)

Federated extension modules currently run in the same renderer
context as the shell. A malicious extension could access the
`window.sero` IPC bridge.

**Approach:** Evaluate running each extension's UI in a separate
`<webview>` tag with `sandbox` attribute, limiting it to a
message-passing API. This is a significant architectural change
and should be prototyped before committing.

---

*Last updated: 2026-03-09. Review and prioritize these items during
the next sprint planning.*

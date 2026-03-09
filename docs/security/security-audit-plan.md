# Sero Security Audit & Hardening Plan

> **Date:** 2026-03-09
> **Scope:** Full penetration test & hardening review of the Sero desktop application
> **Focus areas:** API key management, file access controls, secret leakage prevention, remote gateway hardening

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Audit Scope & Methodology](#2-audit-scope--methodology)
3. [Phase 1 — Gateway Security](#3-phase-1--gateway-security)
4. [Phase 2 — Secrets & API Key Management](#4-phase-2--secrets--api-key-management)
5. [Phase 3 — File Access & Path Traversal](#5-phase-3--file-access--path-traversal)
6. [Phase 4 — Electron Process Isolation & IPC](#6-phase-4--electron-process-isolation--ipc)
7. [Phase 5 — Container Sandbox Escapes](#7-phase-5--container-sandbox-escapes)
8. [Phase 6 — Secret Leakage Prevention](#8-phase-6--secret-leakage-prevention)
9. [Phase 7 — Federated Module & Extension Security](#9-phase-7--federated-module--extension-security)
10. [Phase 8 — Network & Transport Security](#10-phase-8--network--transport-security)
11. [Findings Summary (Pre-Audit)](#11-findings-summary-pre-audit)
12. [Hardening Recommendations](#12-hardening-recommendations)
13. [Test Execution Checklist](#13-test-execution-checklist)

---

## 1. Executive Summary

Sero is an Electron-based agent workspace that runs AI coding sessions inside macOS containers, exposes a WebSocket gateway for remote access, stores API keys for multiple providers, and loads federated extension modules at runtime. This plan defines a structured penetration test across seven attack surfaces with concrete test cases, tooling recommendations, and hardening actions.

---

## 2. Audit Scope & Methodology

### In-Scope Assets

| Asset | Location | Risk Profile |
|-------|----------|-------------|
| Gateway WebSocket server | `electron/gateway/` | High — remote access entry point |
| Auth token store | `~/.sero-ui/gateway-token` | High — single secret gates all remote access |
| API key storage (`auth.json`) | `~/.sero-ui/<profile>/agent/auth.json` | High — Anthropic, OpenAI, Google keys |
| GitHub OAuth token | `~/.sero-ui/github-auth.json` | High — repo access |
| Environment file | `~/.sero-ui/<profile>/agent/.env` | High — may contain API keys |
| Preload / IPC bridge | `electron/preload.ts`, `electron/ipc/` | Medium — process boundary |
| Container exec proxy | `electron/container/` | Medium — command injection surface |
| Extension protocol | `electron/ext-protocol.ts` | Medium — custom `sero-ext://` scheme |
| CSP policy | `electron/csp.ts` | Medium — XSS mitigation |
| File watcher | `electron/file-watcher.ts` | Low |
| Discord bot adapter | `electron/gateway/channels/discord.ts` | Medium — open-by-default access |

### Methodology

- **OWASP Testing Guide v4** adapted for Electron desktop apps
- **Electron Security Checklist** (Electron docs — Security, Native Capabilities)
- **PTES (Penetration Testing Execution Standard)** for structured phases
- Manual code review + automated tooling (see each phase)

### Tooling

| Tool | Purpose |
|------|---------|
| `wscat` / `websocat` | WebSocket gateway probing |
| `Burp Suite` / `mitmproxy` | HTTP/WS traffic interception |
| `electron-forge` inspect mode | Renderer DevTools, IPC sniffing |
| `trufflehog` / `gitleaks` | Secret scanning in source & git history |
| `semgrep` | Static analysis (Electron-specific rulesets) |
| `npm audit` / `pnpm audit` | Dependency vulnerability scan |
| `snyk` | Deep dependency CVE scanning |
| Custom fuzzer scripts | Protocol & path fuzzing |

---

## 3. Phase 1 — Gateway Security

**Target:** `apps/desktop/electron/gateway/`
**Risk:** HIGH — the gateway is the primary remote attack surface

### 3.1 Authentication & Token Security

#### Current State
- 32-byte random token (256-bit entropy), stored at `~/.sero-ui/gateway-token` with mode `0600`
- Constant-time comparison via `crypto.timingSafeEqual()` (`auth.ts:48-56`)
- 10-second authentication timeout for unauthenticated connections (`index.ts:210`)

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| GW-AUTH-01 | Brute-force token | Send 10,000 random tokens via `wscat` | Should not reveal timing differences; connections should be rate-limited or blocked |
| GW-AUTH-02 | Token in URL query string | Access `http://host:18800/?token=<token>`, inspect Referer headers on navigation | Token should NOT leak in Referer headers to third-party resources |
| GW-AUTH-03 | Token file permissions | `stat ~/.sero-ui/gateway-token` on multi-user system | Must be `0600`, owned by current user |
| GW-AUTH-04 | Token rotation | Call `GatewayAuth.regenerate()`, verify old token is rejected | Old connections must be terminated |
| GW-AUTH-05 | Unauthenticated request | Send `prompt` message without prior `connect` | Must receive error and NOT execute |
| GW-AUTH-06 | Replay attack | Capture valid `connect` message, replay after token rotation | Must fail authentication |
| GW-AUTH-07 | Empty/null token | Send `connect` with `token: ""` or `token: null` | Must reject without crash |

#### Hardening Actions

1. **Add rate limiting on failed auth attempts** — After 5 failed attempts from the same IP within 60s, block for 5 minutes. Currently no rate limiting exists.
2. **Remove `?token=` URL parameter support** from web chat (`channels/web.ts`). Replace with a login prompt that sends the token over WebSocket only.
3. **Add `Referrer-Policy: no-referrer` header** to all HTTP responses from the gateway.
4. **Log failed authentication attempts** with client IP and timestamp for audit trails.

### 3.2 Authorization & Access Control

#### Current State
- Flat access model: authenticated clients can access ALL workspaces and ALL sessions
- No per-workspace or per-tool permissions
- No cost limits or usage quotas

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| GW-AUTHZ-01 | Cross-workspace access | Authenticate, list workspaces, send prompt to workspace the client shouldn't access | Should be restricted (currently is NOT) |
| GW-AUTHZ-02 | Tool restriction bypass | Via gateway, invoke `bash` tool with destructive command | Should enforce tool allowlists per client type |
| GW-AUTHZ-03 | Cost exhaustion | Send rapid sequential prompts to expensive models | Should enforce per-session or per-client cost caps |
| GW-AUTHZ-04 | Session enumeration | Call `list_sessions` across all workspaces | Should only list sessions the client created or is authorized for |

#### Hardening Actions

1. **Implement per-workspace access tokens** — Each workspace gets its own token scope; gateway tokens are scoped to specific workspace IDs.
2. **Add cost cap configuration** — `gateway-config.json` should support `maxCostPerSession`, `maxCostPerDay`, and `maxConcurrentSessions`.
3. **Tool allowlists per client type** — Web clients and Discord clients should have configurable tool restrictions (e.g., no `bash` via Discord).
4. **Audit logging** — Log all gateway operations (prompt, steer, abort) with client ID, workspace, and timestamp to `~/.sero-ui/gateway-audit.log`.

### 3.3 WebSocket Protocol Security

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| GW-WS-01 | Malformed JSON | Send `{invalid json` | Error response, connection stays open |
| GW-WS-02 | Oversized message | Send 100MB payload | Should reject with size limit error |
| GW-WS-03 | Unknown message type | Send `{ type: "exec_arbitrary" }` | Should reject gracefully |
| GW-WS-04 | Concurrent connections | Open 1000 simultaneous WebSocket connections | Should enforce max connection limit |
| GW-WS-05 | Slowloris attack | Open connection, send 1 byte per second | Should timeout and close |
| GW-WS-06 | Origin header validation | Connect from `http://evil.com` origin | Should reject non-localhost origins (when not using Tailscale) |

#### Hardening Actions

1. **Max message size** — Add `maxPayload` option to `ws.Server` constructor (recommend 1MB).
2. **Max connections per IP** — Limit to 10 concurrent WebSocket connections per source IP.
3. **Origin validation** — When not behind Tailscale, validate `Origin` header matches `http://127.0.0.1:18800` or `http://localhost:18800`.
4. **Idle timeout** — Close authenticated connections that have been idle for >30 minutes.

### 3.4 Discord Bot Security

#### Current State
- `SERO_DISCORD_USERS` whitelist is optional; when unset, ANY Discord user has full access
- Bot processes DMs and @mentions
- No per-command permissions

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| GW-DC-01 | Open access (no whitelist) | Send DM to bot with `SERO_DISCORD_USERS` unset | Should NOT grant access by default — fail-closed |
| GW-DC-02 | Whitelist bypass | Spoof Discord user ID in message | Should not be possible (Discord API enforces IDs) |
| GW-DC-03 | Prompt injection via Discord | Send message containing tool invocation syntax | Agent should treat as user input, not tool calls |

#### Hardening Actions

1. **Fail-closed Discord access** — If `SERO_DISCORD_USERS` is empty/unset, disable the Discord adapter entirely. Log a warning.
2. **Command prefix** — Require a prefix (e.g., `/sero`) for bot commands to reduce accidental invocation.

---

## 4. Phase 2 — Secrets & API Key Management

**Target:** `electron/ipc/auth.ts`, `electron/ipc/safe-storage.ts`, `electron/github/auth-manager.ts`, `electron/google/auth-manager.ts`
**Risk:** HIGH — leaked API keys can incur significant financial damage

### 4.1 Credential Storage

#### Current State
- API keys stored in `auth.json` via Pi SDK's `AuthStorage`, encrypted with Electron `safeStorage` (OS keychain)
- GitHub token stored in `~/.sero-ui/github-auth.json`, encrypted with `safeStorage.encryptString()`
- Fallback to base64 encoding if OS encryption is unavailable (`safe-storage.ts:25-26`)
- Google keyring uses hardcoded password `'sero-google-keyring'` (`google/auth-manager.ts:65`)

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| SEC-STORE-01 | Read `auth.json` as different user | `sudo -u otheruser cat ~/.sero-ui/agent/auth.json` | Should be denied by file permissions |
| SEC-STORE-02 | Extract keys from memory | Attach debugger to Electron main process, search heap for API key strings | Keys should be short-lived in memory; investigate if they persist |
| SEC-STORE-03 | Decrypt without OS session | Copy `auth.json` to another machine, attempt decryption | Should fail — safeStorage keys are machine-bound |
| SEC-STORE-04 | Base64 fallback detection | Run on Linux without libsecret installed | Should warn user that encryption is unavailable |
| SEC-STORE-05 | File permission on auth.json | `stat ~/.sero-ui/agent/auth.json` | Should be `0600` (currently NOT explicitly set) |
| SEC-STORE-06 | Google keyring password | Attempt to decrypt gogcli keyring with known password `sero-google-keyring` | Attacker with file access can extract Google tokens |

#### Hardening Actions

1. **Explicit file permissions on `auth.json`** — Set `mode: 0o600` when writing `auth.json` (match gateway token pattern).
2. **Warn on base64 fallback** — Display a persistent UI warning and log entry when `safeStorage.isEncryptionAvailable()` returns false.
3. **Rotate Google keyring password** — Derive from machine-specific data (e.g., `os.hostname() + os.userInfo().uid`) instead of hardcoded string.
4. **Memory zeroing** — After API keys are used for HTTP requests, overwrite the string buffer if possible (limited by JS GC, but `Buffer.fill(0)` can help for Buffers).
5. **Key expiry metadata** — Store and check expiry dates for OAuth tokens; prompt for re-auth when expired.

### 4.2 Environment Variable Security

#### Current State
- `.env` loaded from `~/.sero-ui/<profile>/agent/.env` (`electron/env.ts:138-186`)
- Simple KEY=VALUE parser, no dotenv library
- Does NOT override existing process env vars
- Contains: `GOOGLE_CLIENT_SECRET`, `SERO_DISCORD_TOKEN`, potentially `ANTHROPIC_API_KEY`, etc.

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| SEC-ENV-01 | `.env` file permissions | `stat ~/.sero-ui/agent/.env` | Must be `0600` |
| SEC-ENV-02 | `.env` in git | Search for `.env` files in repo | Must be in `.gitignore` |
| SEC-ENV-03 | Env var leakage to renderer | In renderer DevTools, access `process.env` | Must return undefined (context isolation) |
| SEC-ENV-04 | Env var leakage to containers | In container shell, run `env \| grep -i secret` | Should only contain intentionally passed vars |
| SEC-ENV-05 | `.env` parsing edge cases | Add lines with `=` in values, quotes, special chars | Parser must handle correctly without leaking partial keys |

#### Hardening Actions

1. **Set `.env` file permissions to `0600`** on creation and on every read (repair if changed).
2. **Validate `.env` variable names** — Only allow known variable names; warn on unexpected entries.
3. **Audit container env injection** — Review `containerManager.getExtraEnvVars()` to ensure only necessary variables are passed.

---

## 5. Phase 3 — File Access & Path Traversal

**Target:** `electron/ipc/editor.ts`, `electron/container/files.ts`, `electron/ext-protocol.ts`
**Risk:** MEDIUM — container isolation provides a secondary barrier

### 5.1 Path Traversal Attacks

#### Current State
- `toHostPath()` in `editor.ts:43-57` validates paths stay within workspace root using `path.resolve()` + startswith check
- Same pattern in `skills.ts:29-34` and `prompts.ts:29-34`
- Extension protocol in `ext-protocol.ts:73-80` checks `fullPath.startsWith(distDir)`

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| FILE-PT-01 | Classic traversal | Request `../../etc/passwd` via editor read IPC | Must be rejected by `toHostPath()` |
| FILE-PT-02 | Null byte injection | Request `file.txt%00../../etc/passwd` | Must be rejected |
| FILE-PT-03 | Unicode normalization | Request path with Unicode chars that normalize to `..` | Must be rejected |
| FILE-PT-04 | Symlink escape | Create symlink inside workspace pointing to `/etc/` | Investigate: does `path.resolve()` follow symlinks? |
| FILE-PT-05 | Extension protocol traversal | Request `sero-ext://appid/../../../etc/passwd` | Must be rejected by `startsWith(distDir)` |
| FILE-PT-06 | Long path | Send 10,000-char path | Must handle gracefully, no buffer overflow |
| FILE-PT-07 | Relative path in container | Via container `read` tool, request `/etc/shadow` | Container should not have access (rootless container) |

#### Hardening Actions

1. **Symlink resolution audit** — Add `fs.realpathSync()` before startswith check in `toHostPath()` to prevent symlink escapes.
2. **Null byte stripping** — Explicitly strip null bytes from paths before validation.
3. **Path length limits** — Reject paths longer than 4096 characters.

### 5.2 Container File I/O

#### Current State
- Read operations use `cat '${escaped}'` with single-quote escaping (`files.ts:9-20`)
- Write operations use stdin piping to avoid shell escaping issues (`files.ts:26-97`)
- Escape function replaces `'` with `'\''`

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| FILE-CIO-01 | Shell injection via filename | Create file named `'; rm -rf /; echo '` | Must be properly escaped |
| FILE-CIO-02 | Binary file handling | Read/write binary files through container | Must not corrupt data |
| FILE-CIO-03 | Large file write | Write 1GB file via container | Must handle gracefully (timeout or limit) |

#### Hardening Actions

1. **File size limits** — Enforce maximum file size for read/write operations (e.g., 50MB).
2. **Filename validation** — Reject filenames with control characters.

---

## 6. Phase 4 — Electron Process Isolation & IPC

**Target:** `electron/preload.ts`, `electron/main.ts`, `src/types/ipc-channels.ts`
**Risk:** MEDIUM — proper Electron security configuration is critical

### 6.1 Electron Configuration

#### Current State
- `contextIsolation: true` — renderer cannot access Node.js
- `nodeIntegration: false` — no `require()` in renderer
- `plugins: true` — required for Widevine CDM
- CSP enforced via `session.webRequest.onHeadersReceived` (`csp.ts`)

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| ELEC-01 | Renderer Node access | In DevTools, try `require('fs')` and `process.env` | Must fail |
| ELEC-02 | Preload scope leakage | Check if `window.sero` exposes more than intended | Must match typed interface exactly |
| ELEC-03 | CSP bypass | Inject `<script>` tag via XSS vector | CSP should block execution |
| ELEC-04 | Navigation to external URL | Trigger navigation to `https://evil.com` | Should be blocked or sandboxed |
| ELEC-05 | `window.open()` abuse | Call `window.open('file:///etc/passwd')` from renderer | Must be blocked |
| ELEC-06 | Protocol handler abuse | Navigate to `sero-ext://../../sensitive` | Must be validated by ext-protocol |

#### Hardening Actions

1. **`webSecurity: true`** — Verify this is not disabled anywhere (it's the default).
2. **Navigation restrictions** — Add `will-navigate` and `new-window` handlers to block navigation to untrusted origins.
3. **`setPermissionRequestHandler`** — Deny unnecessary permissions (camera, microphone, geolocation) unless explicitly needed.
4. **Remove `allowRunningInsecureContent`** — Verify this flag is not set.

### 6.2 IPC Channel Security

#### Current State
- All IPC through `contextBridge.exposeInMainWorld('sero', {...})`
- Channels defined in `src/types/ipc-channels.ts`
- No request signing or rate limiting on IPC calls
- `setApiKey` IPC handler writes directly to auth storage

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| IPC-01 | Invoke undocumented channel | Use `ipcRenderer.send('sero:internal:*')` from renderer | Must fail — contextBridge blocks raw ipcRenderer access |
| IPC-02 | API key injection | Call `sero.auth.setApiKey('anthropic', 'sk-test')` rapidly | Should not corrupt storage |
| IPC-03 | Large payload via IPC | Send 100MB payload through IPC channel | Should reject or handle gracefully |
| IPC-04 | Type confusion | Send wrong types (number instead of string for API key) | Must validate and reject |

#### Hardening Actions

1. **Input validation on all IPC handlers** — Add Zod or similar schema validation on the main-process side of every IPC handler.
2. **Rate limit sensitive IPC calls** — `setApiKey`, `login`, `prompt` should have per-second rate limits.

---

## 7. Phase 5 — Container Sandbox Escapes

**Target:** `electron/container/index.ts`, `electron/container/tools-coding.ts`
**Risk:** MEDIUM — containers are the primary execution sandbox

### 7.1 Command Injection

#### Current State
- **Critical code path** at `container/index.ts:227`:
  ```typescript
  args.push(cid, 'sh', '-c', `${envPrefix}${command}`);
  ```
  User-provided `command` from agent `bash` tool is directly concatenated into shell string.
- Environment variables use `shQuoteValue()` for quoting (`index.ts:223`)

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| CONT-INJ-01 | Shell metacharacter injection | Via bash tool: `echo hello; cat /etc/shadow` | Container should not have `/etc/shadow` access; but command injection is the concern |
| CONT-INJ-02 | Environment variable injection | Set env var value to `$(whoami)` | Must be quoted, not executed |
| CONT-INJ-03 | Backtick injection | Command with `` `rm -rf /` `` embedded | Must not execute destructively |
| CONT-INJ-04 | Newline injection | Command with `\n` followed by second command | Must handle as literal newline |

#### Hardening Actions

1. **Avoid `sh -c` where possible** — For simple commands, pass arguments as array elements to `container exec` directly.
2. **Command sanitization layer** — Add a validation function that rejects or escapes shell metacharacters for the `bash` tool input before passing to `sh -c`.
3. **Principle of least privilege** — Run container processes as non-root user.

### 7.2 Container Escape

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| CONT-ESC-01 | Mount escape | Attempt to access host filesystem outside `/workspace` bind mount | Must be blocked by container |
| CONT-ESC-02 | Network access | From container, attempt to reach host services on `127.0.0.1` | Investigate container network isolation |
| CONT-ESC-03 | Privilege escalation | Attempt `sudo` or `su` inside container | Must not be available |
| CONT-ESC-04 | `/proc` / `/sys` access | Read host info from `/proc/1/environ` | Must be isolated or restricted |

---

## 8. Phase 6 — Secret Leakage Prevention

**Risk:** HIGH — secrets in logs, crash reports, or git history can be exploited

### 8.1 Log & Output Scrubbing

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| LEAK-LOG-01 | API key in console logs | Search all `console.log/warn/error` calls for variable names containing `key`, `token`, `secret` | Must not log full secrets |
| LEAK-LOG-02 | Gateway token in logs | Check gateway startup logs | Currently redacted (`auth.ts` shows first 8 + last 4 chars only) — verify |
| LEAK-LOG-03 | Error stack traces | Trigger errors in auth flows; check if API keys appear in stack traces | Must not include secrets |
| LEAK-LOG-04 | Agent output scrubbing | Ask agent to `echo $ANTHROPIC_API_KEY` | Should be redacted or blocked |
| LEAK-LOG-05 | Crash report contents | Trigger crash, inspect crash dump | Must not contain API keys |

#### Hardening Actions

1. **Secret redaction middleware** — Implement a log wrapper that scans output for known API key patterns (e.g., `sk-ant-`, `sk-`, `gho_`, `AIza`) and redacts them.
2. **Agent output filtering** — Add a post-processing step to agent `text_delta` events that redacts patterns matching known key formats.
3. **Crash report sanitization** — Before sending any crash telemetry, strip environment variables and auth-related data.

### 8.2 Git History & Source Scanning

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| LEAK-GIT-01 | Secrets in git history | Run `trufflehog git file://. --only-verified` | Zero verified secrets |
| LEAK-GIT-02 | Secrets in source | Run `gitleaks detect --source .` | Zero findings |
| LEAK-GIT-03 | `.env.example` review | Check if example files contain real values | Must contain only placeholders |
| LEAK-GIT-04 | Hardcoded credentials | Search for `password`, `secret`, `apiKey` in source | Only the known `GITHUB_CLIENT_ID` (public) and keyring password should appear |

#### Hardening Actions

1. **Pre-commit hook** — Add a `gitleaks` or `trufflehog` pre-commit hook to prevent secrets from being committed.
2. **CI secret scanning** — Add GitHub secret scanning alerts and `gitleaks` to CI pipeline.
3. **Rotate the Google keyring password** — Replace hardcoded `'sero-google-keyring'` with a derived value.

### 8.3 Clipboard & Screenshots

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| LEAK-CLIP-01 | API key copy | Copy API key from settings UI | Should clear clipboard after 30 seconds or use secure paste |
| LEAK-CLIP-02 | Screen recording | Enable macOS screen recording while API key is displayed | Key should be masked in UI unless explicitly revealed |

#### Hardening Actions

1. **Mask API keys in UI** — Display only last 4 characters; require click to reveal.
2. **Clipboard auto-clear** — If the app copies secrets to clipboard, clear after 30 seconds.

---

## 9. Phase 7 — Federated Module & Extension Security

**Target:** `electron/ext-protocol.ts`, `electron/app-discovery.ts`, `electron/sero-extension.ts`
**Risk:** MEDIUM — malicious extensions could compromise the app

### 9.1 Extension Loading

#### Current State
- Extensions discovered by scanning `packages/pi-*/` directories for `sero.app` manifest in `package.json`
- Assets served via `sero-ext://` custom protocol with path traversal checks
- Extension code runs in renderer context (sandboxed by context isolation)

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| EXT-01 | Malicious manifest | Create package with `sero.app` containing script injection in fields | Manifest should be treated as data, not executed |
| EXT-02 | Protocol traversal | Request `sero-ext://legit-app/../../electron/main.js` | Must be blocked |
| EXT-03 | Extension event injection | Extension emits `sero:notify` with XSS payload in `message` | Notification must sanitize HTML |
| EXT-04 | Tool registration abuse | Extension registers tool with name matching system tool | Must be namespaced or rejected |
| EXT-05 | Extension resource exhaustion | Extension requests infinite loop via tool | Must be interruptible |

#### Hardening Actions

1. **Manifest schema validation** — Validate `sero.app` manifest against a strict JSON schema; reject unknown fields.
2. **Extension sandboxing** — Consider running extension renderer code in a separate `<webview>` with restricted permissions.
3. **Tool name validation** — Enforce prefix/namespace for extension-registered tools.

---

## 10. Phase 8 — Network & Transport Security

**Target:** Transport layer, TLS, proxy settings
**Risk:** MEDIUM

### 10.1 TLS & Certificate Validation

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| NET-TLS-01 | MITM on API calls | Use `mitmproxy` to intercept Anthropic/OpenAI API calls | Should fail with certificate error (no cert pinning expected, but TLS must be enforced) |
| NET-TLS-02 | Gateway without TLS | Connect to gateway on `ws://` (not `wss://`) from remote | Should only be accessible on localhost; Tailscale provides TLS for remote |
| NET-TLS-03 | Downgrade attack | Attempt to downgrade WSS to WS via Tailscale | Tailscale should enforce TLS |

### 10.2 Net Proxy Security

#### Current State
- `electron/ipc/net.ts` proxies HTTP requests from renderer to avoid CORS
- Headers passed through unfiltered

#### Test Cases

| ID | Test | Method | Expected Outcome |
|----|------|--------|-----------------|
| NET-PROXY-01 | SSRF via net proxy | Request `http://169.254.169.254/` (cloud metadata) | Should be blocked |
| NET-PROXY-02 | Header injection | Send request with injected headers via proxy | Headers should be validated |
| NET-PROXY-03 | File protocol via proxy | Request `file:///etc/passwd` through proxy | Must be blocked |

#### Hardening Actions

1. **SSRF protection** — Block requests to private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `127.0.0.0/8`) in the net proxy.
2. **Protocol allowlist** — Only allow `https:` and `http:` schemes in the proxy.
3. **Header sanitization** — Strip or validate sensitive headers before forwarding.

---

## 11. Findings Summary (Pre-Audit)

Based on code review, the following issues have been identified before active testing:

### Critical

| ID | Finding | Location | Status |
|----|---------|----------|--------|
| F-01 | No rate limiting on gateway (auth or requests) | `gateway/index.ts` | Open |
| F-02 | Discord bot open to all users by default | `gateway/channels/discord.ts` | Open |
| F-03 | No per-workspace access control on gateway | `gateway/index.ts` | Open |

### High

| ID | Finding | Location | Status |
|----|---------|----------|--------|
| F-04 | Token passed in URL query parameter | `gateway/channels/web.ts` | Open |
| F-05 | `auth.json` file permissions not explicitly set to `0600` | `electron/ipc/auth.ts` | Open |
| F-06 | Base64 fallback for credential storage (no warning) | `safe-storage.ts:25-26` | Open |
| F-07 | Hardcoded Google keyring password | `google/auth-manager.ts:65` | Open |
| F-08 | No message size limit on WebSocket server | `gateway/index.ts` | Open |
| F-09 | No cost caps for gateway-initiated sessions | `gateway/index.ts` | Open |

### Medium

| ID | Finding | Location | Status |
|----|---------|----------|--------|
| F-10 | Shell command concatenation in container exec | `container/index.ts:227` | Open |
| F-11 | Idempotency key defined but not enforced | `gateway/protocol.ts:22` | Open |
| F-12 | OAuth events broadcast to all windows | `electron/ipc/auth.ts:62-67` | Open |
| F-13 | No SSRF protection in net proxy | `electron/ipc/net.ts` | Open |
| F-14 | Net proxy passes headers unfiltered | `electron/ipc/net.ts` | Open |
| F-15 | No symlink resolution in path validation | `electron/ipc/editor.ts:43-57` | Open |
| F-16 | No max connection limit on WebSocket server | `gateway/index.ts` | Open |

### Low

| ID | Finding | Location | Status |
|----|---------|----------|--------|
| F-17 | No navigation restriction handlers | `electron/main.ts` | Open |
| F-18 | No audit logging for gateway operations | `gateway/index.ts` | Open |
| F-19 | No secret pattern redaction in logs | Various | Open |

---

## 12. Hardening Recommendations

### Priority 1 — Immediate (Gateway & Secrets)

1. **Rate limiting on gateway** — Implement token bucket or sliding window rate limiter for both authentication attempts and authenticated requests.
2. **Remove `?token=` URL support** — Force token entry via WebSocket `connect` message only.
3. **Fail-closed Discord** — Disable Discord adapter when no user whitelist is configured.
4. **Set `auth.json` permissions** — Add `{ mode: 0o600 }` to all writes.
5. **WebSocket `maxPayload`** — Set to 1MB in `ws.Server` options.
6. **Max connections** — Limit to 50 total, 10 per IP.

### Priority 2 — Short-Term (Access Control & Injection)

7. **Per-workspace gateway tokens** — Scope tokens to specific workspaces.
8. **Cost caps** — Configurable per-session and daily cost limits.
9. **IPC input validation** — Add Zod schemas to all main-process IPC handlers.
10. **Symlink resolution** — Use `fs.realpathSync()` before path boundary checks.
11. **SSRF protection** — Block private IPs in net proxy.
12. **Secret redaction** — Add pattern-based redaction to all log outputs.

### Priority 3 — Medium-Term (Defense in Depth)

13. **Navigation restrictions** — Block `will-navigate` to untrusted origins.
14. **Audit logging** — Structured JSON logs for all gateway and auth operations.
15. **Pre-commit secret scanning** — Add `gitleaks` hook.
16. **Extension sandboxing** — Evaluate running extension UI in isolated `<webview>`.
17. **Google keyring password derivation** — Replace hardcoded password.
18. **Base64 fallback warning** — UI toast + log warning when encryption unavailable.

---

## 13. Test Execution Checklist

Use this checklist when executing the audit:

### Pre-Audit Setup
- [ ] Set up isolated test environment (separate user profile, test API keys)
- [ ] Install tooling: `wscat`, `mitmproxy`, `trufflehog`, `gitleaks`, `semgrep`
- [ ] Create test API keys with minimal permissions for each provider
- [ ] Document baseline: file permissions, running processes, open ports

### Phase Execution
- [ ] **Phase 1:** Gateway security (GW-AUTH-*, GW-AUTHZ-*, GW-WS-*, GW-DC-*)
- [ ] **Phase 2:** Secrets & API keys (SEC-STORE-*, SEC-ENV-*)
- [ ] **Phase 3:** File access (FILE-PT-*, FILE-CIO-*)
- [ ] **Phase 4:** Electron & IPC (ELEC-*, IPC-*)
- [ ] **Phase 5:** Container sandbox (CONT-INJ-*, CONT-ESC-*)
- [ ] **Phase 6:** Secret leakage (LEAK-LOG-*, LEAK-GIT-*, LEAK-CLIP-*)
- [ ] **Phase 7:** Extensions (EXT-*)
- [ ] **Phase 8:** Network (NET-TLS-*, NET-PROXY-*)

### Post-Audit
- [ ] Compile findings with severity ratings (Critical/High/Medium/Low)
- [ ] Verify all hardening actions with re-tests
- [ ] Update this document with final status
- [ ] Run `pnpm audit` and `snyk test` for dependency vulnerabilities
- [ ] Generate final report with remediation timeline

---

*This plan should be reviewed and updated as the audit progresses. Each finding should be tracked to resolution.*

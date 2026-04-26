# Security, Privacy, and Permissions doc scout

## Relevant Files
- `SECURITY.md` — public security policy, supported report scope, private reporting channels, redaction guidance.
- `apps/docs-site/docs/reference/security-privacy.md` — current public posture language, local-vs-remote summary, explicit caveats about alpha limitations.
- `apps/docs-site/docs/reference/state-and-folders.md` — canonical sensitive path map for profile state, auth, layout, workspaces, app state, and logs.
- `docs/security/gateway.md` — detailed gateway threat model, token handling, limits, and verification checklist.
- `plugins/sero-user-feedback-plugin/extension/permission-gate.ts` — actual permission-gate behavior for dangerous `bash` commands.
- `plugins/sero-user-feedback-plugin/extension/index.ts` — user-feedback tool surface and how permission gate is registered alongside question/questionnaire/interview tools.
- `plugins/sero-admin-plugin/extension/index.ts` — admin surface is UI-only, not an agent tool.
- `plugins/sero-mcp-plugin/README.md` — MCP plugin intentionally keeps agent-facing surface small: one bridged tool (`mcp`) and one UI-only tool (`mcp_manager`).
- `plugins/sero-mcp-plugin/extension/index.ts` — runtime wiring confirms `mcp` is bridged and management stays behind the UI/runtime.
- `apps/desktop/electron/platform/security/window-security.ts` — main-window navigation/webview/permission hardening.
- `apps/desktop/electron/platform/security/csp.ts` — renderer CSP allowlist and loopback allowances.
- `apps/desktop/electron/main.ts` — app boot security setup, gateway opt-in, CSP + window security installation.
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md` — security docs page is explicitly blocked on the above review and should stay conservative.

## Key Findings

### Public security posture and report process
- Sero is documented as a **source-only OSS alpha**.
- Valid reports are accepted for `main` and current alpha tags best effort; older forks/modified builds are out of scope.
- Private reporting channels are preferred: GitHub private vulnerability reporting/advisories, otherwise `security@sero-ai.dev` with subject `[Sero Security]`.
- Report guidance asks for impact, repro, build/commit context, and whether local/profile/network access or a malicious plugin/workspace is required.
- Reporters are explicitly told **not** to include raw API keys, gateway tokens, OAuth tokens, full auth files, or screenshots that expose secrets/private local paths; redact first if needed.

### Sensitive files / state redaction guidance
- `state-and-folders.md` is the canonical map for what lives under `<SERO_HOME>/agent/`, `<SERO_HOME>/workspaces/`, `<SERO_HOME>/apps/`, and `/tmp` logs.
- Treat these as sensitive and redact them before sharing: auth stores, `.env`, GitHub auth, gateway token/config/web tokens, layout, workspace registry, memory files, app state, and debug/runtime logs.
- The current docs consistently prefer profile-scoped `<SERO_HOME>/agent/...` paths over older `~/.pi/agent` references.
- `security-privacy.md` reinforces that local profiles/local state matter and that logs may contain sensitive workflow info.

### Renderer / browser safeguards that are safe to describe
- `window-security.ts` blocks main-window navigation to untrusted origins; `file:` is allowed, and `http://localhost:5173` is allowed only in development.
- Webviews are hardened: preload is stripped, Node integration is disabled, context isolation is on, sandbox is on, insecure content is blocked, and only the dedicated MCP auth partition is allowed.
- `setWindowOpenHandler` allows opening `http(s)` URLs externally via the OS shell and denies other popups.
- Permission requests are deny-by-default except `media` and `clipboard-sanitized-write`.
- `csp.ts` installs a strict renderer CSP. It allows only narrowly scoped sources, including `sero-ext:` assets, Spotify domains, blob/data, and loopback HTTP/WS sources where needed; production still allows loopback HTTP for embedded auth/viewer rails but not broad remote origins.
- `main.ts` shows these safeguards are installed before the window is shown, after app readiness.

### Permission gate scope and behavior
- `permission-gate.ts` only hooks the `bash` tool, not all tools.
- It looks for a limited set of dangerous patterns: `rm -rf`/recursive delete, `sudo`, `chmod/chown ... 777`, `mkfs`, `dd ... of=`, redirection to `/dev/sd*`, and shutdown/reboot/halt/poweroff.
- It explicitly auto-allows **simple workspace-scoped recursive delete** commands when they parse as a plain `rm -r/-rf` within the current workspace and do not target the workspace root or `.git` paths.
- It blocks shell-control-character / globbed / complex commands from being treated as safe cleanup.
- In Sero mode it uses the IPC user-feedback bridge; in CLI mode it falls back to a TUI warning prompt.
- Approval timeout is 30 seconds in Sero mode; on timeout or cancellation it blocks with an explicit reason.
- Non-interactive mode without UI blocks dangerous commands by default.

### User-feedback tools vs permission gate
- The user-feedback extension registers `question`, `questionnaire`, `interview`, `/interview`, and then the permission gate.
- The question/questionnaire tools are general user-input helpers, not security gates.
- The permission gate is a separate interceptor specifically for dangerous `bash` tool calls.

### Admin and MCP caveats
- Admin extension is intentionally **UI-only** and meant for inspecting configs/sessions/logs; it should not be described as agent-usable or CLI-bridged.
- MCP plugin README says the agent-facing surface is intentionally small: exactly one bridged tool (`mcp`) and one UI-only management tool (`mcp_manager`).
- Do not overclaim MCP as a security boundary; it is about keeping the tool surface limited, not about universal access control or hard isolation.

### Gateway / remote-access caveats
- `docs/security/gateway.md` is explicit that the gateway is **off by default** and only starts with `SERO_GATEWAY=1`.
- An authenticated gateway client has the same effective power as the desktop UI: it can open sessions on any workspace and steer prompts/agent actions.
- Gateway token is profile-scoped, file-permissioned, compared in constant time, and should be treated like a root password.
- The docs call out no rate limiting, no per-workspace access control, no tool restrictions, and risks from Tailscale or Discord exposure.
- Discord access can be fully open if `SERO_DISCORD_USERS` is empty; that is a misconfiguration risk, not a hard boundary.

## What not to claim
- Do **not** claim universal permissions for all tools; the permission gate only covers dangerous `bash` patterns.
- Do **not** claim hardened multi-tenant isolation or cryptographic profile boundaries; docs explicitly frame this as local-first alpha, not a hardened boundary.
- Do **not** claim all tools are gated or that the permission gate is comprehensive.
- Do **not** describe Admin or MCP management surfaces as agent-accessible just because they exist in the app.
- Do **not** overstate gateway safety: authenticated remote clients have desktop-equivalent power and no per-workspace or per-tool restriction.

## Useful phrasing cues for the docs update
- “local-first alpha” / “treat local profile state as sensitive”
- “dangerous bash commands require confirmation” rather than “all dangerous actions are blocked”
- “UI-only management surface” for Admin and MCP management flows
- “gateway is opt-in and powerful; enable carefully”
- “profile-scoped paths and logs should be redacted before sharing”

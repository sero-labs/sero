# Context for: Optional Web Remote docs-site guide/reference

## Relevant Files
- `docs/security/gateway.md` — canonical gateway threat model, caveats, verification steps, and what not to claim.
- `apps/docs-site/docs/reference/security-privacy.md` — public security posture, redaction guidance, local/remote surface notes, gateway caveats, and alpha non-claims.
- `apps/docs-site/docs/reference/state-and-folders.md` — canonical profile/state paths, including gateway token/config/web-token files.
- `apps/docs-site/docs/reference/support-scope.md` — public alpha support limits; useful for keeping Web Remote wording conservative.
- `apps/desktop/electron/main.ts` — gateway is started only when `SERO_GATEWAY=1` is set.
- `apps/desktop/electron/ipc/gateway/gateway.ts` — gateway IPC entrypoints, QR login flow, Tailscale serve hookup, Discord startup.
- `apps/desktop/electron/features/gateway/index.ts` — gateway server lifecycle, localhost binding, auth timeout, origin checks, and request routing.
- `apps/desktop/electron/features/gateway/security/auth.ts` — master token generation/validation and web-token acceptance.
- `apps/desktop/electron/features/gateway/bridge/web-tokens.ts` — scoped web token storage/expiry/revocation and file path.
- `apps/desktop/electron/features/gateway/channels/web.ts` — legacy/basic web chat UI and explicit token-in-URL discouragement.
- `apps/desktop/electron/features/gateway/bridge/tailscale.ts` — `tailscale serve` behavior and tailnet-only exposure.
- `apps/desktop/electron/features/gateway/server/protocol.ts` — supported gateway request types/capabilities.
- `apps/desktop/electron/features/gateway/server/extended-handlers.ts` — file/artifact/session/web-token handling and access checks.
- `apps/desktop/electron/features/gateway/server/access-control.ts` — workspace/session/artifact scoping model.
- `apps/desktop/electron/features/gateway/server/request-handler.ts` — gateway prompt/steer/abort/status/list operations and idempotency handling.
- `apps/desktop/src/components/layout/device/ConnectDeviceDialog.tsx` — renderer wording for pairing a remote device and QR login URL generation.

## Key Findings
- The gateway is explicitly **off by default** and only auto-starts when `SERO_GATEWAY=1` is present in the desktop process environment.
- Gateway server binds to `127.0.0.1` by default; HTTP serves on port `18800` and a legacy/basic web UI can also run on `18801`.
- The gateway can expose the service to Tailscale via `tailscale serve`; source and docs both stress **tailnet-only**, not public funneling.
- Discord integration exists, but public docs must be careful: access depends on `SERO_DISCORD_USERS`, and an empty allowlist is risky because any DM/mention-capable user may interact.
- Authentication supports:
  - a profile-scoped master token from `<SERO_HOME>/agent/gateway-token`
  - scoped web tokens from `<SERO_HOME>/agent/gateway-web-tokens.json`
- Web tokens may be either restricted to explicit workspace IDs or unrestricted owner tokens (`workspaceIds: null`), with a default expiry of 7 days and a max of 10 active tokens.
- QR/device pairing flow is implemented in the renderer via `getQrLoginData()`: it creates a time-limited web token, optionally calls `tailscale.serve(port)`, and returns a login URL plus QR code data.
- The docs-site can safely say a paired device gets profile-wide access to current and future workspaces, because the renderer copy and gateway auth model both say that. It should still avoid overclaiming stronger security boundaries.
- Supported authenticated gateway actions confirmed in protocol/source:
  - `prompt`, `steer`, `abort`
  - `status`
  - `list_workspaces`, `list_sessions`, `create_session`
  - `list_files`, `read_file`
  - `list_artifacts`, `get_artifact`
  - `get_session_history`
  - `create_web_token`, `list_web_tokens`, `revoke_web_token`
- Workspace/session/artifact scope is enforced in code, but only at the gateway access-scope level. A master-auth client can access all workspaces; scoped web tokens can limit to specific workspace IDs.
- `docs/security/gateway.md` explicitly states there is **no per-workspace access control** for authenticated gateway clients, **no rate limiting**, and **no gateway-specific tool restrictions** beyond the normal agent/tool behavior.
- The gateway request handler uses an auth timeout (10s unauthenticated), origin validation, per-IP and total connection limits, and timing-safe token comparison.
- Token handling is sensitive:
  - the master token file is profile-scoped
  - web tokens are stored separately in profile config
  - docs/security warns token URLs are discouraged because they can leak through history, screenshots, and referrers
- Current source logs a token preview/path hint when loading or generating the master token; do not describe this as full secret redaction.

## Wording to Keep Conservative
- Say “optional”, “local-first”, “profile-scoped”, and “tailnet-only when using Tailscale”; avoid language implying hardened remote access.
- Describe Web Remote as a gateway/web chat/pairing surface, not a production remote-admin product.
- Avoid claiming:
  - hardened remote access or multi-tenant security
  - per-workspace or per-tool permissions beyond the current auth scope model
  - public internet exposure safety
  - stable public API guarantees
  - rate limiting
  - production deployment support
  - container isolation as a complete security boundary
- Prefer “current alpha” / “source-only OSS alpha” framing from the security and support docs.

## Links to Reuse
- Security / Privacy: `/reference/security-privacy`
- State and Folders: `/reference/state-and-folders`
- Support Scope: `/reference/support-scope`

## Gotchas
- `ConnectDeviceDialog` currently says pairing signs the device into the profile “with access to all current workspaces and any new workspaces you create later”; this is accurate for the owner/web-token pairing flow, but public docs should still avoid implying the setup is a hardened security boundary.
- The gateway has both master tokens and scoped web tokens; docs should distinguish them clearly.
- Legacy/basic web chat still exists, but the bundled web remote SPA is the primary UI owner.
- Keep all path references profile-scoped (`<SERO_HOME>/agent/...`) rather than `~/.pi/agent`.

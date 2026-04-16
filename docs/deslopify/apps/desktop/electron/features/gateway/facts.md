# Facts — apps/desktop/electron/features/gateway

_Last reviewed: 2026-04-16_

## What this code does
This feature is Sero's remote-access gateway. It owns the WebSocket/HTTP server, gateway auth token handling, request validation/routing, per-session cost tracking, Discord and web chat adapters, Tailscale exposure, QR-code generation, and the bridge that forwards agent-pool events back to remote clients.

## Shape & metrics
- Total files: 19
- Largest file: `apps/desktop/electron/features/gateway/index.ts` (497 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC):
  - `apps/desktop/electron/features/gateway/index.ts` (497)
  - `apps/desktop/electron/features/gateway/channels/discord.ts` (464)
- Generated assets in scope: `apps/desktop/electron/features/gateway/web-dist/index.html` plus bundled `web-dist/assets/*`
- External dependencies of note: `ws`, `http`, Electron `net`/`nativeImage`, `qrcode`, dynamic `discord.js`, Tailscale CLI, filesystem-backed auth/config stores
- Upstream callers: `apps/desktop/electron/shared/infra/shared-infra.ts`, `apps/desktop/electron/ipc/gateway/gateway.ts`, `apps/desktop/electron/ipc/gateway/gateway-ops.ts`, `apps/desktop/electron/ipc/agent/core/agent.ts`, build/packaging scripts
- Downstream dependencies: remote prompt routing, gateway settings UI, Discord bot access, web remote SPA/basic HTML, Tailscale publishing, agent event streaming

## Architectural notes
- This feature is an external network boundary, not an internal helper. Type validation, auth scope, and failure semantics are materially more important here than in ordinary in-process modules.
- The flat gateway token model is still explicitly called out as open security debt in `docs/security/outstanding-hardening.md` and the in-code TODO in `security/auth.ts`.
- The feature currently ships two remote UI surfaces: an inline minimal web chat (`channels/web.ts`) and a bundled SPA under `web-dist/`, plus a `/basic` fallback route in `index.ts`.
- Discord integration now subscribes through a formal gateway event-listener seam in `bridge/agent-bridge.ts` rather than rewriting `GatewayServer` methods at runtime.

## Runtime-sensitive surfaces
- Auth scope and request validation are security-critical: remote clients can list workspaces, open sessions, read files, and fetch history through this boundary.
- The agent-bridge/cost-tracker path must preserve prompt success-path semantics while preventing duplicate execution and runaway spend.
- Static asset serving and web remote behavior must work in dev, packaged builds, and Tailscale-exposed paths.
- Discord image delivery depends on Electron/Chromium networking and `nativeImage` downscaling; transport changes need real-world verification.

## Surprising discoveries
- The gateway originally used a flat access model where any valid token reached any workspace; this was replaced with scoped workspace tokens in `4350404d`, while the master-token hardening TODO remains open.
- `/sero abort` in the Discord adapter only sent a reply and never called `agentOps.abort()` before the 2026-04-12 hardening pass (resolved).
- `validateRequest()` previously checked only the `type` field before force-casting payloads; this was closed in `19242c02` (tracker synced 2026-04-16).
- Malformed `gateway-config.json` previously got overwritten with defaults on load; this was fixed in `fc8558ed` (2026-04-16).

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 19 (was 18)
- Largest file: `apps/desktop/electron/features/gateway/index.ts` (489 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 3 (all outside the High-priority auth/abort paths)

### What changed
- Added `server/access-control.ts` and threaded workspace/session/artifact authorization through gateway request handling.
- Web tokens are now scoped to explicit workspace IDs, and QR pairing in the desktop UI creates workspace-scoped tokens through preload + IPC.
- `gateway-ops` now validates that an existing session belongs to the requested workspace before reopening it.
- Discord `/sero abort` now calls `agentOps.abort()` and reports failures honestly.

### Still outstanding
- Request validation is still type-tag-only and needs real per-request schemas.
- Discord still subscribes via gateway method monkey-patching, and static-file serving is still synchronous on the hot path.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 19 (unchanged)
- Largest file: `apps/desktop/electron/features/gateway/index.ts` (495 LOC, was 489 at the first post-fix snapshot)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 3 (unchanged in this pass)

### What changed
- Closed a stale tracker row by confirming `validateRequest()` already performs per-request payload shaping/guards (landed previously in `19242c02`).
- Switched cost-config loading in `server/cost-tracker.ts` to a result-shaped read path so malformed/unreadable files now log an explicit error and fall back to defaults without overwriting the source.

### Still outstanding
- Discord still subscribes via gateway method monkey-patching instead of a formal event-listener API.
- Static-file serving still performs synchronous filesystem checks on request-time paths.
- The feature still carries dual web UI ownership (`channels/web.ts` inline UI + bundled `web-dist/` SPA).

## Post-fix snapshot — 2026-04-16 (gateway follow-up pass)

### Metrics after fixes
- Total files: 19 (unchanged)
- Largest file: `apps/desktop/electron/features/gateway/index.ts` (497 LOC, was 495 in the prior snapshot)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 1 (`chromiumFetch` response compatibility cast in `channels/discord.ts`)

### What changed
- Added a formal gateway event-listener subscription seam in `bridge/agent-bridge.ts`, and switched the Discord adapter to use that seam instead of monkey-patching `GatewayServer` methods.
- Removed the Discord adapter's remaining easy type escapes/non-null assertions in message routing (`sendTyping` guard + mention handling).
- Reworked static-file serving so `web-dist` resolution and file-manifest discovery are primed once at startup, with request-time lookups served from cached metadata instead of repeated `existsSync`/`statSync` checks.
- Added focused regression coverage for the new event-listener bridge and static-file cache/fallback behavior.

### Still outstanding
- The feature still carries dual web UI ownership (`channels/web.ts` inline UI + bundled `web-dist/` SPA).
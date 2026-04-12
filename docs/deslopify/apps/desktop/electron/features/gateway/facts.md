# Facts — apps/desktop/electron/features/gateway

_Last reviewed: 2026-04-12_

## What this code does
This feature is Sero's remote-access gateway. It owns the WebSocket/HTTP server, gateway auth token handling, request validation/routing, per-session cost tracking, Discord and web chat adapters, Tailscale exposure, QR-code generation, and the bridge that forwards agent-pool events back to remote clients.

## Shape & metrics
- Total files: 18
- Largest file: `apps/desktop/electron/features/gateway/index.ts` (488 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC):
  - `apps/desktop/electron/features/gateway/index.ts` (488)
  - `apps/desktop/electron/features/gateway/channels/discord.ts` (470)
- Generated assets in scope: `apps/desktop/electron/features/gateway/web-dist/index.html` plus bundled `web-dist/assets/*`
- External dependencies of note: `ws`, `http`, Electron `net`/`nativeImage`, `qrcode`, dynamic `discord.js`, Tailscale CLI, filesystem-backed auth/config stores
- Upstream callers: `apps/desktop/electron/shared/infra/shared-infra.ts`, `apps/desktop/electron/ipc/gateway/gateway.ts`, `apps/desktop/electron/ipc/gateway/gateway-ops.ts`, `apps/desktop/electron/ipc/agent/core/agent.ts`, build/packaging scripts
- Downstream dependencies: remote prompt routing, gateway settings UI, Discord bot access, web remote SPA/basic HTML, Tailscale publishing, agent event streaming

## Architectural notes
- This feature is an external network boundary, not an internal helper. Type validation, auth scope, and failure semantics are materially more important here than in ordinary in-process modules.
- The flat gateway token model is still explicitly called out as open security debt in `docs/security/outstanding-hardening.md` and the in-code TODO in `security/auth.ts`.
- The feature currently ships two remote UI surfaces: an inline minimal web chat (`channels/web.ts`) and a bundled SPA under `web-dist/`, plus a `/basic` fallback route in `index.ts`.
- Discord integration currently subscribes to gateway events by monkey-patching `GatewayServer` methods rather than using a formal event listener contract.

## Runtime-sensitive surfaces
- Auth scope and request validation are security-critical: remote clients can list workspaces, open sessions, read files, and fetch history through this boundary.
- The agent-bridge/cost-tracker path must preserve prompt success-path semantics while preventing duplicate execution and runaway spend.
- Static asset serving and web remote behavior must work in dev, packaged builds, and Tailscale-exposed paths.
- Discord image delivery depends on Electron/Chromium networking and `nativeImage` downscaling; transport changes need real-world verification.

## Surprising discoveries
- The gateway still documents and implements a flat access model where any valid token can reach any workspace.
- `/sero abort` in the Discord adapter only sends a reply; it never actually calls `agentOps.abort()`.
- `validateRequest()` only checks the `type` field and then casts the rest of the untrusted payload wholesale.
- Malformed `gateway-config.json` currently gets overwritten with defaults on the next load, mirroring the same config-clobber pattern already found elsewhere in the monorepo.

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

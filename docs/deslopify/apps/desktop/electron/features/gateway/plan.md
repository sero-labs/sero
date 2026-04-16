# Refactoring Plan — apps/desktop/electron/features/gateway

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/features/gateway` is doing important work and already has some hardening in place, but it still carries meaningful external-boundary debt. The top priorities are straightforward: the flat workspace access model is still open, and the Discord abort command is currently broken. After that, the biggest wins are to replace the current type-cast request validation with a real schema boundary, stop clobbering malformed gateway config on load, and reduce the brittle coupling between the Discord adapter and the core server.

## Issues Found (prioritized)
- **High** — Gateway auth is still flat-scoped across all workspaces and sessions — `apps/desktop/electron/features/gateway/security/auth.ts:7-10` still documents the open security debt, while `apps/desktop/electron/features/gateway/server/request-handler.ts:122,182-202` and `apps/desktop/electron/features/gateway/server/extended-handlers.ts:32-87,141-142` trust client-supplied `workspaceId` for prompt/session/file/history routes. For an external network boundary, this is the most important unresolved gateway issue. Effort: **L**.
- **High** — Discord `/sero abort` is a no-op — `apps/desktop/electron/features/gateway/channels/discord.ts:242-249` replies “Aborting current task...” but never calls `this.agentOps.abort(session.sessionId)`. That is an active behavior bug in a user-facing remote-control path. Effort: **S**.
- **Medium** — Request validation only checks `type` and then force-casts the payload — `apps/desktop/electron/features/gateway/server/protocol.ts:217-221` returns `obj as unknown as GatewayRequest` after validating just one field. Every other property on this untrusted WebSocket boundary stays unchecked until deeper callsites. Effort: **M**.
- **Medium** — Malformed gateway cost config is silently overwritten with defaults — `apps/desktop/electron/features/gateway/server/cost-tracker.ts:233-251` catches any read/parse failure and immediately writes `DEFAULT_LIMITS`. That destroys evidence of operator mistakes and can silently widen spend limits back to defaults. Effort: **S**.
- **Medium** — Discord event subscription relies on monkey-patching `GatewayServer` methods — `apps/desktop/electron/features/gateway/channels/discord.ts:283-301` replaces `broadcastEvent` and `pushEvent` at runtime instead of subscribing through a formal event sink/listener contract. That is brittle cross-module coupling in a feature that already has a dedicated bridge layer. Effort: **M**.
- **Medium** — Static asset serving does synchronous filesystem checks on every request in the Electron main process — `apps/desktop/electron/features/gateway/server/static-files.ts:29-81` uses `existsSync` and `statSync` repeatedly before streaming. It works today, but this is still event-loop blocking on an externally reachable path. Effort: **S**.
- **Low** — The gateway feature now carries duplicated remote UI ownership — `apps/desktop/electron/features/gateway/channels/web.ts:1-284` maintains a fully inline web chat UI while `apps/desktop/electron/features/gateway/web-dist/index.html` and `web-dist/assets/*` ship the bundled SPA used by the primary remote flow. Keeping both surfaces in the same feature increases drift and review noise. Effort: **M**.

## Proposed Refactoring
1. **Land workspace-scoped auth for the gateway.**
   - Follow the existing security-hardening recommendation: introduce scoped tokens (or equivalent stored scope) and carry the authorized workspace set on the connected client record.
   - Enforce that scope in both `request-handler.ts` and `extended-handlers.ts` before delegating to `agentOps`.
   - Filter `list_workspaces` to only authorized scopes instead of exposing the full registry.
   - This is a real behavior change and needs explicit rollout/verification.

2. **Fix Discord abort immediately.**
   - In the `/sero abort` command path, call `this.agentOps.abort(session.sessionId)` before replying success.
   - Handle the “no active session” and “abort failed” paths explicitly so Discord users get truthful feedback.

3. **Replace cast-based request validation with a real schema boundary.**
   - Add request-shaped validators per message type (Zod or equivalent narrow guards).
   - Validate required fields like `workspaceId`, `sessionId`, `text`, token metadata, and file paths before routing.
   - Keep `GatewayRequest` as the typed union, but only after payloads have been proven to match it.

4. **Make gateway config loading non-destructive.**
   - Return a result-shaped read (`ok/value` vs `ok/error`) from cost-config loading.
   - On malformed JSON, surface an explicit gateway config error and keep the file untouched instead of overwriting it with defaults.
   - Align this with the broader monorepo push toward non-destructive config parsing.

5. **Replace Discord monkey-patching with a formal event-listener API.**
   - Expose a listener/subscription API from `GatewayServer` or reuse the existing bridge layer so adapters can subscribe without rewriting server methods.
   - Fold the current `pushEvent`/`broadcastEvent` interception into one explicit event fan-out path.
   - While touching this area, remove the remaining type escapes/non-null assertions in the adapter (`as any`, `this.client!.user!`) where practical.

6. **Move static-file resolution off the synchronous hot path.**
   - Resolve `webDistDir` once at startup and cache it.
   - Replace repeated `existsSync`/`statSync` request-time checks with async or precomputed asset handling where practical.
   - Preserve current dev vs packaged fallback behavior used by the build scripts.

7. **Choose one primary remote-web ownership model.**
   - Keep `/basic` only as a deliberate fallback with minimal maintenance burden, or retire the inline UI if the SPA is now the real product surface.
   - Document the chosen ownership so future gateway work does not accidentally duplicate both paths.

## Benefits & Trade-offs
- Benefits: materially better remote-access safety, a fixed Discord control path, stronger validation on an untrusted boundary, and lower coupling between the Discord adapter and the core server.
- Trade-offs: workspace-scoped auth is not a cosmetic refactor; it changes how tokens are issued, stored, and validated, and it will touch IPC/UI tooling that displays gateway credentials.

## Dependencies & Risks
- Workspace-scoped auth must land together with token management/UI changes or remote clients will be stranded between formats.
- Tightening request validation can reject payloads that older clients currently send; include compatibility notes if external clients exist beyond the repo.
- Refactoring Discord subscriptions must preserve current gateway event delivery order for streamed text and image attachments.
- Static-file serving changes must be tested in dev, packaged builds, and Tailscale-exposed flows because the current relative fallback logic is subtle.

## Next Steps
1. ~~Fix `/sero abort` first.~~ ✅ 2026-04-12 (`4350404d`)
2. ~~Implement workspace-scoped gateway auth and enforce it across all request routes.~~ ✅ 2026-04-12 (`4350404d`)
3. ~~Replace cast-based request validation with per-request schemas/guards.~~ ✅ 2026-04-12 (`19242c02`) — tracker row synced 2026-04-16
4. ~~Make cost-config loading non-destructive.~~ ✅ 2026-04-16 (`fc8558ed`)
5. ~~Replace Discord monkey-patching with a formal subscription API.~~ ✅ 2026-04-16 (`32320672`)
6. ~~Move static-file resolution off the synchronous hot path.~~ ✅ 2026-04-16 (`32320672`)
7. Choose one primary remote-web ownership model.
8. Verification checklist:
   - Connect via web token and confirm only authorized workspaces/sessions/files are visible.
   - Prompt, steer, abort, list files, and fetch session history from an authorized workspace.
   - Verify `/sero abort` actually stops an in-flight Discord task.
   - Start the web remote in dev, packaged, and Tailscale-served modes and confirm static assets still load.
   - Corrupt `gateway-config.json` intentionally and verify the app surfaces the error without overwriting the file.

## Execution log
- 2026-04-12 — `4350404d` — `fix(desktop): harden wave d high-priority runtime paths`
  - Scoped gateway web tokens to explicit workspace IDs, threaded those scopes through connection auth, and enforced them across workspace/session/artifact request routes.
  - Fixed Discord `/sero abort` so it now calls `agentOps.abort()` and reports failures honestly.
- 2026-04-16 — tracker sync — `19242c02` — `Wave D — Follow-ups — Gateway Scope, Recovery UX, and Coverage (#136)`
  - Confirmed the request-validation Medium item was already landed: `validateRequest()` now performs per-request payload shaping/guards instead of type-tag-only casting.
- 2026-04-16 — `fc8558ed` — `fix(gateway): avoid overwriting malformed cost config`
  - Switched gateway cost-config loading to a result-shaped reader that preserves malformed/unreadable files and falls back to defaults without clobbering operator data.
  - Added focused gateway cost-tracker coverage for malformed-config preservation and first-run default persistence.
- 2026-04-16 — `32320672` — `refactor(gateway): formalize discord event subscription and static asset cache`
  - Replaced Discord gateway method monkey-patching with a formal event-listener subscription seam in `bridge/agent-bridge.ts`.
  - Removed Discord adapter non-null/type-escape leftovers touched by that seam (`sendTyping` guard + mention checks).
  - Primed and cached static `web-dist` metadata once at startup, removing request-time `existsSync`/`statSync` checks.
  - Added focused tests for event-listener fan-out and static-file cache fallback behavior.

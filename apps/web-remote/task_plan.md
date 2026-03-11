# Web Remote Fixes & Features — Task Plan

## Goal
Fix 6 issues/features in `apps/web-remote/` — the Sero Remote web SPA that connects to the gateway.

## Status: `complete` ✅

All 6 phases implemented, all typechecks pass (25/25 packages), all files ≤500 LOC.

---

## Phase 1: Session titles in sidebar ✅
**Files touched:**
- `apps/desktop/electron/gateway/types.ts` — added `firstMessage` to listSessions return
- `apps/desktop/electron/ipc/agent.ts` — included `firstMessage` in listSessions response
- `apps/web-remote/src/stores/workspace.ts` — added `firstMessage` to Session type
- `apps/web-remote/src/components/WorkspacePicker.tsx` — show `name || firstMessage || id`

## Phase 2: Load session history on select ✅
**Files touched:**
- `apps/desktop/electron/gateway/protocol.ts` — added `get_session_history` request type
- `apps/desktop/electron/gateway/types.ts` — added `getSessionHistory` op
- `apps/desktop/electron/gateway/extended-handlers.ts` — added handler
- `apps/desktop/electron/ipc/gateway-ops.ts` — NEW: extracted file/session ops
- `apps/desktop/electron/ipc/gateway-history.ts` — NEW: `convertToGatewayHistory` helper
- `apps/web-remote/src/lib/gateway-client.ts` — added `requestSessionHistory()`
- `apps/web-remote/src/stores/chat.ts` — `loadHistory()`, handles history response
- `apps/web-remote/src/stores/workspace.ts` — triggers history load on session select
- `apps/web-remote/src/components/WorkspacePicker.tsx` — calls `loadHistory` on click

## Phase 3: Fix file tree loading ✅
**Root cause:** `listFiles`, `readFile`, `listArtifacts`, `getArtifact`, `createSession` were MISSING from `installGatewayAgentOps`. Extended handlers called them but they didn't exist.
**Files touched:**
- `apps/desktop/electron/ipc/gateway-ops.ts` — implemented all missing ops
- `apps/desktop/electron/gateway/extended-handlers.ts` — include path in list_files response
- `apps/web-remote/src/stores/files.ts` — handle new `{path, entries}` response format

## Phase 4: Fix tool call ordering ✅
**Root cause:** `messages[]` and `toolCalls[]` were separate arrays, rendering tool calls at bottom.
**Fix:** Added `toolCalls` field to `ChatMessage`, interleaved via `renderItems` computed from store.
**Files touched:**
- `apps/web-remote/src/stores/chat.ts` — `ChatRenderItem` type, `buildRenderItems()`, attach tools at `agent_end`
- `apps/web-remote/src/components/ChatPanel.tsx` — render from `renderItems` instead of manual interleaving

## Phase 5: Image sending support ✅
**Files touched:**
- `apps/desktop/electron/gateway/protocol.ts` — added `images` to `GatewayPromptRequest`
- `apps/desktop/electron/gateway/types.ts` — added images param to `prompt()`
- `apps/desktop/electron/gateway/request-handler.ts` — pass images through
- `apps/desktop/electron/ipc/agent.ts` — gateway prompt op passes images to `session.prompt()`
- `apps/web-remote/src/lib/gateway-client.ts` — `sendPrompt()` accepts images
- `apps/web-remote/src/stores/chat.ts` — `sendMessage()` accepts images
- `apps/web-remote/src/components/ChatPanel.tsx` — paste handler, file picker, thumbnails

## Phase 6: QR code mobile auth ✅
**Files touched:**
- `apps/desktop/electron/gateway/qr-page.ts` — NEW: inline QR code HTML generator
- `apps/desktop/electron/gateway/index.ts` — `/qr?master=<token>` HTTP endpoint
- `apps/web-remote/src/stores/connection.ts` — auto-reads `?token=` from URL params

---

## Files Created
| File | Lines | Purpose |
|------|-------|---------|
| `electron/ipc/gateway-ops.ts` | 118 | Gateway file/session operations |
| `electron/ipc/gateway-history.ts` | 66 | ChatMessage → gateway history converter |
| `electron/gateway/qr-page.ts` | 464 | QR code login page HTML generator |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| `setSessionName` not on SessionManager | Fixed: removed call, name set later when session opens |

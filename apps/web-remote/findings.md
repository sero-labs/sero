# Web Remote — Findings

## Architecture
- Web remote connects to gateway via WebSocket on port 18800
- Gateway runs in Electron main process, bridges to agent session pool
- Protocol: JSON frames — typed requests with `{ type: 'ok', requestType, data }` responses
- Push events for streaming: text_delta, thinking_delta, tool_start, tool_end, agent_start, agent_end
- Auth: master token or web tokens (7-day default, stored encrypted in IndexedDB)

## Key Discovery: Missing Gateway Operations
The `installGatewayAgentOps` in `agent.ts` only installs 6 ops, but `GatewayAgentOps` interface has more.
Specifically, `listFiles` and `readFile` are NOT installed in the ops object — they fall through to
extended-handlers.ts which checks `agentOps.listFiles(...)` — this will throw because the op IS in the
interface but the implementation is missing from the installGatewayAgentOps block.

Actually — checking more carefully: the extended handlers call `agentOps.listFiles()` and `agentOps.readFile()`
and the ops object DOES have more methods added after line 248 (need to verify). The `installGatewayAgentOps`
call may be incomplete — need to add listFiles, readFile, listArtifacts, getArtifact, createSession.

## Key Discovery: Session History Not Available
- No `get_session_history` request type exists
- To load history: need to read the session JSONL file, parse it with SessionManager, convert messages
- The `convertSessionMessages()` helper in agent-helpers.ts already does this conversion
- Can reuse that for gateway history loading

## Key Discovery: Tool Calls Separate From Messages
- `ChatStore` keeps `messages[]` and `toolCalls[]` as separate flat arrays
- No association between which message a tool call belongs to
- ChatPanel tries to interleave but puts all tool calls at the end
- Need to embed tool call refs into the message timeline

## Key Discovery: Images Not Supported in Gateway Protocol
- `GatewayPromptRequest` only has `text: string` — no `images` field
- `AgentSession.prompt()` accepts `{ images: ImageContent[] }` 
- Gateway bridge's `prompt()` only passes text
- Desktop IPC prompt handler converts `ChatAttachment[]` → `ImageContent[]` via `attachmentsToImages()`

## Key Discovery: Web Token System Exists
- `WebTokenManager` in `gateway/web-tokens.ts` already handles creation, validation, revocation
- Gateway protocol already has `create_web_token`, `list_web_tokens`, `revoke_web_token`
- Only master token holders can manage web tokens
- Missing: QR code display, URL-based auto-auth, mobile-friendly flow

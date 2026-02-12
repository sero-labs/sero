# Task Plan: Wire ChatPanel to Pi SDK AgentSession

## Goal
When a session is selected in the sidebar, create a real Pi SDK `AgentSession` in the main process, stream events to the renderer, and display messages + tool calls in the ChatPanel using ai-elements components.

## Current Phase
Phase 1

## Architecture

```
Renderer                              Main Process
──────────────────────                ──────────────────────
ChatPanel.tsx                         electron/ipc/agent.ts
  ↕                                     ↕
stores/agent.ts                       AgentSession (Pi SDK)
  ↕                                     ↕ subscribe()
window.sero.agent  ──invoke──►        IPC handlers
               ◄──webContents.send──  event streaming
```

**Key design:** The main process owns the `AgentSession` singleton. 
- Renderer → Main: `invoke` for commands (open, prompt, abort)
- Main → Renderer: `webContents.send` for streamed events (text deltas, tool calls, etc.)
- Renderer listens via `ipcRenderer.on` and pushes into a Zustand store

**Message model for renderer:** We don't send raw Pi SDK types over IPC. 
Instead, we define a slim `ChatMessage` union that maps Pi events to 
what ai-elements needs: user text, assistant text (streaming), and tool 
calls with input/output/state.

## Phases

### Phase 1: IPC Types for Agent
- [ ] Extend `src/types/ipc.ts` with agent channels and `ChatMessage` types
- [ ] Extend `src/types/electron.d.ts` with `sero.agent` API
- **Status:** pending

### Phase 2: Agent IPC Handlers (main process)
- [ ] Create `electron/ipc/agent.ts`
  - `sero:agent:open` — creates AgentSession for a session path, subscribes to events, streams to renderer
  - `sero:agent:prompt` — sends user message, returns when agent finishes
  - `sero:agent:abort` — aborts current operation
  - `sero:agent:close` — disposes current session
  - Uses AuthStorage + ModelRegistry for API key resolution
  - Hardcoded to claude-opus-4-6 for now
  - cwd = ~/.sero-ui (project working directory for tools)
  - Event subscription maps Pi events → ChatMessage types → webContents.send
- [ ] Register in `electron/ipc/index.ts`
- **Status:** pending

### Phase 3: Preload Bridge
- [ ] Extend preload with `sero.agent.open()`, `.prompt()`, `.abort()`, `.close()`
- [ ] Add `sero.agent.onEvent(callback)` for main→renderer streaming
- **Status:** pending

### Phase 4: Agent Zustand Store
- [ ] Create `src/stores/agent.ts`
  - State: `messages: ChatMessage[]`, `isStreaming`, `error`, `sessionId`
  - Actions: `openSession(path)`, `sendPrompt(text)`, `abort()`
  - Subscribes to `sero.agent.onEvent` and updates messages array
  - Handles streaming text by accumulating deltas into the current assistant message
- **Status:** pending

### Phase 5: Update ChatPanel
- [ ] Replace dummy messages with agent store data
- [ ] Render user messages with `Message` + `MessageContent` + `MessageResponse`
- [ ] Render assistant text with `MessageResponse` (streaming-compatible)
- [ ] Render tool calls with `Tool` + `ToolHeader` + `ToolContent` + `ToolInput` + `ToolOutput`
- [ ] Wire PromptInput to `sendPrompt()`
- [ ] Show empty state when no session selected
- [ ] Show loading/streaming indicator
- **Status:** pending

### Phase 6: Wire Session Selection
- [ ] When activeSessionId changes in sessions store → call agent.openSession()
- [ ] Refresh session list after agent_end (firstMessage/messageCount change)
- **Status:** pending

### Phase 7: Typecheck & Verify
- [ ] `npx tsc --noEmit` passes
- [ ] `node scripts/build-electron.mjs` succeeds
- [ ] End-to-end: select session → type message → see streaming response + tool calls
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Singleton AgentSession in main process | Only one session active at a time; simplifies lifecycle |
| Slim ChatMessage types over IPC (not raw SDK) | SDK types have Dates, circular refs, huge content; renderer needs display-friendly shape |
| webContents.send for streaming (not invoke) | invoke is request-response; streaming needs push from main→renderer |
| AuthStorage default (env vars + ~/.pi/agent/auth.json) | "Use whatever the SDK supports" — no custom auth UI |
| claude-opus-4-6 hardcoded | User's choice for now; model selector comes later |
| cwd = ~/.sero-ui | User's choice for tool working directory |
| ai-elements Tool component for tool calls | Composable, already installed, matches chat UI style |

## Notes
- Pi SDK `_persist()` only flushes to JSONL after an assistant message — our sessions will get real content once agent responds
- `session.messages` gives the full conversation — use on `agent:open` to restore history
- The ToolUIPart state mapping: input-streaming→pending, input-available→running, output-available→completed, output-error→error
- `MessageResponse` handles streaming markdown with `parseIncompleteMarkdown` 

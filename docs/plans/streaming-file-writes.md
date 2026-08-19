# Streaming file writes

Evaluation of how to show a file appearing in real time while the model writes
it, instead of only showing the finished artifact.

Status: evaluation / design. No code changed yet.

## 1. Why nothing streams today

The file content is not in the tool **result**. It is in the tool **arguments**.

The pi harness `write` tool takes `{ path, content }`, and `edit` takes
`{ path, edits: [{ oldText, newText }] }`
(`pi-agent-core/dist/harness/tools/write.d.ts`, `edit.d.ts`). The tool runs only
after the model has finished emitting the whole argument object. Its result is a
short confirmation. So there is no content left to stream by the time the tool
starts.

Sero forwards three tool events in
`apps/desktop/electron/ipc/agent/core/agent-subscription.ts`:

| SDK event | Sero event | Fires when |
| --- | --- | --- |
| `tool_execution_start` | `tool_start` | arguments are already complete |
| `tool_execution_update` | `tool_update` | the tool calls `onUpdate()` mid-run |
| `tool_execution_end` | `tool_end` | the tool returns |

`tool_update` is a real streaming channel, but it carries partial *output*
(`AgentToolUpdateCallback` → `partialResult`). Bash uses it. `write` has no
output to stream. This channel cannot solve the problem.

## 2. What the SDK already gives us

`AssistantMessageEvent` (`pi-ai/dist/types.d.ts`) has a tool-call delta
protocol next to the text one:

```
toolcall_start  { contentIndex, partial }
toolcall_delta  { contentIndex, delta, partial }   // delta = raw partial JSON
toolcall_end    { contentIndex, toolCall, partial }
```

Two things make this directly usable:

**The SDK already repairs the partial JSON for us.** On every delta the
provider adapter runs
`block.arguments = parseStreamingJson(block.partialJson)`
(`pi-ai/dist/api/anthropic-messages.js:474`). `parseStreamingJson` falls back to
the `partial-json` parser and a control-character repair pass, and always returns
an object. So `partial.content[contentIndex].arguments.content` is a live,
growing string. Sero does **not** need to write a partial-JSON parser.

The same call is present in `openai-completions.js`,
`bedrock-converse-stream.js` and `pi-messages.js`, so the behaviour is not
Anthropic-only.

**The events already reach Sero.** `agent-loop.js:222` forwards every
`toolcall_*` event as `message_update`, `agent-session.js:460` passes it through
untouched, and Sero's `session.subscribe` handler already receives
`message_update`. It currently reads only `text_delta` and `thinking_delta` and
drops the rest.

So the gap is one `switch` branch in the main process plus the layers below it.
No SDK change, no fork, no upgrade.

## 3. Design

### 3.1 Main process

In `agent-subscription.ts`, extend the `message_update` case:

- `toolcall_start` — read `ame.partial.content[ame.contentIndex]`, emit a
  `tool_input_start` with the tool name and the key.
- `toolcall_delta` — read the block again, pull the streamable field, emit the
  **appended tail only**.
- `toolcall_end` — emit `tool_input_end` carrying the final `toolCall.id`.

Streamable field per tool:

| Tool | Field |
| --- | --- |
| `write` | `arguments.content` |
| `edit` | `arguments.edits[last].newText` |

Keep the mapping in one small table so a plugin tool can opt in later. Anything
not in the table streams nothing and behaves exactly as it does today.

Two correctness points:

- **`partial` is mutated in place.** `agent-loop.js` emits
  `message: { ...partialMessage }` — a shallow copy, so the content blocks are
  the same objects the adapter keeps mutating. Extract the string synchronously
  inside the handler, before the IPC send.
- **`toolCall.id` is not guaranteed at `toolcall_start`.** Anthropic sets it
  from `content_block.id`; the OpenAI adapter only registers it
  `if (toolCall.id)` (`openai-completions.js:274`). Key the preview on
  `` `${messageIndex}:${contentIndex}` `` and reconcile to the real
  `toolCallId` at `toolcall_end`.

### 3.2 Types

`apps/desktop/src/types/ipc.ts`:

- add `tool_input_start` / `tool_input_delta` / `tool_input_end` to
  `AgentStreamEvent`
- add `isStreamingInput?: boolean` to `ChatToolCallMessage`

Preload (`electron/preload/api/core.ts`) forwards the union, so it needs no
change.

### 3.3 Renderer store

`apps/desktop/src/stores/agent-utils.ts`:

- `tool_input_start` — append a placeholder `ChatToolCallMessage` with
  `state: 'pending'` and `isStreamingInput: true`
- `tool_input_delta` — append the tail to `input.content`, coalesced with the
  existing rAF buffer (`bufferTextDelta` / `scheduleDeltaFlush`), so a file
  write costs one render per frame, not one per token
- `tool_input_end` — set the real `toolCallId`, clear `isStreamingInput`
- `tool_start` — **patch** the existing placeholder instead of appending, so the
  card does not appear twice

Abandoned calls need a sweep: the model can stop mid-tool-call
(`AssistantMessageEvent` ends in `error` with reason `aborted`). Drop any
placeholder still `pending` at `agent_end`.

### 3.4 UI

`ToolCallProgress.tsx` already owns the "Live" card for running tools. Add a
`buildWriteProgress` branch that renders the streaming content in a monospace
pane pinned to the bottom, with the path as the title and a line counter as the
badge. `SingleToolCall` opens expanded while running, so the pane is visible
without a click.

Cap the rendered pane to the last ~200 lines. A 3000-line file re-highlighted
every frame will drop frames; a tail does not.

### 3.5 What NOT to do

**Do not write partial content to disk.** A half-written file triggers file
watchers, LSP re-parses, dev-server reloads and test runs against syntactically
broken source, and leaves corrupt files if the turn aborts. The preview must be
in-memory only. The existing atomic write at `tool_execution_end` stays the sole
writer.

## 4. Scope

| Phase | Work | Files |
| --- | --- | --- |
| 1 | Streaming input plumbing + live pane in the tool card | `agent-subscription.ts`, `types/ipc.ts`, `agent-utils.ts`, `ToolCallProgress.tsx` |
| 2 | Live tab in the explorer editor, driven by the same store state | `apps/desktop/src/components/apps/explorer/editor/` |
| 3 | Web remote parity | `gateway-client.ts`, `web-remote/src/stores/chat.ts` |

Phase 1 is the whole user-visible win and is small. Phase 3 is a separate job:
the gateway push union does not forward `tool_update` today either, so web
remote has no partial tool channel at all.

## 5. Tests

All deterministic, per the repo test rules. No live model needed — a canned
array of `AssistantMessageEvent` values is the input.

- Feed a `toolcall_start` → n × `toolcall_delta` → `toolcall_end` sequence
  through the subscription handler and assert the emitted tails concatenate to
  the final `content`.
- Feed a sequence that aborts before `toolcall_end` and assert no placeholder
  survives `agent_end`.
- Feed deltas that split a UTF-8 escape and a `\n` across chunk boundaries, and
  assert the reassembled string equals the final argument.
- Feed two interleaved tool calls in one assistant message and assert each
  `contentIndex` lands on its own card.
- Store test: `tool_input_start` then `tool_start` produces one message, not two.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| IPC flood — one message per token | Send tails, not snapshots; coalesce on rAF in the store |
| Re-highlight cost on large files | Render a trailing window, full content on completion |
| Provider without argument streaming | Table-driven; falls back to today's behaviour |
| Placeholder leaks on abort | Sweep pending placeholders at `agent_end` |
| Corrupt files | Preview is memory-only; disk write stays atomic at tool end |

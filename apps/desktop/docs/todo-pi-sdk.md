# Pi SDK Integration — Todo

Next phase of Pi SDK integration into Sero, ordered by priority.

## Up Next

- [ ] **Context usage & model info in StatusBar** — Add IPC channel to query
  `getContextUsage()` (tokens / context window / %) and `ctx.model` for the
  focused session. Show token count + model name in StatusBar. Low effort,
  high value.

- [ ] **Tool call rendering improvements** — Forward richer tool details
  through the event stream. Use Pi SDK's typed tool events
  (`BashToolCallEvent`, `EditToolCallEvent`, `ReadToolCallEvent`, etc.) and
  `isToolCallEventType()` helpers. Render bash results with terminal-style
  blocks, edits with mini diff views, reads with syntax-highlighted content.
  Medium effort, high value.

- [ ] **Session branching / forking** — Wire up `AgentSession.newSession()`
  with `parentSession` for conversation forking. Add "Fork from here" action
  on messages in ChatPanel. New branch appears as a session under the same
  workspace. Medium effort, high value.

- [ ] **Auto-compaction events** — Handle `auto_compaction_start` and
  `auto_compaction_end` events from `AgentSession`. Show a brief "Compacting
  context…" indicator in ChatPanel. Low effort, medium value.

- [ ] **Image attachments in PromptInput** — Use `AgentSession.prompt()`'s
  `images` option (`ImageContent[]`). Add drag-and-drop / paste-to-attach in
  PromptInput for multimodal conversations. Medium effort, medium value.

## Deferred

- **Extension UI context** (`ExtensionUIContext`) — `select()`, `confirm()`,
  `input()` dialogs need Electron equivalents. Worth doing but deep rabbit hole.
- **Session tree visualization** — `session_tree` / `session_before_tree`
  events. More useful after branching UI exists.
- **Custom editor component** — Deep TUI integration, not needed yet.
- **`user_bash` events** — Requires xterm.js + node-pty (integrated terminal)
  first.

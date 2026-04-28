# Context for: DSC-009 through DSC-019 source inventory

## Relevant Files
- `apps/desktop/src/components/layout/ChatPromptArea.tsx` — composer wiring for slash commands, @file refs, attachments, workspace snapshot, voice control, context editor, model selector, collaboration toggle, stop/steer, and queued follow-ups.
- `apps/desktop/src/hooks/useChatPromptInput.ts` — submit/steer routing, slash command handling, @file autocomplete, tab completion, collaboration routing.
- `apps/desktop/src/hooks/useMessageQueue.ts` — follow-up queue behavior while streaming.
- `apps/desktop/src/components/layout/ContextEditor.tsx` and `context-editor/*` — session context editor UI.
- `apps/desktop/src/components/layout/VoiceTranscriptionControl.tsx` and `voice-utils.ts` — mic capture + `window.sero.voice` bridge.
- `apps/desktop/electron/ipc/agent/handlers/voice.ts` and `apps/desktop/electron/features/agent/assistants/voice-transcription.ts` — OpenAI transcription status/flow and key resolution.
- `apps/desktop/src/components/layout/WorkspaceSnapshotMenuItem.tsx` — snapshot contents and prefill behavior.
- `apps/desktop/src/components/layout/FileReferenceMenu.tsx` — @file menu UI.
- `apps/desktop/src/components/layout/SlashCommandMenu.tsx` — slash command menu source ordering.
- `apps/desktop/src/components/layout/ChatPanelHelpers.tsx` — collaboration toggle/strategy and memory/thinking/context controls.
- `apps/desktop/electron/features/subagent/**` — subagent discovery, pooling, run modes, no-recursion boundary.
- `apps/desktop/electron/features/collaboration/**` and `apps/desktop/src/components/layout/CollaborationActivityPanel.tsx` — 4-agent collaboration/debate framework and degraded mode.
- `apps/desktop/src/components/apps/dashboard/**`, `apps/desktop/src/stores/dashboard.ts`, `packages/app-runtime/src/widget-registry.ts`, `packages/app-runtime/src/use-widget-registration.ts` — dashboard widgets and runtime registration.
- `apps/desktop/src/components/layout/CheckpointRestoreDialog.tsx`, `apps/desktop/src/hooks/useCheckpointRestore.ts`, `apps/desktop/electron/ipc/agent/core/agent-checkpoint.ts`, `apps/desktop/electron/ipc/integrations/vcs.ts` — checkpoint/undo/VCS restore flow.
- `apps/desktop/electron/ipc/agent/handlers/models.ts`, `local-models.ts`, `model-groups.ts`, `provider-health.ts` (via docs references) — eval/model/provider support touchpoints.
- `apps/desktop/electron/cli/**` (not fully expanded here) — CLI/eval surface, relevant for DSC-013 docs only.
- `packages/app-runtime/src/index.ts` and hook files — author-facing runtime exports.
- `plugins/*/package.json`, `../plugins/*/package.json` — plugin catalog source manifests.

## DSC-009 — Agent sessions / context / voice

### Source-of-truth details
- `ChatPromptArea` shows the actual composer surface: prompt input, attachment action menu, `WorkspaceSnapshotMenuItem`, `ContextEditorMenuItem`, `VoiceTranscriptionControl`, `CollaborationToggle`, `MemoryBlocksToggle`, `ThinkingBlocksToggle`, and `ModelSelector`.
- `useChatPromptInput` handles:
  - built-in slash commands `login` / `logout` (client-side, not sent to agent)
  - slash menu from `useFocusedCommands()`
  - `@file` autocomplete against workspace files
  - Tab completion for file refs
  - submit routing to `sendPrompt` or `sendCollaborationPrompt`
  - while streaming: `⌘/Ctrl` submit becomes a queued follow-up; otherwise it steers with `steerAgent()`
- `useMessageQueue` auto-dequeues and sends the next queued prompt when streaming stops; queue items can be removed before send.
- `WorkspaceSnapshotMenuItem` injects a markdown snapshot with workspace name/root, open editor tabs, and open browser tabs. It explicitly omits git diff/status and terminal history.
- `ContextEditor` is session-scoped, saved with the session, and exposes system prompt, tools, and skills with preset support.
- Voice transcription is local mic capture + `window.sero.voice.status()` and `window.sero.voice.transcribe()`; it appends transcript text to the prompt.
- Voice status is disabled unless OpenAI credentials exist.

### Caveats / mismatches
- Current overview docs still describe chat at a high level and intentionally omit detailed composer controls; DSC-009 is the canonical deep guide.
- `ChatPromptArea`/`useChatPromptInput` imply steering is just sending a new prompt during streaming; docs should not overpromise finer-grained interrupt semantics.
- The snapshot is intentionally partial and excludes git/terminal state.

## DSC-010 — Subagents / collaboration / agent definitions

### Source-of-truth details
- `apps/desktop/electron/features/subagent/index.ts` exports `SubagentManager` with `listAgents()`, `runSingle()`, `runSingleStructured()`, `runParallel()`, `runChain()`, `abortAll()`, `abortOne()`, `snapshot()`, and `clearCompleted()`.
- `SubagentManager` loads agents from `SERO_AGENT_DIR/agents` (`~/.sero-ui/agent/agents` by default via `SERO_AGENT_DIR`), not `~/.pi/agent/`.
- `features/subagent/runtime/discovery.ts` (per rg note) explicitly loads `.md` agent definitions from `~/.sero-ui/agent/agents/`.
- Collaboration engine is in `apps/desktop/electron/features/collaboration/index.ts`:
  - 4-agent flow: researcher → analyst + visionary in parallel → coordinator synthesis
  - degraded mode if required specialist output is missing
  - collaboration has callbacks for phase start, specialist start/end, and status updates
- Collaboration UI source: `CollaborationActivityPanel.tsx`, `CollaborationResponse.tsx`, `collaboration-chat-feed.ts`, `ChatPanelHelpers.tsx`.
- Types involved: `apps/desktop/src/types/subagent.ts`, `apps/desktop/src/types/collaboration.ts`.

### Caveats / mismatches
- Docs should explicitly say subagents cannot recursively spawn subagents; that boundary is enforced by child-session/tool availability, not just UX.
- Collaboration/debate is distinct from ordinary subagent runs; docs should not blur the two.
- Current docs site has no canonical subagent or collaboration pages yet; coverage audit already marks both missing.

## DSC-011 — Dashboard / widgets

### Source-of-truth details
- `Dashboard.tsx` renders a draggable/resizable `react-grid-layout` dashboard and loads widgets from installed app manifests plus runtime registration.
- `AddWidgetDialog.tsx` groups widgets by app and adds them to the grid.
- `WidgetMount.tsx` mounts either manifest widgets or runtime widgets inside `AppProvider`.
- `useRuntimeWidgets.ts` subscribes to `getRuntimeWidgets()` / `onWidgetRegistryChange()` from `@sero-ai/app-runtime`.
- `packages/app-runtime/src/widget-registry.ts` defines runtime widget registry and exports `registerWidget`, `getRuntimeWidgets`, `onWidgetRegistryChange`, `RuntimeWidget`.
- `packages/app-runtime/src/use-widget-registration.ts` registers runtime widgets from app code.
- `apps/desktop/src/stores/dashboard.ts` persists widget instances/layouts through `persistLayout({ dashboardLayout: ... })`.

### Caveats / mismatches
- Widgets are hints, not fixed placements; docs should avoid guaranteeing exact size/placement behavior.
- Dashboard state is profile/layout state, not browser storage.
- Coverage audit says this area is currently missing dedicated docs.

## DSC-012 — Checkpoints / undo / source-control safety

### Source-of-truth details
- `apps/desktop/electron/ipc/agent/core/agent-checkpoint.ts` is the key IPC layer:
  - `undoToTurn()` navigates session tree back to the user entry, restores the VCS checkpoint, invalidates git workspace state, and can re-prefill composer text from the undo result.
  - `restoreLegacyCheckpoint()` restores a checkpoint and may branch the session tree if a matching turn exists.
- `apps/desktop/electron/ipc/integrations/vcs.ts` registers checkpoint/VCS handlers: create, restore, diff, watch/unwatch, status, log entries, bookmarks, remotes, push/pull operations, PR ops, undo, abandon, squash, op log, etc.
- `useCheckpointRestore.ts` and `CheckpointRestoreDialog.tsx` are the renderer entry points for restore flows.

### Caveats / mismatches
- Manual checkpoint restore and turn undo are different operations; docs must keep them distinct.
- Turn undo is both file restore and session-tree rewind; source-control restore is not the same thing.
- Coverage audit currently marks this area partial.

## DSC-013 — Testing / evals

### Source-of-truth details
- `apps/docs-site/docs/reference/testing-evals.md` currently documents the public alpha test model, but it is still centered on `pnpm test`, `pnpm test:ci`, and `pnpm eval:snapshot`.
- Relevant source plan references: `docs/testing/eval-guide.md`, `promptfooconfig.yaml`, `eval/promptfoo-snapshot.yaml`, `eval/scenarios/**`, `package.json`, `apps/desktop/electron/__tests__/**`.
- Docs inventory should also inspect package scripts and promptfoo configs for exact commands and scenario list.

### Caveats / mismatches
- Existing docs explicitly say there is no repo-wide public `turbo run test` contract.
- Eval docs need cost/auth warnings for real provider runs (`pnpm eval`) and should separate snapshot vs live evals.

## DSC-014..DSC-019 — Plugin catalog / built-ins / externals / app-runtime / local dev

### Plugin package/source inventory found

#### Built-in plugins under `plugins/`
- `plugins/sero-admin-plugin/package.json` → `@sero-ai/plugin-admin`
- `plugins/sero-alibaba-plugin/package.json` → `@sero-ai/plugin-alibaba`
- `plugins/sero-cron-plugin/package.json` → `@sero-ai/plugin-cron`
- `plugins/sero-git-plugin/package.json` → `@sero-ai/plugin-git`
- `plugins/sero-mcp-plugin/package.json` → `@sero-ai/plugin-mcp`
- `plugins/sero-memory-plugin/package.json` → `@sero-ai/plugin-memory`
- `plugins/sero-user-feedback-plugin/package.json` → `@sero-ai/plugin-user-feedback`
- `plugins/sero-web-plugin/package.json` → `@sero-ai/plugin-web`

#### External/local plugins under `../plugins/`
- `../plugins/sero-calc-plugin/package.json` → `@sero-ai/plugin-calc`
- `../plugins/sero-daily-quote-plugin/package.json` → `@sero-ai/plugin-daily-quote`
- `../plugins/sero-google-plugin/package.json` → `@sero-ai/plugin-google`
- `../plugins/sero-humanizer-plugin/package.json` → `@sero-ai/plugin-humanizer`
- `../plugins/sero-imagegen-plugin/package.json` → `@sero-ai/plugin-imagegen`
- `../plugins/sero-kanban-plugin/package.json` → `@sero-ai/plugin-kanban`
- `../plugins/sero-notes-plugin/package.json` → `@sero-ai/plugin-notes`
- `../plugins/sero-plan-mode-plugin/package.json` → `@sero-ai/plugin-plan-mode`
- `../plugins/sero-research-plugin/package.json` → `@sero-ai/plugin-research`
- `../plugins/sero-slopzilla-plugin/package.json` → `@sero-ai/plugin-slopzilla`
- `../plugins/sero-spotify-plugin/package.json` → `@sero-ai/plugin-spotify`
- `../plugins/sero-starling-plugin/package.json` → `@sero-ai/plugin-starling`
- `../plugins/sero-tetris-plugin/package.json` → `@sero-ai/plugin-tetris`
- `../plugins/sero-todo-plugin-main/package.json` → `@sero-ai/todo-plugin`
- `../plugins/sero-weight-tracker-plugin/package.json` → `@sero-ai/plugin-weight-tracker`

### app-runtime exports/hook names (DSC-019)
- `packages/app-runtime/src/index.ts` exports:
  - `AppContext`, `AppProvider`, `AppContextValue`
  - `useAppState`
  - `useAppInfo`
  - `useAgentPrompt`
  - `useAI`, `AppAI`
  - `useAppTools`, `AppTools`
  - `useAvailableModels`, `UseAvailableModelsResult`
  - `useTheme`, `UseThemeResult`
  - `getSeroApi`
  - `AppModelInfo`, `AppModelGroup`
  - `AppToolContentBlock`, `AppToolImageContent`, `AppToolResult`, `AppToolTextContent`
  - `registerWidget`, `getRuntimeWidgets`, `onWidgetRegistryChange`
  - `RuntimeWidget`
  - `useWidgetRegistration`
- `useAI()` has `prompt()` and `promptStream()`.
- `useAppTools()` exposes `run(toolName, params?)`.
- `useAppState()` persists via host IPC/watch/write.
- `useWidgetRegistration()` registers runtime widgets for the current renderer session.

### Local plugin dev / app-runtime caveats
- `reference/plugin-author-quick-path.md` still frames app-runtime hooks conservatively and mentions file-backed app state paths; it also points to `useAppState`, `useAppTools`, `useWidgetRegistration`, and `useTheme`.
- `reference/plugins.md` already describes local plugin development distinct from installed plugins and attached folders.
- Current docs mention `SERO_DEV_PLUGINS` only as a dev aid; DSC-019 says it should not be presented as the normal product workflow.
- Some docs already describe widget registration and app-runtime APIs, but `app-runtime` lacks a compact source-of-truth table page.

## Cross-cutting mismatches / caveats
- Several docs still use broad alpha wording; new docs should stay source-checked and avoid claiming stability.
- `~/.pi/agent/` should not appear in public Sero docs; current source/docs consistently prefer `~/.sero-ui/agent/` / `<SERO_HOME>/agent/`.
- Coverage audit at `apps/docs-site/docs/reference/coverage-audit.md` already names missing/partial rows for subagents, collaboration, dashboard widgets, checkpoints, voice/context, and plugins.

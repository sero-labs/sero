# JJ Checkpoint System Plan (Sero)

## Status
- State: In Progress
- Updated: 2026-02-18

## Goal
Implement Cursor/Windsurf/Codex-style workspace checkpoints in Sero, backed by JJ (colocated with Git), so users can restore any prior checkpoint and see rich diffs between checkpoints.

## Locked Decisions
- Checkpoint cadence: `turn_end` (agent turn based) for agent work.
- Capture scope: all file changes, including manual editor changes and terminal changes.
- Capture mechanism for non-agent edits: filesystem watcher + debounce (not fragile tool-event coupling).
- Restore behavior: `jj new <checkpoint-id> -m "restore: <checkpoint-id>"` (restores files exactly, keeps timeline intact).
- Timeline model: one checkpoint timeline per workspace.
- Agent safety policy: block `git` and mutating `jj` in agent bash tool calls; allow read-only `jj`.
- Workspace modes: support both container and host workspaces.
- UI scope for v1: coding sidebar VCS panel + inline restore affordance on user chat messages (no chat checkpoint cards).
- Session switching authority: Sero sidebar is source of truth (no extension-driven session switching flow).

## Implementation Strategy
1. Core JJ backend (main process): init, status, list checkpoints, diff, restore, and eventing.
2. PI extension integration: workspace/session metadata persistence, command guard, turn checkpointing.
3. Non-agent change capture: file-watcher debounce -> checkpoint creation.
4. UI integration: coding VCS panel + user-message checkpoint restore affordance, restore and diff actions.
5. Safety + consistency: editor reload behavior after restore, path/IPC type safety, tests/typecheck.

## Task Tracker

### Phase 0: Planning + Contracts
- [x] Create implementation plan in `docs/plans`.
- [x] Define JJ IPC types/channels in renderer/main contracts (`src/types/vcs.ts`, `src/types/electron.d.ts`, preload + IPC handlers).
- [x] Add execution notes + risk log updates in this file as work progresses.

### Phase 1: JJ Backend (Electron Main)
- [x] Create `apps/desktop/electron/vcs/types.ts` (checkpoint, file change, diff models).
- [x] Create `apps/desktop/electron/vcs/jj-runner.ts` (host/container execution abstraction).
- [x] Create `apps/desktop/electron/vcs/vcs-manager.ts` (workspace-scoped JJ operations).
- [x] Add `apps/desktop/electron/ipc/vcs.ts` handlers.
- [x] Register VCS IPC in `apps/desktop/electron/ipc/index.ts`.
- [x] Replace container init `git init` with JJ colocated init in `apps/desktop/electron/container/lifecycle.ts`.
- [x] Add host-workspace JJ init path (non-container workspaces).

### Phase 2: PI Extension + Checkpoint Hooks
- [x] Extend `apps/desktop/electron/sero-extension.ts` with JJ command guard (`tool_call`).
- [x] Persist workspace/session checkpoint metadata with `pi.appendEntry(...)`.
- [x] Add `turn_end` checkpoint creation (agent-turn checkpoints).
- [x] Add slash commands for checkpoint operations (restore/list/diff bridge where needed).
- [x] Ensure extension avoids TUI-only `ctx.ui.*` behavior and uses Sero-compatible pathways.

### Phase 3: Non-Agent File Change Capture
- [x] Hook file watcher events to debounce checkpoint creation per workspace.
- [x] Add guardrails to avoid checkpoint storms (cooldown + no-op diff skip).
- [x] Ensure both container and host workspaces use same debounce capture behavior.

### Phase 4: Renderer + UX
- [x] Surface extension checkpoint/custom messages in chat history + stream (mapped into assistant-visible messages).
- [x] Remove chat checkpoint card strip from ChatPanel (too noisy).
- [x] Add inline "revert to this point" action on user messages.
- [x] Add restore confirmation dialog with diff-based changed-file preview before applying restore.
- [x] Add coding sidebar VCS panel (replace placeholder source control view).
- [x] Add checkpoint list + restore action + diff entry points in sidebar.
- [x] Add status indicator in `StatusBar` (current checkpoint / drift state).

### Phase 5: Restore Correctness + Reload
- [x] Ensure restore triggers workspace file refresh events.
- [x] Ensure open editor tabs reload/reset correctly after restore.
- [x] Verify file tree and editor cache consistency after restore in both workspace modes (implemented watcher + editor reload hooks; runtime manual QA still pending).

### Phase 6: Validation
- [x] Typecheck affected packages (`apps/desktop` and shared types).
- [x] Attempt test run (`pnpm test -- --run` in `apps/desktop`) — no test files configured.
- [ ] Run targeted manual verification flow:
  - [ ] create/edit files manually -> checkpoint appears
  - [ ] agent turn edits -> checkpoint appears
  - [ ] restore old checkpoint -> disk state matches exactly
  - [ ] diff between two checkpoints renders expected file changes
- [ ] Update this plan’s checklist to final state.

## Progress Log
- 2026-02-18: Plan created.
- 2026-02-18: Implemented core JJ backend (`electron/vcs/*`), VCS IPC + preload bridge, and workspace watcher-based checkpoint capture.
- 2026-02-18: Added PI extension JJ guard + turn checkpoint hooks + `/checkpoint`, `/checkpoints`, `/restore`, `/diffcp`.
- 2026-02-18: Added initial renderer VCS store + coding sidebar VCS panel + chat checkpoint card strip.
- 2026-02-18: Added session metadata persistence (`pi.appendEntry`) and restore-driven editor buffer reload.
- 2026-02-18: Added chat surfacing of extension custom/checkpoint messages and compare-any-two checkpoint diff flow in VCS panel.
- 2026-02-18: Refactored `electron/ipc/agent.ts` under 500 LOC by extracting model/context handlers; added missing `ContainerManager.getEnvVars()`; desktop typecheck now passes.
- 2026-02-18: Added explicit `vcs restored` refresh hook in FileTree for immediate sidebar consistency post-restore.
- 2026-02-18: Ran `pnpm test -- --run` in `apps/desktop`; no tests are currently present (`electron/__tests__/**/*.test.ts` empty).
- 2026-02-18: Removed checkpoint cards from `ChatPanel`; added inline user-message restore icon with tooltip and confirmation modal with diff file summary.
- 2026-02-18: Added transparent checkpoint mapping (no automatic chat chatter) by linking turn checkpoints to user messages in Agent IPC/store flow.

## Risks to Watch
- Chat custom-message fidelity: custom messages are currently surfaced as assistant-formatted messages (not a dedicated renderer type).
- Restore cache invalidation: editor tab content cache must be refreshed explicitly after `jj new <id>` restore.
- Cross-mode execution parity: container and host paths must produce identical JJ semantics.
- Checkpoint noise: FS watcher debounce/cooldown tuning required.

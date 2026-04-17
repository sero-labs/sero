---
title: Chat Turn Undo, Snapshot Separation, and Git Live Refresh Plan
date: 2026-04-17
status: proposed
author: OpenAI
related:
  - apps/desktop/electron/features/apps/extensions/git-checkpoints.ts
  - apps/desktop/electron/ipc/agent/core/agent-checkpoint.ts
  - apps/desktop/electron/ipc/agent/core/agent-messages.ts
  - apps/desktop/electron/ipc/agent/core/agent-subscription.ts
  - apps/desktop/src/components/layout/ChatMessageItem.tsx
  - apps/desktop/src/components/layout/shell/ChatPanel.tsx
  - apps/desktop/src/components/layout/ChatPromptArea.tsx
  - apps/desktop/src/hooks/useCheckpointRestore.ts
  - apps/desktop/electron/features/vcs/core/vcs-manager.ts
  - apps/desktop/electron/features/apps/git-app/manager.ts
  - plugins/sero-git-plugin/ui/GitApp.tsx
---

# Chat Turn Undo, Snapshot Separation, and Git Live Refresh Plan

## Goal

Redesign Sero's current checkpoint/restore behavior so that:

- ChatPanel exposes **Undo this turn** instead of the confusing shifted checkpoint UI
- undo applies to the **same user prompt** the user clicked
- undo restores the workspace to the **pre-turn** state
- undo uses **pi session tree navigation** so the active session rewinds cleanly without hard-deleting history
- the composer is **prefilled with the undone prompt text** for a fast retry/edit flow
- automatic agent undo snapshots are **separated from visible Git history**
- manual VCS checkpoints remain available as a distinct source-control feature
- the Git plugin/app refreshes **automatically without polling**
- auto undo labels and related UX copy are precise and user-friendly

## Locked product decisions

These decisions are considered settled for this implementation plan.

- ChatPanel action becomes **Undo this turn**
- The action appears on the **same user prompt** it will undo
- Undo means:
  - restore the workspace to the **pre-turn** state
  - branch the active session to **before that user prompt** using pi tree navigation
  - prefill the composer with the old prompt text
- We will use **pi session tree navigation** instead of hard-deleting abandoned session entries
- Hard-pruning/rebuilding session files is **out of scope** for this work
- Automatic turn undo storage should be **internal**, not normal visible Git history
- Manual checkpoints stay in Source Control / VCS flows as a separate concept
- Git app refresh should be **event-driven + watch-based**, with **no polling fallback**
- Chat undo labels should be derived from mutation/user intent, **not** assistant first-line truncation

## Non-goals

- Hard-delete abandoned branches from session JSONL files
- Redesign the entire Source Control panel in the same change set
- Replace manual VCS checkpointing with the new undo mechanism
- Ship speculative session-file rewriting outside supported pi APIs

## Phase rules

Every phase should be shippable on its own.

A phase is only complete when all of the following are true:

- focused unit tests for touched areas pass
- `pnpm typecheck` passes from the monorepo root
- a manual smoke pass for the affected UX is complete
- touched source files remain under the 500 LOC limit
- tasks in this document have been marked as complete
- the phase lands in its own commit

---

# Phase 1 — Lay the undo plumbing and split the concepts

**Goal:** Introduce the new contracts and composer-prefill plumbing without changing the live undo behavior yet.

## Tasks

- [x] Introduce a dedicated renderer/main-process type for **chat turn undo refs** so chat no longer overloads generic checkpoint semantics.
- [x] Add dedicated session-scoped **composer prefill** state in the renderer store.
- [x] Teach `useChatPromptInput()` / `ChatPromptArea` to accept an external draft, populate the textarea, and focus it when applied.
- [x] Add IPC/event plumbing for main-process-driven composer prefill.
- [x] Split the current mixed-responsibility checkpoint module into clearer responsibilities:
  - [x] manual VCS checkpoint commands / restore / diff
  - [x] future auto turn-undo capture logic
- [x] Preserve current end-user checkpoint behavior during this phase; this is infrastructure only.
- [x] Keep touched files under the LOC cap by splitting instead of expanding existing near-cap files.

## Likely files

- `apps/desktop/src/types/checkpoints.ts` or new `apps/desktop/src/types/turn-undo.ts`
- `apps/desktop/src/types/{agent.ts,ipc.ts,electron.d.ts,ipc-channels.ts}`
- `apps/desktop/electron/preload/api/core.ts`
- `apps/desktop/src/stores/{agent-types.ts,agent.ts,agent-utils.ts}`
- `apps/desktop/src/hooks/useChatPromptInput.ts`
- `apps/desktop/src/components/layout/ChatPromptArea.tsx`
- `apps/desktop/electron/features/apps/extensions/git-checkpoints.ts` or extracted successor modules

## Tests

- [x] Add/update unit tests for external composer prefill lifecycle.
- [x] Add/update store tests for setting/clearing session-scoped composer drafts.
- [x] Add regression coverage proving manual `/checkpoint`, `/checkpoints`, `/restore`, and `/diffcp` behavior is unchanged.

## Validation

- [x] Run focused desktop unit tests for touched files.
- [x] Run `pnpm typecheck`.
- [x] Commit.

**Suggested commit:** `refactor(desktop): add turn-undo plumbing and composer prefill support`

---

# Phase 2 — Ship true same-turn ChatPanel undo

**Goal:** Deliver the new user-visible behavior: **Undo this turn** on the same prompt, with pi tree navigation and composer prefill.

## Tasks

- [x] Replace the shifted “next prompt gets previous checkpoint” mapping with **same-turn undo attachment**.
- [x] Stop using `lastCompletedCheckpoint` / `user_checkpoint` for ChatPanel undo.
- [x] Introduce a dedicated session custom entry for turn undo metadata, e.g. `turn-undo`, carrying:
  - [x] `workspaceId`
  - [x] internal snapshot id
  - [x] target user entry id
  - [x] user-facing label
  - [x] timestamp
- [x] Update session-to-chat mapping so the undo ref attaches to the **same user message** that will be undone.
- [x] Add a new main-process IPC handler, e.g. `undoToTurn(sessionId, undoRef)` that:
  - [x] restores the workspace to the stored pre-turn snapshot
  - [x] calls `session.navigateTree(userEntryId, { summarize: false })`
  - [x] rebuilds messages and sends `messages_loaded`
  - [x] uses returned `editorText` to prefill the composer
- [x] Update ChatPanel copy:
  - [x] button tooltip/label becomes `Undo this turn`
  - [x] dialog title/body becomes undo-focused rather than checkpoint-focused
- [x] Reuse the existing diff-preview pattern, but make it preview the files that will be undone.
- [x] Define legacy behavior explicitly:
  - [x] old `git-checkpoint` turn entries are not reinterpreted as new-style same-turn undo entries
  - [x] inline ChatPanel undo appears only for new `turn-undo` entries

## Likely files

- `apps/desktop/electron/features/apps/extensions/...` new or extracted turn-undo module
- `apps/desktop/electron/ipc/agent/core/{agent-checkpoint.ts,agent-messages.ts,agent-subscription.ts,agent-prompt.ts,agent-session-open.ts}`
- `apps/desktop/src/components/layout/{ChatMessageItem.tsx,CheckpointRestoreDialog.tsx}`
- `apps/desktop/src/components/layout/shell/ChatPanel.tsx`
- `apps/desktop/src/hooks/useCheckpointRestore.ts` (likely renamed/split to turn-undo-specific hook)
- `apps/desktop/src/stores/agent-utils.ts`

## Tests

- [x] Add unit tests for same-turn attachment mapping.
- [x] Add IPC tests proving `undoToTurn()` calls `navigateTree()` with the user entry id.
- [x] Add tests proving composer prefill comes from returned `editorText`.
- [x] Add renderer tests for button visibility, wording, and dialog flow.
- [x] Add regression coverage ensuring legacy checkpoint entries do not produce misleading same-turn undo UI.

## Manual smoke

- [x] Reproduce: `tell me a joke` → `save that to file joke.txt` → `write a story` → undo the save prompt.
- [x] Confirm `joke.txt` is removed/restored correctly.
- [x] Confirm the active chat rewinds to before the undone prompt.
- [x] Confirm the composer is prefilled with the undone prompt text.

## Validation

- [x] Run focused desktop unit tests for touched files.
- [x] Run `pnpm typecheck`.
- [x] Commit.

**Suggested commit:** `feat(desktop): add same-turn chat undo with tree navigation`

---

# Phase 3 — Move auto undo snapshots out of visible Git history

**Goal:** Solve checkpoint noise by separating automatic undo storage from manual VCS checkpoints.

## Tasks

- [x] Implement an internal **pre-turn snapshot manager** for automatic undo points.
- [x] Snapshot capture should happen on the **first mutating tool call**, before mutation occurs, so pre-turn manual working-copy edits are preserved in the undo point.
- [x] Store automatic turn undo snapshots in an **internal hidden mechanism**, not normal branch history.
  - [x] Prefer a Git-native hidden mechanism such as hidden refs / internal snapshot objects if feasible.
  - [x] Do not add normal visible commits for automatic turn undo.
- [x] Keep **manual checkpoints** as visible VCS objects in existing VCS flows.
- [x] Remove old auto-turn visible checkpoint creation from the current extension flow.
- [x] Add retention/cleanup rules for stale internal snapshots.
- [x] Ensure undo/restore continues to trigger:
  - [x] editor reloads
  - [x] VCS state refresh
  - [x] chat message reload

## Likely files

- new internal snapshot manager under `apps/desktop/electron/features/vcs/` or `apps/desktop/electron/features/agent/undo/`
- `apps/desktop/electron/features/apps/extensions/...` turn-undo capture logic
- `apps/desktop/electron/features/vcs/core/vcs-manager.ts`
- `packages/common/src/vcs.ts`
- `apps/desktop/src/stores/vcs.ts`
- `docs/guides/version-control-user-flow.md`

## Tests

- [x] Add tests proving mutating turns create internal undo snapshots without visible `source: 'turn'` checkpoint commits.
- [x] Add tests proving manual VCS checkpoints still behave exactly as before.
- [x] Add tests for snapshot cleanup/retention behavior.
- [x] Add regression coverage for mixed-edit cases: manual working copy + agent mutation.

## Validation

- [x] Run focused desktop unit tests for touched files.
- [x] Run `pnpm typecheck`.
- [x] Commit.

**Suggested commit:** `feat(vcs): store auto turn undo snapshots outside visible git history`

---

# Phase 4 — Make the Git plugin live without polling

**Goal:** Remove the need for routine manual refresh by replacing it with event-driven updates plus non-polling watchers.

## Tasks

- [x] Introduce a central **Git refresh invalidation coordinator** in the main process.
- [x] Emit refresh invalidations from Sero-controlled mutations:
  - [x] git plugin actions
  - [x] editor/workspace file saves
  - [x] manual checkpoint create/restore
  - [x] turn undo restore
  - [x] agent mutating turns
- [x] Replace the current polling fallback with a **non-polling** watch strategy for repo truth:
  - [x] workspace content watch
  - [x] `.git/HEAD`
  - [x] `.git/index`
  - [x] `.git/refs`
  - [x] `packed-refs` where relevant
- [x] Coalesce/debounce refreshes so many events become one refresh pass.
- [x] If live watch setup fails, surface a degraded/manual state in the UI rather than silently falling back to polling.
- [x] Remove `poll` sync mode if practical across shared types and UI.
- [x] Keep the Refresh button as an explicit escape hatch only.

## Likely files

- `apps/desktop/electron/features/apps/git-app/manager.ts`
- `apps/desktop/electron/ipc/apps/app-state.ts`
- `plugins/sero-git-plugin/shared/types.ts`
- `plugins/sero-git-plugin/ui/components/Header.tsx`
- editor/workspace save/restore integration points
- turn-undo restore completion path

## Tests

- [x] Add manager tests for event coalescing / single-refresh behavior.
- [x] Add tests proving watcher setup failure does not fall back to polling.
- [x] Add tests proving Sero-originated mutations trigger automatic refresh.
- [x] Update Git header/UI tests for the new sync state labels and no-poll behavior.

## Manual smoke

- [x] Edit files in Sero and verify the Git UI updates automatically.
- [x] Undo a turn and verify the Git UI updates automatically.
- [x] Change the repo externally and verify the Git UI updates automatically.
- [x] Confirm Refresh is no longer required in the normal path.

## Validation

- [x] Run focused desktop + git-plugin unit tests.
- [x] Run `pnpm typecheck`.
- [x] Commit.

**Suggested commit:** `feat(git): make git app refresh event-driven without polling`

---

# Phase 5 — Improve labels, copy, and final UX polish

**Goal:** Replace truncated/poor auto labels with user-friendly summaries and finalize the language split between chat undo and VCS restore.

## Tasks

- [x] Add a `buildTurnUndoLabel()` helper with a priority order such as:
  - [x] mutation/tool-aware summary (`Update joke.txt`)
  - [x] changed-file summary (`Update 3 files`)
  - [x] user prompt summary (`save that to file joke.txt`)
  - [x] fallback (`Undo point`)
- [x] Capture minimal mutation metadata during the turn so labels are precise.
- [x] Remove assistant-first-line-derived labels from the automatic undo path.
- [x] Ensure bad labels like `Saved to:` can no longer appear.
- [x] Make any remaining manual checkpoint fallback descriptions deterministic/stable where still needed.
- [x] Finalize wording split everywhere:
  - [x] ChatPanel uses `Undo this turn`
  - [x] Source Control / VCS uses `Restore checkpoint`
- [x] Update docs to explain the distinction between:
  - [x] chat undo
  - [x] VCS/manual checkpoints
  - [x] session tree branching behavior

## Likely files

- new summary helper near turn-undo logic
- `apps/desktop/src/components/layout/{ChatMessageItem.tsx,...dialog...}`
- manual checkpoint description helpers in VCS if needed
- `docs/guides/version-control-user-flow.md`
- any related desktop/help docs touched by the new wording

## Tests

- [x] Add unit tests for label generation priority/fallbacks.
- [x] Add regression tests for current bad truncation examples.
- [x] Update UI snapshot/assertion tests for the final copy.

## Validation

- [x] Run focused desktop unit tests.
- [x] Run `pnpm typecheck`.
- [x] Commit.

**Suggested commit:** `feat(desktop): improve turn undo labels and final ux copy`

---

# Recommended implementation order

1. **Phase 1 — Lay the undo plumbing and split the concepts**
2. **Phase 2 — Ship true same-turn ChatPanel undo**
3. **Phase 3 — Move auto undo snapshots out of visible Git history**
4. **Phase 4 — Make the Git plugin live without polling**
5. **Phase 5 — Improve labels, copy, and final UX polish**

This order delivers the core UX change first, then removes Git-history noise, then fixes Git liveliness, and finishes with polish.

# Acceptance criteria

This plan is complete when all of the following are true:

- ChatPanel shows **Undo this turn** on the same prompt it will undo.
- Clicking the action restores the workspace to the **pre-turn** state.
- The active session rewinds using **pi tree navigation** rather than ad hoc session-file rewriting.
- The composer is prefilled with the undone prompt text.
- Automatic undo storage no longer pollutes visible Git history.
- Manual VCS checkpoints still work and remain a separate concept in Source Control.
- The Git app/plugin updates automatically without polling in the normal path.
- Automatic undo labels are specific and no longer derived from bad assistant-text truncation.
- Focused tests and `pnpm typecheck` pass for every landed phase.

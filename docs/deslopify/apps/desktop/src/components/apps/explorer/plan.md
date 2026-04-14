# Refactoring Plan — apps/desktop/src/components/apps/explorer

_Plan drafted: 2026-04-12_

## Executive Summary
`src/components/apps/explorer` is functional and feature-rich, but it is now carrying the cost of being the first real app surface in the product: orchestration logic is pooling in `ExplorerWorkspace.tsx` and `EditorPanel.tsx`, while the file-tree/VCS/subagent subareas have each grown their own imperative lifecycle patterns. There are no immediate High-priority rule violations in this area, but it is the next place where maintainability will degrade sharply unless ownership is split before the near-cap files tip over.

## Issues Found (prioritized)
- **Medium** — ~~`ExplorerWorkspace` is a near-cap orchestration hub with too many runtime responsibilities — `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx:39-454` handles root discovery, persisted editor state restore/save, terminal bootstrap, VCS watcher wiring, editor-bridge subscriptions, diff routing, and panel-resize synchronization in one component. This is beyond the “self-contained app shell” intent of AD-001/AD-002 and makes any explorer change high-churn.~~ ✅ 2026-04-14 (`32baeb88`) — Split `ExplorerWorkspace` into a thin layout shell plus focused `useExplorerRoots`, `useExplorerEditorState`, and `useExplorerRuntimeEffects` hooks while preserving root removal, editor-bridge, VCS watcher, and terminal bootstrap semantics.

- **Medium** — ~~`EditorPanel` is another near-cap multi-owner component instead of a focused editor surface — `apps/desktop/src/components/apps/explorer/editor/EditorPanel.tsx:39-444` mixes file loading, unsaved-buffer caching, Monaco view-state persistence, preview-mode switching, custom opener registration, filesystem refresh subscriptions, VCS restore handling, and LSP integration. It is currently the renderer-side choke point for several unrelated behaviors.~~ ✅ 2026-04-14 (`b78e2419`) — Split `EditorPanel` into a thin render shell plus focused document-state, Monaco-state/navigation, and runtime-sync hooks while preserving save, pending goto, preview-mode, and filetree/VCS reload semantics.

- **Medium** — ~~`FileTree` relies on effect-heavy imperative synchronization that is hard to reason about and hard to extend safely — `apps/desktop/src/components/apps/explorer/file-tree/FileTree.tsx:83-286` resets local data on workspace/root changes, lazily loads directories, reacts to two event buses, applies drag/drop mutations, and then calls `tree.rebuildTree()` as a final reconciliation pass. This works today, but it makes future multi-root or large-tree behavior risky because data ownership is spread across refs, state, and headless-tree internals.~~ ✅ 2026-04-14 (`4a3df3a7`) — Extracted `useFileTreeModel` so directory loading, expansion/watcher refresh, drag-drop mutations, and the contained `tree.rebuildTree()` invariant live outside the render shell, with focused coverage for expanded-directory reload behavior.

- **Medium** — ~~VCS/orchestration leaf components duplicate transient async UI patterns and still hide at least one failure path — `apps/desktop/src/components/apps/explorer/vcs/BookmarksSection.tsx:83-85`, `apps/desktop/src/components/apps/explorer/vcs/PullRequestSection.tsx:80-101`, `apps/desktop/src/components/apps/explorer/vcs/ChangeDetail.tsx:43-63`, and `apps/desktop/src/components/apps/explorer/orchestration/SubagentOutput.tsx:21-27` each hand-roll timer-cleared notices or optimistic async feedback, while `ChangeDetail.tsx:43-49` swallows file-summary load errors entirely. The area reads as many bespoke mini-flows rather than one coherent UI system.~~ ✅ 2026-04-14 (`33f534b4`) — Added explorer-scoped transient feedback helpers, moved PR preview debouncing onto `useDebouncedCallback`, and replaced the silent `ChangeDetail` summary-load catch with an inline warning + focused test coverage.

- **Low** — `WorkingCopySection` still ships a dead action in the primary source-control workflow — `apps/desktop/src/components/apps/explorer/vcs/WorkingCopySection.tsx:118-128` renders a Sparkles “Absorb changes into ancestors” button with no handler or disabled state. This is small, but dead controls in a primary surface erode trust quickly. Effort: **S**.

## Proposed Refactoring
1. **Split `ExplorerWorkspace` into internal controllers plus a thin layout shell.**
   - Keep the JSX shell responsible for the resizable layout and panel composition only.
   - Extract focused hooks/modules such as:
     - `useExplorerRoots(workspaceId)` — root loading/removal + file-watch refresh
     - `useExplorerEditorState(workspaceId)` — tab restore/persist, diff mode, path remap/delete handling
     - `useExplorerRuntimeEffects(workspaceId)` — VCS watcher wiring, terminal auto-create, editor-bridge subscription
   - This keeps the Explorer app aligned with AD-001/AD-002: the app owns its own layout, but the shell should not also be a lifecycle dumping ground.

2. **Decompose `EditorPanel` by concern before it crosses 500 LOC.**
   - Target structure:
     - `editor/useEditorDocumentState.ts` — file load/save, dirty tracking, content caches
     - `editor/useEditorRuntimeSync.ts` — filetree/VCS refresh listeners and reload policy
     - `editor/useMonacoNavigation.ts` — opener registration + pending goto behavior
     - `editor/EditorPanel.tsx` — render shell + Monaco/preview switch
   - Keep the public component API stable so `ExplorerWorkspace` only sees the current props.
   - Aligns with the four-layer renderer/store/preload/main rule by keeping renderer orchestration legible.

3. **Extract a dedicated file-tree model hook and reduce imperative rebuilds.**
   - Move directory loading, expansion state, watcher refresh, and drag/drop mutation handling into a `useFileTreeModel` hook.
   - Keep `FileTree.tsx` focused on headless-tree wiring + rendering.
   - Replace the blanket `tree.rebuildTree()` reconciliation with narrower updates if the headless-tree API allows it; if not, isolate that requirement inside the model hook with a comment that explains the invariant.

4. **Standardize transient async UI helpers across VCS and orchestration surfaces.**
   - Introduce a small shared hook/helper for ephemeral notices and copy state (for example `useTransientUiState(durationMs)` or a scoped explorer-only helper).
   - Replace the repeated `setTimeout(() => clear...)` patterns in bookmarks, PR preview, push notices, and output-copy feedback.
   - Convert `ChangeDetail.tsx:43-49` from silent failure to an explicit inline error state or warning banner.
   - This matches the cleanup direction already recorded in `docs/deslop.md` for repeated timer/debounce slop.

5. **Remove or properly wire incomplete controls.**
   - Either implement the working-copy absorb action through the existing VCS store or hide/disable the button until the workflow exists end-to-end.
   - Apply the same rule to any other placeholder controls that reached the primary explorer surface.

## Benefits & Trade-offs
- Benefits: lower review load for explorer changes, clearer app-surface ownership, easier debugging of filetree/editor refresh bugs, and less repeated UI-state boilerplate across VCS/subagent panels.
- Trade-offs: moderate module churn in a highly visible area, more files to navigate, and some short-term friction while extracting hooks without changing behavior.

## Dependencies & Risks
- `ExplorerWorkspace` and `EditorPanel` touch many renderer stores (`explorer`, `terminal`, `vcs`, `editor-bridge`), so extraction work must preserve store contracts already stabilized in Wave B.
- File-tree refactoring must preserve multi-root behavior and drag/drop semantics; this is not a cosmetic split.
- Any editor decomposition must stay coordinated with `src/lsp` and `electron/features/editor` so renderer/main language-routing drift does not get worse.

## Next Steps
1. ~~Split `ExplorerWorkspace.tsx` into layout shell + focused controller hooks.~~ ✅ 2026-04-14 (`32baeb88`)
2. ~~Split `editor/EditorPanel.tsx` into document, Monaco, and runtime-sync modules.~~ ✅ 2026-04-14 (`b78e2419`)
3. ~~Extract a `useFileTreeModel` hook and contain headless-tree rebuild mechanics there.~~ ✅ 2026-04-14 (`4a3df3a7`)
4. ~~Deduplicate transient notice/copy helpers and remove the silent `ChangeDetail` catch.~~ ✅ 2026-04-14 (`33f534b4`)
5. Remove or implement the dead absorb action before expanding the VCS surface further.

## Execution log
- `32baeb88` — `refactor(explorer): split ExplorerWorkspace runtime controllers`
- `b78e2419` — `refactor(explorer): split editor panel runtime controllers`
- `4a3df3a7` — `refactor(explorer): extract file tree model controller`
- `33f534b4` — `refactor(explorer): dedupe transient async ui feedback`

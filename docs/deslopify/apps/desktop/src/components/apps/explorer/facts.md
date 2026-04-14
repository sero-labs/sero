# Facts — apps/desktop/src/components/apps/explorer

_Last reviewed: 2026-04-12_

## What this code does
`src/components/apps/explorer` is the primary desktop work surface. It renders the Explorer app shell (activity bar, sidebar, editor, terminal), hosts the VCS and subagent/orchestration panels, manages multi-root file trees, and bridges Monaco/LSP/file-preview behavior to the renderer stores and the `window.sero` IPC surface.

## Shape & metrics
- Total files: 38
- Largest file: `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` (480 LOC)
- Files over 500 LOC: None
- Near-cap files (≥300 LOC):
  - `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` (480)
  - `apps/desktop/src/components/apps/explorer/editor/EditorPanel.tsx` (473)
  - `apps/desktop/src/components/apps/explorer/vcs/PullRequestSection.tsx` (362)
  - `apps/desktop/src/components/apps/explorer/file-tree/FileTree.tsx` (334)
  - `apps/desktop/src/components/apps/explorer/vcs/ChangeDetail.tsx` (317)
  - `apps/desktop/src/components/apps/explorer/vcs/BookmarksSection.tsx` (303)
- External dependencies of note: `@monaco-editor/react`, `monaco-editor`, `@headless-tree/*`, `@dnd-kit/*`, `@xterm/*`, `motion/react`, `streamdown`
- Upstream callers: `apps/desktop/src/components/apps/ActiveAppPanel.tsx`, `apps/desktop/src/stores/editor-bridge.ts`, shell/session state from `src/stores/{explorer,terminal,vcs,subagent}`
- Downstream dependencies: `window.sero.{editor,filetree,terminal,vcs,workspace}`, `src/lsp/use-lsp`, `src/lib/copy-to-clipboard`

## Architectural notes
- This directory is the main renderer consumer of AD-001 and AD-002: Explorer remains a self-contained app, but it now contains several substantial feature islands (editor, terminal, VCS, orchestration) that need clearer internal ownership boundaries.
- Terminal and editor behavior are direct consumers of AD-018 container-backed execution. Explorer surface code should stay thin over the stores and `window.sero` bridge rather than becoming another orchestration layer.
- The subagent/orchestration sidebar is the renderer landing zone for AD-021, so its UI state and event subscriptions should stay isolated from the rest of the explorer shell.
- No source file here breaks the 500 LOC hard cap yet, but `ExplorerWorkspace.tsx` and `editor/EditorPanel.tsx` are both within one medium feature of becoming violations.

## Surprising discoveries
- The “Explorer” app now owns much more than file navigation: source control, terminal lifecycle, live dev-server previews, diff viewing, markdown/media previews, and subagent monitoring all terminate here.
- Several seemingly small leaf components re-implement transient async UI patterns (`setTimeout`-cleared notices, inline loading/error state, silent catch blocks) instead of sharing helpers, so the slop is spread horizontally rather than concentrated in one obvious file.
- `WorkingCopySection.tsx` still renders an “Absorb changes into ancestors” button with no handler, which makes the panel look more complete than it actually is.

## Post-fix snapshot — 2026-04-14

### Metrics after fixes
- Total files: 44 (was 38)
- Largest file: `apps/desktop/src/components/apps/explorer/editor/EditorPanel.tsx` (473 LOC)
- Files over 500 LOC: None (was None)
- Type escape hatches remaining: unchanged in the still-pending `EditorPanel` / `FileTree` seams; no new escape hatches added in the `ExplorerWorkspace` split

### What changed
- `ExplorerWorkspace.tsx` now stays focused on the resizable layout shell while the extracted hooks own root loading/removal, persisted editor-tab state, bridge-open handling, VCS watcher wiring, and terminal bootstrap.
- Added `useExplorerEditorState.test.tsx` to lock in the behavior-sensitive editor-state semantics that the split preserved: restored tabs, pending bridge opens, and path remap/delete handling.
- The largest near-cap pressure in this folder now sits on `editor/EditorPanel.tsx`, not the explorer shell.

### Still outstanding
- `editor/EditorPanel.tsx` remains the highest-priority Medium follow-up and is still near the 500-LOC cap.
- `file-tree/FileTree.tsx` still needs the planned model-hook extraction to contain its imperative rebuild lifecycle.
- Transient notice dedupe, the silent `ChangeDetail` failure path, and the dead `WorkingCopySection` absorb control are still pending exactly as described in the original plan.

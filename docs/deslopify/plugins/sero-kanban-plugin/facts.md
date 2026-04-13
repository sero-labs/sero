# Facts — plugins/sero-kanban-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-kanban-plugin/` is the reference Sero plugin for long-running development workflows. It ships prompt templates, one manifest-driven `kanban` Pi extension tool/command, a shared board/error-log contract, a federated React board UI, and a dashboard widget. The extension and the Electron host coordinate through workspace files under `.sero/apps/kanban/`, while the UI uses `@sero-ai/app-runtime` to read and write the same state file the host/orchestrator watches.

## Shape & metrics
- Total files: 46
- Total LOC: 6,006
- Largest file: `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx` (466 LOC)
- Files over 500 LOC: none
- Near-cap files (≥390 LOC):
  - `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx` (466)
  - `plugins/sero-kanban-plugin/ui/components/DescriptionEditor.tsx` (405)
  - `plugins/sero-kanban-plugin/ui/components/ActivityPanel.tsx` (393)
- External dependencies of note:
  - Pi extension/runtime APIs (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`)
  - `@sinclair/typebox` for the bridged `kanban` tool schema
  - `@sero-ai/app-runtime` for file-backed plugin state, AI hooks, and agent prompting
  - `motion/react` for the federated UI and widget
  - `git` + `gh` CLI shell-outs for worktree and PR cleanup
- Upstream callers / consumers of note:
  - Manifest-driven host discovery loads `KanbanApp` and `KanbanWidget` from `sero.app`
  - AD-020 manifest-first bridging exposes the `kanban` tool through `sero-cli`
  - `apps/desktop/electron/features/kanban/**` shares the same board/error/review-cache files and depends on the plugin’s state semantics staying truthful
- Downstream dependencies:
  - Workspace board state at `.sero/apps/kanban/state.json`
  - Error log at `.sero/apps/kanban/errors.json`
  - Review cache files under `.sero/apps/kanban/reviews/`
  - GitHub PR state and local git worktrees for review cleanup paths
- Test surface:
  - 3 focused extension tests under `extension/__tests__/`
  - No direct UI test coverage; `vitest.config.ts` includes only `extension/**` and `shared/**`

## Architectural notes
- This is the deepest built-in plugin exemplar in the repo: package manifest, prompt templates, AD-020 tool registration, shared contracts, federated UI, and dashboard widget all live in one package.
- The shared board contract is now correctly owned by `@sero/common`; `shared/types.ts` and `shared/validation.ts` are thin plugin-local re-export layers plus the plugin-specific error-log types.
- The package gets the important plugin-platform basics right: production Vite `base: './'`, manifest-defined widget exposure, and a normal `pi.registerTool()` extension path instead of bypassing the CLI bridge.
- Workflow ownership is still split. The extension owns the canonical `kanban` tool behavior, but the UI also mutates workflow state directly with local reducers in `ui/lib/card-workflow.ts` and updater callbacks in `ui/components/CardDetail.tsx` / `ui/KanbanApp.tsx`.
- The current tests only protect the extension/shared layer, not the UI-side action path that now duplicates workflow behavior.

## Runtime-sensitive surfaces
- Review decisions are behavior-sensitive, not cosmetic. `request-revisions` and `cancel-pr` must preserve GitHub PR close behavior, review-cache deletion, worktree cleanup, and error-log append semantics.
- Board/error-log file reads must distinguish “file missing on first run” from “file malformed or unreadable”; otherwise the next write can silently erase board history.
- The federated UI path is production-sensitive: `vite.config.ts` correctly uses `base: './'`, and future cleanup must preserve MF remote/widget exposure.
- The recent shared-contract move introduced runtime value re-exports from `@sero/common` in `shared/types.ts`; packaged built-in plugin staging should keep those imports resolvable outside the monorepo layout.

## Surprising discoveries
- The UI can request revisions or cancel a PR without going through the extension tool path. That skips the extension’s GitHub/worktree/review-cache/error-log side effects even though the UI text implies those actions happened.
- The `settings` tool and the settings panel no longer describe the same runtime. The UI exposes `yoloAutoMergePrs`, while the tool schema/help only supports `yoloMode`, `testingEnabled`, and `reviewMode`; meanwhile `autoAdvance` is displayed in tool output but has no matching UI control.
- The plugin’s Vitest config excludes `ui/**`, so the duplicated UI workflow layer has no direct tests even though the extension layer does.
- `ui/components/AddCardForm.tsx` is orphaned while `ui/components/ColumnView.tsx` ships a second inline add-card form, and `ui/components/CardDetailFooter.tsx` still accepts an unused `onPriorityChange` prop.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total files: 49 (was 46)
- Largest file: `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx` (466 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: unchanged in the still-unfixed UI workflow layer; D1 only touched persisted-state seams

### What changed
- `extension/state-io.ts` now defaults only on missing board files and fails loud on malformed/unreadable board JSON.
- `extension/error-log.ts` now defaults only on missing `errors.json` and fails loud on malformed/unreadable retrospective data.
- `extension/index.ts` now returns recovery-oriented tool errors instead of silently rebuilding empty board/error state.
- Added direct persisted-state tests for board reads plus malformed error-log coverage.

### Still outstanding
- The remaining High item is still the UI→extension workflow ownership drift for review actions.
- Medium settings-surface alignment, cleanup-failure visibility, and UI file splitting are still pending.

## Post-fix snapshot — 2026-04-13 (D3 closeout)

### Metrics after fixes
- Largest file: `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx` (466 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: unchanged in the Medium UI workflow helper/file-shape work

### What changed
- Revalidated the review-action ownership seam against current desktop reality instead of adding a redundant bridge.
- Confirmed that the host already applies review-side effects for UI-triggered state transitions through `apps/desktop/electron/features/kanban/review/actions/review-action-effects.ts`.
- Existing desktop tests already cover those host-owned effects, so the earlier High finding is now obsolete rather than still actionable.

### Still outstanding
- High items are cleared for this plan.
- Medium settings-surface alignment, cleanup-failure visibility, and UI file-splitting/test work remain pending.

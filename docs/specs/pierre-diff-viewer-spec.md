# Spec: Diff Viewer on @pierre/diffs + @pierre/trees

**Status:** Phase 1 implemented — manual verification pending
**Branch:** `feat/pierre-diff-viewer`
**Background:** [docs/plans/pierre-diffs-trees-migration.md](../plans/pierre-diffs-trees-migration.md) (analysis & rationale — not needed to execute this spec)

## Goal

Replace the Monaco-based diff tab with a diff viewer built on `@pierre/diffs`: the whole changeset in one scrollable view with sticky file headers and collapsible unchanged regions, plus a changed-files tree navigator built on `@pierre/trees` with git-status decorations and click-to-scroll.

## Scope

**In:**
- Rewrite `DiffTab` on `@pierre/diffs` `CodeView` (Phase 1)
- Replace the diff tab's file-list sidebar with a `@pierre/trees` tree (Phase 2)

**Out (explicitly not in this spec):**
- Explorer sidebar file tree — stays on `@headless-tree`, unchanged
- Worker pool, render cache, annotations, line selection, chat diff previews
- Any IPC / main-process changes — the existing `window.sero.vcs` API is sufficient

## Current state (what gets replaced)

`apps/desktop/src/components/apps/explorer/editor/DiffTab.tsx` — Monaco `DiffEditor`, one file at a time, hand-rolled file-list sidebar, keyed remount + deferred model disposal to work around a Monaco bug. Single call site: `ExplorerWorkspace.tsx`. Data comes from `window.sero.vcs.fileDiffSummary(wsId, from, to)` and `window.sero.vcs.fileContent(wsId, rev, path)`. `DiffTabState` (`type/workspaceId/fromRev/toRev/initialPath`) is the external contract and must not change.

## Target design

```
DiffTab.tsx                     shell: toolbar (split/unified toggle, rev labels), layout, state
├── DiffFileNavigator.tsx       Phase 2: @pierre/trees tree of changed files w/ git status
├── DiffChangeset.tsx           @pierre/diffs CodeView: all files, progressive loading
└── diff-themes.ts              editorThemeId → shiki ThemesType + --diffs-*/--trees-* token CSS
```

Data flow: `fileDiffSummary` → file list → for each file, fetch `fileContent` for both revs → `parseDiffFromFile(oldFile, newFile)` → append to `CodeView` via `CodeViewHandle.addItems` (progressive: first file paints immediately). Tree selection → `codeViewRef.scrollTo({ item })`.

Theming: `theme` = `{ light, dark }` shiki names derived from `editorThemeId` (reuse the `resolveMarkdownCodeThemes` mapping in `monaco-themes.ts`); `themeType` from `useThemeStore().effectiveMode`. App-token alignment (fonts, chrome) via `--diffs-*` / `--trees-*` CSS variables only — no `unsafeCSS`.

## Task list

### Phase 1 — Changeset viewer on @pierre/diffs

- [x] **1.1 Dependency**: add `@pierre/diffs` (exact pin) to `apps/desktop`. Confirm install brings its own deps and that the workspace `shiki ^3.23` satisfies the peer range. `pnpm typecheck` still green before any code changes. *(shiki@3.23.0 deduped — single copy in the workspace.)*
- [x] **1.2 Theme bridge** (`editor/diff-themes.ts`): export `resolveDiffThemes(editorThemeId): { light, dark }` reusing the editor→shiki mapping from `monaco-themes.ts` (extract/share, don't duplicate the table). Add one CSS block setting `--diffs-font-family`, `--diffs-font-size`, and chrome vars from design tokens (`--bg-base`, `--text-*`, `--border-subtle`). *(Mapping extracted to `resolveShikiThemePair`; chrome vars in `diff-view.css` — only font/spacing vars needed, colors come from the shiki theme.)*
- [x] **1.3 `DiffChangeset.tsx`**: `CodeView` wrapper. Props: `workspaceId/fromRev/toRev/files/diffStyle` + ref for scroll. Progressive loading loop: fetch both revisions per file, `parseDiffFromFile`, `addItems`; per-file fetch failure renders that file as an error item, doesn't abort the rest. Options: `diffStyle` from prop, `lineDiffType: 'word-alt'`, collapse-unchanged on (default), `stickyHeaders: true`. *(Batches of 8 files to bound concurrent IPC calls; unparseable pairs fall back to plain file rendering.)*
- [x] **1.4 Rewrite `DiffTab.tsx`**: keep `DiffTabState` contract, loading state, toolbar (split/unified toggle now switches `diffStyle`, rev labels unchanged), file-list sidebar temporarily kept as the existing button list. `initialPath` → scroll to that file once its item is added.
- [x] **1.5 Cleanup**: delete `DiffFileView`, `disposeDiffModels`, the Monaco disposal workaround comment, and the `@monaco-editor/react` `DiffEditor` lazy import. No file over 500 LOC.
- [ ] **1.6 Verify** (manual, via VCS panel → open diff on a real multi-file change):
  - [ ] Multi-file changeset renders with sticky headers; unchanged regions collapse/expand
  - [ ] Split/unified toggle works
  - [ ] Added, deleted, and renamed files render correctly
  - [ ] Light/dark mode and at least 3 editor themes look right
  - [ ] Large changeset (50+ files) streams in without blocking the UI
  - [ ] `initialPath` opens scrolled to the right file
  - [x] `pnpm typecheck` green (also `vite build` passes)

### Phase 2 — File navigator on @pierre/trees

- [ ] **2.1 Dependency**: add `@pierre/trees` (exact pin) to `apps/desktop`. Note: brings a small internal `preact` runtime (render-internal, no React interaction).
- [ ] **2.2 `DiffFileNavigator.tsx`**: `useFileTree` + `<FileTree>` fed the full path list from `files` (`initialExpansion: 'open'`, search on). Map each entry's status → `setGitStatus()` entries. `onSelectionChange` → `scrollTo` callback prop. Theme via `--trees-*-override` vars from design tokens.
- [ ] **2.3 Wire into `DiffTab`**: replace the button-list sidebar with `DiffFileNavigator`; keep the show/hide toggle. Selected file follows scroll target; drop `statusCode`/`statusColor` usage from this view (they remain used by the VCS panel).
- [ ] **2.4 Verify**:
  - [ ] Clicking a file scrolls the changeset to it
  - [ ] Status decorations match the VCS panel for the same change
  - [ ] Tree search filters files; keyboard navigation works
  - [ ] Toggle hide/show navigator still works
  - [ ] `pnpm typecheck` green

### Wrap-up

- [ ] Check `apps/docs-site` for diff-view screenshots/descriptions; update if stale
- [ ] Conventional-commit PR: `feat(explorer): rebuild diff view on @pierre/diffs and @pierre/trees`

## Acceptance criteria

1. Opening a diff from the VCS panel shows the entire changeset in one scroll view — no per-file clicking required to review a change.
2. All existing entry points (`DiffTabState`, `onOpenDiff`) work unchanged.
3. No Monaco code remains in the diff path; the main editor (`EditorPanel`) is untouched.
4. Themes: diff colors follow the selected editor theme; chrome follows app light/dark tokens.
5. Zero typecheck errors; every touched file ≤ 500 LOC.

# Pierre Diffs & Trees — Migration Analysis and Plan

**Date:** 2026-07-17
**Packages evaluated:** `@pierre/diffs` v1.2.12, `@pierre/trees` v1.0.0-beta.5 (Apache-2.0, by The Pierre Computer Company)
**Sero surfaces evaluated:** `apps/desktop/src/components/apps/explorer/editor/DiffTab.tsx` (Monaco DiffEditor) and `apps/desktop/src/components/apps/explorer/file-tree/` (@headless-tree)

## Decision summary

| Surface | Verdict |
|---|---|
| Diff viewer (`DiffTab`) | **Migrate to `@pierre/diffs`** — clear win, low risk |
| Diff view's changed-files navigator | **Migrate to `@pierre/trees`** — perfect fit (path list known upfront, git-status lanes built in) |
| Explorer file tree (`FileTree`) | **Do not migrate now** — structural mismatch with lazy IPC loading; keep `@headless-tree`, revisit if upstream adds async loading |

## Why migrate the diff viewer

Sero's diff surface is read-only end-to-end (`options.readOnly: true`, IPC handlers are read-only queries). We pay Monaco's editor semantics for none of its editing value, and `DiffTab` carries a keyed-remount + deferred-dispose workaround for Monaco's model-disposal bug.

What `@pierre/diffs` gives us that Monaco's DiffEditor doesn't:

- **Whole-changeset view** (`CodeView`): every changed file in one virtualized scroll with sticky file headers, instead of the manual one-file-at-a-time navigator.
- **Collapsed unchanged regions** with click-to-expand (100 lines per click, auto-expands small gaps).
- **Better git-diff ergonomics**: file headers with rename/mode changes, hunk separators with line info, word-level intraline highlighting, split/unified toggle that's cheap to switch.
- **Annotation framework**: React nodes injected at any diff line — the future seam for AI review comments and inline chat on diffs. Nothing comparable exists in our Monaco setup.
- **Accept/reject hunk helpers** (`diffAcceptRejectHunk`) — future seam for apply/revert-hunk UX.
- **Line selection API** — future seam for "comment on lines X–Y" and permalinks.

Why it's low-risk:

- **Input shape matches exactly.** `MultiFileDiff` takes `oldFile`/`newFile` content strings — precisely what `window.sero.vcs.fileContent()` returns. `PatchDiff` also accepts the raw patch text `window.sero.vcs.diff()` already produces (future chat previews).
- **Shiki is already in our bundle** (streamdown chat markdown + `ai-elements/code-block.tsx`, `shiki ^3.23`, in-range for the package's `^3 || ^4` peer). We even already map editor themes → shiki theme names (`resolveMarkdownCodeThemes` in `monaco-themes.ts`) — the diff theme wiring reuses that mapping.
- **Read-only by design** — matches our surface.
- **Mature**: v1.2.12, 59 test suites, production use on pierre.co, docs at diffs.com.
- **Monaco stays regardless** (EditorPanel is the main editor), so this is not a bundle-size play — it's a UX and capability play. The diff-only Monaco entanglement (disposal hack, `DiffEditor` lazy import) goes away.

Known losses / gaps (accepted):

- No minimap (low value in a diff; collapse-unchanged covers the navigation need).
- No image/binary diffs (Monaco didn't render those either).
- No built-in keyboard line navigation.
- Worker pool and render cache are flagged experimental — **we skip them initially**. Default `shiki-js` engine renders plain text synchronously first, then swaps in highlights, so the main-thread path doesn't jank.

## Why the changed-files navigator is the right first `@pierre/trees` adoption

The diff view's file list is where trees + diffs "integrate nicely":

- The path list is **fully known upfront** (`fileDiffSummary`) — no lazy-loading mismatch.
- Built-in **git-status decorations** (added/deleted/modified/renamed lanes) replace our hand-rolled status letter + color column.
- Selection events drive `CodeView.scrollTo` — click a file in the tree, the changeset scrolls to it.
- Virtualized + searchable out of the box for large changesets.

## Why NOT the explorer file tree (for now)

`@pierre/trees` is genuinely good (virtualized, multi-select, DnD, inline rename, search, vscode-style icons, strong tests), but two structural facts disqualify it for the explorer today:

1. **No lazy/async directory loading and no expand event.** The model requires the complete flat path list upfront; `onMutation` covers add/remove/move/reset only — expansion is not observable per-directory. Our explorer's core contract is IPC-on-expand (`window.sero.editor.listFiles` per directory). Emulating laziness means polling `getItem(path).isExpanded()` behind a generic `subscribe()` — an unsupported hack. Enumerating everything upfront means either walking `node_modules`/`.git` (100k+ paths over IPC per workspace) or silently hiding ignored directories from the explorer — both product regressions.
2. **Rows are Preact inside a shadow root.** Only the header and context menu accept React nodes (via slots). Our current row customization is modest so this alone wouldn't block, but combined with (1) and the package's beta status (`1.0.0-beta.5`), the trade is bad while `@headless-tree` covers current needs.

**Revisit trigger:** upstream adds an async loader or a public expand/collapse event (worth filing an issue — the mutation/batch/`resetPaths(preparedInput)` APIs are already efficient enough that an expand hook is the only missing piece).

**Independent quick wins for the current explorer tree** (optional, no migration required): enable `@headless-tree`'s search feature (the shared `tree.tsx` already exposes `data-search-match`), and add git-status coloring using the data the VCS panel already has.

## Migration plan

### Phase 1 — Diff viewer (`@pierre/diffs`)

1. **Add dependency** to `apps/desktop`: `@pierre/diffs` (pin exact; pnpm brings `diff`, `hast-util-to-html`, `lru_map`, `@pierre/theme(-ing)`, `@shikijs/transformers`; `shiki` peer already satisfied by the workspace).
2. **Theme bridge** (new small module, e.g. `editor/diff-themes.ts`): map `editorThemeId` → `ThemesType` (`{ light, dark }` shiki theme names), reusing/extending `resolveMarkdownCodeThemes`. Pass `themeType` from `useThemeStore().effectiveMode`. Set `--diffs-*` CSS vars (font family/size, backgrounds) from our design tokens (`--bg-base`, `--text-*`, `--border-subtle`) in one stylesheet block.
3. **Rebuild `DiffTab` body** around `CodeView`:
   - Fetch `fileDiffSummary`, then load file pairs (`fileContent` × 2) **progressively** and append via the `CodeViewHandle.addItems` ref API — first file paints immediately, big changesets stream in.
   - Item type `'diff'` per file, `parseDiffFromFile(oldFile, newFile)` per pair (main thread; no worker pool in phase 1).
   - Keep the toolbar: split/unified toggle → `diffStyle` option; revision labels unchanged.
   - Delete `DiffFileView`, `disposeDiffModels`, the Monaco disposal comment block, and the `@monaco-editor/react` `DiffEditor` lazy import.
4. **Options baseline:** `diffStyle: 'split'` default, `lineDiffType: 'word-alt'`, collapse-unchanged on (default), sticky headers on, line selection off (phase 1).
5. **Respect the 500-LOC rule**: the new tab splits into `DiffTab.tsx` (shell/toolbar/state), `DiffChangeset.tsx` (CodeView wiring), `diff-themes.ts`.
6. **Verify:** `pnpm typecheck`; drive the real flow — open a diff from the VCS panel (ChangeDetail → onOpenDiff) on a multi-file change, check light/dark and each editor theme, toggle split/unified, large-file changeset, added/deleted/renamed files.

### Phase 2 — Changed-files navigator (`@pierre/trees`)

1. **Add dependency**: `@pierre/trees` (pin; note it brings a small `preact` runtime — render-internal only, invisible to our React tree).
2. Replace the hand-rolled button list in the diff tab with `useFileTree` + `<FileTree>`:
   - `paths` from `fileDiffSummary` (full list known upfront; `initialExpansion: 'open'`).
   - `setGitStatus()` from each entry's status → built-in status lanes replace `statusCode`/`statusColor` here.
   - `onSelectionChange` → `codeViewRef.scrollTo({ item })`.
   - Theme via `--trees-*-override` vars from our tokens (or `themeToTreeStyles()` from the active shiki theme for consistency with the diff pane).
3. Keep it scoped to the diff view. The explorer keeps `MultiRootFileTree` unchanged.
4. **Verify:** navigator click scrolls to the file; status lanes match the VCS panel; keyboard nav works.

### Phase 3 (optional, later) — follow-up opportunities

- **Chat/tool-call diff previews:** `PatchDiff` can render `window.sero.vcs.diff()` patch text inline in sessions — a surface we currently don't have at all.
- **Worker pool** for very large changesets once the API leaves experimental (needs `worker.format: 'es'` in vite config and a `workerFactory`).
- **Annotations**: AI review comments / inline discussion on diff lines.
- **Explorer tree migration**: only if upstream ships async loading (see revisit trigger above).

### Risks

| Risk | Mitigation |
|---|---|
| Shadow-DOM theming misses a token (odd colors in a custom theme) | Everything themeable via documented `--diffs-*` / `--trees-*` vars; `unsafeCSS` exists but is explicitly not back-compat-safe — avoid it |
| `@pierre/trees` is beta | Confined to the diff navigator (small, easily reverted); explorer untouched |
| Big changesets loading 2× file contents over IPC | Progressive `addItems` streaming; same data volume as today's per-file loads, just batched |
| Second VDOM (preact) in bundle | ~4 KB, shadow-root-internal; no interaction with React 19 |
| Docs-site | Check `apps/docs-site` for any diff-view screenshots/description to refresh before PR |

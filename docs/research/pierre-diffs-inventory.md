# `@pierre/diffs` inventory against the git UX

Research for [#303](https://github.com/sero-labs/sero/issues/303), part of map #294.
Checked against the git UX specified in the resolution comments on #301 (explorer
panel and header popover) and #302 (the Git app).

Facts only. No recommendations.

## How this was checked

Everything below was read from the **installed** package, not from published
docs:

```
node_modules/.pnpm/@pierre+diffs@1.2.12_@shikijs+themes@4.1.0_react-dom@19.2.5_react@19.2.5__react@19.2.5/node_modules/@pierre/diffs/dist/
```

Citations below shorten that path to `DIFFS/`. The trees package is shortened to
`TREES/`:

```
node_modules/.pnpm/@pierre+trees@1.0.0-beta.5_.../node_modules/@pierre/trees/dist/
```

**Docs vs types.** The only documentation shipped in the package is
`README.md`, which lists "Add your own accept/reject changes UI" and "Flexible
annotation framework" as features. That matches the types: the library gives you
the data transform and the injection points, not the buttons. The public docs
site (`diffs.com`) describes the merge-conflict primitive as one "that treats
current and incoming sections as structured additions/deletions", which is
exactly what the shipped code does (`DIFFS/utils/normalizeDiffResolution.js:6`).
The full `diffs.com/docs` page could not be retrieved (it exceeds the fetch size
limit), so no line-by-line docs comparison was possible. **No disagreement
between the shipped types and the docs was found.** Where anything below
contradicts a claim made in an earlier ticket comment, that is called out
explicitly.

## What Sero uses today

Six imports, in two files, both in the desktop app:

| Import | Where |
|---|---|
| `ThemesType` | `apps/desktop/src/components/apps/explorer/editor/diff-themes.ts:9` |
| `parseDiffFromFile` | `apps/desktop/src/components/apps/explorer/editor/DiffChangeset.tsx:10` |
| `CodeViewItem`, `CodeViewOptions` | `DiffChangeset.tsx:11` |
| `CodeView`, `CodeViewHandle` | `DiffChangeset.tsx:12` |
| `FileTree`, `useFileTree` (`@pierre/trees/react`) | `apps/desktop/src/components/apps/explorer/editor/DiffFileNavigator.tsx:8` |
| `GitStatusEntry` (`@pierre/trees`) | `DiffFileNavigator.tsx:9` |

Correction to #303's framing: it says Sero imports **three** things. It imports
those three plus the two `@pierre/trees` imports added by the diff viewer work
on this branch. `@pierre/trees` is no longer unused.

`@pierre/diffs` and `@pierre/trees` are dependencies of `apps/desktop` only
(`apps/desktop/package.json:84-85`). The Git plugin has neither
(`plugins/sero-git-plugin/package.json` lists only `typebox` as a dependency).

## 1 — What exists and is unused

### `UnresolvedFile` — a complete merge-conflict resolver

Confirmed. Two forms:

- Vanilla class, `DIFFS/components/UnresolvedFile.d.ts:41`, exported at
  `DIFFS/index.d.ts:18`.
- React component, `DIFFS/react/UnresolvedFile.d.ts:26`, exported from
  `@pierre/diffs/react`.

It takes a `FileContents` (the on-disk file with conflict markers still in it)
and parses, renders, and resolves the conflicts itself. Options:

- `mergeConflictActionsType: 'none' | 'default' | <render fn>`
  (`DIFFS/components/UnresolvedFile.d.ts:10,13`) — `'default'` renders the
  built-in accept row.
- `onMergeConflictAction(payload, instance)` and
  `onMergeConflictResolve(file, payload)`
  (`DIFFS/components/UnresolvedFile.d.ts:14-15`) — **vanilla class only**, see
  section 2.
- `instance.resolveConflict(conflictIndex, resolution, fileDiff?)`
  (`DIFFS/components/UnresolvedFile.d.ts:60`) returns
  `{ file, fileDiff, actions, markerRows }`
  (`DIFFS/components/UnresolvedFile.d.ts:34-39`) — `file` is the resolved file
  contents, which is what you would write to disk.

Marker regexes are exported: `MERGE_CONFLICT_START/BASE/SEPARATOR/END_MARKER_REGEX`
(`DIFFS/constants.d.ts:16-19`).

**One correction to #302.** Its resolution comment lists
`parseMergeConflictDiffFromFile` as an export. It is **not** exported — neither
from the package root (`DIFFS/index.d.ts:108`, no such name) nor from
`@pierre/diffs/react` (`DIFFS/react/index.d.ts`, no such name). It exists at
`DIFFS/utils/parseMergeConflictDiffFromFile.d.ts:26` and is used internally
(`DIFFS/react/utils/useUnresolvedFileInstance.js:2`), but the package's
`exports` map only declares `.`, `./react`, `./ssr`, `./worker`,
`./worker/worker.js` and `./worker/worker-portable.js`
(`node_modules/.../@pierre/diffs/package.json`), so a deep import cannot
resolve. The same applies to `MergeConflictDiffAction` and
`buildMergeConflictMarkerRows`.

Consequence: you cannot pre-parse a file's conflicts yourself to build a
file-level "Accept all current" loop or a conflict count for a badge. You get
the parsed conflicts only as a by-product of mounting the component (the React
component returns them internally but does not expose them — see section 2).

### `diffAcceptRejectHunk` — hunk-level accept/reject on the diff model

`DIFFS/utils/diffAcceptRejectHunk.d.ts:5`, exported at `DIFFS/index.d.ts:76`.

```ts
diffAcceptRejectHunk(diff: FileDiffMetadata, hunkIndex: number,
                     options: 'accept' | 'reject' | 'both' | { type, changeIndex })
  : FileDiffMetadata
```

Types at `DIFFS/types.d.ts:647-652`. Unused in Sero. See section 4 for whether
it is a staging path.

### `resolveRegion` — the general form of both of the above

`DIFFS/utils/resolveRegion.d.ts:11`, exported at `DIFFS/index.d.ts:103`. Takes an
arbitrary `{ hunkIndex, startContentIndex, endContentIndex, resolution }` where
resolution is `'deletions' | 'additions' | 'both'`
(`DIFFS/utils/resolveRegion.d.ts:4-10`). Both `diffAcceptRejectHunk`
(`DIFFS/utils/diffAcceptRejectHunk.js:13`) and `resolveConflict`
(`DIFFS/utils/resolveConflict.js:5`) are thin wrappers over it. It is the only
one of the three that can address a sub-hunk range, so it is the primitive for
anything finer than "a whole hunk".

### `InteractionManager` — hover, click and gutter affordances

`DIFFS/managers/InteractionManager.d.ts:62`. You never construct it; `FileDiff`
owns one (`DIFFS/components/FileDiff.d.ts:92`). What you actually adopt is its
**options**, which are mixed into `FileDiffOptions`
(`DIFFS/components/FileDiff.d.ts:26`) and passed straight through by `CodeView`
(`DIFFS/components/CodeView.d.ts:76,79-80`):

- `enableGutterUtility`, `onGutterUtilityClick(range)`, `renderGutterUtility(...)`
  (`DIFFS/managers/InteractionManager.d.ts:39-40`,
  `DIFFS/components/FileDiff.d.ts:44`) — a hover-revealed button in the line
  gutter that hands you the selected line range. This is the seam for anything
  the spec wants to hang off a diff line.
- `onLineClick`, `onLineNumberClick`, `onLineEnter`, `onLineLeave`,
  `onTokenClick/Enter/Leave` (`DIFFS/managers/InteractionManager.d.ts:41-47`).
- `lineHoverHighlight: 'disabled' | 'both' | 'number' | 'line'`
  (`DIFFS/managers/InteractionManager.d.ts:37`).

All unused by Sero — `DiffChangeset.tsx:47-56` passes only theme, themeType,
diffStyle, lineDiffType and stickyHeaders.

### `CodeViewLineSelection` — line selection and permalinks

`DIFFS/components/CodeView.d.ts:57-60`: `{ id, range }` where `id` is the
CodeView item id (the file path, in Sero's usage) and `range` is
`SelectedLineRange` (`DIFFS/types.d.ts:334-339`, supports a start/end line each
with a `deletions`/`additions` side). Driven by `enableLineSelection` /
`controlledSelection` (`DIFFS/managers/InteractionManager.d.ts:49-50`),
`onSelectedLinesChange` (`DIFFS/components/CodeView.d.ts:92`), and the React
handle's `setSelectedLines` / `getSelectedLines` / `clearSelectedLines`
(`DIFFS/react/CodeView.d.ts:38-40`). Selection callbacks
`onLineSelected/Start/Change/End` are pass-through
(`DIFFS/components/CodeView.d.ts:80`).

Unused. This is "select lines 12-30 of this file in this diff" as a first-class,
addressable value.

### `LineDecoration` / `SplitLineDecorationProps` — not adoptable as exported

`DIFFS/renderers/DiffHunksRenderer.d.ts:19-28`. These are the parameter and
return types of `getUnifiedLineDecoration` and `getSplitLineDecoration`, which
are **`protected` methods** on `DiffHunksRenderer`
(`DIFFS/renderers/DiffHunksRenderer.d.ts:94-100`). See section 2.

### `HunkExpansionRegion` — expand-context state

`DIFFS/types.d.ts:521-524`, just `{ fromStart, fromEnd }`. The behaviour is
already on by default. The controls are `expandHunk(hunkIndex, direction,
count?)` (`DIFFS/components/FileDiff.d.ts:135`,
`DIFFS/components/VirtualizedFileDiff.d.ts:42`) and the options
`expandUnchanged`, `collapsedContextThreshold`, `expansionLineCount`
(`DIFFS/types.d.ts:308-312`), all of which `CodeView` passes through
(`DIFFS/components/CodeView.d.ts:76`). Sero sets none of them. Expansion is
unavailable on diffs parsed from a patch rather than from full file contents —
`isPartial` (`DIFFS/types.d.ts:232-241`). Sero always builds from full contents
(`DiffChangeset.tsx:89-92`), so expansion works there.

### `VirtualizedFileDiff` — already in use, indirectly

`DIFFS/components/VirtualizedFileDiff.d.ts:8`. Its constructor requires a
`Virtualizer | CodeView` (`DIFFS/components/VirtualizedFileDiff.d.ts:20`), and
`CodeView` creates one per diff item
(`DIFFS/components/CodeView.d.ts:31`). Sero already gets it through `CodeView`.
It is not a separate thing to adopt; it is what `CodeView` is made of.

### Other unused exports worth knowing about

| Export | What it is | Where |
|---|---|---|
| `MultiFileDiff` | React component: diff two files that contain many files | `DIFFS/react/MultiFileDiff.d.ts:10` |
| `PatchDiff` | React component: render a raw patch string directly | `DIFFS/react/PatchDiff.d.ts:8` |
| `parsePatchFiles` / `processPatch` / `processFile` | Parse `git diff` / `git format-patch` output into `FileDiffMetadata` | `DIFFS/utils/parsePatchFiles.d.ts:4,12,21` |
| `getSingularPatch` | One patch string → one `FileDiffMetadata` | `DIFFS/utils/getSingularPatch.d.ts:4` |
| `trimPatchContext` | Reduce context lines in a patch, re-splitting hunks as needed | `DIFFS/utils/trimPatchContext.d.ts:8` |
| `FileStream` + `CodeToTokenTransformStream` | Stream-highlight a file as it arrives | `DIFFS/index.d.ts:17,16` |
| `WorkerPoolContextProvider` | Move highlighting off the main thread | `DIFFS/react/index.d.ts` |
| line annotations (`DiffLineAnnotation`, `renderAnnotation`) | Inject arbitrary React nodes at a diff line | `DIFFS/types.d.ts:356-359`, `DIFFS/react/CodeView.d.ts:20` |

`PatchDiff` and `parsePatchFiles` matter because the Git plugin currently parses
diffs itself into its own `FileDiff`/`DiffHunk`/`DiffLine` shapes
(`plugins/sero-git-plugin/ui/components/DiffViewer.tsx:8`).

## 2 — Close, but doesn't fit

### The React `UnresolvedFile` never tells you a conflict was resolved

This is the sharpest edge in the library, and it lands squarely on #302's
"adoption, not construction" conclusion.

The vanilla class has `onMergeConflictResolve(file: FileContents, payload)`
(`DIFFS/components/UnresolvedFile.d.ts:15`) — the resolved file contents, ready
to write to disk. The React component does not have it:

- `UnresolvedFileReactOptions` is
  `Omit<FileDiffOptions, 'hunkSeparators' | 'diffStyle' | 'onMergeConflictAction' | 'onPostRender'> & UnresolvedFileHunksRendererOptions`
  (`DIFFS/react/UnresolvedFile.d.ts:15`). `FileDiffOptions`
  (`DIFFS/components/FileDiff.d.ts:26-46`) has neither
  `onMergeConflictResolve` nor `onMergeConflictAction`; those live only on
  `UnresolvedFileOptions`. `UnresolvedFileHunksRendererOptions`
  (`DIFFS/renderers/UnresolvedFileHunksRenderer.d.ts:12-14`) carries only
  `mergeConflictActionsType`. So neither callback is reachable from React.
- The React wrapper installs its **own** `onMergeConflictAction` and keeps the
  resolved state in local `useState`
  (`DIFFS/react/utils/useUnresolvedFileInstance.js:11-29,41`). Clicking
  "Accept current change" updates the component's internal state and nothing
  else happens. Nothing is written, and nothing outside the component is
  notified.
- The initial parse is a lazy `useState` initialiser
  (`DIFFS/react/utils/useUnresolvedFileInstance.js:11-18`). It never re-runs, so
  changing the `file` prop does **not** re-parse. Re-parsing requires remounting
  (a changed `key`).
- `useUnresolvedFileInstance` is not exported from `@pierre/diffs/react`
  (`DIFFS/react/index.d.ts` export list), so the hook cannot be used directly
  either.

The only escape hatch is `renderMergeConflictUtility(action, getInstance)`
(`DIFFS/react/UnresolvedFile.d.ts:23`): render your own action row, call
`getInstance()?.resolveConflict(i, resolution)` yourself, and read `file` off the
return value (`DIFFS/components/UnresolvedFile.d.ts:60`). But passing
`renderMergeConflictUtility` forces `mergeConflictActionsType` to a no-op
renderer (`DIFFS/react/utils/useUnresolvedFileInstance.js:99`) — so **the moment
you need to know about a resolution, you lose the built-in
`mergeConflictActionsType: 'default'` action row and have to draw the buttons
yourself.**

Net: the *resolution engine, marker parsing, region rendering and colouring* are
adoption. The *action row* is adoption only in a demo where resolutions are
never persisted. In Sero it will be hand-drawn, because Sero must write the
resolved file to disk. This does not overturn #302's conclusion — the expensive
part really is shipped — but the "everything else in the pane is `UnresolvedFile`
as shipped" line needs the qualifier.

### `LineDecoration` requires subclassing two classes and can't be wired up

Adding your own gutter/content attributes per line means overriding
`getUnifiedLineDecoration` / `getSplitLineDecoration`, which are `protected`
(`DIFFS/renderers/DiffHunksRenderer.d.ts:94-100`). Installing the subclass means
overriding `createHunksRenderer`, also `protected`
(`DIFFS/components/FileDiff.d.ts:109`). Neither React component accepts a
renderer or component class, and `CodeView` constructs its own instances
(`DIFFS/components/CodeView.d.ts:31,38`). So `LineDecoration` is exported as a
type but there is no supported way for a consumer to supply one. The supported
route to per-line UI is annotations (`renderAnnotation`,
`DIFFS/react/CodeView.d.ts:20`) or the gutter utility
(`DIFFS/react/CodeView.d.ts:21`).

### `resolveConflict`'s closed union — confirmed, and it's structural

`resolveConflict(diff, conflict, type)` where `type` is
`'current' | 'incoming' | 'both'` (`DIFFS/utils/resolveConflict.d.ts:4`,
`DIFFS/types.d.ts:648`). This is not a surface-level restriction: the
implementation maps `current → 'deletions'`, `incoming → 'additions'`,
everything else → `'both'` (`DIFFS/utils/normalizeDiffResolution.js:6`), and
`resolveRegion` then copies lines that are already in the diff
(`DIFFS/utils/resolveRegion.js:164-190`). There is no code path that inserts
text which is not already on one side. #302's finding stands, and the same is
true of `resolveRegion` and `diffAcceptRejectHunk` — all three share the engine.

### There is no way back to a patch string

Every resolution API returns `FileDiffMetadata`
(`DIFFS/utils/resolveRegion.d.ts:11`), and no export converts `FileDiffMetadata`
back into a unified-diff string. The package's only patch functions read patches
(`parsePatchFiles`, `getSingularPatch`) or trim one
(`trimPatchContext`, `DIFFS/utils/trimPatchContext.d.ts:8`). This is the fact
behind section 4.

## 3 — Where the spec's design contradicts the library's model

### The conflict pane can't live inside the diff pane

The spec (#302) says the detail column is "always a diff", and in the conflict
state "the diff pane becomes a conflict resolver". `CodeView` — the thing Sero's
diff pane is — only accepts items of type `'file'` or `'diff'`
(`DIFFS/types.d.ts:360-376`). There is no unresolved-file item type, and the
CodeView pass-through option and callback lists carry nothing merge-conflict
related (`DIFFS/components/CodeView.d.ts:76,79-80`). `UnresolvedFile` is a
sibling of `FileDiff`, not a `CodeView` item.

So the conflict state is a **different component swapped into the same slot**,
and it renders one file at a time with no shared virtualisation. A conflicted
changeset means N mounted `UnresolvedFile` components, or one at a time driven
by the file list. Everything the diff pane gets from `CodeView` — virtualised
scrolling, sticky headers, `scrollTo({type:'item'})`, one selection model across
files — does not exist in the conflict state and would have to be rebuilt or
dropped.

### The Git app can't reach the library at all today

The spec says the right pane is `DiffChangeset`. `DiffChangeset` is a desktop-app
component (`apps/desktop/src/components/apps/explorer/editor/DiffChangeset.tsx`),
and `@pierre/diffs` is a dependency of `apps/desktop` only
(`apps/desktop/package.json:84`). The Git app is a federated plugin whose only
dependency is `typebox` (`plugins/sero-git-plugin/package.json`), and
`@sero-ai/app-runtime` exposes no diff surface — its app-facing exports are
things like `openSeroFile` (`packages/app-runtime/src/app-launch.ts:48`). The
plugin's current diff pane is 158 hand-written lines with its own hunk types and
no syntax highlighting (`plugins/sero-git-plugin/ui/components/DiffViewer.tsx`).

This is not a design contradiction with the library; it is a packaging fact the
spec's "the right column is `DiffChangeset`" line depends on. Either
`DiffChangeset` moves into a shared package, or the plugin takes on
`@pierre/diffs` directly.

### `current`/`incoming` versus `ours`/`theirs`

Already resolved in #302 v5→correction, recorded here because the types enforce
it: `MergeConflictResolution` is `'current' | 'incoming' | 'both'`
(`DIFFS/types.d.ts:412`). There is no ours/theirs vocabulary anywhere in the
package.

### Split view has no conflict story

`UnresolvedFileOptions` omits `diffStyle` entirely
(`DIFFS/components/UnresolvedFile.d.ts:11`) — the conflict view is always
unified. #302 already redrew the pane inline-unified, so the spec and the library
now agree; the type is the reason they must.

## 4 — Is `diffAcceptRejectHunk` a path to per-hunk staging?

**No, not on its own.** It solves the display half and none of the git half.

What it does: takes a `FileDiffMetadata`, a hunk index and
`'accept' | 'reject' | 'both'`, and returns a **new `FileDiffMetadata`** with
that hunk's changes collapsed into context lines
(`DIFFS/utils/diffAcceptRejectHunk.d.ts:5`;
`DIFFS/utils/diffAcceptRejectHunk.js:4-27`). `accept` keeps the addition lines,
`reject` keeps the deletion lines (`DIFFS/utils/normalizeDiffResolution.js:6`),
and the result is rebuilt line-by-line from lines already present in the input
diff (`DIFFS/utils/resolveRegion.js:164-190`). It never touches the filesystem,
never produces a patch, and never talks to git.

What per-hunk staging needs and this does not give:

1. **A patch to stage.** `git apply --cached` needs a unified-diff string. There
   is no `FileDiffMetadata` → patch serialiser anywhere in the package (only
   readers: `DIFFS/utils/parsePatchFiles.d.ts`,
   `DIFFS/utils/getSingularPatch.d.ts`). Sero would write that serialiser, or
   generate the patch on the git side from hunk indices.
2. **Two states, not one.** Staging means the index and the working tree diverge.
   `diffAcceptRejectHunk` collapses one diff toward one side; it has no model of
   "staged vs unstaged" and returns a single diff.
3. **Stable hunk identity across a refresh.** `hunkIndex` is a position in
   `diff.hunks` (`DIFFS/types.d.ts:227`). After staging one hunk and re-running
   `git diff`, the indices shift. Nothing in the library helps re-anchor.
4. **Sub-hunk granularity, if wanted.** The object form
   `{ type, changeIndex }` (`DIFFS/types.d.ts:649-652`) targets one change block
   inside a hunk (`DIFFS/utils/diffAcceptRejectHunk.js:17-20`), and
   `resolveRegion` (`DIFFS/utils/resolveRegion.d.ts:4-10`) takes an arbitrary
   content range. So line-level staging is expressible in the model even though
   it still has to be executed by git.

Where it *is* useful: driving the optimistic UI. Stage a hunk, apply
`diffAcceptRejectHunk` to the in-memory diff, and the pane updates instantly
without waiting for a git round-trip. That is a real saving, but it is not the
staging mechanism.

Note also that hunk-level actions need a place to click. The library's supported
per-line affordance is the gutter utility
(`DIFFS/managers/InteractionManager.d.ts:39-40`), which is a **line** button, not
a **hunk** button. A per-hunk button row is not a shipped affordance — the
nearest supported route is a file-level or line-level annotation
(`DIFFS/react/CodeView.d.ts:20`) anchored at the hunk's first line.

## 5 — Version reality

### `@pierre/diffs`

`1.2.12` is the current `latest` on npm (checked `npm view @pierre/diffs version`
→ `1.2.12`). The pin is not stale. There is a prerelease line above it, ending at
`1.3.0-rc.1`.

Comparing the root export lists of `1.2.12` and `1.3.0-rc.1` (both from the
shipped `dist/index.d.ts`): **nothing was removed**, and 41 names were added.
The material ones:

| Added in `1.3.0-rc.1` | Relevance |
|---|---|
| `DiffsEditor`, `DiffsEditableComponent`, `EditableInstance`, `TextEdit`, `EditorState`, `EditorSelection`, `Position`, `Range`, `SelectionDirection` | A real text **editor** on top of the diff renderer. Nothing in #301/#302 asks for editing a diff in place, but "Let me edit it" in the AI conflict flow (#302 v7) is exactly this shape. |
| `loadDiffFiles?: FileDiffContentsLoader` (`/tmp` tarball `dist/types.d.ts:365`, type at `:52`) | Lazy per-file content loading: `(fileDiff) => Promise<{oldFile, newFile}>`. `DiffChangeset.tsx:70-123` hand-rolls exactly this with a batch size of 8. |
| `hydratePartialDiff`, `cloneFileDiffMetadata` | Turning a patch-parsed (`isPartial`) diff into a full one, and copying diff metadata — both relevant if diffs ever come from `git diff` output rather than two file reads. |
| `RenderHeaderFilenameSuffixCallback`, `HEADER_FILENAME_SUFFIX_SLOT_ID` | An extra header slot after the filename. |
| `isFileAnnotation`, `isDiffAnnotation`, and collection variants | Type guards for the annotation framework. |

What `1.3.0-rc.1` does **not** change: the React `UnresolvedFile` still has no
resolve callback (identical `UnresolvedFileReactOptions` omit list), and
`CodeViewItem` is still only `'file' | 'diff'`. Both findings in sections 2 and 3
survive the upgrade.

### `@pierre/trees@1.0.0-beta.5`

`1.0.0-beta.5` is the newest published version (checked
`npm view @pierre/trees versions`). Sero is current.

Already used by `DiffFileNavigator.tsx` (paths, initial expansion, search, git
status lanes, selection). Unused, and directly relevant to the spec's working
tree list and branch rail:

| Capability | Where | Spec relevance |
|---|---|---|
| `applyGitStatusPatch({ remove, set })` | `TREES/render/FileTree.d.ts:25` | Incremental status updates without rebuilding the tree — the push-model refresh of the Changes list. |
| `setGitStatus(...)` | `TREES/render/FileTree.d.ts:43` | Wholesale status replacement. |
| `renderRowDecoration` | `TREES/model/publicTypes.d.ts:174`, type at `:293-306` | Per-row trailing text or icon. **Text or icon only** — see below. |
| `composition.contextMenu` with `render(item, ctx)`, `triggerMode: 'both' \| 'button' \| 'right-click'` | `TREES/model/publicTypes.d.ts:279-290` | The only interactive per-row surface. |
| `scrollToPath`, `focusPath`, `focusNearestPath` | `TREES/render/FileTree.d.ts:20-22` | Keeping the selected file visible. |
| search: `setSearch`, `openSearch`, `getSearchMatchingPaths`, `focusNext/PreviousSearchMatch`, modes `expand-matches \| collapse-non-matches \| hide-non-matches` | `TREES/render/FileTree.d.ts:28-35`, `TREES/model/publicTypes.d.ts:120` | Filtering a long Changes list. |
| virtualised rows, `FILE_TREE_DEFAULT_ITEM_HEIGHT`, `density` presets | `TREES/model/virtualization.js`, `TREES/model/publicTypes.d.ts:169` | Long lists at a fixed panel height. |
| `flattenEmptyDirectories`, `FLATTENED_PREFIX` | `TREES/model/publicTypes.d.ts:44`, `TREES/constants.d.ts:13` | Collapsing `a/b/c/` chains — the same problem the branch rail has with `chore/review-open-…`. |
| inline renaming, drag and drop, mutation events | `TREES/model/publicTypes.d.ts:162-166`, `:140-151`, `TREES/render/FileTree.d.ts:27` | Not asked for by the spec. |

Two sharp edges for the branch rail specifically:

- **Middle truncation exists but is unreachable.** `MiddleTruncate` and
  `Fruncate` (`TREES/components/OverflowText.d.ts:59,55`) implement exactly the
  spec's `chore/review-open-…-25cb4` treatment, with `split: 'leaf-path'` among
  the presets (`TREES/components/OverflowText.d.ts:22,40`). They are **not
  exported** from `@pierre/trees` or `@pierre/trees/react`, and the package's
  `exports` map declares only `.`, `./web-components`, `./react` and `./ssr`, so
  there is no deep-import route. They are also Preact components
  (`TREES/components/OverflowText.d.ts:1`). Sero writes its own.
- **Row decorations can't hold buttons.** `FileTreeRowDecoration` is
  `{ text, title? }` or `{ icon, title? }`
  (`TREES/model/publicTypes.d.ts:293-301`) — no click handler, no element. The
  spec's hover actions (Open in Explorer · Discard · Stage) are not row
  decorations. The only interactive per-row slot is the context menu
  (`TREES/model/publicTypes.d.ts:287`), which is a right-click or a dedicated
  button, not a hover row.

Neither package contains a commit graph. Grepping both `dist` trees for
graph or lane types returns nothing but an icon name.
`plugins/sero-git-plugin/ui/components/CommitGraph.tsx` (288 lines) stays
hand-rolled.

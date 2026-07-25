# Git UX

The approved design for every git-touching surface in Sero: which surface does
which job, what they all look like, where the code lives, and the order to build
it in.

**Status:** approved. Charted as wayfinder map
[#294](https://github.com/sero-labs/sero/issues/294); all eight tickets closed.
Architecture recorded as **AD-025** in [`../decisions.md`](../decisions.md).
This document is the assembly — where a decision needed argument, the argument is
in the ticket, and the ticket is linked.

**Companion:** AD-024 and [`vcs-unification.md`](./vcs-unification.md) settled the
git *infrastructure* below the UI. This settles the UI. The layer below is out of
scope except where the UI needs something it doesn't expose.

**Prototypes:** self-contained HTML, no build, on branch
`prototype/git-ux-surfaces` under `docs/prototypes/git-ux/` — `git-surfaces.html`
(explorer view, popover), `git-app.html`, `git-graph.html`, `git-states.html`,
`git-diff.html`, `git-rules.html`.

---

## 1. Surfaces

Four, and the mapping is the inverse of a sidebar-first product. The VS Code
model — one sidebar does everything — was tried here and is inadequate for the
work Sero users do. That inadequacy is *why* the full-screen Git app exists.
([#295](https://github.com/sero-labs/sero/issues/295))

| Surface | Owns | Never |
|---|---|---|
| **Git app** (full screen) | The real work: staging, commit, branches, history, graph, stashes, PR, conflicts | Editing files |
| **Explorer → Git view** | Reading what changed, then leaving | Committing, branching, PR, sync |
| **Titlebar popover** | Quick actions without changing context | Anything needing room |
| **Dashboard widgets** | Read-only glance | Acting |

Everything git-facing is called **Git**. The activity-bar item currently labelled
*Source Control* is renamed.

### The Explorer is modes, not panes

The Explorer's views swap: **Git** and **Editor** are peers, each reached from the
activity bar. Neither contains the other — the git views never show an editable
file, and the editor never shows a diff.

Opening a *file* from either git surface switches to the Editor view; the git view
goes away and returns unchanged when you switch back. This removes the current
defect where opening a diff replaces the whole editor **including its tab bar**,
stranding every open file behind a grey strip with an ×
(`ExplorerWorkspace.tsx:235`).
([#299](https://github.com/sero-labs/sero/issues/299))

### What is deleted

| Gone | Why |
|---|---|
| `DiffTab` as a mode over the editor | Diffs live in the git views. Not promoted to a real tab — removed |
| The plugin's hand-rolled `DiffViewer` and its 45%-width panel | Superseded by `DiffChangeset` |
| `BranchesSection`, `RemotesSection`, `CommitLog` as a control surface, `GitHubAuthBanner`, `PullRequestComposer` (explorer copies) | The panel stops trying to be complete |
| The status bar branch picker | Superseded by the Git app, unused ([#304](https://github.com/sero-labs/sero/issues/304)) |
| The Git app's private `--g-*` theme (17 variables) | Host design tokens throughout |
| `window.sero.gitApp` | No caller left once there is one data path |

---

## 2. Design rules

Thirty rules, extracted from the prototypes rather than argued from principle, so
each one is already demonstrated somewhere. A reviewer can hold a PR against any
of them. ([#297](https://github.com/sero-labs/sero/issues/297))

**Containers**

1. One bordered container per surface. Nothing inside it is a box; sections are
   separated by 1px hairlines in `--border-subtle`.
2. Controls may have a border; content may not. Inputs, ghost buttons and chips
   are controls. A grouping of content is not.
3. One exemption: a tinted bordered box is allowed when it holds something
   awaiting your input, and it disappears once answered. That admits the GitHub
   sign-in notice and the AI question box. A box that merely groups is a card and
   is not allowed.
4. Radius never grows inward — 4–5px chips and icon buttons, 6–7px buttons and
   inputs, 9–12px surface roots and dialogs.
5. Shadow only on things that float. Depth otherwise comes from background steps:
   base → surface (fields, sticky headers) → elevated (hover) → overlay
   (selected) → muted (pressed).

**Counts and chips**

6. Counts are plain text, never pills.
7. Pills carry names, not numbers — a branch, a tag, a remote, an account.

**Type**

8. One section-heading style: ~0.77rem, weight 500, `--text-muted`, slight
   tracking, sentence case. Uppercase is reserved for the panel title bar and
   graph column headers only.
9. Monospace is for machine values only — SHAs, line counts, sync arrows,
   timestamps, ref names, diff bodies. Prose is sans, including inside the diff
   pane.

**Density**

10. One row scale everywhere. File and branch rows are 25–26px on every surface;
    commit rows are 30px because they carry a lane graphic. Row text
    0.83–0.85rem, labels 0.76–0.78rem, meta 0.72–0.74rem mono. Surfaces differ in
    *what is in the row*, not how big it is. This explicitly rejects per-surface
    densities.

**Rows**

11. Rows are fixed height and never wrap. Long values truncate so the identifying
    part survives: file paths ellipsis with the directory dimmed, branch names
    middle-truncated, ref chips capped at 92px with a `+2` overflow count.
12. Row actions appear on hover and take the meta's place, so nothing reflows.
    20px icon buttons, no labels, destructive tinted red on hover only.
13. One selection model: hover `--bg-elevated`, selected `--bg-overlay`. No
    checkboxes anywhere.

**Lists**

14. No list grows the surface. Every list is bounded and scrolls in place with
    sticky section headers.
15. Group by what you must do about the item, not by type — Staged / Changes,
    Conflicts / Resolved / Merged cleanly. The list is the to-do list.

**Colour**

16. Brand green is the single primary action per surface; everything else is ghost
    or transparent.
17. Violet is identity-and-AI: HEAD, current branch, every AI affordance. AI is
    never green.
18. File status is one 6px dot — amber modified, green added, red deleted, blue
    new. The dot is the whole story: file rows carry no `+N −N` line counts (see
    step 4 in §11 for why the prototypes' counts were dropped).
19. Amber carries five meanings (modified file, behind count, detached-HEAD chip,
    warning banner, lane colour) and that is accepted. Each appears in a different
    place at a different shape; none are confusable in practice. Recorded so it is
    not relitigated per PR.

**Actions and feedback**

20. Unavailable actions are disabled, not hidden, and where the reason isn't
    obvious it is attached in place beneath the control — "2 conflicts left to
    resolve". Not a tooltip, not a toast.
21. No toasts. Progress happens inside the control that started it.
22. Errors follow the scope of what failed: an action reports where it was
    invoked, in the same slot as the disabled-reason hint; a repo-level failure
    uses the mode banner. This replaces the four mechanisms in use today.
23. Loading never blocks and never replaces content. No skeletons, no overlay
    spinners; stale data stays until fresh data arrives.
24. Three interruption levels only — banner (a repo mode you are in), inline
    tinted box (a question needing an answer, per rule 3), dialog (destructive and
    irreversible only).
25. Empty is centred and offers the next step: a heading, one sentence, up to two
    buttons. Small empties are a single muted inline row.

**Copy**

26. Verbs and objects the user already knows. No invented product nouns — *Ship
    deck*, *Quick sync*, *All in* are gone.
27. Buttons name their object: "Commit 8 files", not "Commit".
28. No status label for a state with no action — *Ready*, *Live refresh active*.
29. Borrow the vocabulary of whatever we wrap — current/incoming, not
    ours/theirs, because that is what `@pierre/diffs` says.
30. One name for the thing: **Git**.

### Two rules decided from drawings, not prose

Both were drawn at real size beside their alternatives and chosen from the
picture ([`git-rules.html`](https://github.com/sero-labs/sero/blob/prototype/git-ux-surfaces/docs/prototypes/git-ux/git-rules.html)):

- **Rule 12 stands.** The alternatives were a reserved 63px action slot on every
  row, and counts-plus-an-overflow-menu. The reserved slot truncates filenames on
  every row permanently to serve the one row you are pointing at.
- **Rule 19 stands.** Neutralising the modified dot makes amber meaningful but
  trades the loudest signal in the list for the rarest one, and a grey dot beside
  a grey filename is close to invisible.

---

## 3. The Git app

**Layout:** rail · (working tree + diff) · graph, split vertically with the graph
**below**. ([#302](https://github.com/sero-labs/sero/issues/302))

| Region | Contents |
|---|---|
| Rail, 214px | Branches, remotes, stashes. Lane colour shared with the graph |
| Upper, flexible | Working tree (Staged / Changes) left, diff right |
| Divider | Draggable; the graph header also collapses it. Position persists per workspace |
| Lower, graph | Full-width band: branch/tag · graph · commit · SHA · author · when |

The work you do constantly gets the top and the height; history is what yields
space when you drag. This dissolved the three-column-vs-graph-on-top question —
it is one layout with a divider, not a choice.

**The graph is real, not decoration.** Multi-lane with actual topology: forks
curve out, merges curve in, merge commits sit on the lane they merged *into*, an
unmerged branch's lane simply stops. Lane colour carries into the rail. Ref chips
capped at 92px with an overflow count, so the commit message is never pushed off
the row — the defect that made the current graph unreadable.

**Working tree.** Explicit Staged and Changes sections, not tickboxes. Per-row
actions on hover: unstaged gets Open in Editor · Discard · Stage; staged gets Open
in Editor · Unstage. Discard was missing entirely before.

**Also homed here.** PR compose is the right-hand pane, not a fourth surface, so
history stays visible beside it. GitHub sign-in lives in the top bar, with a
secondary line in the PR view explaining why it matters there.

**Branch rail** uses middle-truncation so branches sharing a long prefix stay
distinguishable, and marks a branch checked out in a worktree `WT` rather than
listing it twice. Remotes are a group heading, so `origin` is not also a branch
row.

---

## 4. Explorer Git view

Changes and history on the left at 300px, the diff filling the rest.
([#301](https://github.com/sero-labs/sero/issues/301),
[#299](https://github.com/sero-labs/sero/issues/299))

The two lists share a fixed height: **Changes takes what it needs up to half the
view then scrolls; History takes the remainder and scrolls too.** Changes never
gets pushed out of view by a long history, and history never disappears because
you touched a lot of files. Both section headers stay put while their list
scrolls.

Clicking either list opens the diff in this view. Clicking a row's file icon
switches to the Editor. A link to the Git app sits at the foot.

**Deliberately thin — and what it does *not* have:**

- No commit box, branch list, PR form or auth banner (all in the Git app).
- **No sync header.** The titlebar popover already owns quick sync and is
  reachable from every view; repeating branch, counts and Fetch/Pull/Push here
  would be the same three buttons in two places.
- **No file list inside the diff.** The changes list on the left *is* the file
  list, so the diff runs full width. `DiffTab.tsx:98` already hides the 220px
  navigator below two files; the rule widens to "only where nothing else lists
  the files", which means neither git view shows it.

---

## 5. Titlebar popover

300px, down from 420px, and it now shows the files it is about to commit.
([#301](https://github.com/sero-labs/sero/issues/301))

Keeps its commit box. The change list **scrolls at five rows**, so the popover is
the same height with one changed file or eighty and the commit button never moves.
Committing only *some* of them is what the Git app is for.

**AI commit drafting** is a sparkle inside the message field, not a second button
competing with Commit. It spins in place and the message fills in. No toast, no
status line.

Below the commit box: Fetch · Pull · Push, then a link to the Git app.

The trigger carries **one** count, not two.

**Removed, and why:**

| Gone | Reason |
|---|---|
| Hero sentence ("Wrap up the current changes…") | Told you nothing you couldn't see |
| Stats strip (`22:58:06 · 0 staged · 1 changed · 0↑/0↓`) | Four facts, three repeated in the same popover |
| Commit and Pull-request bordered boxes | Cards inside a card |
| The PR form | Never fitted a popover, and was byte-identical to the sidebar's |
| "Ready", "Live refresh active" | Status labels for states with no action |
| `Ship 1` *and* `1 changed` in the trigger | Two counts for one file |

---

## 6. Dashboard widgets

Unchanged in job: read-only quick reference, never act. They are already the one
surface composing the shared `@sero-ai/ui` component set, so they need the design
rules applied but no redesign.

---

## 7. The hard states

All reuse the agreed Git app layout, so none is a special screen anyone has to
learn. ([#302](https://github.com/sero-labs/sero/issues/302),
[`git-states.html`](https://github.com/sero-labs/sero/blob/prototype/git-ux-surfaces/docs/prototypes/git-ux/git-states.html))

### Merge conflict

A mode the app announces and can leave. A banner states what is happening and
carries **Abort merge**, the only place it applies.

- **Files are grouped by what you must do about them** — Conflicts, Resolved,
  Merged cleanly. The list is the to-do list.
- The diff pane becomes a conflict resolver: inline unified, current/incoming
  vocabulary, per-conflict accept actions, plus file-level *Accept all current* /
  *Accept all incoming*.
- Fetch, pull, push and PR are **disabled, not hidden**.
- The commit button is disabled **with a count** — "2 conflicts left to resolve".
- The graph shows the merge as a dashed, unfinished node with both parents
  visible.

**The resolver is mostly adoption, not construction** — but read §9 for the one
part that is genuinely ours.

### Resolve with AI

**Automatic, not a proposal queue.** One button; it resolves what it can and
applies as it goes; it interrupts only when it genuinely cannot decide, and then
asks a specific question with the real options.

- **A question blocks that conflict, not the run** — independent conflicts carry
  on behind it.
- **Stop keeps completed resolutions** — they are ordinary working-tree changes.
- **`Undo AI resolutions`** reverts only the machine's work and leaves your
  answers alone.
- **AI-resolved files stay marked**, so a week later you can tell which
  resolutions were yours.
- **The model carries your answer forward** to related conflicts. A per-conflict
  review loop structurally cannot do that, and it is the argument for
  automatic-first.
- **The gate is at the merge, not at each conflict.** Nothing is committed;
  `Abort merge` is untouched.

Declining is the model's call and it gives its reason — **not a confidence score
we invented**. A model that always answers is worse than one that declines,
because you stop reading its output.

### Repository with no commits

The unborn branch is **shown, not hidden** — `main` exists as a name even with
nothing on it. **Publish to GitHub** replaces **Create pull request** in the same
slot. Untracked files get a `new` status of their own. The graph explains itself
rather than rendering an empty grid.

### Detached HEAD

The state most likely to lose work silently, so it says so plainly and offers both
ways out: **Create branch here** or **Return to main**.

`HEAD` appears in the rail as its own entry — the rail always answers "where am
I". Committing is disabled with the reason attached. Push and PR off; **fetch
stays on**, because it is harmless. `HEAD` is marked on the graph in warning
colour, distinct from any branch tag.

### Switching branch with uncommitted changes

**The only dialog in the app**, because it is the only action that can destroy
work. Three named outcomes: **bring them along** (default, what git does when
there is no conflict), **stash first**, **discard**.

---

## 8. Architecture

**AD-025: the plugin owns git — every view *and* the renderer-side repo cache.**
The host owns the git service (AD-024) and the extension points views mount into.
No git UI and no git state in `apps/desktop`.
([#298](https://github.com/sero-labs/sero/issues/298))

### Views are contributed, not imported

Both git surfaces ship from `sero-git-plugin` and mount through the mechanism that
already serves global search — `sero.app.search` → `GraphifySearch`, mounted by
`GlobalSearchDialog` via `SearchContributionMount`: a manifest slot, a selector,
and a mount wrapping the federated component in `AppProvider` +
`PluginStyleScope`.

**The seam is placement vs content.** The host contributes the slot; the plugin
contributes what goes in it. That is principled rather than incidental because it
already governs search and dashboard widgets.

A Git view slot costs the ~12-file floor from
[#296](https://github.com/sero-labs/sero/issues/296) plus three closed lists,
one of which is a data-loss trap:

| Seam | File | Note |
|---|---|---|
| `ExplorerPanel` union + hardcoded `items` | `ActivityBar.tsx:9,19-25` | Activity-bar entries become manifest-driven |
| `EXPLORER_PANELS` validator | `stores/explorer.ts:33-43` | Rejects unknown ids, so a persisted plugin view **silently resets to `explorer`**. Handle deliberately — keep the id, show a placeholder — not by widening the set |
| Main-area routing | `ExplorerWorkspace.tsx:233` | `browser` is the existing precedent for a view that takes the main area |

The titlebar popover needs a titlebar slot, priced at ~13 files and strictly
cheaper (no union, no persistence). One real decision there, not a copy-paste:
`PluginStyleScope` portals to `document.body` and so does Radix `PopoverContent`,
so who owns the `Popover` matters.

### One state path

The three renderer paths — `useAppState` + `gitApp.run`, `useVcsStore` +
`window.sero.vcs`, and bare `window.sero.vcs.pr*` — collapse into **one store
owned by the plugin**, calling `window.sero.vcs` directly.

**Nothing is published for it.** No vcs hook in `@sero-ai/app-runtime`, so no
public surface to keep stable and no version floor for repo data.

Nothing is lost by moving it. Every action outside the cached reads is the same
shape — call the bridge, then refresh (`stores/vcs.ts:234-251,295-298`). The
pagination, working-copy status, branch and remote lists and diff cache move
as-is, and the ref-counted pushed-state subscription moves with them, started by
the plugin instead of `useExplorerRuntimeEffects`.

Two host consumers are dealt with rather than worked around:

- The **status bar branch picker** is deleted
  ([#304](https://github.com/sero-labs/sero/issues/304)).
- **Checkpoint restore** (undoing a chat turn) calls `window.sero.vcs` directly —
  three one-shot calls in a dialog that gain nothing from caching, and it keeps a
  host feature from depending on the git plugin being installed.

### View state

A contributed view unmounts when hidden. The data survives it: plugin code runs in
the host's own JS realm and the federated module stays loaded, so the plugin's
store outlives its views exactly as a host store would. Only **position** is lost,
and the plugin keeps it:

- **Graph divider** → the plugin's persisted app state, per workspace.
- **Selected file and scroll offset** → a memory cache.

**Rejected: the host holding contributed views mounted-but-hidden.** It would bind
every contributed view of every plugin to staying in memory with no opt-out, keep
invisible subscriptions running, and mask staleness bugs until a restart.

**Rule:** a module-scoped view cache **must** be keyed by workspace or cleared on
workspace change. The host already discards its diff on workspace change for this
reason (`useExplorerEditorState.ts:40-43`); `GraphifySearch`'s cache is *not*
keyed, so it is the example of the bug, not the pattern to copy wholesale.

### Shared primitives

**Inside the plugin**, not promoted to `@sero-ai/ui` or `@sero-ai/common`. The
file row, branch row, section header, commit box and diff pane serve two surfaces
that both ship from the plugin — and rule 10, one row scale everywhere, is what
makes them shareable at all. Promoting them would put git-shaped components in a
general design-system package and add a republish to every change. If a third
non-plugin surface ever needs one, that is the moment to promote it.

### Styling

Scoped plugins **do** inherit host design tokens, by ordinary custom-property
inheritance — `packages/ui/src/styles/plugin.css` defines no concrete colours, so
there is nothing in the plugin bundle to shadow the host. The `--g-*` theme dies
with no replacement needed.

### Dependencies move with the views

`@pierre/diffs` and `@pierre/trees` come out of `apps/desktop/package.json` and
into the plugin. All host usage is five files in one folder
(`components/apps/explorer/editor/` — `DiffTab`, `DiffChangeset`,
`DiffFileNavigator`, `diff-themes.ts`, `diff-view.css`); nothing else in the host,
no other plugin, no shared package.

Two things verified rather than assumed:

- The library **renders into a shadow root and injects its styles there**
  (`components/File.js:473-475`), so the plugin build's `@scope` rewrite neither
  reaches nor breaks it, and token alignment still works because custom
  properties inherit across the boundary.
- `editorThemeId` lives in the host store and persists to `layout.json`
  (`stores/app/state.ts:80,283-286`) while the plugin context carries only
  `themeMode` and `themePresetId` (`app-runtime/src/context.ts:29`). It must be
  added to the published context.

### Published API changes

One `@sero-ai/app-runtime` release, carrying **one** thing and nothing about vcs:

1. `editorThemeId` on the plugin context.

~~2. Open-file-**and-switch-view**.~~ **Corrected during step 1 — this already
works.** The claim was that `openSeroFile` opens a tab without changing
`activePanel`. It does change it: the call reaches `useEditorBridge`'s
`focusEditor` (`stores/editor-bridge.ts:63-70`, added in #177), which sets
`activePanel: 'explorer'`, opens the sidebar and switches the active app. A file
opened from a git surface therefore reveals the editor as intended, contributed
view included. No host change was needed; a test now pins the behaviour
(`lib/app-control-bridge.test.ts`).

External plugins pin the package, so this needs a version bump plus a
`requiredHostCapabilities` floor.

---

## 9. Adopt, don't build

`@pierre/diffs` is pinned at 1.2.12 and Sero uses a small fraction of it. Full
inventory with file:line citations:
[`../research/pierre-diffs-inventory.md`](../research/pierre-diffs-inventory.md).
([#303](https://github.com/sero-labs/sero/issues/303))

Sixteen places the build should adopt rather than write, including the whole
conflict model (`UnresolvedFile`, the marker regexes, `resolveConflict`),
`resolveRegion()` for sub-hunk resolution, gutter-utility hover actions, line
selection, hunk expansion, and `@pierre/trees`' `FileTree` for the working-tree
list with live status patching.

**Three sharp edges the build must know about:**

1. **The React `UnresolvedFile` never tells you a conflict was resolved.** The
   vanilla class exposes `onMergeConflictResolve(file, payload)` with the resolved
   contents; the React wrapper drops it, installs its own handler and keeps the
   result in local state. Click *Accept current change* and nothing is written and
   nothing outside is notified. Passing `renderMergeConflictUtility` to escape
   that force-disables the built-in action row. So parsing, rendering and the
   resolution engine are free, but **the accept buttons are ours**, because Sero
   must persist.
2. **`diffAcceptRejectHunk` is not a path to hunk staging.** It rewrites the diff
   in memory only; there is no patch serialiser, so nothing to feed
   `git apply --cached`. It is genuinely useful as optimistic UI after a stage.
   Per-hunk staging is not offered by this design.
3. **AI resolutions cannot go through `resolveConflict()`** — its type is the
   closed union `'current' | 'incoming' | 'both'`, so a resolution that is neither
   side must write file contents and re-parse. State this or someone will try and
   find the type won't allow it.

**Standing rule:** before designing any git view, check what `@pierre/diffs`
already renders.

---

## 10. Net-new backend work

Everything else in this document is a move, a delete or an adoption. These four
are new:

| Work | Shape |
|---|---|
| **Commit-message drafting** | Sibling of `prGenerateDraft` (`electron/ipc/integrations/vcs.ts:192`): `runAdhocAgent`, new prompt, the staged diff as input |
| **AI conflict resolution** | `runAdhocAgent`, new prompt, structured output validated per conflict, plus the question/answer loop and forward-carrying of answers |
| **Writing AI resolutions** | Not `resolveConflict()` (§9.3) — write file contents and re-parse |
| **The conflict accept buttons** | Not the library's (§9.1) — ours, because we persist |

---

## 11. Build order

Sliced so the app works at every step and nothing sits half-migrated. Each step is
independently shippable.

**Step 1 — host affordances (nothing user-visible changes). Done.**
Add `editorThemeId` to the plugin context; publish `@sero-ai/app-runtime` with
the version floor. Add the Explorer view slot and the titlebar slot, including
the deliberate handling of an unknown persisted `activePanel`. No git code moves
yet. Open-file-and-switch-view turned out to be already implemented (see §8,
*Published API changes*).

Built as `sero.app.explorerView` and `sero.app.titlebar`, mirroring
`sero.app.search`, behind the host capabilities `ui.explorerView` and
`ui.titlebar`. Two things settled while building it:

- **The titlebar popover question is answered: the plugin owns the `Popover`.**
  `@sero-ai/ui`'s Radix wrappers already portal into the container
  `PluginStyleScope` provides, so a plugin-owned popover stays inside the
  plugin's style scope instead of landing unscoped on `document.body`.
- **A contributed Explorer view takes the whole area**, sidebar included, which
  is what §4's layout needs. `panelOwnsMainArea()` (`lib/explorer-panels.ts`) is
  the single rule, shared by the browser panel.

**Step 2 — clear the host's git state consumers. Done.**
Convert checkpoint restore to call `window.sero.vcs` directly. The status bar
branch picker is **done** ([#304](https://github.com/sero-labs/sero/issues/304),
`a103dcaab`) — `push()` turned out not to read `activePushBranch` at all, callers
pass it. `useVcsStore` is then used only by git UI that is about to go.

The restore path needed no refresh call of its own, and no new signal: both
routes (`agent.undoToTurn` and `vcs.restore`) reach `vcsManager.restoreCheckpoint`,
which emits `restored`, which the main process broadcasts and the git store
already subscribes to (`stores/vcs.ts:134-160`). The hook's manual
`loadWorkspace()` was duplicating that push. The plugin's store subscribes to the
same event at step 4.

The one remaining non-git-UI consumer is `useExplorerRuntimeEffects`, which §8
already assigns to step 4.

`activePushBranch` deliberately stays in the store until step 4: `CommitDetail`,
`BranchesSection` and `VcsPanel` still read it and all three die there. **Do not
recreate it in the plugin store** — the new design has no active-push-branch
concept. Push pushes the current branch, and the rail is where you change branch.
The auto-select-main fallback (`stores/vcs.ts:335-354`) goes with it.

**Step 3 — move the diff into the plugin. Done.**
Move the five `editor/` diff files and the two `@pierre` dependencies into
`sero-git-plugin`. The plugin's existing Git app starts rendering `DiffChangeset`
in place of its hand-rolled `DiffViewer`. The host's `DiffTab` still exists and
still works — this step adds nothing broken.

Three things it turned out to need, none of them optional:

- **The deps are copied, not moved, until step 4.** The host's `DiffTab` still
  renders diffs, so `@pierre/diffs` stays in `apps/desktop` until the cutover
  deletes it. Both now point at one pinned catalog entry, so the two surfaces
  cannot render diffs with different versions of the library.
  `@pierre/trees` stays in the host only — the git views show no file navigator
  (§4), so the plugin takes it at step 5 when the working-tree list adopts
  `FileTree`.
- **The diff pane reads the two sides itself.** The extension is no longer asked
  for a diff, which removes the wait-for-a-refresh dance the old pane needed.
  The revision pair is the whole design: staged is `HEAD`→index, unstaged is
  index→working tree, a commit is `hash^`→`hash`. The index is reachable because
  `getFileContent` runs `git show <rev>:<path>` and an empty rev means the index
  — no backend change. **Getting this wrong is invisible**: comparing a staged
  file against the working tree renders a perfectly plausible, wrong diff, so the
  mapping is unit-tested and screenshot-verified against a real repo
  (`e2e/git-diff-pane.workflow.spec.ts`).
- **Git paths are repo-relative; the host's file bridge is workspace-rooted and
  refuses to read outside the workspace.** Those roots coincide in the normal
  case and not always. The plugin translates between them
  (`ui/lib/repo-paths.ts`) and, when a file genuinely lies outside the
  workspace, says so — an unreadable side is never treated as an empty file,
  which would render a whole file as deleted.

`editorThemeId`'s shiki mapping moved to `@sero-ai/common` so the plugin's diff
colours the code exactly like the host editor without a second copy of the table.

**Step 4 — the Explorer Git view, and the cutover. Done.**
Build the contributed Git view (§4) with the plugin's own store. Route the
activity-bar item to it. In one commit: delete `VcsPanel` and its sections,
`DiffTab` and its render path, and the host `useVcsStore`. This is the only step
where two implementations exist at once, and it is a single commit.

The panel id stayed `git` — the plugin's app id is also `git`, so a persisted
selection survives the move with no migration. `git` simply left
`BUILTIN_EXPLORER_PANELS`, and step 1's rule (a non-built-in panel fills the
main area) routed it.

Found while building it:

- **An exposed federated module must have a default export.** The host's loader
  resolves `mod.default` and reports nothing but "failed to load remote"
  otherwise — a named-only export mounts a blank panel. The other three exposed
  modules already had one; this is worth knowing before the titlebar
  contribution in step 6.
- **`@pierre/trees` stayed in the host.** Neither git view shows a file
  navigator (§4), so the plugin takes it at step 5, when the working-tree list
  adopts `FileTree`.
- **`PullRequestComposer` is not deleted yet.** §1 lists it among the explorer
  copies to remove, but the titlebar popover still renders it until step 6.

**Decided during step 4: file rows carry no `+N −N` counts, anywhere.** The
prototypes draw them; they are removed from the design.

The repo cache is refreshed by one `git status --porcelain` call, which reports
paths and statuses and no line counts. Real counts mean two more `git diff
--numstat` calls (staged and unstaged are separate questions) on every refresh —
and in live mode a refresh fires whenever files change on disk, so git would be
diffing the contents of every changed file continuously. Three cases have no
clean answer either: untracked files don't appear in `git diff` at all, binary
files report a dash, and a partly-staged file has two different sets of numbers
while the list shows one row per path.

The status dot already says what happened to the file, which is what the list is
for; the diff itself is one click away. Rule 6 (counts are plain text) still
governs the counts that remain, such as `Changes 8`.

**Step 5 — rebuild the Git app. Done, bar one thing.**
Apply §3 inside the plugin: rail, working tree, graph band, draggable divider,
per-row actions, PR compose in the right pane, sign-in in the top bar. Retire the
`--g-*` theme. Retire `window.sero.gitApp` once nothing calls it.

Done: the layout (rail · working tree + diff · history band under a draggable
divider that persists per workspace), the working tree with its Staged/Changes
sections and hover actions, the 214px middle-truncating rail, 30px graph rows
with capped ref chips, and the death of the `--g-*` theme.

**Discard** is new — §3 notes it was missing entirely. It is a new git action,
narrow by design: one named file, never an "all" sweep, untracked files
untouched. Rule 24 reserves dialogs for the dirty branch switch, so the row asks
a second time in place instead.

**PR compose** is the right-hand pane, sharing the column with the diff —
selecting a file or a commit takes the column back. Sign-in sits in the top bar,
and the pane stays reachable when signed out so it can say why creation is off
rather than hiding. The host's composer is untouched: the titlebar popover still
renders it until step 6 deletes that form.

**Lane colour is shared.** One graph layout is computed in the app and read by
both surfaces, so a branch is the same colour in the rail and in the graph.

Still open:

- **`window.sero.gitApp` cannot be retired yet, and §11 assumes it can.**
  Staging, committing, stashing, checkout, merge and cherry-pick exist only as
  `gitApp.run` actions; `window.sero.vcs` has no equivalent. Retiring the bridge
  means adding those to the vcs surface first, which is net-new backend work §10
  does not list. The rebuild uses `gitApp.run` for mutations and the plugin
  store's `window.sero.vcs` for reads, which is one path per concern rather than
  the three AD-025 set out to remove.
That is the only part of §3 not delivered, and it is a backend gap rather than
a UI one.

**Step 6 — the titlebar popover.**
Move it to a plugin contribution on the titlebar slot from step 1, at 300px, per
§5. Delete the Ship deck.

**Step 7 — the hard states.**
Conflict mode, empty repo, detached HEAD, dirty branch switch (§7), adopting
`UnresolvedFile` and supplying our own accept buttons.

**Step 8 — the AI features.**
Commit-message drafting, then AI conflict resolution with its question loop
(§10).

**Step 9 — sweep.**
Design rules (§2) across the dashboard widgets and anything missed. Check every
touched file against the 500-LOC rule.

Steps 1–2 can run in parallel with each other. Steps 7 and 8 depend only on
step 5.

---

## Out of scope

- The git/VCS infrastructure below the UI — AD-024 and
  [`vcs-unification.md`](./vcs-unification.md) settled it.
- **Per-hunk staging** — the library cannot serialise a patch (§9.2), so it would
  be built from scratch. Not part of this design.
- The general plugin-mount inconsistency: manifest slots always wrap in
  `PluginStyleScope`, runtime-registered widgets never do, and only `SeroAppMount`
  reads `styleIsolation`. Settled for git by using manifest slots; still a trap
  for the next surface that moves between mechanisms.

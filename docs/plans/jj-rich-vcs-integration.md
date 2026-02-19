# Rich JJ VCS Integration — Sero Source Control

## Status
- **State:** Phase 1–4 Implemented
- **Created:** 2026-02-18
- **Updated:** 2026-02-18

## Vision

Transform Sero's VCS panel from a basic checkpoint list into a **full-featured source control experience** — a JJ-native alternative to VSCode Source Control + GitLens, purpose-built for an agent-first workspace.

The key insight: JJ is not Git. It has first-class concepts (changes vs commits, bookmarks vs branches, automatic rebase, first-class conflicts, operation log/undo) that enable a fundamentally better UX than wrapping Git. This plan leans into JJ's strengths rather than imitating Git GUIs.

---

## What Exists Today

| Layer | What's built | Limitations |
|-------|-------------|-------------|
| **Backend** (`electron/vcs/`) | `VcsManager` — init, checkpoint create/list/restore, diff (unified text), fs watcher | No bookmarks, remotes, push/fetch, conflict detection, log graph, status, describe, squash, split, rebase, undo, operation log |
| **IPC** | 8 channels (list, state, create, restore, diff, watch, unwatch, event) | No structured diff (just raw git-diff text), no bookmark/remote/conflict channels |
| **Store** (`stores/vcs.ts`) | Workspace-scoped checkpoint list, lastDiff (string), loading/error | No parsed diff model, no bookmark state, no remote state, no conflict state |
| **UI** (`vcs/VcsPanel.tsx`) | Card-per-checkpoint with Diff/Restore/Set-base buttons, raw diff `<pre>` block | Cards too bulky for 100s of checkpoints, no syntax highlighting on diffs, no graph, no branch/remote views |

## Architecture Principles

1. **JJ-native, not Git-with-extra-steps.** Use bookmarks (not "branches"), changes (not "commits"), revsets for queries. Expose JJ's unique powers: automatic rebase, first-class conflicts, operation undo, `jj absorb`, `jj squash`.

2. **Monaco for diffs.** Already in the project (`@monaco-editor/react` + `monaco-editor`). Monaco has a built-in `DiffEditor` that supports inline and side-by-side views, syntax highlighting for every language, and minimap. Zero new dependencies for the diff viewer.

3. **Agent-aware.** The agent can read VCS state, the VCS panel shows agent activity, and push/sync operations can be triggered by the agent or the user.

4. **Compact log, rich detail-on-demand.** The checkpoint/change list is a dense text log (like `jj log` output). Clicking a row expands inline detail or opens a diff tab in the editor area.

---

## Feature Map: JJ CLI → Sero UI

### Tier 1 — Core (High Impact, Medium Effort)

| Feature | JJ Commands | UI Surface | Notes |
|---------|------------|------------|-------|
| **Compact Change Log** | `jj log -T <template> --limit N` | Replaces card list. Dense rows: graph glyph + change ID + description + age + bookmarks. Paging via "Load more" / virtual scroll. | Like your reference screenshots — GitKraken-density but JJ-native. |
| **Monaco Diff Viewer** | `jj diff --from X --to Y --git` → parse → Monaco `DiffEditor` | Opens as a tab in the editor area (like VSCode's diff tabs). File-level navigation in a sidebar within the diff view. | Use `diff` npm package (already installed) to parse hunks; feed to Monaco `DiffEditor`. |
| **Inline Change Detail** | `jj show -r <rev> --summary` + `jj diff -r <rev> --stat` | Expand-on-click below log row: file list with +/- stats, "Open Diff" per file. | Like GitLens commit detail. |
| **Working Copy Status** | `jj status` → parse modified/added/deleted/conflicted | Status section at top of VCS panel: grouped file list with stage indicators. Click opens diff vs parent. | JJ auto-snapshots, so this is always fresh. |
| **Describe (Edit Message)** | `jj describe -r <rev> -m "..."` | Inline edit on any mutable change's description. Double-click or edit icon. | JJ lets you edit any mutable change description, not just HEAD. |
| **Bookmark Management** | `jj bookmark list`, `create`, `move`, `delete`, `rename` | Collapsible "Bookmarks" section in VCS panel. Create/move/delete actions. Shows tracking status for remotes. | JJ bookmarks ≈ Git branch pointers but more flexible. |

### Tier 2 — Remote & Sync (High Impact, Higher Effort)

| Feature | JJ Commands | UI Surface | Notes |
|---------|------------|------------|-------|
| **Remote Management** | `jj git remote add/list/remove/set-url` | Settings-style panel or modal: add remote (name + URL), list existing, remove. | One-time setup per workspace. |
| **Fetch** | `jj git fetch --remote <name>` | Button in VCS panel header or bookmark section. Shows progress/result toast. | Fetches all tracked bookmarks by default. |
| **Push** | `jj git push --bookmark <name>` or `--change <rev>` | Push button per bookmark (if ahead of remote). Or "Push Change" action on any revision. `--dry-run` preview first. | JJ's `--change` auto-creates a `push-<id>` bookmark — great for quick sharing. |
| **Fetch + Rebase** | `jj git fetch` → JJ auto-rebases (built-in!) | After fetch, show notification if local work was rebased. Log updates automatically. | **This is JJ's killer feature** — no manual rebase/merge needed after fetch. |
| **Push Status Indicators** | Template: `bookmarks.map(|b| b.name ++ if(b.remote, " ↑"))` | In bookmark list and log: ↑ (ahead), ↓ (behind), ↑↓ (diverged), ✓ (synced). | Parse from `jj bookmark list --all-remotes`. |

### Tier 3 — Advanced JJ Power Tools (Medium Impact, Medium Effort)

| Feature | JJ Commands | UI Surface | Notes |
|---------|------------|------------|-------|
| **Squash** | `jj squash` / `jj squash --from X --into Y` | "Squash into parent" action on change rows. Or drag-and-drop squash between changes in the log. | Combines changes. JJ's squash is cleaner than Git's interactive rebase. |
| **Split** | `jj split -r <rev>` (with file selection) | "Split" action on a change → shows file list with checkboxes → selected files go to first change, rest to second. | No interactive diff editor needed — file-level split is the 80/20. |
| **Absorb** | `jj absorb` | "Absorb" button when working copy has changes. One-click: distributes hunks to the right ancestor changes. | JJ's `absorb` is magic — like `git absorb` but built-in. |
| **Rebase** | `jj rebase -r <rev> -o <dest>` | Drag-and-drop in the log graph, or "Rebase onto..." context menu action with revset picker. | JJ rebase is fast and conflict-aware. |
| **Undo** | `jj undo` / `jj operation log` | "Undo last operation" button in VCS panel header. Operation log as a secondary view. | JJ's operation log is a complete audit trail — every mutation is undoable. |
| **Conflict Resolution** | `jj resolve --list` → detect, `jj diff` → show conflict markers | Conflict indicator on changes + files. Monaco editor shows conflict markers with accept/reject actions. | JJ stores conflicts as first-class tree states, not marker-littered files. |

### Tier 4 — Graph & Visualization (High Polish, Higher Effort)

| Feature | JJ Commands | UI Surface | Notes |
|---------|------------|------------|-------|
| **DAG Graph** | `jj log --revisions '::@' -T <graph-template>` | SVG/Canvas graph alongside the log rows (like your GitKraken screenshot). Branches, merges, parallel revisions visible. | Start with simple text graph from `jj log`, graduate to rendered SVG. |
| **Interdiff** | `jj interdiff --from X --to Y` | "Compare iterations" — see what changed between two versions of the same change (useful for reviewing agent rewrites). | Unique JJ feature — shows how a change evolved. |
| **Operation History** | `jj operation log -T <template>` | Secondary tab/view in VCS panel (like your "Operations history" reference screenshot). Undo to any operation. | Complete audit trail. |

---

## Detailed Design

### 1. Compact Change Log (Replaces VcsPanel checkpoint cards)

**Current problem:** Each checkpoint is a card with 3 buttons, taking ~60px height. At 100+ checkpoints, the panel is unusable.

**New design:** Dense text rows inspired by `jj log` output and your reference images.

```
┌─ Source Control ───────────────────────────────────┐
│ ┌─ Working Copy ─────────────────────────────────┐ │
│ │  M  src/App.tsx                                │ │
│ │  A  src/utils/helpers.ts                       │ │
│ │  D  old-config.json                            │ │
│ │  [Checkpoint]  [Absorb]  [Describe: ...]       │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ┌─ Bookmarks ────────────── [+] [Fetch] [Push] ─┐ │
│ │  main          ✓ synced                        │ │
│ │  feature/auth  ↑ 3 ahead                       │ │
│ │  push-kxvmq    ↑ 1 ahead                       │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ┌─ Changes ────────────────────── [Undo] [⟳] ───┐ │
│ │  @  kxvmqprl  2m  checkpoint: turn ...    (wip)│ │
│ │  ○  rstuwnxy  5m  feat: add auth hook          │ │
│ │  ○  mlxxkkvr  12m checkpoint: turn ...         │ │
│ │  ○  qwulvsrz  18m fix: correct import path     │ │
│ │  ○  abcdefgh  1h  initial scaffold             │ │
│ │  ◆  00000000      (root)                       │ │
│ │                                                │ │
│ │  ── page 1 of 4 ── [← Prev] [Next →] ──       │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ┌─ Remotes ──────────────────────────────────────┐ │
│ │  origin  git@github.com:user/repo.git  [Edit]  │ │
│ └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

**Row format:**
```
<glyph> <changeId:8>  <age>  <description:truncated>  [bookmark-badges]
```

**Interactions per row (on hover / right-click context menu):**
- **Click** → expand inline detail (file list + stats)
- **Double-click description** → inline edit (`jj describe`)
- **Context menu** → Restore, Diff vs parent, Diff vs working copy, Squash into parent, Rebase, Split, Copy change ID, Create bookmark here, Abandon

**Paging:** Server-side via `jj log --limit N` with offset. "Load more" button or `← Prev / Next →` nav. Start with 40 per page.

### 2. Monaco Diff Viewer

**Approach:** Open diffs as editor tabs, not inline in the VCS panel.

```
┌─ EditorTabBar ──────────────────────────────────────┐
│  App.tsx │ helpers.ts │ App.tsx (Diff: abc12 → def34) │
├─────────────────────────────────────────────────────┤
│  ┌─ File Nav ─┐  ┌─ Monaco DiffEditor ────────────┐ │
│  │  M App.tsx  │  │  --- a/src/App.tsx              │ │
│  │  A helper.. │  │  +++ b/src/App.tsx              │ │
│  │  D config.. │  │  @@ -10,6 +10,8 @@             │ │
│  │             │  │   import { useState }            │ │
│  │             │  │  +import { useAuth }             │ │
│  │             │  │  +import { AuthProvider }        │ │
│  └─────────────┘  └────────────────────────────────┘ │
│        [Inline ↔ Side-by-side]  [Previous ↑] [Next ↓]│
└─────────────────────────────────────────────────────┘
```

**Data flow:**
1. User clicks "Diff" on a change or file → IPC: `vcs.fileContent(workspaceId, revset, path)` for both sides
2. Main process: `jj file show -r <rev> <path>` for left, `jj file show -r <rev2> <path>` for right
3. Feed both strings to Monaco `DiffEditor` component with appropriate language detection
4. File navigation sidebar: parsed from `jj diff --from X --to Y --summary`

**New JJ commands needed:**
- `jj file show -r <rev> <path>` — get file content at a specific revision
- `jj diff --from X --to Y --summary` — structured file change list
- `jj diff --from X --to Y --stat` — histogram stats

### 3. Remote & Sync Flow

**Setup flow:**
1. User opens VCS panel → "Remotes" section shows "No remotes configured"
2. Click [+ Add Remote] → inline form: name (default: "origin") + URL
3. Backend: `jj git remote add <name> <url>`
4. Remotes section updates to show the remote

**Sync flow:**
```
[Fetch]  →  jj git fetch --remote origin
             └─ JJ automatically rebases local work on top of fetched changes
             └─ Log refreshes, toast: "Fetched 3 new changes, rebased 2 local changes"

[Push]   →  jj git push --bookmark <name> --dry-run   (preview)
             └─ Show "Will push 3 changes to origin/feature-auth" confirmation
             └─ jj git push --bookmark <name>          (execute)
             └─ Toast: "Pushed feature-auth to origin"

[Sync]   →  Fetch + Push in sequence (convenience button)
```

**Push by change (JJ-unique UX):**
- Right-click any change → "Push this change"
- Backend: `jj git push --change <changeId>` → auto-creates `push-<shortid>` bookmark
- Great for sharing WIP with no manual bookmark management

**Auth:** SSH forwarding already works via container `--ssh`. For HTTPS, use Git credential helpers configured in the workspace.

### 4. Conflict Detection & Resolution

JJ stores conflicts as first-class objects — no marker-littered files.

**Detection:**
- `jj log -r 'conflicts()' -T <template>` — list all revisions with conflicts
- `jj resolve --list -r <rev>` — list conflicted files in a revision

**UI:**
- Conflict badge on change rows in the log (⚠️ icon)
- Conflict section in working copy status
- Click conflicted file → opens in Monaco with JJ conflict markers
- Action buttons: "Accept Left", "Accept Right", "Accept Both" (via `jj resolve --tool :ours/:theirs`)
- For complex merges: "Open in Editor" (manual conflict marker resolution, JJ detects when markers are resolved)

### 5. Bookmark Manager

**Section in VCS panel with columns:**
```
Name              Tracking          Status     Actions
main              origin/main       ✓ synced   [push] [delete]
feature/auth      origin/feat..     ↑ 3 ahead  [push] [delete]
push-kxvmq        (local only)      —          [push] [delete]
origin/main       (remote)          ◆          [track]
```

**Actions:**
- [+ Create] → name input + target revision (default: @)
- [Move] → move bookmark to different revision
- [Delete] → `jj bookmark delete` (propagates deletion on next push)
- [Track/Untrack] → `jj bookmark track/untrack`
- [Rename] → `jj bookmark rename`

---

## Implementation Phases

### Phase A: Backend Expansion (electron/vcs/)

Extend `VcsManager` with new methods. Extend `JjRunner` if needed. New IPC channels.

| Method | JJ Command | Returns |
|--------|-----------|---------|
| `getStatus(wsId)` | `jj status` (parsed) | `{ modified, added, deleted, conflicted, empty }` |
| `getLogEntries(wsId, revset, limit, offset)` | `jj log --no-graph -T <json-template> -r <revset> --limit N` | `ChangeEntry[]` (structured) |
| `getChangeDetail(wsId, changeId)` | `jj show -r <id> --summary --stat` | `ChangeDetail` (files + stats) |
| `getFileContent(wsId, revset, path)` | `jj file show -r <revset> <path>` | `string` (file content) |
| `getFileDiffSummary(wsId, from, to)` | `jj diff --from X --to Y --summary` | `FileDiffEntry[]` |
| `describeChange(wsId, changeId, msg)` | `jj describe -r <id> -m "..."` | `void` |
| `listBookmarks(wsId)` | `jj bookmark list --all-remotes -T <json-template>` | `Bookmark[]` |
| `createBookmark(wsId, name, rev)` | `jj bookmark create <name> -r <rev>` | `void` |
| `moveBookmark(wsId, name, rev)` | `jj bookmark move <name> --to <rev>` | `void` |
| `deleteBookmark(wsId, name)` | `jj bookmark delete <name>` | `void` |
| `renameBookmark(wsId, old, new)` | `jj bookmark rename <old> <new>` | `void` |
| `listRemotes(wsId)` | `jj git remote list` | `Remote[]` |
| `addRemote(wsId, name, url)` | `jj git remote add <name> <url>` | `void` |
| `removeRemote(wsId, name)` | `jj git remote remove <name>` | `void` |
| `fetch(wsId, remote?)` | `jj git fetch --remote <remote>` | `FetchResult` |
| `push(wsId, opts)` | `jj git push --bookmark X` or `--change X` | `PushResult` |
| `pushDryRun(wsId, opts)` | `jj git push ... --dry-run` | `PushPreview` |
| `squash(wsId, from?, into?)` | `jj squash --from X --into Y` | `void` |
| `abandon(wsId, changeId)` | `jj abandon <changeId>` | `void` |
| `undo(wsId)` | `jj undo` | `void` |
| `getOperationLog(wsId, limit)` | `jj operation log --no-graph -T <template> --limit N` | `OperationEntry[]` |
| `getConflicts(wsId, rev?)` | `jj resolve --list -r <rev>` | `ConflictFile[]` |
| `resolveConflict(wsId, path, strategy)` | `jj resolve -r @ <path> --tool :ours/:theirs` | `void` |

### Phase B: Types & IPC Expansion

**New types** (`src/types/vcs.ts` — will need splitting into `vcs/` directory):

```typescript
// Change log entry (richer than VcsCheckpoint)
interface ChangeEntry {
  changeId: string;          // short form
  commitId: string;          // git-compatible SHA
  author: string;
  timestamp: string;
  description: string;
  empty: boolean;            // empty change (no diff)
  conflict: boolean;         // has conflicts
  immutable: boolean;        // ◆ vs ○
  isWorkingCopy: boolean;    // @ marker
  bookmarks: string[];       // attached bookmarks
  tags: string[];
}

interface ChangeDetail {
  entry: ChangeEntry;
  files: FileDiffEntry[];
  stats: { added: number; removed: number };
}

interface FileDiffEntry {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;          // for renames
  stats?: { added: number; removed: number };
}

interface Bookmark {
  name: string;
  changeId: string;
  isTracking: boolean;       // tracking a remote bookmark
  remotes: { name: string; synced: boolean; ahead: number; behind: number }[];
}

interface Remote {
  name: string;
  url: string;
}

interface FetchResult {
  success: boolean;
  newChanges: number;
  rebasedLocal: number;
  message: string;
}

interface PushResult {
  success: boolean;
  pushedBookmarks: string[];
  message: string;
}

interface PushPreview {
  bookmarks: { name: string; from: string; to: string }[];
  newChanges: number;
}

interface OperationEntry {
  id: string;
  timestamp: string;
  description: string;
}

interface ConflictFile {
  path: string;
  sides: number;             // usually 2
}
```

### Phase C: Renderer — VCS Panel Rebuild

**Split the monolithic VcsPanel into sub-components:**

```
src/components/apps/coding/vcs/
├── VcsPanel.tsx              # Layout: sections + scroll container
├── WorkingCopySection.tsx    # Status, stage actions, checkpoint/absorb
├── BookmarksSection.tsx      # Bookmark list + CRUD actions
├── ChangeLog.tsx             # Dense log rows with paging
├── ChangeLogRow.tsx          # Single row: glyph + id + desc + age + bookmarks
├── ChangeDetail.tsx          # Expanded inline detail for a row
├── RemotesSection.tsx        # Remote list + add/remove
├── OperationHistory.tsx      # Op log (secondary view)
├── types.ts                  # Panel-local UI types
└── utils.ts                  # Formatting helpers (age, truncate, etc.)
```

### Phase D: Renderer — Monaco Diff Tab

**Diff opens as a tab in the editor area**, not inline in the VCS panel.

```
src/components/apps/coding/editor/
├── DiffTab.tsx               # Monaco DiffEditor wrapper
├── DiffFileNav.tsx           # File list sidebar within diff view
└── diff-utils.ts             # Parse unified diff → per-file content pairs
```

**Integration with existing editor:**
- `CodingWorkspace` already manages tabs as file paths
- Add a new tab type: `{ type: 'diff', from: string, to: string, path: string }`
- `EditorPanel` renders `DiffTab` when tab type is `'diff'`
- Monaco `DiffEditor` props: `original` (left content), `modified` (right content), `language`, `renderSideBySide`

### Phase E: Agent Safety Updates

Update the JJ command guard in `sero-extension.ts`:
- **Allow read-only:** `jj log`, `jj status`, `jj diff`, `jj show`, `jj file show`, `jj bookmark list`, `jj git remote list`
- **Block mutating:** `jj git push`, `jj git fetch`, `jj rebase`, `jj squash`, `jj abandon`, `jj bookmark create/delete/move`, `jj undo`, `jj describe`
- **Agent-initiated push:** Only via explicit user approval in the UI (e.g., agent suggests push → user confirms in a modal)

---

## Phased Delivery Order

```
Phase 1: Compact Change Log + Working Copy Status    ← highest ROI, replaces clunky cards
Phase 2: Monaco Diff Viewer                          ← transforms diff from <pre> dump to real tool
Phase 3: Bookmark Management + Describe              ← enables meaningful change organization  
Phase 4: Remote Setup + Fetch/Push                   ← enables GitHub sync
Phase 5: Squash/Abandon/Undo                         ← JJ power tools
Phase 6: Conflict Detection & Resolution             ← safety net for fetch-rebase conflicts
Phase 7: Operation History                           ← full audit trail
Phase 8: DAG Graph Visualization                     ← polish (could use jj log graph text initially)
```

Each phase is independently shippable and valuable.

---

## Dependency Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Diff viewer library | **Monaco DiffEditor** (built-in) | Already in project, syntax highlighting for free, side-by-side + inline modes, zero new deps |
| Diff parsing | **`diff` npm package** (already installed) | Parse unified/git diffs into structured hunks. Feed file contents to Monaco. |
| Graph rendering | **Text-first** (JJ's own ASCII graph) → SVG later | Ship fast. JJ's text graph is readable. SVG graph is a Phase 8 polish item. |
| Virtual scrolling (log) | **Paging** first → virtual scroll later | Paging via `--limit` + `--offset` is simpler and JJ-native. Virtual scroll if UX demands it. |
| Conflict resolution UI | **Monaco editor** with custom conflict decorations | Reuse existing editor infrastructure. JJ conflict markers are parseable. |

## Risks

| Risk | Mitigation |
|------|-----------|
| JJ template output parsing is fragile | Use JSON-like delimited templates with unique separators; add parsing tests |
| Push/fetch fails due to SSH auth in containers | SSH forwarding already works via `--ssh`; add HTTPS credential helper fallback |
| Undo can be dangerous | Require confirmation modal; show operation preview before undo |
| Diff viewer performance on huge files | Monaco handles large files well; add file size cap (1MB) |
| Conflict resolution UX complexity | Start with simple `:ours`/`:theirs` buttons; manual edit as fallback |
| Command guard bypass via agent | Extend allowlist/blocklist pattern; integration test the guard |

## Open Questions

1. **Should the agent be able to trigger push/fetch?** Current decision: no. But could enable via explicit user approval modal triggered by agent suggestion.
2. **Should we show Git commits alongside JJ changes?** JJ colocated repos have both. Probably not — keep it JJ-native and let `jj git export` handle the mapping.
3. **Virtual scroll vs paging for the change log?** Start with paging (simpler, JJ-native via `--limit`). Evaluate virtual scroll if users have 500+ changes.
4. **Should describe/squash/split be available on immutable changes?** JJ blocks it by default. We should respect that and only show those actions on mutable changes.

# JJ Rich VCS Integration — Research Findings

## JJ CLI Capability Audit

### What JJ can do that Git can't (advantages we should exploit)

| Capability | JJ Command | Why it matters for Sero |
|-----------|-----------|------------------------|
| **Automatic rebase after fetch** | `jj git fetch` (built-in) | No merge conflicts from upstream sync — JJ rebases local work automatically. Users never see "you have diverged" |
| **First-class conflicts** | Conflicts stored as tree state, not markers | Can commit conflicted files, work on other things, come back later. No "resolve before you can do anything" blocking |
| **Operation undo** | `jj undo` / `jj op log` | Complete undo of ANY operation. Accidentally abandoned a change? Undo. Bad rebase? Undo. This is a safety net Git doesn't have |
| **Change ID stability** | Change IDs survive rebase/amend | A change keeps its identity even after rebase. No more "which commit was that after I rebased?" |
| **Absorb** | `jj absorb` | One command distributes working copy hunks to the right ancestor changes. Like `git absorb` but built-in and reliable |
| **Describe any mutable change** | `jj describe -r <any-mutable>` | Edit the description of any mutable change, not just HEAD. Perfect for retroactively documenting agent work |
| **Interdiff** | `jj interdiff --from X --to Y` | See how a change evolved across rebases. Unique to JJ. Great for reviewing agent iterations |
| **Push by change** | `jj git push --change <id>` | Auto-creates a bookmark and pushes. Zero ceremony for sharing WIP |
| **Parallel changes** | `jj split --parallel` | Split a change into siblings instead of parent-child. Natural for "these are independent fixes" |
| **Squash anywhere** | `jj squash --from X --into Y` | Move changes between any two mutable revisions. Not limited to adjacent commits |

### JJ Template System (for structured output parsing)

JJ templates are powerful — we can output structured data:

```bash
# JSON-ish output for change entries
jj log --no-graph -T '
  change_id.short(12) ++ "\t"
  ++ commit_id.short(12) ++ "\t"
  ++ author.name() ++ "\t"
  ++ author.timestamp().utc().format("%Y-%m-%dT%H:%M:%SZ") ++ "\t"
  ++ description.first_line() ++ "\t"
  ++ empty ++ "\t"
  ++ conflict ++ "\t"
  ++ immutable ++ "\t"
  ++ if(self == working_copies, "true", "false") ++ "\t"
  ++ bookmarks.map(|b| b.name()).join(",") ++ "\t"
  ++ tags.map(|t| t.name()).join(",")
  ++ "\n"
' --limit 40
```

**Key template keywords:**
- `change_id`, `commit_id`, `author`, `committer`
- `description`, `empty`, `conflict`, `immutable`
- `bookmarks`, `tags`, `working_copies`
- `self` (the revision itself, for comparison)

### JJ Revset Language (for querying)

Powerful query language we can expose:

```
@                    # working copy
@-                   # parent of working copy
root()               # root commit
heads()              # all heads
bookmarks()          # all bookmarked revisions
remote_bookmarks()   # all remote bookmarks
conflicts()          # all revisions with conflicts
mutable()            # all mutable revisions
immutable()          # all immutable revisions
mine()               # my changes
X..Y                 # range
X::                  # X and descendants
::X                  # X and ancestors
```

### Bookmark System (JJ's equivalent of Git branches)

- **Bookmarks are pointers** — like Git branches but named "bookmarks"
- **Tracking:** `jj bookmark track origin/main` links local to remote
- **Auto-move:** some bookmarks auto-advance (like Git's HEAD)
- **Conflict resolution:** if local and remote diverge, JJ shows "conflicted bookmark"
- **Listing with remote status:**
  ```bash
  jj bookmark list --all-remotes -T '
    name ++ "\t" ++ remote ++ "\t" ++ target.change_id().short(12) ++ "\n"
  '
  ```

### Git Remote Operations

- `jj git remote add origin <url>` — standard
- `jj git fetch` — fetches and auto-rebases
- `jj git push --bookmark main` — push specific bookmark
- `jj git push --change <id>` — push by change (auto-creates bookmark)
- `jj git push --dry-run` — preview what would be pushed
- `jj git push --all` — push all bookmarks
- `jj git export` — sync JJ state → Git (for colocated repos)
- `jj git import` — sync Git state → JJ (for colocated repos)

### File Content Retrieval (for diff viewer)

```bash
# Get file content at specific revision
jj file show -r <revset> <path>

# Get file list at specific revision
jj file list -r <revset>

# Structured diff summary
jj diff --from <rev1> --to <rev2> --summary
# Output: M src/App.tsx
#         A src/utils/helpers.ts
#         D old-config.json

# Stat diff
jj diff --from <rev1> --to <rev2> --stat
# Output: src/App.tsx      | 15 ++++++-----
#         src/utils/helpers.ts | 42 ++++++++++++++++++++
```

## Monaco DiffEditor Capabilities

Monaco is already installed (`@monaco-editor/react` v4.7.0 + `monaco-editor` v0.52.2).

**Built-in DiffEditor features:**
- Side-by-side and inline diff views
- Syntax highlighting for all languages (auto-detected from filename)
- Minimap for navigation
- Char-level diff highlighting
- Folding for unchanged regions
- "Navigate to next/previous change" API
- Read-only mode (perfect for historical diffs)

**Usage:**
```tsx
import { DiffEditor } from '@monaco-editor/react';

<DiffEditor
  original={leftContent}
  modified={rightContent}
  language="typescript"
  options={{
    readOnly: true,
    renderSideBySide: true,
    minimap: { enabled: true },
  }}
/>
```

**No new dependencies needed.** The `diff` package (v8.0.3, already installed) can parse unified diffs if we need structured hunk data, but for Monaco DiffEditor we just need the raw file contents from each side.

## Reference UI Patterns (from screenshots)

### Screenshot 1: GitKraken Team View
- Dense table layout: time, title, author, repo, status icons, complexity, +/- stats, branch
- Filters: assignee, author dropdowns
- Two sections: Pull Requests + Issues
- **Takeaway for Sero:** The density works. Each row is ~32px. Good for scanning lots of changes. We want this for the change log.

### Screenshot 2: Operations History
- Clean vertical timeline
- Date group headers ("Today, Jul 3", "Wed, Jul 2")
- Each entry: time + icon + operation type + change ID + message
- **Takeaway for Sero:** Perfect model for our Operation History view. Date grouping is essential for readability.

### Screenshot 3: GitKraken Graph
- Branch/tag + SVG graph + commit message + author + changes (+/-) + commit date columns
- Color-coded graph lines per branch
- Current commit highlighted
- **Takeaway for Sero:** Text graph from `jj log` is a good v1. SVG graph is aspirational but the text graph with color is perfectly usable.

## Existing Code Patterns to Follow

### IPC Pattern
```
1. Add types to src/types/vcs.ts (or new vcs/ directory)
2. Add handler in electron/ipc/vcs.ts
3. Add channel constant in shared IPC channels
4. Expose in electron/preload.ts under window.sero.vcs
5. Type the window API in src/types/electron.d.ts
6. Add store method in src/stores/vcs.ts
7. Use in component
```

### File Size Rule
Every file must stay under 500 LOC. The VcsPanel split into ~10 sub-components is not optional — it's required by project convention.

### State Management Rule
No localStorage for app state. All VCS state lives in Zustand store. The store is the single source of truth for the renderer.

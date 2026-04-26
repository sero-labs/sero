# Context for: conservative user-facing Git Manager guide

## Relevant Files
- `plugins/sero-git-plugin/package.json` — declares the plugin/app identity: app id `git`, user-facing app name `Git`, icon `git-branch`, and state file `.sero/apps/git/state.json`.
- `plugins/sero-git-plugin/extension/index.ts` — defines the Pi extension entrypoint, the `git_manager` tool, and the `/git` user command.
- `plugins/sero-git-plugin/extension/state-io.ts` — resolves and reads/writes the persisted Git app state file.
- `plugins/sero-git-plugin/extension/git-service-core.ts` — refresh logic, repo detection, ignore-rule setup for the state folder, and safety helpers.
- `plugins/sero-git-plugin/extension/git-service-query-actions.ts` — read-only tool actions like status, log, branches, diff, and show_commit.
- `plugins/sero-git-plugin/extension/git-service-mutation-actions.ts` — mutating tool actions: stage/unstage, commit, stash, fetch/pull/push, checkout/create/delete branch, merge, cherry-pick, remove worktree.
- `plugins/sero-git-plugin/shared/types.ts` and `packages/common/src/git-app.ts` — canonical action/request/state types.
- `plugins/sero-git-plugin/ui/GitApp.tsx` — main UI shell and state-driven workspace loading/error states.
- `plugins/sero-git-plugin/ui/components/Header.tsx` — top bar with repo/branch stats and direct refresh/fetch/pull/push buttons.
- `plugins/sero-git-plugin/ui/components/BranchPanel.tsx` — left sidebar for branches, remotes, stashes, branch creation, checkout, delete, and worktree removal.
- `plugins/sero-git-plugin/ui/components/StagingArea.tsx` — staged/unstaged file lists, per-file toggle, stage all/unstage all, commit message input.
- `plugins/sero-git-plugin/ui/components/CommitGraph.tsx` — visual commit graph and commit selection.
- `plugins/sero-git-plugin/ui/components/CommitDetail.tsx` — commit metadata, file list, and cherry-pick action.
- `plugins/sero-git-plugin/ui/components/DiffViewer.tsx` — file diff display for selected diff/commit/file.
- `docs/guides/version-control-user-flow.md` — JJ-backed Explorer Source Control flow for contrast.
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md` — launch checklist note that Git Manager guide must distinguish visual manager, `/git`/`git_manager`, mutation risks, and Explorer/JJ differences.
- `.pi/plans/2026-04-26-feature-inventory/pilot-doc-briefs.md` — pilot brief outlining conservative Git Manager doc scope and caveats.

## Project Structure
The Git plugin is split into a Pi extension and a React app UI, both backed by the same JSON state file:
- `extension/` handles tool execution, repo scanning, and state persistence.
- `ui/` renders the app and calls back into the host bridge via `gitApp.run(workspaceId, params)`.
- `shared/types.ts` defines the file-backed app state shape used by both sides.

The app is registered as a Sero plugin/app with `sero.app.id = "git"` and `sero.app.name = "Git"`. There is no evidence of multiple tabs in the UI; the visible layout is a single shell with header, branch sidebar, commit graph, diff panel, commit detail, and staging area.

## Conventions
- Tool names use snake_case action strings (`show_commit`, `create_branch`, `remove_worktree`, etc.).
- UI actions usually pass a `GitManagerRequest` object directly to `onAction`.
- State is normalized through `normalizeGitState()` before rendering.
- Write paths are created atomically with temp-file rename in `state-io.ts`.
- Mutating operations refresh the state after execution so the UI stays in sync.

## Dependencies
- The extension uses Git CLI via shared helpers in `git-exec`, `git-commands`, and service modules.
- UI depends on `@sero-ai/app-runtime` (`useAppState`, `useAppInfo`, `getSeroApi`) and shared types from `@sero-ai/common`.
- Visual components use Sero UI primitives for context menus.

## Key Findings
- Exact user-facing names:
  - app name: `Git`
  - app id: `git`
  - tool: `git_manager`
  - command: `/git`
- `/git` is only a conversational shortcut that sends a user message like “Using the git_manager tool: …”; it does not directly perform Git operations itself.
- `git_manager` supports these high-level actions:
  - read/query: `refresh`, `status`, `log`, `branches`, `diff`, `show_commit`
  - file/index ops: `stage`, `unstage`
  - history/state ops: `commit`, `stash`, `stash_pop`, `stash_apply`
  - remote sync: `fetch`, `pull`, `push`
  - branch/worktree ops: `checkout`, `create_branch`, `delete_branch`, `remove_worktree`
  - integration ops: `merge`, `cherry_pick`
- Parameter expectations at a high level:
  - `file` is required for `diff` and may be used for `stage`/`unstage`; optional `staged` selects staged vs unstaged diff.
  - `message` is required for `commit` and optional for `stash`.
  - `branch` is required for branch actions and merge/checkout.
  - `hash` is required for `show_commit` and `cherry_pick`.
  - `worktreePath` is required for `remove_worktree`.
  - `all` enables bulk stage/unstage and is also used for `commit` auto-stage and `cherry_pick` pre-stash behavior.
  - `force` is used for branch/worktree deletion/removal overrides.
  - `stashIndex` selects a specific stash entry.
- Visual UI surfaces that are clearly present:
  - Header buttons for Refresh, Fetch, Pull, Push.
  - Left branch panel with local branches, remote branches, and stashes.
  - New branch form in the local branches section.
  - Per-branch context menu with switch/delete/force delete/remove worktree/force remove worktree.
  - Staging area with staged and unstaged columns, per-file stage/unstage toggles, stage all/unstage all, and a commit message box.
  - Commit graph and commit detail panel with file diff list and cherry-pick.
  - Diff viewer for selected file/commit diffs.
- Tool-only or partially verified surfaces:
  - The extension exposes more actions than the header buttons or obvious controls cover; do not imply every action has a first-class visual button.
  - `remove_worktree`, `merge`, `cherry_pick`, `stash_pop`, `stash_apply`, and force delete actions exist in the tool layer and some are available through context menus or detail prompts, but the doc should avoid overclaiming polished full-screen workflows unless verified in runtime.
- Git state storage/sync behavior:
  - State is stored per workspace in `<workspace>/.sero/apps/git/state.json`.
  - Missing state file falls back to a default empty state.
  - Malformed state throws a repair/remove error.
  - `refreshGitState()` writes the state file after scans and on non-repo detection.
  - `ensureGitStateIgnored()` appends `**/.sero/apps/git/` to the repo’s git exclude file so the state file does not appear as an untracked change.
  - The app reads state with `useAppState`, so the UI is file-backed and reactive.
- Safety / mutation caveats:
  - Branch checkout refuses to switch to a branch already checked out in another worktree.
  - Branch deletion refuses the current branch, the detected default branch, and branches already checked out in a worktree.
  - Worktree removal refuses to remove the main worktree and warns on dirty/locked worktrees unless `force` is used.
  - Cherry-pick refuses dirty working trees unless `all=true` is set, in which case it stashes uncommitted/untracked changes before cherry-picking; it does not automatically re-apply/pop that stash afterward.
  - Commit with `all=true` auto-stages all changes before commit.
  - Push falls back to `push --set-upstream` if the upstream is missing.
  - Merge/cherry-pick conflict errors are post-processed to tell the user to resolve conflicts and continue from the command line if needed.

## Gotchas
- Do not describe Git Manager as the same thing as Explorer Source Control: the Explorer guide is JJ-backed and organized around Working Copy / Bookmarks / Pull Request / Changes / Remotes, while Git Manager is Git-native and centered on commit graph, branches, staging, stash, and direct Git operations.
- Avoid claiming visual completeness for all tool actions. The extension supports more than the obvious UI buttons, and some flows are mainly tool/agent-driven.
- Avoid calling branch/worktree mutating actions “safe automation”; they can alter the real repository and have explicit guardrails, not full prevention.
- The UI’s top-level component is a single Git app shell, not a multi-tab source-control suite like the Explorer docs describe.

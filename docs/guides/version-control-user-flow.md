# Source Control User Flow (Sero)

This guide explains how users move through the new Source Control section in Sero’s Explorer workspace.

## Overview

Sero Source Control is Git-backed and organized into these sections:

1. `Working Copy` — current uncommitted file changes and manual checkpoint creation.
2. `Branches` — local branches, active push branch selection, fetch/push.
3. `Pull Request` — PR preparation and creation via GitHub CLI (`gh`).
4. `Changes` — change history with diff/restore/push actions.
5. `Remotes` — remote repository configuration.

## End-to-End Flow

## 1. Open Source Control

1. Open a workspace in Explorer mode.
2. Open the `Source Control` panel in the sidebar.
3. Sero loads current Git state (working copy, branches, commit log, remotes).

## 2. Create or Review Working Changes

1. Edit files in the editor, terminal, or via agent actions.
2. Review changed files under `Working Copy`.
3. Optional: click a file to open a diff.
4. Optional: add a description and click `Commit` to create a manual checkpoint.

Notes:
- Chat undo and Source Control checkpoints are different tools.
- `Undo this turn` lives in chat, restores the workspace to the pre-turn snapshot, rewinds the Pi session tree to before that user prompt, and puts the old prompt back in the composer so you can retry or edit it.
- Manual checkpoints stay in Source Control as explicit VCS history you create on purpose.
- Automatic undo snapshots are internal and do not appear as normal visible checkpoint commits.
- Manual edits can stay grouped in working copy until you explicitly checkpoint.

## 3. Manage Branches

1. In `Branches`, create a branch (for example `feat/my-branch`) if needed.
2. Set the branch as active push branch (star action).
3. Use `Push` to push the active branch, or push a specific change from `Changes`.
4. Use `Fetch` to refresh remote state when needed.

Notes:
- `main` is treated as the default/base branch.
- Active push branch is per workspace and reused across pushes.

## 4. Create a Pull Request

1. Go to `Pull Request`.
2. Choose `Source` branch (must be a non-default local branch).
3. Set `Target` branch (defaults to detected base branch, usually `main`).
4. Click `Generate draft` to auto-fill PR title and description from branch diff context.
5. Edit title/description as needed.
6. Click `Create PR`.

Result behavior:
- Success/failure feedback is shown after PR creation.
- If an open PR already exists for the same source/target pair, Sero blocks duplicate creation and links the existing PR.

## PR Section Disabled State

`Pull Request` is disabled when no non-default local source branch exists.

To enable it:
1. Create a feature branch (for example `feat/my-branch`).
2. Move work onto that branch (or push a change as that branch).
3. Reopen/use the PR section.

## Authentication Requirements

Push and PR creation use different auth mechanisms:

1. `jj/git push` can succeed via SSH remote auth.
2. `gh pr create` requires GitHub CLI API auth in the same runtime (host/container where command runs).

If PR creation fails with `gh auth` guidance, run:

```bash
gh auth login
```

inside the same workspace runtime (typically the Sero container for container workspaces).

## 5. Review, Diff, and Restore History

1. Open `Changes` to inspect historical entries.
2. Expand a change to view files and actions.
3. Use:
   - `Diff` to inspect content changes.
   - `Restore checkpoint` to return files to that checkpoint snapshot.
   - `Push` / `Push as...` to publish a specific change.
4. Use chat `Undo this turn` when you want to back out one agent turn from the conversation itself.

Important distinction:
- `Undo this turn` branches the active chat session back to before the selected user prompt. The abandoned branch is left in the Pi session tree rather than hard-deleted.
- `Restore checkpoint` is a Source Control action on manual VCS history. It restores files from a checkpoint snapshot and does not mean “undo the current chat turn.”

## Typical Daily Workflow

1. Work on files.
2. Checkpoint as needed.
3. Create/select feature branch.
4. Push feature branch.
5. Generate PR draft.
6. Edit PR text.
7. Create PR to target branch.
8. Continue iteration with additional pushes to the same active branch.


# Migrating a JJ (Jujutsu) Colocated Workspace to Git

Guide for converting a Sero workspace from JJ-managed version control to plain Git. Based on real migration experience.

## Background

Sero workspaces use Jujutsu (JJ) colocated with Git — meaning both `.jj/` and `.git/` exist in the repo. JJ manages the Git objects behind the scenes. This guide covers removing JJ and switching to native Git.

## Prerequisites

- The workspace has both `.jj/` and `.git/` directories (colocated mode)
- You have `trash` available (preferred over `rm` for recoverability)

---

## Migration Steps

### 1. Move bookmarks to the desired commits

JJ bookmarks are the equivalent of Git branches, but they **don't auto-advance** with new commits. Before removing JJ, make sure all bookmarks point where you want the Git branches to end up.

```bash
# Check current state
jj log --limit 15

# Move a bookmark to the working copy
jj bookmark move main --to @

# Or move to a specific change
jj bookmark move main --to <change-id>
```

**Verify the Git branch matches:**

```bash
cat .git/refs/heads/main
```

This should show the commit hash you expect. JJ writes to Git refs in real-time in colocated mode, so moving a bookmark immediately updates the Git branch.

### 2. Remove the JJ directory

```bash
trash .jj
```

Use `trash` instead of `rm -rf` so you can recover if something goes wrong.

### 3. Fix the detached HEAD

JJ operates with a detached HEAD internally — it doesn't keep `.git/HEAD` pointed at a branch ref. After removing JJ, Git will think you're in a detached HEAD state:

```
$ git status
HEAD detached from c6a08cf
```

**Fix it by writing the branch ref directly:**

```bash
echo "ref: refs/heads/main" > .git/HEAD
```

Replace `main` with whatever branch you want to be checked out.

**Verify:**

```bash
git status
# Should show: On branch main
```

### 4. Clean up JJ keep refs

JJ creates internal references under `.git/refs/jj/keep/` to prevent Git from garbage-collecting commits that JJ is tracking. These can accumulate significantly (60+ refs is common).

**These refs cause problems:**

- During `git push`, Git sends all known refs to the remote for negotiation
- The remote doesn't understand `refs/jj/keep/*` refs
- This can trigger **HTTP 400 errors** during push:
  ```
  error: RPC failed; HTTP 400 curl 22 The requested URL returned error: 400
  send-pack: unexpected disconnect while reading sideband packet
  fatal: the remote end hung up unexpectedly
  ```

**Clean them up:**

```bash
rm -rf .git/refs/jj
```

This is safe to do after JJ has been removed — these refs only existed to serve JJ's internal tracking.

### 5. Verify the final state

```bash
# Should show "On branch main" (or your chosen branch)
git status

# Should show your expected commit history
git log --oneline -10

# Should list only real branches
git branch -a

# No jj refs remaining
find .git/refs/jj -type f 2>/dev/null | wc -l
# Expected: 0

# Test push works
git push origin <branch-name>
```

---

## Complete Migration Checklist

```
[ ] 1. Move all JJ bookmarks to correct positions
[ ] 2. Verify .git/refs/heads/* match expected commits
[ ] 3. Remove .jj/ directory (use trash)
[ ] 4. Fix .git/HEAD → "ref: refs/heads/<branch>"
[ ] 5. Remove .git/refs/jj/ directory
[ ] 6. Verify git status shows correct branch
[ ] 7. Test git push works
```

---

## Gotchas & Troubleshooting

### Bookmark vs Branch confusion

JJ bookmarks ≠ Git branches in behavior. Bookmarks don't auto-advance, so if you've been committing in JJ without moving the bookmark, the Git branch will be stuck at an old commit. Always check and move bookmarks before removing JJ.

### Large file warnings during bookmark move

JJ may show warnings like:
```
Warning: Refused to snapshot some files:
  image.png: 1.5MiB; the maximum size allowed is 1.0MiB
```

These warnings are about JJ's snapshot system and **don't prevent the bookmark move**. The Git commit tree already contains these files regardless of JJ's snapshot limit.

### "Everything up-to-date" combined with push errors

If you see both an HTTP 400 error AND "Everything up-to-date", it's almost certainly the `refs/jj/keep/*` refs polluting the push negotiation. Clean them up per step 4.

### Sero's git command restrictions

Sero may block mutating git commands (`commit`, `push`, `checkout`, `reset`) via a shell wrapper when it detects a managed workspace. After removing `.jj/`, the workspace VCS detection may need to refresh. You can still run git commands directly from an external terminal.

### Multiple branches/bookmarks

If the workspace had multiple JJ bookmarks (e.g., `main`, `feat/my-branch`, `chore/wip-manual`), each becomes a Git branch. Check all of them:

```bash
find .git/refs/heads -type f -exec echo {} \; -exec cat {} \;
```

Remove any you don't need:

```bash
git branch -d <unwanted-branch>
```

### Sero features that stop working

After removing JJ, these Sero features will no longer work:
- **Automatic checkpoints** (JJ-based snapshot after agent turns)
- **Checkpoint restore** (uses `jj restore`)
- **Source Control panel** JJ-specific features (bookmark management, JJ log)

Standard Git operations through Sero's UI should continue to work.

---

## Sero VCS UI Push Failures (SSH→HTTPS Rewrite)

### The Problem

After migration, pushing from Sero's VCS UI could fail with:
```
error: RPC failed; HTTP 400 curl 22 The requested URL returned error: 400
send-pack: unexpected disconnect while reading sideband packet
fatal: the remote end hung up unexpectedly
Everything up-to-date
```

Meanwhile, the same push works fine from the terminal.

### Root Cause

Sero's `GitHubAuthManager.getAuthEnvVars()` rewrites SSH remotes (`git@github.com:`) to HTTPS (`https://github.com/`) so it can authenticate with `GH_TOKEN` via `GIT_ASKPASS=gh`. This HTTPS transport is less tolerant of:

1. **Large ref counts** — leftover `refs/jj/keep/*` refs (60+) bloat the ref negotiation payload
2. **Large pack files** — HTTPS has stricter payload limits than SSH for push data

SSH (used by the terminal) handles both of these without issue.

### The Fix

**`git-runner.ts`** now detects whether the host has working SSH keys for GitHub. If SSH works, it skips the HTTPS URL rewrite and lets git use SSH natively for push/fetch. The `GH_TOKEN` is still set for `gh` CLI operations (PRs, etc.).

- SSH check is cached for the process lifetime (one `ssh -T git@github.com` call)
- Falls back to HTTPS rewrite if no SSH keys are found (e.g., containers)
- Container execution still uses HTTPS rewrite (containers rarely have SSH keys)

### Preventing Future Issues

When migrating workspaces, always clean up JJ keep refs (step 4) **before** attempting any push — even if you plan to use SSH. The refs can cause subtle issues with both transports.

## Related

- [JJ Versioning Strategy](./jj-versioning/strategy.md)
- [Jujutsu Documentation](https://martinvonz.github.io/jj/)

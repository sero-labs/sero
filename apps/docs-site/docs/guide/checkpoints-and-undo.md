# Checkpoints and Undo

Sero has more than one recovery tool. Manual checkpoints restore workspace files. Chat turn undo restores files and rewinds the session tree for a specific agent turn. Git/JJ source-control operations are separate repository operations.

Source checked: `docs/guides/version-control-user-flow.md`, `apps/desktop/src/hooks/useCheckpointRestore.ts`, `apps/desktop/src/components/layout/CheckpointRestoreDialog.tsx`, `apps/desktop/electron/ipc/agent/core/agent-checkpoint.ts`, `apps/desktop/electron/ipc/integrations/vcs.ts`, and `apps/desktop/src/types/ipc-channels.ts`.

## Which tool should I use?

| Action | Restores files? | Rewinds chat/session? | Typical use |
| --- | ---: | ---: | --- |
| Manual checkpoint | No | No | Save a known-good state before risky work. |
| Restore checkpoint | Yes | Usually no; legacy restore may branch if tied to a turn | Return workspace files to a saved checkpoint. |
| Undo this turn | Yes | Yes | Retry after an agent turn made unwanted changes. |
| Git/JJ restore/revert/reset | Yes, depending on command | No | Source-control recovery or branch/history work. |

None of these replace reviewing file changes.

## Manual checkpoints

Use a manual checkpoint before a risky change, large refactor, or experimental prompt. A checkpoint records a recoverable file state through Sero's VCS/checkpoint layer.

Good moments to checkpoint:

- before asking the agent to edit many files
- before dependency upgrades or generated changes
- before testing unfamiliar Git/source-control operations
- after a clean test/build result

## Restore checkpoint

Restoring a checkpoint is a file operation. It can overwrite current workspace changes. If a checkpoint is associated with older session metadata, Sero may branch the session tree, but you should treat manual restore as primarily workspace-file recovery.

Before restoring:

1. Review current diffs.
2. Save or commit work you still need.
3. Confirm you are in the intended workspace.
4. Expect source-control views to refresh after restore.

## Undo this turn

Chat turn undo is designed for “the last agent turn went wrong.” It restores the VCS snapshot for that turn, rewinds the session tree back to the user entry, invalidates Git workspace state, and can prefill the composer so you can revise the prompt.

Use it when:

- the agent edited the wrong files
- you want to retry a prompt with clearer constraints
- an agent turn generated a messy intermediate state

Do not use it as a substitute for reading diffs. If you made manual edits after the turn, undo may conflict with work you wanted to keep.

## Source-control safety

Git/JJ operations still affect the real repository. Checkpoints can help, but they do not make destructive commands safe.

Practical habits:

- keep important work committed or backed up before destructive operations
- avoid force operations unless you understand the repository state
- resolve merge/cherry-pick conflicts with normal source-control discipline
- check branch/worktree identity before restore, reset, branch delete, or push
- use disposable repositories for testing unfamiliar flows

## Recovery examples

### A bad agent edit

1. Stop the agent if it is still running.
2. Review the diff to understand what changed.
3. Use **Undo this turn** if you want to restore files and retry the prompt.
4. Rewrite the prompt with explicit file scope and constraints.

### A manual edit went wrong

1. Check current source-control status.
2. If you made a manual checkpoint, restore it.
3. If the repository has a clean commit to return to, use Git/JJ recovery tools instead.

### A source-control operation conflicted

1. Stop and inspect status.
2. Resolve or abort the Git/JJ operation using the appropriate source-control commands.
3. Refresh Sero's source-control view.
4. Use checkpoints only if you are intentionally restoring workspace files.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Restore is blocked while agent runs | Stop/finish the streaming turn first. |
| Files changed but chat did not rewind | You likely used VCS/checkpoint restore rather than turn undo. |
| Chat rewound but diff still looks stale | Refresh the source-control/Git view after restore. |
| Restore overwrote work you wanted | Check Git/JJ history, stash, backups, and any newer checkpoints. |

## Related docs

- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Explorer Workspace](/guide/explorer-workspace)
- [Git Integration](/guide/git-integration)
- [Sero CLI](/reference/sero-cli)
- [Troubleshooting](/reference/troubleshooting)

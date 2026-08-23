# Manage a Room

This guide explains how Sero keeps member changes separate, how to respond to
access requests, how to change a team, and how to recover a stopped Room.

Start with [Create a Room](/guide/rooms) if you have not run one yet. See the
[Rooms reference](/reference/rooms) for all statuses, fields, and limits.

## Keep file changes separate

When a Room can edit a Git repository, Sero normally gives each editing member
a separate worktree. A worktree is another copy of the repository on its own
branch.

Separate worktrees let several members edit the same project without changing
the files in your open workspace or seeing another member's unfinished work.
Sero combines their changes later.

A read-only member does not need a separate worktree. A Room can also use the
open workspace directly, but this needs your approval because members can
change files that you have open.

### Check which member is changing a file

Members use **claims** to tell the team which files they intend to change. A
claim can name one file, a folder, or a pattern such as `src/*.js`.

A claim is a coordination notice. It does not lock the file. If two claims
overlap, the members can discuss who should do the work. Their separate
worktrees protect their working copies while they decide.

Open the **Claims** tab to review active claims. If two members continue to work
on the same file, send them a message with clear ownership instructions.

See [Path claims](/reference/rooms#path-claims) for overlap policies and limits.

## Set access before start

Before you select **Start**, set and approve each member's access level:

- **Read only** lets the member inspect the workspace.
- **Edit workspace** lets the member change files and run commands.
- **Edit and push** also lets the member use version-control actions that
  publish changes.

A running Room cannot increase a member's access. Its host grant fixes the team
and each member's tools when the Room starts. If the Conductor requests more
access, Sero rejects the request instead of showing it for approval.

The Room can request more time or a higher cost limit. Sero shows these limit
requests for you to approve or reject. Members, including the Conductor, cannot
approve their own requests.

### Understand the access limit

Access settings control which Sero tools a member receives. They are not a
security sandbox. A member with shell, or command-line, access can run any
command that your account can run, including `git push` or `gh`.

Run a Room only in a project that you permit it to change. Review the proposed
tools before you start the Room because you cannot add tools while it runs.

## Change a running team

The Conductor can change a member's task, priorities, or instructions. It can
also suspend, resume, or retire a member. It cannot add or replace a member
after the Room starts.

- **Suspend** stops new turns for a member but keeps its session and context.
- **Resume** lets a suspended member continue.
- **Retire** ends the member's work and releases its file claims.
Add or replace members when you review the proposal. A running Room rejects
these membership changes because its approved host grant has a fixed set of
members.

Open **Changes** to review changes that the Conductor made to the team.

## Send instructions while the Room runs

Send a message when the team needs new information or direction. Choose when
the member receives it:

- **Now** wakes or interrupts the selected member. Use it to stop incorrect
  work or give urgent information.
- **Next turn** adds the message to the member's next turn. Use it for
  information that can wait.

Watching a Room does not use model tokens. A new agent turn can add to the Room
cost.

## Pause or stop a Room

Select **Pause** to prevent new member turns from starting. Pause does not stop
active turns. They finish before the Room has the **Paused** status. Select
**Resume** when the team can continue.

Select **Stop** when you do not want the Room to continue. Stop aborts active
turns, ends the Room, and cannot be resumed.

## Continue a Room that stopped

The Room shows why it stopped. Common causes include:

- the Room reached its time or cost limit;
- a question or approval needs your response;
- members are waiting for each other;
- the Conductor could not continue;
- Sero restarted during an active turn.

Read the notice and resolve its cause before you select **Resume**. For example,
answer the question, approve or reject the request, raise a limit, or send new
instructions.

After Sero restarts, it checks the saved Room, member sessions, and worktrees.
It clears interrupted turns, then the Conductor decides which work still needs
to run. Saved messages and commits remain available.

## Review the delivered result

The proposal sets one delivery destination. A Room can leave changes in the
workspace, create a pull request, save a report, or use another available
destination. A Room started from chat also returns its final answer to that
chat.

Sero asks for your approval before it sends a result outside the workspace. If
the destination provides a reference, such as a pull request URL, Sero records
it with the result.

A finished Room shows:

- the final result;
- saved artifacts, such as reports, test output, patches, and reviews;
- work that the team did not complete;
- the final time and cost.

Review unfinished work and artifacts before you use the result. Run important
checks yourself.

## Archive or delete a finished Room

The current Room controls do not provide an **Archive** action.

The finished-Room UI does not have a **Delete** control. To remove a Room, call
the `rooms` tool or API with the `delete` action and the Room ID. See
[GitHub issue #380](https://github.com/sero-labs/sero/issues/380) for the missing
UI control.

The `delete` action removes the Room record and its Room state permanently.
Sero also deletes the persistent-session grant history, which includes the
member session files. Before deletion, Sero preserves member work in
checkpoints. If it cannot preserve a member worktree, deletion stops and you
can fix the worktree before you try again.

Check the result and artifacts before you use the `delete` action. You cannot
undo deletion.

## Related guides

- [Create a Room](/guide/rooms)
- [Rooms reference](/reference/rooms)
- [Create a Workflow](/guide/workflows)

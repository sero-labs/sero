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

## Respond to an access request

Each member starts with an access level that you approved:

- **Read only** lets the member inspect the workspace.
- **Edit workspace** lets the member change files and run commands.
- **Edit and push** also lets the member use version-control actions that
  publish changes.

If a member needs more access, the Room pauses and shows an approval request.
Read which member made the request, why it needs the access, and which tools the
change will add.

Select **Approve** to grant the requested access to that member. Select
**Reject** to keep its current access. A rejected member can continue with the
tools it already has or report that it cannot complete its task.

The same approval process applies when the Room requests more time, a higher
cost limit, more members, or a different delivery destination. Members,
including the Conductor, cannot approve their own requests.

### Understand the access limit

Access settings control which Sero tools a member receives. They are not a
security sandbox. A member with shell, or command-line, access can run any
command that your account can run, including `git push` or `gh`.

Run a Room only in a project that you permit it to change. Review the proposed
tools before you start the Room or approve more access.

## Change a running team

The Conductor can change the team within the limits that you approved. It can
change a member's task, priorities, or instructions. It can also add, suspend,
resume, or retire a member.

- **Suspend** stops new turns for a member but keeps its session and context.
- **Resume** lets a suspended member continue.
- **Retire** ends the member's work and releases its file claims.
- **Add** creates another member when the approved team-size and cost limits
  allow it.

Replacing the Conductor needs your approval because the Conductor decides how
to coordinate the team and when the Room is complete.

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

Select **Pause** to prevent new member turns from starting. Active turns finish
or stop before the Room has the **Paused** status. Select **Resume** when the
team can continue.

Select **Cancel** when you do not want the Room to continue. Cancellation ends
the Room and cannot be resumed.

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

Select **Archive** to keep the Room in the list and remove older retained
message activity.

Select **Delete** to remove the Room record permanently. Deleting a Room does
not immediately delete its member sessions. Sero keeps them according to the
normal session retention rules.

Check the result and artifacts before you archive or delete the Room. You cannot
undo deletion.

## Related guides

- [Create a Room](/guide/rooms)
- [Rooms reference](/reference/rooms)
- [Create a Workflow](/guide/workflows)

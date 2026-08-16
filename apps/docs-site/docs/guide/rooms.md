# Rooms

Use a Room when one problem needs several agents to work together. Sero creates
a temporary team for the problem. The team can share findings, divide the work,
ask you questions, and change its approach as it learns more.

Use a [Workflow](/guide/workflows) instead when the work has a repeatable step
plan or must run on a schedule or after an event.

## Before you start

Open a workspace and make sure its model and provider are ready. Rooms are
available by default. A Room does not start any member session until you review
and approve its proposal.

The proposal shows:

- each team member and their job;
- the maximum working time and cost;
- the files, commands, network access, and delivery access each member needs;
- where the final result will go.

The **Conductor** is the team lead. It assigns work, combines findings, and
decides when the result is ready. Other members do the specialist work.

## Create a Room

1. Open **Orchestrator** and select **Rooms**.
2. Select **Start a Room**.
3. Describe the problem and the result you need. Include important limits or
   checks in the description.
4. Set the maximum spend, maximum time, access level, and delivery destination.
5. Select **Design room**.
6. Review the proposed team and access.
7. To change the proposal, select **Adjust**, describe the change, and review
   the new proposal.
8. Select **Start room** and approve the member sessions.

For example:

> Find the cause of the failed login tests, fix the defect, add a test that
> fails on the old code, and give me a pull request. Do not change the database
> schema.

## Follow the work

The Room view shows the current team, activity, questions, approvals, work
items, claims, and output files.

- Open a member to read its session and current task.
- Send a message when the team needs new information or direction.
- Answer a member question from the item shown in **Needs you**.
- Review an approval before you allow more access, time, spend, members, or a
  new delivery destination.
- Pause the Room to stop new agent turns. Resume it when you are ready.
- Stop the Room when you do not want it to continue.

Watching a Room does not use model tokens. Sending a message immediately can
start a new member turn. A message sent for the next turn waits until that
member works again.

## Understand file changes

A member that can edit files normally gets its own managed worktree. This is a
separate checkout of the repository. It prevents two editing members from
changing the same working copy without coordination.

Read-only members do not get command tools. The start approval lists the tools
and access that each member will receive. A tool that is not allowed under that
access is removed before the Room starts.

When a Room ends, Sero keeps committed work and tries to preserve uncommitted
work from member worktrees. Review the result and listed artifacts before you
delete the Room record.

## Questions and approvals

A question asks you for information. An approval asks for authority that the
Room does not have.

Only you can answer an approval. A Room member, including the Conductor, cannot
approve its own request. Rejecting a request keeps the current limits and does
not give the team the requested authority.

External delivery, such as a message or webhook, needs your approval. A Room
started from chat also returns one final result to that chat.

## If a Room stops

The Room explains why it stopped. Common reasons include:

- it reached its time or cost limit;
- members are waiting on each other;
- the Conductor could not continue;
- the Room needs your answer or approval;
- Sero restarted while members were working.

Read the notice before you resume. You can message the team with new direction,
approve or reject the open request, resume the Room, or stop it. Sero keeps the
member session history so you can inspect what happened.

## Finish, archive, or delete

A completed Room shows its result, output files, unresolved items, time, and
cost. Check these items before you use the result.

Archive a finished Room when you want to keep its record but reduce retained
activity data. Delete it when you no longer need the Room record. Deletion is
permanent.

## Find exact settings and actions

See the [Rooms reference](/reference/rooms) for statuses, limits, access rules,
tool actions, environment settings, and storage paths.

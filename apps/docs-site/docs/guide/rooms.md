# Rooms

A Room gives one task to a temporary team of Sero agents. Each member has a
role. Members can work at the same time, share findings, and change how they
divide the task.

Use a Room when a task needs several roles or points of view. Use a
[Workflow](/guide/workflows) when Sero can follow a plan of steps instead.
[Orchestrator](/guide/orchestrator) explains the difference.

Sero is in public beta. Check important results before you use or publish them.

## Before you start

This tutorial uses
[Meridian](https://github.com/monobyte/meridian-orders-demo), a small example
project for processing orders and payments. Its tests reproduce three separate
problems:

- splitting an order total can lose one cent;
- two payments at the same time can overwrite each other;
- retrying a failed payment can charge the customer more than once.

Before you continue:

1. [Install and open Sero](/guide/getting-started).
2. [Configure a model](/guide/models-and-providers).
3. Make sure Git and Node.js are available.
4. Clone the example project:

   ```bash
   git clone https://github.com/monobyte/meridian-orders-demo.git
   ```

5. Open the cloned `meridian-orders-demo` folder as a workspace in Sero.
6. Open a terminal in the workspace and run:

   ```bash
   npm test
   ```

Four tests fail. This is the expected starting state. Make sure the Git working
tree has no changes before you continue.

The Room will investigate the three problems, repair them, and leave the changes
in the workspace. It must ask you to choose the rounding rule for order totals.

## 1. Describe the task

Open Orchestrator from the app bar, select **Rooms**, then select **New**.

![The new Room screen, with the problem described and the four limits below it](../assets/images/orchestrator-rooms-brief.jpg)

Enter this description:

> The order and payment tests in this repository fail for three separate
> reasons. Investigate the rounding error, the lost payment update, and the
> repeated charge separately. Repair all three problems and run the complete
> test suite. Ask me to choose the rounding rule before you change it. Leave the
> completed changes in this workspace.

Set the Room limits:

- **Maximum spend** sets the highest model cost.
- **Maximum time** sets how long the team can work.
- **Access** sets which files and tools the team can use.
- **Deliver to** sets where Sero puts the result.

For this tutorial, use a maximum spend of $5.00, a maximum time of 1 hour,
**This workspace** access, and **Workspace files** delivery.

Access settings are not a security sandbox. A member with shell, or
command-line, access can run any command that your account can run. Use a Room
only in a project that you permit it to change.

The presets below the form provide example descriptions for common tasks. Do
not select one for this tutorial.

Select **Design the team →**.

## 2. Review the proposed team

Sero reviews the task, workspace, limits, and access before it proposes a team.
It does not create agent sessions or incur model costs during this stage.

![Designing the team, with its five steps and the time remaining](../assets/images/orchestrator-rooms-designing.jpg)

The proposal shows each member, its role, and the access it needs.

![The proposal with the team and approval summary](../assets/images/orchestrator-rooms-proposal.jpg)

One member is the **Conductor**. The Conductor gives work to the other members,
combines their findings, and decides when the task is complete.

In this example, Ada is the Conductor. Grace, Leslie, and Barbara each
investigate one problem.

Review:

- each member's role and instructions;
- the number of members;
- the time and cost limits;
- the files and tools that each member can use;
- any requested access that exceeds the limits you selected.

Select **Why this team?** to read why Sero chose these roles. Select **Advanced
settings** to see the tools available to each member.

## 3. Change the team

Select **Adjust** if you want a different team. Describe the change in plain
language.

![Adjust, with a change described in plain English](../assets/images/orchestrator-rooms-adjust.jpg)

For this tutorial, enter:

> Add a reviewer who checks all three repairs together before the Room finishes.

Select **Rethink the team**, then review the new proposal.

![The revised proposal, now with a reviewer](../assets/images/orchestrator-rooms-adjusted.jpg)

You can also ask for fewer members, different roles, stricter review, or another
division of the task.

When the team is correct, select **Start room**. Sero asks for permission to
create the agent sessions. Model costs start after the Room starts.

## 4. Follow the work

The Room screen shows the limits, team, and activity.

- The header shows elapsed time, cost, and the number of active members.
- The team list shows what each member is doing.
- The activity feed shows decisions, messages, and changes to the work.

![The activity feed on the All filter, with the team list beside it](../assets/images/orchestrator-rooms-activity-all.jpg)

The feed opens on **Highlights**. Select **All** for the complete activity,
**Decisions** for choices made by the team, **Messages** for communication
between members, or **Work** for changes to assigned tasks.

![The Decisions filter, with three entries](../assets/images/orchestrator-rooms-decisions.jpg)

Select **Watch** to show one status card for each member. A card shows the
member's latest message, number of turns, and cost.

![The Watch view with a card for each member](../assets/images/orchestrator-rooms-watch.jpg)

### Review one member

Select a member to open its details.

**Session** shows the member's work, one turn at a time, with its usage totals.

![Ada's session, with the turn list and the session details](../assets/images/orchestrator-rooms-member.jpg)

**Info** shows the member's role, responsibilities, and instructions.

![Ada's Info tab, showing role, responsibilities and working instructions](../assets/images/orchestrator-rooms-member-info.jpg)

## 5. Answer a question

The Room pauses when it needs you to choose the rounding rule.

![The Room paused, with a member's question at the top](../assets/images/orchestrator-rooms-question.jpg)

The question appears in a banner above the activity feed. It identifies the
member that asked and explains the available choices. The member also has the
**Needs you** state in the team list.

Enter your answer in the banner. The Room continues from the same point. It does
not repeat completed work.

A Room can ask a question whenever its investigation finds a decision that
needs your input. The question does not need to be known before the Room starts.

## 6. Review the team's records

Select **Brief** to open the records shared by all members.

**Brief** shows the goal, current work, and conditions for completion.

![The Brief tab with the objective, active work, and success criteria](../assets/images/orchestrator-rooms-brief-tab.jpg)

**Work** shows each task, its state, and its owner.

![The Work tab, with each task, its owner and its state](../assets/images/orchestrator-rooms-work.jpg)

**Claims** shows which files each member intends to change. A claim tells other
members about planned work. It does not lock the file.

![The Claims tab, with two claimed files](../assets/images/orchestrator-rooms-claims-tab.jpg)

**Artifacts** contains results that members save for the team, such as findings,
test output, and review notes.

![The Artifacts tab, listing six published reports](../assets/images/orchestrator-rooms-artifacts.jpg)

**Changes** shows changes that the Conductor made to the team or its assigned
work. The Conductor cannot increase access, time, cost, or the number of members
beyond the limits that you approved.

![The Changes tab, with the roster-change budget and the assignments made](../assets/images/orchestrator-rooms-changes.jpg)

## 7. Check the result

When the Room finishes, its final result appears at the top of the activity
feed.

![The finished Room, with its result at the top of the feed](../assets/images/orchestrator-rooms-complete.jpg)

Before you accept the result:

1. Read the final summary and any unfinished items.
2. Review the files changed in the workspace.
3. Open the review artifact and check the reviewer's findings.
4. Run `npm test` yourself and confirm that all tests pass.

The member sessions remain available after the Room closes. Open a member if you
need to check how it reached a result.

## Next steps

- [Manage a Room](/guide/rooms-advanced) — file coordination, access requests,
  team changes, and recovery.
- [Rooms reference](/reference/rooms) — controls, statuses, access, and storage
  paths.
- [Create a Workflow](/guide/workflows) — use a plan instead of a team.

# Orchestrator

Orchestrator lets Sero's AI agents work on a task without you directing every
step. You describe the result you want, review how Sero plans to do the work,
and decide when it can start.

Open Orchestrator from the app bar, then choose **Workflows** or **Rooms**. A
third mode, **[Goals](/guide/goals)**, starts in the chat session itself with
`/goal`, and Orchestrator manages the ones you leave running.

## Choose a Workflow, Room or Goal

- Use a **[Workflow](/guide/workflows)** when Sero can plan the work before it
  starts. For example, a Workflow can collect the week's project notes, write a
  summary, ask you to review it, and save the approved version. You can run a
  Workflow once, on a schedule, or after an event.
- Use a **[Room](/guide/rooms)** when several agents need to work together. Sero
  creates a temporary team, gives each member a role, and lets them share their
  findings. For example, one member can review the cost of a project, another
  can review the schedule, and a third can check the risks. The team then
  combines its findings into one report.

- Use a **[Goal](/guide/goals)** when you want the session you are already in to
  keep working until a result is reached. Sero plans nothing first. You say what
  must be true at the end, and the session keeps going until it is.

- Use **[Architect](/guide/architect)** when you want a whole product from an
  idea. Architect researches, proposes a charter with a cost cap, builds one
  milestone at a time through Workflows and Rooms, checks the evidence itself,
  releases and maintains the result. You approve the charter and answer the
  decisions that are yours.

If you need a plan, choose a Workflow. If you need a team, choose a Room. If you
need the current chat to keep going, choose a Goal. If you need a product
owned for you, choose Architect.

| | Workflow | Room | Goal | Architect |
| --- | --- | --- | --- | --- |
| Sero creates | A plan of steps | A team of agents | Nothing to review first | A charter with milestones and a cap |
| Work happens | Step by step | Members work and share findings | In your chat session | Milestone by milestone, in Workflows and Rooms |
| Use it for | A task with clear stages | A task that needs different roles or points of view | One result with an unknown route | A product built, released and maintained from an idea |

You do not need a Workflow before you start a Room or a Goal. They are
independent.

## What stays under your control

Sero shows you what it proposes before work starts. For a Workflow, you review
the steps. For a Room, you review the team and each member's role.

You also review:

- which files and tools the agents can use;
- how long they can work and how much they can spend;
- where Sero will put the result.

Your workspace is the project or folder that you opened in Sero. Sero asks for
approval before it sends a result outside that workspace.

Access settings control the tools available to an agent. They are not a
sandbox. An agent with shell, or command-line, access can run any command that
your account can run. Use Orchestrator only in a project that you permit it to
change.

Orchestrator pauses the work when it needs:

- an answer to a question;
- your approval for an action;
- more time or a higher cost limit;
- help after something failed.

You can close Orchestrator while the work continues. **Home** shows questions
and approvals that need your attention. Sero notifies you when the work finishes
or cannot continue.

## Start here

- [Create and run a Workflow](/guide/workflows) — the tutorial.
- [Manage Workflows](/guide/workflows-advanced) — schedules, recovery,
  Library and Catalog.
- [Create and run a Room](/guide/rooms) — the tutorial.
- [Manage a Room](/guide/rooms-advanced) — claims, limits, and the changes a
  team can make while it works.
- [Architect](/guide/architect) — a product owned for you, from idea to
  maintenance.

For exact tool names, commands, and compatibility terms, see the
[Orchestrator reference](/reference/orchestrator), the
[Workflows reference](/reference/workflows), and the
[Rooms reference](/reference/rooms).

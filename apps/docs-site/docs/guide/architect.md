# Architect

Sero Architect owns a product for you, above the level of one task. You give
it an idea and a folder. It researches, proposes a charter with milestones and
a cost cap, builds one milestone at a time through Workflows and Rooms, checks
the evidence itself, releases, and then maintains the result. It asks you only
for the decisions that are yours.

Use Architect when you want a delivered, maintained product from an idea. Use
[Orchestrator](/guide/orchestrator) directly when you want to run one Workflow,
Room or Goal yourself.

## Before you start

1. [Install and open Sero](/guide/getting-started).
2. [Configure a model](/guide/models-and-providers). Architect uses the first
   model on your machine that supports reasoning, unless
   `SERO_ARCHITECT_MODEL` names one.
3. Make sure Orchestrator is available. Architect dispatches its work through
   Workflows and Rooms.

Architect keeps one persistent agent session open per project, called the
owner. Sero asks you to allow that session when the project starts, the same
way it asks for a Room member. Everything the owner can do is limited to the
project folder and the tools you allowed.

## Create a project

1. Open **Architect** from the app bar and select **New project**.
2. Write the idea in your own words. Architect keeps the text exactly as you
   wrote it and never edits it.
3. Give a folder inside your home directory. An empty or new folder is best.
4. Select **Create project**.

Architect creates the folder, runs `git init`, registers the folder as a Sero
workspace, and then asks you to allow the owner session. The project stays in
`intake` until you allow it. After that, discovery starts.

## Phases

Every project moves through six phases in this order. Architect never skips a
phase and never moves back.

| Phase | What happens | What you do |
| --- | --- | --- |
| `intake` | The folder, repository and workspace are created. | Allow the owner session. |
| `discovery` | The owner reads your idea and runs research. | Nothing, unless you send a directive. |
| `charter` | The owner proposes a brief, milestones, a cost cap and an autonomy setting. | Approve the charter, or ask for a change. |
| `build` | Milestones run one at a time. Each closes only on evidence. | Approve milestone plans and answer decisions. |
| `release` | The last milestone is delivered, for example as a pull request. | Approve delivery outside the workspace. |
| `maintain` | A maintenance Workflow listens to issues, CI failures and a weekly review. | Answer the decisions it raises. |

Four overlays can sit on top of a phase. They are stops, never later phases:

- `decision`: a question waits for you. Nothing that depends on it moves.
- `paused`: you paused the project. Running work finishes; the owner is not
  woken until you resume.
- `limited`: spend reached the cap. Raise the cap to continue.
- `blocked`: the owner needs help it cannot get on its own. The page says why.

## The project page

The page has four parts, in this order.

1. **The state line.** One sentence from the Architect, the phase, the overlay,
   and spend against the cap.
2. **Needs you.** Open decisions and approvals. Each decision card shows the
   question, the options with their consequences, the reason it was raised,
   and the recommended option already selected. **Answer** takes one action.
   If nothing is needed, the section says so and does not grow.
3. **Milestones.** One row per milestone with its status and, when work is
   running, one **Open in Orchestrator** link to the Workflow or Room. Evidence
   for a closed milestone sits behind a disclosure.
4. **Directive.** A short message to the Architect and its latest reply. A
   directive wakes the Architect ahead of every other event.

History and older directives are behind disclosures in the side column. The
page never shows an event log and never streams agent output. To read the
owner's session, select **Open session**.

## Milestones close on evidence

A milestone is complete only when Architect has checked it. The owner cannot
mark a milestone done by saying so. Architect runs the project's check
commands, reads the git diff, and for a milestone with a preview route it
starts the dev server, loads the route and saves a screenshot. The result is
recorded on the milestone as one of four states:

| State | Meaning |
| --- | --- |
| `reported` | the work claims it is complete |
| `verified` | Architect's checks passed at a named commit |
| `accepted` | the owner accepted the verified result |
| `delivered` | the result was delivered, for example a merged pull request |

A lower state never stands in for a higher one. If files change after the
evidence was taken, the evidence is marked stale and the checks run again.

## Decisions

Architect always asks you before it:

- changes an approved charter;
- delivers anything outside the workspace, such as a pull request, an email or
  a webhook;
- spends beyond the cap.

Other decisions depend on the autonomy setting you chose at the charter:

| Setting | What you approve |
| --- | --- |
| `milestones` (default) | the charter and each milestone plan |
| `charter-only` | the charter only |
| `model-judged` | the charter; the Architect decides what else to raise |

A decision has no timeout and no default. The milestones that depend on it
park until you answer. Milestones that do not depend on it keep running.

## Cost

Every project has a cost cap set at the charter. Spend includes the owner
session, research runs and every dispatched Workflow and Room. At the cap the
project stops with the `limited` overlay: running work finishes on its own,
and nothing new starts until you raise the cap from the page.

## Controls

The controls menu on the project page offers:

- **Pause** and **Resume**. Pause stops the owner from being woken. Work in
  flight continues.
- **Stop**. The owner is not woken again. Work in flight continues.
- **Raise cap**.
- **Autonomy**. Cycles through the three settings.
- **Delete project**. Removes the record and the owner session. Files in the
  project folder stay.

## The dashboard widget

The Architect widget shows your projects with their state lines and the
number of items that need you. With no projects it offers one action, **New
project**.

## Related pages

- [Architect reference](/reference/architect): tools, record fields, statuses
  and storage.
- [Orchestrator](/guide/orchestrator): Workflows, Rooms and Goals.

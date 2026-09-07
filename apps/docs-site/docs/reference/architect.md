# Architect reference

This page lists the runtime facts for Sero Architect. For the user task, see
[Architect](/guide/architect).

## Availability

Architect is a built-in plugin, `@sero-ai/plugin-architect`, with global scope:
one project list per profile. It needs persistent agent sessions, the
Orchestrator plugin, and the host capabilities `appAgent.invokeTool`,
`tool.cli`, `appRuntime.background` and `appRuntime.workspaceCreate`.

`SERO_ARCHITECT_MODEL` names the owner's model as `provider/model`. Without
it, the owner uses the first available model that supports reasoning.

## Terms

| Term | Meaning |
| --- | --- |
| Project | one idea, its folder, workspace, owner session, charter, milestones, decisions, directives, budget and history |
| Owner | the persistent agent session that thinks for one project; the runtime acts on its behalf |
| Charter | the brief, milestone list, cost cap and autonomy setting proposed after discovery and approved by you |
| Milestone | one unit of work, dispatched as a Workflow or a Room and closed only on evidence |
| Decision | a question raised to you with options, consequences, a recommendation and a reason |
| Directive | a message from you to the owner; it replies once |
| Evidence | command results, a diff summary and a capture recorded by the runtime at a named commit |
| Wake | one turn of the owner session, started by the runtime for an event |

## Phases and overlays

Phases, in order: `intake`, `discovery`, `charter`, `build`, `release`,
`maintain`. A project never moves back.

Overlays: `decision`, `blocked`, `paused`, `limited`. An overlay is derived on
every write from the record's flags and is never set by hand.

## Milestone statuses

| Status | Meaning |
| --- | --- |
| `planned` | on the charter, no plan approved yet |
| `approved` | the plan is approved; the owner may dispatch it |
| `running` | a Workflow or Room is running it |
| `verifying` | the work reported completion; the runtime is checking the evidence |
| `done` | accepted on verified evidence |
| `parked` | waiting on an open decision; returns to its previous status when answered |

Verification states on a milestone: `reported`, `verified`, `accepted`,
`delivered`. A lower state never stands in for a higher one.

## Wake sources

The runtime wakes the owner for these events, highest priority first:

| Kind | Cause |
| --- | --- |
| `directive` | you sent a directive |
| `decision` | you answered a decision, approved a charter or plan, or raised the cap |
| `dispatch-blocked` | a Workflow or Room needs input or stopped |
| `dispatch-complete` | a Workflow or Room finished and the evidence check ran |
| `external-event` | the maintenance Workflow ran for an issue, a CI failure or its schedule |
| `quiet` | the project was created, research finished, or planned work remains |

One wake runs at a time. Wakes of the same kind merge. The owner is not woken
while the project is paused, limited, blocked or stopped. Every wake ends with
one of `sleep`, `decide` or `blocked`; three turns in a row with no outcome
block the project.

## Owner tool

The owner reaches the runtime through one bridged tool, `architect`, run as
`sero architect --action <name> --projectId <id>`. Every call carries the
project id and is refused for any session that is not that project's owner.

| Action | Effect |
| --- | --- |
| `brief` | records the brief |
| `charter` | proposes the charter; on an approved charter it raises a decision instead |
| `milestone` | adds a milestone, sets its plan, or claims completion (`--done`), which is refused without evidence |
| `decide` | raises a decision and parks the milestones it names |
| `research` | asks the runtime to run a structured research subagent |
| `dispatch` | asks the runtime to create a Workflow or a Room for a milestone |
| `evidence` | asks the runtime to run the checks; the owner cannot attach results itself |
| `status` | reads the record |
| `reply` | answers the open directive |
| `blocked` | ends the wake blocked, with a reason |
| `sleep` | ends the wake |

The owner session holds only the `architect` command and the platform tools.
The `architect_projects` management tool refuses an owner caller, so the owner
cannot approve its own charter, raise its own cap or answer its own decisions.

## Management tool

The user's chat and the project page use `architect_projects`.

| Action | Parameters |
| --- | --- |
| `list` | none |
| `show` | `projectId` |
| `create` | `idea`, `folder` |
| `pause`, `resume`, `stop`, `delete` | `projectId` |
| `raise_cap` | `projectId`, `capUsd` |
| `set_autonomy` | `projectId`, `autonomy` (`milestones`, `charter-only`, `model-judged`) |
| `approve` | `projectId`, `target` (`charter` or `milestone`), `milestoneId` |
| `answer` | `projectId`, `decisionId`, `optionId`, optional `note` |
| `directive` | `projectId`, `text` |

`pause` and `stop` do not cancel a running Workflow or Room. `delete` removes
the record and the owner session's grant; files in the folder stay.

## Forced escalations

The runtime raises a decision itself, with the proposal attached, when the
owner tries to change an approved charter, deliver to a destination outside
the workspace (`email-send`, `chat-post`, `webhook-post`), or spend over the
remaining cap. The proposal is applied only when you pick `apply`.

## Delivery

A release milestone names a destination. Inside the workspace: `pr`,
`workspace-files`, `saved-artifact`, `email-draft`. Outside it, always a
decision first: `email-send`, `chat-post`, `webhook-post`. A delivery receipt
is recorded on the milestone; it never substitutes for verification.

## Maintenance

On entering `maintain`, the runtime creates one Workflow subscribed to
`github:issue-opened`, `github:ci-failed` and the schedule `0 8 * * 1`. Each
run wakes the owner to triage. A fix is a milestone and moves through the same
four verification states.

## State and storage

| Path | Content |
| --- | --- |
| `~/.sero-ui/apps/architect/state.json` | the index: one row per project (id, name, phase, overlay, state line, spend, cap, needs-you count) |
| `~/.sero-ui/apps/architect/projects/<id>.json` | the full project record; the runtime is its only writer |
| `<folder>/.sero/apps/architect/evidence/<milestone>/<commit>.png` | captures taken by the verifier |

The UI, the widget and the management tool read only the index and one
record. Layout preferences of the Architect surface persist through the host
layout service, never through browser storage.

## Related pages

- [Architect](/guide/architect)
- [Orchestrator reference](/reference/orchestrator)
- [Workflows reference](/reference/workflows)
- [Rooms reference](/reference/rooms)

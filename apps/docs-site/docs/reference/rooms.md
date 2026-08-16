# Rooms reference

This page lists the runtime facts for Orchestrator Rooms. For the user task,
see [Create and run a Room](/guide/rooms).

## Availability

Rooms are enabled by default when the host supports persistent agent sessions.
Set `SERO_ROOMS=0` or `SERO_ROOMS=false` before Sero starts to disable Rooms as
an emergency measure.

`SERO_ROOM_MODELS` limits Rooms on the machine to a comma-separated list of
`provider/model` values. `SERO_ROOM_THINKING` limits the allowed thinking
levels. Values that do not match an available option are ignored and logged.

## Terms

| Term | Meaning |
| --- | --- |
| Room | one problem, its temporary team, limits, messages, work, and result |
| Conductor | the member that coordinates the team and decides when work is complete |
| Member | one persistent agent session with a defined job and approved access |
| Proposal | the team, limits, access, and delivery plan shown before start |
| Brief | the current objective, decisions, work, blockers, questions, and success checks |
| Artifact | a file or other result recorded by a member |
| Claim | a notice that a member intends to work on a path or named resource |

## Room statuses

| Status | Meaning |
| --- | --- |
| `draft` | the Room is being described or reviewed |
| `adjusting` | Sero is revising the proposal |
| `starting` | Sero is creating approved member sessions and workspaces |
| `ready` | setup is complete and member work can start |
| `running` | the scheduler can start member turns |
| `pausing` | current turns are settling; no new turn starts |
| `paused` | no member turn can start until resume |
| `completing` | Sero is delivering the result and closing resources |
| `completed` | the result was delivered and the Room ended |
| `failed` | the Room ended because it could not recover |
| `cancelled` | the user stopped the Room |

`completed`, `failed`, and `cancelled` are final states.

## Member access

Each member has one approved permission level:

| Level | Workspace | Commands | Version control |
| --- | --- | --- | --- |
| `read-only` | read | none | read |
| `edit-workspace` | read and write in its assigned workspace | allowed | local changes |
| `edit-and-push` | read and write in its assigned workspace | allowed | push and pull-request actions |

The host checks each requested tool against the member's permission level. A
tool that needs more authority is removed from the approved grant. An unknown
plugin tool is denied until Sero has an explicit permission mapping for it.

The Conductor can change tasks, priorities, and instructions within the
approved limits. It can also add, retire, suspend, or resume members when the
approved team-size and cost limits permit it. It cannot give itself or another
member more access.

The user must approve a change that increases access, time, cost, team size, or
delivery authority. Replacing the Conductor also needs user approval.

## Workspace modes

| Mode | Behavior |
| --- | --- |
| `read-only-shared` | members read the workspace and do not edit it |
| `worktree-per-member` | each editing member receives a separate managed Git worktree |
| `shared-working-tree` | editing members use one working tree and must coordinate overlapping paths |

`worktree-per-member` is the normal mode for editing teams. Read-only members
do not need a worktree.

## Scheduling and limits

Rooms have limits for maximum cost, working time, team size, active member
turns, and retry behavior. Reaching a hard limit stops new turns and shows a
reason in the Room. It does not silently increase the limit.

One active-turn slot is reserved for the Conductor when the Conductor is not
already running. This lets the Conductor respond when other members fill the
remaining slots.

## Questions, messages, and approvals

A member question ends that member's turn and releases its active slot. The
same session continues after the answer arrives.

An intervention can be delivered:

- `now` — wake or interrupt the named members;
- `next-turn` — add the message to the next turn without an immediate model
  call.

Only the user control surface can resolve approvals. The member control surface
cannot approve requests, start or stop the Room, or change the Room's approved
limits.

## Delivery

The proposal defines one delivery destination. A Room started from chat also
returns one final result to the chat that started it.

Delivery to an external destination needs user approval. Sero records a
delivery reference when the destination provides one.

## User tool actions

The `rooms` tool is the user control surface.

| Action | Purpose |
| --- | --- |
| `prepare` | create a draft proposal from a problem description |
| `adjust` | revise a draft proposal from a plain-language instruction |
| `start` | approve setup and start member sessions |
| `pause`, `resume` | stop or restart member turns |
| `cancel`, `delete` | end a Room or remove its record |
| `resolve_approval` | approve or reject one request |
| `intervene` | send information or direction to members |
| `wake` | put an idle member back to work |
| `answer` | answer a waiting member question |
| `release` | release an explicit wait between members |
| `timeline` | read Room activity |
| `watch`, `unwatch` | start or stop live status updates |
| `history` | read a member session history |
| `context` | read the current Room context |

Room members use the separate `room` tool through the Sero CLI. The runtime
checks that the caller is on the Room roster. A Room member cannot use the
user-only `rooms` control surface.

## Recovery and retention

After a restart, Sero reconciles saved Room state with member sessions and
managed worktrees. Interrupted member turns are released. The Conductor decides
what work still needs to run.

Pausing keeps the Room record and member session history. Archiving a finished
Room keeps it in the Room list and removes older retained message activity.
Deleting removes the Room record. Member session files remain subject to the
normal Sero session retention rules.

## State and storage

Room state is stored per workspace:

```text
<workspace>/.sero/apps/orchestrator/rooms/
  index.json
  <roomId>/room.json
  <roomId>/members/<memberId>.json
  <roomId>/messages/<page>.json
  <roomId>/revisions.json
  <roomId>/timeline.jsonl
```

These files can contain prompts, answers, paths, model usage, costs, and work
results. Remove private data before you share them.

## Related pages

- [Rooms guide](/guide/rooms)
- [Orchestrator reference](/reference/orchestrator)
- [State and Folders](/reference/state-and-folders)
- [Security and Privacy](/reference/security-privacy)

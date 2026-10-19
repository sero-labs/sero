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

The Conductor can change tasks, priorities, and instructions. It can retire,
suspend, or resume members. It can also change a member's setup, add a member
or replace one while the Room runs. See
[Change a running Room](#change-a-running-room). A change never gives a member
more than you approved unless you approve that addition.

The Room can ask the user to approve a higher time or cost limit.

A member, like an Architect owner, registers every tool its approval allows and
starts with a small loaded set. It finds and loads another approved tool in the
same session with Pi's `tool_search`, with no new approval. A tool outside the
approval is not registered, so the member cannot find or call it. One line in
the member's prompt lists the approved tools it does not have, and why: its
plugin is not installed, you turned it off, it is not available to a Room
member, or it is outside the approval. After the session reopens, a member can search
for the tool again. Discovery is not a `sero-cli` command.

A member has Code Mode when the Room gives it that tool, at the start approval
or in a later change you approve. No member has it by default. It starts
loaded, and a script can call only the tools that member was approved for. A
read-only member's script cannot reach a write tool.

## Change a running Room

A running Room can change through its existing approval. Sero keeps the same
grant and every member's history. It does not start a second grant.

| Change | Rule |
| --- | --- |
| A member's model, thinking level, tools or skills | allowed |
| Add a member | allowed. The new member cannot need its own checkout |
| Replace a member | allowed. The old member is retired with its history kept. The new member starts from the handover |
| A member's permission level, or whether it needs its own checkout | not allowed while the Room runs |

A change that stays inside what you approved applies with no dialog. It takes
effect at the member's next safe point: the end of its current turn. Sero never
aborts a turn to apply a change. A change that adds access, such as a tool,
skill, model, thinking level or member you did not approve, is held. The Room
shows what it would add. It applies only after you approve that addition. If
you decline, the Room keeps its old setup.

A member can have one open setup change at a time. A member whose setup is
changing does not start work until the change is applied or settled.

If Sero restarts during a change, the change is finished or held. It is never
applied twice.

## Workspace modes

| Mode | Behavior |
| --- | --- |
| `read-only-shared` | members read the workspace and do not edit it |
| `worktree-per-member` | each editing member receives a separate managed Git worktree |
| `shared-working-tree` | editing members use one working tree and must coordinate overlapping paths |

`worktree-per-member` is the normal mode for editing teams. Read-only members
do not need a worktree.

## Path claims

A claim records that a member intends to work on a path or named resource. It is
not a lock. Each editing member has a separate checkout, and Git handles
conflicts when the changes are combined. Claims help members prevent duplicate
work.

| Field | Meaning |
| --- | --- |
| `pattern` | a path, a directory, or a glob |
| `reason` | why the member needs the claim |
| `status` | `active` or `released` |
| `createdAt`, `releasedAt` | when the claim was created and released |

Overlap is tested against other members' active claims only. A member that
re-claims its own pattern is not in conflict with itself.

The Room's claim policy decides what an overlap does:

| Policy | Result |
| --- | --- |
| `warn` | record the claim and identify members with overlapping claims |
| `block` | the whole request is refused, so a partly applied claim set never exists |

A member can hold up to 50 active claims. Sero keeps up to 200 released claims
for the audit trail and removes the oldest entries first.

Sero releases a member's claims when the member retires or the Room ends. It
also checks the roster when it reads claims and ignores claims from members that
are no longer active.

## Artifacts

An artifact is a result recorded by a Room member.

| Field | Meaning |
| --- | --- |
| `kind` | one of `plan`, `decision`, `branch`, `commit`, `patch`, `test-result`, `review`, `report`, `pull-request`, `final-answer` |
| `title` | the member's title for the artifact |
| `ref` | a host artifact reference, or an external URL |
| `producedByMemberId` | the member that recorded it |
| `relatedWorkId` | the related work item, if present |

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
| `pause`, `resume` | prevent new turns while active turns finish, or restart member turns; pause does not stop an active turn |
| `cancel`, `delete` | stop a Room and abort active turns, or remove its state and member session history |
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

Pausing keeps the Room record and member session history. The store supports an
internal archive state that removes old retained message activity, but the
current user control surface does not expose an archive action. Deleting removes
the Room state and deletes its persistent-session grant history, including its
member session files. Sero first preserves member work in checkpoints and
refuses deletion if it cannot preserve a member worktree.

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
- [Manage a Room](/guide/rooms-advanced)
- [Architect reference](/reference/architect)
- [Goals](/guide/goals)
- [Sero CLI reference](/reference/sero-cli)
- [State and Folders](/reference/state-and-folders)
- [Security and Privacy](/reference/security-privacy)

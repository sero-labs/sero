Verified at revision 75b5543d592f09f145c0d4ffed4b285f7d25459c on 2026-10-06.

# Limit provenance map

Provenance classes: user approved (UA), internal watchdog (IW), inferred default (ID), agent chosen (AC).

Paths are relative to the repository root. Plugin paths are shortened: `architect/` is `plugins/sero-architect-plugin/`, `orch/` is `plugins/sero-orchestrator-plugin/`, `host/` is `apps/desktop/electron/features/`. "Not verified" means the path was not confirmed in code.

## Architect owner

| Limit | Value | Created at | Enforced at | Provenance | What happens when reached | Can an agent raise it? |
|---|---|---|---|---|---|---|
| Owner turn watchdog | 10 minutes per turn | architect/runtime/owner-session.ts:151 | architect/runtime/owner-session.ts:412-416 | IW | The turn is aborted. The first time, the owner is woken again with a note to continue in shorter steps (architect/runtime/index.ts:241-243, owner-session.ts:450-452). A second one in a row blocks the project (owner-session.ts:454-457). The record keeps what was done. | No. The constant is fixed. |
| Silent turn limit | 3 turns in a row with no declared outcome | architect/runtime/turn-outcomes.ts:12 | architect/runtime/turn-outcomes.ts:44-50 | IW | The project is blocked with a readable reason. The record is kept. | No. A declared outcome only resets the count (turn-outcomes.ts:44). |
| Project cost cap | Number typed at intake | architect/ui/components/IntakeDialog.tsx:88-104, architect/runtime/projects-actions.ts:169, becomes the budget cap at architect/runtime/owner-session.ts:240 and is shown in the start approval at owner-session.ts:114 | architect/shared/lifecycle.ts:24 (limited overlay), lifecycle.ts:137-157 (charge), architect/shared/budget.ts:35-57 (free amount, start allocation) | UA | New starts are refused and the project shows "limited". Work already running can report more spend (budget.ts:4-7). | No. Only a user action (architect/runtime/projects-actions.ts:317) or a decision proposal the user accepts (architect/runtime/decision-proposals.ts:67) calls setCap (architect/shared/lifecycle.ts:159). No other caller found. |
| Per-start allocation for a milestone Workflow or Room | Smaller of what the owner asked and what is free | architect/runtime/services.ts:270-273 (owner request, clipped to free budget), architect/shared/budget.ts:47-57 | architect/runtime/services.ts:273 passes it to the Workflow or Room as its cost limit; enforced there (see Workflows and Rooms) | AC | The Workflow or Room stops new work at that amount. | The owner picks the amount, but it can never exceed the free part of the user cap (budget.ts:57). |
| Research start promise | $5 | architect/shared/budget.ts:18, used at architect/runtime/services.ts:246 | architect/shared/budget.ts:47-57 (refuses when nothing is free) | ID | The research start is refused when no budget is free. | No. Fixed constant. |
| Research Room envelope | 15 minutes, 3 members, up to $5 | architect/runtime/research-room.ts:78 | orch/runtime/rooms/room-limits.ts:39-47 and :91 (see Rooms) | ID | The Room pauses at its limit. | No. Fixed in code. The user never sees it. |
| Evidence command timeout | 10 minutes per command | architect/runtime/services.ts:53 | architect/runtime/services.ts:146 passes it to host.runCommand. The kill itself is in the host and was not verified. | IW | Not verified how the timeout is reported for the milestone. | No. |
| Owner session grant | 1 live, 1 total session | architect/runtime/owner-session.ts:97-98 | host/apps/runtime/capabilities/persistent-sessions/grant-store.ts:199-204 | ID | A second session is refused. The approval text (owner-session.ts:114) shows the cap and model but not these counts. | No. |
| Delegation session bounds | 8 live, 64 total, 16384 prompt bytes | architect/runtime/delegation.ts:40, :57, :62-63 | Host ceiling host/apps/runtime/capabilities/persistent-sessions/clamp.ts:29-31, :171-172; counts at grant-store.ts:429-430; prompt size at validate.ts:210-213 | ID | The session start is denied. Whether the approval dialog shows these numbers: not verified. | No. |

## Structured workers and Workflows

| Limit | Value | Created at | Enforced at | Provenance | What happens when reached | Can an agent raise it? |
|---|---|---|---|---|---|---|
| Total attempts | 50 | orch/shared/defaults.ts:62, merged at orch/runtime/loop-factory.ts:36-45 and :107, orch/runtime/plan-mapping.ts:100 | orch/runtime/limits.ts:76-78 | ID | The Workflow blocks as a management limit. This is not completion (limits.ts:1-4). | Not verified. The only override found is orch/runtime/override-actions.ts:47-53, which swaps the token limit for a dollar cap. |
| Attempts per step | 3 | orch/shared/defaults.ts:61. A step can carry its own value (orch/runtime/readiness.ts:45). | orch/runtime/readiness.ts:45, orch/shared/recovery.ts:18 | ID | The step is not started again. | The planner can suggest it (see next row). |
| Planner-suggested limits | Attempts per step, concurrent steps, total tokens | orch/runtime/planner-prompt.ts:58, applied at orch/runtime/plan-mapping.ts:100 | orch/runtime/limits.ts:85-87 (tokens), readiness.ts:45 | AC | Same as the limit it sets. The Architect removes the token limit for its Workflows (architect/runtime/services.ts:283, orch/runtime/loop-factory.ts:43). | The planner chooses these inside the defaults. A user value overrides it (loop-factory.ts:42). |
| Workflow wall clock | 30 minutes per run when nobody sets one | orch/shared/defaults.ts:64. The Architect passes only a cost limit (architect/runtime/services.ts:273, :288), so this default applies to its milestone Workflows. | orch/runtime/limits.ts:79-84 (between batches). Also given to a running step as its timeout: orch/runtime/executors/common.ts:147-167, orch/runtime/executors/active-session.ts:54-62. | ID | New work stops and the Workflow blocks. A running step is stopped when the time is gone. This is a default the user never chose, not a stall watchdog. | Not verified. |
| Workflow cost cap (Architect dispatch) | Allocation from the Architect | architect/runtime/services.ts:272-273 | orch/runtime/limits.ts:88-90 | AC | The Workflow blocks as a management limit. | The owner can ask for a new total through a retry decision (architect/runtime/linked-work.ts:34, decision-proposals.ts:91). Whether the user must accept it: not verified. |
| Concurrent steps | 3 | orch/shared/defaults.ts:63 | orch/runtime/run-engine.ts:179, orch/runtime/fan-out-run.ts:79 | ID | Extra ready steps wait. This slows work and does not stop it. | The planner can suggest it. |
| Outcome repair follow-ups | 2 | orch/runtime/executors/common.ts:32 | Passed to the structured call at common.ts:30. The re-prompt loop is in the host and was not verified. | IW | The step attempt ends with the last reply. Not verified in detail. | No. |
| Active-session step timeout fallback | 30 minutes, only when the Workflow has no wall clock | orch/runtime/executors/active-session.ts:15, :54-62 | orch/runtime/executors/active-session.ts:95, :166-174 | IW | The step fails with a "timed out" summary. | No. |
| Subagent run timeout | 10 minutes, unless the caller passes one | host/subagent/index.ts:61, host/subagent/core/types.ts:78, host/subagent/core/resolve.ts:33. A Workflow step overrides it with its remaining wall clock (orch/runtime/executors/common.ts:167). | host/subagent/runtime/runner.ts:169-172 | IW | The run is stopped with the reason "Timed out after Ns". What is kept of partial work: not verified. | A caller can pass timeoutMs (host/subagent/index.ts:153-154). |
| Tool stall timeout | 120 seconds per tool call | host/subagent/index.ts:62, core/types.ts:79, core/resolve.ts:34 and :101 | host/subagent/runtime/runner.ts:342-350 | IW | The tool call is aborted and the whole run is stopped (runner.ts:350). | A caller can pass a setting (resolve.ts:78, :101). |
| Subagent pool | 4 at once, 8 total | host/subagent/index.ts:58-59 | host/subagent/index.ts:63 (ConcurrencyPool). What a refused start looks like: not verified. | ID | Not verified. | No. |

Not inventoried: git clone and pull timeouts for the catalog, GitHub HTTP timeouts and the dirty-workspace prompt timeout (orch/runtime/catalog-store.ts:40-41, orch/runtime/events/github-http.ts:28, orch/runtime/workspace.ts:216). They do not stop agent work.

## Rooms

A Room started by the user shows its time and spend in the approval (orch/ui/components/RoomProposal.tsx:267-268). A Room started by the Architect skips that approval inside the approved start (architect/runtime/services.ts:315-318, from a code comment; host side not verified). Both cases are listed.

| Limit | Value | Created at | Enforced at | Provenance | What happens when reached | Can an agent raise it? |
|---|---|---|---|---|---|---|
| Room time limit (user-started) | 60 minutes default, chip choices 30 to 240 | orch/runtime/rooms/planner.ts:108-113 and :250, orch/ui/components/RoomBriefForm.tsx:32-34 and :98 | orch/runtime/rooms/room-limits.ts:46-48, orch/runtime/rooms/room-scheduler.ts:87 | UA | New turns stop and the Room pauses for the user (orch/runtime/rooms/room-stall.ts:47-53). Work in flight finishes (room-limits.ts:8-9). Paused time is not counted (room-limits.ts:43-46). | Resume can extend it (orch/runtime/rooms/room-lifecycle.ts:371-384) through the room tool's maxMinutes (orch/extension/room-app.ts:224). Whether the user must approve that: not verified. |
| Room spend limit (user-started) | $5 default, chip choices 2 to 25 | orch/runtime/rooms/planner.ts:110 and :246-251, orch/ui/components/RoomBriefForm.tsx:32 | orch/runtime/rooms/room-limits.ts:39-41 | UA | Same pause as above. | No path found that changes it without the user. Not verified for the room tool. |
| Room time limit (Architect-started) | 60 minutes, because the Architect passes none | orch/runtime/rooms/planner.ts:111, architect/runtime/services.ts:273 and :313 | orch/runtime/rooms/room-limits.ts:46-48 | ID | The Room pauses. | Not verified. |
| Room spend limit (Architect-started) | Allocation from the Architect | architect/runtime/services.ts:272-273 and :313 | orch/runtime/rooms/room-limits.ts:39-41 | AC | The Room pauses. | Bounded by the project cap (architect/shared/budget.ts:57). |
| Team size cap | 5 | orch/runtime/rooms/planner.ts:109 and :249. The approval shows the team size (RoomProposal.tsx:266), and the cap appears in Advanced settings (orch/ui/components/RoomAdvancedSettings.tsx:200). | orch/runtime/rooms/room-limits.ts:91-93, orch/shared/room-validation.ts:109-113 | ID | A larger team is refused or clipped (orch/shared/room-clamp.ts:200-209). | An agent can ask for a different cap when preparing a Room (orch/extension/room-app.ts:182). The user approves the proposal. |
| Active turns at once | 3 | orch/runtime/rooms/planner.ts:121 | orch/runtime/rooms/room-scheduler.ts:101 | ID | Extra members wait. This slows work and does not stop it. | No. |
| Room total tokens | 2,000,000 | orch/runtime/rooms/planner.ts:124 | orch/runtime/rooms/room-limits.ts:50-52 | ID | The Room pauses. | No. |
| Turns per member | 30 | orch/runtime/rooms/planner.ts:125 | orch/runtime/rooms/room-limits.ts:74-76, room-scheduler.ts:129 | ID | That member gets no more turns. | No. |
| Spend and tokens per member | Half the Room total | orch/runtime/rooms/planner.ts:140, :252-253 | orch/runtime/rooms/room-limits.ts:68-73 | ID | That member gets no more turns. | No. |
| Consecutive member failures | 3 | orch/runtime/rooms/planner.ts:127 | orch/runtime/rooms/room-limits.ts:77-79 | ID | That member gets no more turns. | No. |
| Roster changes and replacements | 5 changes, 3 replacements | orch/runtime/rooms/planner.ts:122-123 | orch/runtime/rooms/room-limits.ts:54-57 and :87-101 | ID | Further team changes are refused. | No. |
| Retries per member | 2 | orch/runtime/rooms/planner.ts:126, parsed at orch/runtime/rooms/blueprint-schema.ts:117 | Not verified. No enforcement found in orch/runtime. | ID | Not verified. | No. |
| Idle (no progress) limit | 5 minutes | orch/runtime/rooms/planner.ts:130. Shown only as a read-out in Advanced settings (RoomAdvancedSettings.tsx:212). | orch/runtime/rooms/room-limits.ts:108-118, orch/runtime/rooms/room-coordinator.ts:283-290 | IW | The Room pauses. If a member is asking the user a question it pauses as "awaiting user"; otherwise the Conductor is told first (orch/runtime/rooms/room-stall.ts:150-162). The ladder is read from the saved stop reason, so a restart does not reset it (room-stall.ts:12-15). | No. |
| Deadlock and stranded-question escalation | No constant. Triggered when members wait on each other. | orch/runtime/rooms/room-stall.ts:56-59 | orch/runtime/rooms/room-stall.ts:56-95 | IW | The Conductor is told, and continued deadlock pauses the Room. | No. |
| Live and total session counts, prompt bound | Live: smaller of team size and active turns + 1 + 2. Total: team size + replacements. Prompt: built size + 512 bytes. Pool ceiling 12. | orch/runtime/rooms/member-grant.ts:53, :209, :217-219, :170-176, :196, :256-257. Pool: orch/runtime/rooms/member-session.ts:48. | host/apps/runtime/capabilities/persistent-sessions/grant-store.ts:429-430, validate.ts:210-213, orch/runtime/rooms/member-session.ts:283 | ID | A session start is denied, or the least recently used idle session is closed (member-session.ts:275-277). | No. |
| Mailbox send rate | 20 sends per member per 60 seconds | orch/runtime/rooms/room-mailbox-limits.ts:35-41 | orch/runtime/rooms/room-mailbox.ts:124 | IW | The send is refused. | No. |
| Room size bounds | 200 work items, 200 artifacts, 256 KiB per artifact, 50 claims per member, inbox 50, message 4,000 characters, 20 messages per turn | orch/runtime/rooms/room-work.ts:31-34, room-claims.ts:38, room-mailbox-limits.ts:36-37, member-prompt.ts:19 | Confirmed for work items (room-work.ts:234) and claims (room-claims.ts:193). Others: not verified. | ID | The request is denied with a reason. | No. |

No per-turn timeout for a Room member was found in orch/runtime/rooms.

## Goals

| Limit | Value | Created at | Enforced at | Provenance | What happens when reached | Can an agent raise it? |
|---|---|---|---|---|---|---|
| Automatic turns | 25 when nobody sets one | orch/shared/goal-defaults.ts:13, merged at orch/runtime/goals/goal-runtime.ts:146 | orch/runtime/goals/goal-limits.ts:30-36 | ID | The Goal becomes "limited", not complete, and the user is notified (orch/runtime/goals/goal-runtime.ts:201-209, orch/extension/goal-loop.ts:100-104). | Yes, see the goal tool row. |
| Goal limits typed by the user | Turns, active minutes, tokens, cost | orch/extension/goal-commands.ts:50-56, `/goal turns <n>` | orch/runtime/goals/goal-limits.ts:30-49 | UA | Same as above. Token and cost limits bound the Goal's own turns, not total spend (goal-limits.ts:5-8). | Yes, see the goal tool row. |
| Goal limits set through the goal tool | Turns, minutes, tokens, cost | orch/extension/goal-app.ts:31-38 and :71 (set_limits), orch/runtime/goals/goal-runtime.ts:351-357 | orch/runtime/goals/goal-limits.ts:30-49 | AC | Same as above. | Yes. set_limits merges any values into the Goal (goal-runtime.ts:354). No user approval step was found. A user-typed limit has no protection from this path. |
| No-progress hold | 3 identical outcomes with no tool attempt | orch/shared/goal-defaults.ts:16, orch/runtime/goals/goal-transitions.ts:87 and :105 | orch/runtime/goals/goal-runtime.ts:210-215 | IW | The Goal pauses with reason "no-progress" and the user is notified. Resume with /goal resume (orch/extension/goal-loop.ts:102-103). | No. |

A Goal wait has no timer. It holds the Goal until the user restarts it (orch/shared/goal-types.ts:73-77).

## Host persistent sessions

| Limit | Value | Created at | Enforced at | Provenance | What happens when reached | Can an agent raise it? |
|---|---|---|---|---|---|---|
| Live and total session ceilings | 8 live, 64 total | host/apps/runtime/capabilities/persistent-sessions/clamp.ts:28-31 | clamp.ts:171-172 and :202-203 (lower any request), grant-store.ts:199-204 and :429-430 | ID | A request above the ceiling is lowered. A start at the limit is refused ("live-limit", "total-limit"). | No. A caller can ask for less and never for more (clamp.ts:27). |
| System prompt addition size | 16,384 bytes ceiling | host/apps/runtime/capabilities/persistent-sessions/clamp.ts:31 and :145 | host/apps/runtime/capabilities/persistent-sessions/validate.ts:210-213 | ID | The session is denied. | No. |

## Candidates for stall recovery

Only internal watchdogs whose effect is to stop progressing work.

- Owner turn watchdog (10 minutes): aborts the turn. The record keeps what was done. One retry wake is already queued (architect/runtime/index.ts:241-243). A second in a row blocks the project.
- Silent turn limit (3): blocks the project with a readable reason. The record and session turn counts are kept.
- Evidence command timeout (10 minutes): kills one command. What state is kept on the milestone: not verified.
- Active-session step timeout fallback (30 minutes, only without a wall clock): fails the step with a timeout summary. The Workflow keeps its attempt history.
- Subagent run timeout (10 minutes, unless a Workflow passes its remaining wall clock): stops the run with a reason. What partial work is kept: not verified.
- Tool stall timeout (120 seconds): aborts the tool call and stops the whole run, with the reason recorded (host/subagent/runtime/runner.ts:346-350).
- Room idle limit (5 minutes): pauses the Room with a saved stop reason. Members, messages and work are kept. The escalation ladder survives restart.
- Room deadlock escalation: tells the Conductor first and pauses the Room if the deadlock continues. State is kept.
- Goal no-progress hold (3 repeats): pauses the Goal with the reason saved. The user resumes it.

## Limits that must not change

Every user-approved limit. Each stays a hard stop that only a user action can lift.

- Project cost cap (architect/shared/lifecycle.ts:24, architect/shared/budget.ts:35-57). Raised only by a user action or a decision the user accepts.
- Room time limit for a user-started Room (orch/runtime/rooms/room-limits.ts:46-48). Active time only, paused time is not counted.
- Room spend limit for a user-started Room (orch/runtime/rooms/room-limits.ts:39-41).
- Goal limits the user typed (orch/runtime/goals/goal-limits.ts:30-49). They are not protected today from the goal tool's set_limits path (orch/runtime/goals/goal-runtime.ts:351-357).

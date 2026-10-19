Verified at revision ba4c3fbf4e242ce736cad9ecd17906d7279f35ea on 2026-10-06.

# Restriction map

This map covers committed HEAD. The working tree also has uncommitted edits to `plugins/sero-architect-plugin/runtime/baseline.ts` and its test. Those files are outside the five seams and were not read.

Classes:

- authority check: protects what the user approved. Must stay.
- correctness constraint: protects data, identity or crash safety. Must stay.
- execution prescription: dictates how the agent works without protecting either. Candidate for removal.

Probe names used in the tables:

- CONTRACT: `apps/desktop/e2e/session-tools.contract.spec.ts`. It uses a stub model and records what each session is shown and can call. Owner probe at lines 348-379, Room member probe at 382-426, subagent probe at 312-328, member exclusion list at line 346.
- OS: `plugins/sero-architect-plugin/runtime/__tests__/owner-session.test.ts`
- OA: `plugins/sero-architect-plugin/runtime/__tests__/owner-actions.test.ts`
- EB: `plugins/sero-architect-plugin/runtime/__tests__/evidence-binding.test.ts`
- VAL, PERM, GS, HBS, MRP: `validate.test.ts`, `permission-tools.test.ts`, `grant-store.test.ts`, `host-build-session.test.ts`, `member-resource-profile.test.ts` under `apps/desktop/electron/__tests__/features/apps/runtime/capabilities/persistent-sessions/`
- RREV: `plugins/sero-orchestrator-plugin/runtime/__tests__/room-revisions.test.ts`
- PTP, RUN: `platform-tool-policy.test.ts`, `runner.test.ts` under `apps/desktop/electron/__tests__/features/subagent/`
- EXE: `plugins/sero-orchestrator-plugin/runtime/__tests__/executors.test.ts`
- EQ: `plugins/sero-orchestrator-plugin/runtime/__tests__/event-queue.test.ts`
- GR, GL: `plugins/sero-orchestrator-plugin/runtime/__tests__/goal-runtime.test.ts` and `plugins/sero-orchestrator-plugin/extension/__tests__/goal-loop.test.ts`

All Architect paths are under `plugins/sero-architect-plugin/`. All Orchestrator paths are under `plugins/sero-orchestrator-plugin/`. Desktop paths are under `apps/desktop/electron/`. PS means `features/apps/runtime/capabilities/persistent-sessions/`.

Every probe listed was identified by reading test names, not by running it.

## 1. Architect owner actions and session

| Restriction | Where | Class | Covered by probe | Design-table claim still true? |
| --- | --- | --- | --- | --- |
| The owner is offered five tools: read, bash, write, edit, sero-cli | Architect `runtime/owner-session.ts:30`, `:80` | execution prescription: it is the plugin's own proposal, and the user still approves it | OS:179-190 asserts the list; CONTRACT owner probe 348-379 | Yes ("granted tools") |
| The owner is offered no skills, in the proposal and in every session request | Architect `runtime/owner-session.ts:81`, `:133` | execution prescription: the empty list is the plugin's choice, not a user decision | No probe. OS:179-190 does not assert skills and the owner probe does not check them | Yes (`skills: []`) |
| An owner session request must stay inside its approved policy (tool, skill, model, thinking level, working directory) | Desktop `PS/validate.ts:172-201` | authority check: a request outside approval is denied | VAL:319-331 covers tools and skills. Model, thinking and directory tests not verified | Not in the design table |
| Owner grant is pinned to the project folder, filesystem write, commands all, network fetch, vcs commit (no push) | Architect `runtime/owner-session.ts:77`, `:84` | authority check: publishing stays a separate user decision | OS:187-188 asserts the folder and vcs commit | Not in the design table |
| Owner grant allows one live and one total session | Architect `runtime/owner-session.ts:94-95` | authority check: an approved cap, and it also keeps one session identity per project | OS:182 asserts the live cap only | Not in the design table |
| A changed Admin model selection blocks the project until the user resumes | Architect `runtime/owner-session.ts:289-302` | authority check: the approved model is the one that runs | Not verified | Not in the design table |
| Contract is rebuilt for every wake and sent again after compaction | Architect `runtime/owner-session.ts:320`, `:366-370` | correctness constraint: the owner must not lose its record-derived identity and rules | OS:205-214 | Yes ("current-contract restoration") |
| Usage is charged once per turn from the larger of stored and reported cost, with token deltas | Architect `runtime/owner-session.ts:338-346` | correctness constraint: prevents double charging | OS:249-250 | Yes ("usage charging") |
| A turn that runs more than ten minutes is aborted | Architect `runtime/owner-session.ts:150`, `:407-413` | execution prescription: a fixed internal default, not tied to any user approval | OS:40-62 | Yes ("ten-minute turn watchdog") |
| The first timeout is retried once, and only while the project may still wake for work. A second consecutive timeout blocks the project | Architect `runtime/owner-session.ts:445-453`; `runtime/index.ts:225` | execution prescription: the retry-then-block rule is internal, not user-set (the overlay check on the retry is the only authority part) | OS:51-62 | Yes |
| Owner calls are accepted only from the session that owns the project, and only for that project id | Architect `runtime/owner-actions.ts:94-97`, `:389-395` | authority check: no other session can change the record | OA:121 ("not one") | Not in the design table |
| Dispatch kind must be workflow or room. There is no owner action that does the work itself | Architect `shared/owner-actions.ts:33`; `runtime/owner-actions.ts:302` | execution prescription: it dictates that every milestone effect is delegated | OA:254 covers a dispatch. No probe shows direct work being refused | Yes ("Dispatch kinds are Workflow or Room") |
| A single researcher cannot run commands. Only a Room can | Architect `runtime/owner-actions.ts:285` | execution prescription: the owner is told how to staff the work | Not verified | Not in the design table |
| OpenSpec implementation runs only as a Workflow ("in this proof of concept") | Architect `runtime/owner-actions.ts:320` | execution prescription: a staffing rule | Not verified | Not in the design table |
| Only a planned or approved milestone dispatches. Running, verifying and done milestones refuse. A milestone with a dispatch in preparation is not dispatched twice | Architect `runtime/owner-actions.ts:301`, `:313-315` | correctness constraint: prevents duplicate runs of one milestone | OA:299 | Not in the design table |
| A planned milestone under autonomy "milestones" needs the user's approval of its plan before dispatch | Architect `runtime/owner-actions.ts:316-318` | authority check | OA:376 | Not in the design table |
| Dispatch needs build, release or maintain phase, no pause or block, spend below the cap, and approved authority | Architect `runtime/owner-actions.ts:309-311`; `shared/lifecycle.ts:185-193` | authority check: the user's pause, cap and approval decide | Not verified | Not in the design table |
| Sending to email, chat or webhook becomes a user decision. Spending beyond the cap becomes a user decision | Architect `runtime/owner-actions.ts:334-356`; `shared/owner-actions.ts:39` | authority check | OA:341, OA:360 | Not in the design table |
| A delivery destination is allowed only in release or maintain for projects without an agreement | Architect `runtime/owner-actions.ts:327-329` | execution prescription: it orders delivery after a release phase for the charter flow | Not verified | Not in the design table |
| The project folder is in use: dispatch and evidence start nothing while a writer exists. The writer guard counts a milestone with a pending dispatch, or a running milestone whose dispatch uses project files, and it skips the maintenance milestone | Architect `runtime/owner-actions.ts:305-308`, `:371-372`; `runtime/execution-location.ts:21-28` | correctness constraint: overlapping writers on shared files corrupt each other | OA:90; `runtime/__tests__/services.test.ts:51`. No test file for `execution-location.ts` | Yes ("shared-writer guard currently recognize delegated work"). It looks only at dispatches |
| Workspace or Worktree must be chosen in project settings before new work | Architect `runtime/execution-location.ts:7` | authority check: the user's placement choice | Not verified | Yes ("Saved Workspace/Worktree choice") |
| Evidence can run only for a milestone that has a linked dispatch and either is done or is verifying with a reported state | Architect `runtime/owner-actions.ts:377-379`; reported set at `runtime/dispatch-watch.ts:291` | execution prescription: it ties evidence to delegation. The other evidence rules do the protecting | OA:158 (refused before completion), OA:165 (starts after completion) | Yes, with a detail the table omits: the guard also admits a done milestone |
| Evidence is produced by the runtime. A call carrying exit code, capture, diff, output or passed is refused whole | Architect `runtime/owner-actions.ts:365-368`; `shared/owner-actions.ts:48` | correctness constraint: an owner claim must not stand in for a measured result | OA:151 | Yes ("runtime evidence") |
| A milestone closes only from verifying, with a passing run, every command at exit code 0, a diff summary when files changed, and a smoke check plus capture for a preview | Architect `runtime/owner-actions.ts:182-191`; `runtime/milestone-evidence.ts:5-25` | authority check: it is the acceptance bar the user relies on | OA:177, OA:184, OA:201 | Yes |
| Evidence goes stale when files change. Closing is refused and the same commands rerun | Architect `runtime/owner-actions.ts:168-180`; `runtime/milestone-evidence.ts:11` | correctness constraint: old results must not accept new files | OA:241 | Yes ("artifact freshness") |
| Evidence is bound to the criteria and preview route as they read when the check was requested. A changed criterion supersedes it | Architect `shared/evidence-binding.ts:31-52`, `:83-92`; `runtime/owner-actions.ts:383-384` | authority check: criteria are what the user stated | EB:51, EB:89, EB:111 | Yes ("current requirement/check binding") |
| Delivery is not reported while a user-stated requirement has neither accepted evidence nor a stated gap | Architect `shared/evidence-binding.ts:73-75` | authority check | EB:143, EB:155 | Not in the design table |
| A user directive must be answered before the owner can sleep, decide or block | Architect `runtime/owner-actions.ts:120-122`, `:437-438` | authority check: a user request cannot be dropped | Not verified | Not in the design table |
| All record changes run through one write queue, and checks that depend on a read run inside it | Architect `runtime/record-store.ts:92-118` | correctness constraint | Not verified | Yes ("single-writer mutations") |

## 2. Room revision guards

| Restriction | Where | Class | Covered by probe | Design-table claim still true? |
| --- | --- | --- | --- | --- |
| Only the Conductor can revise a Room. The caller is identified from the roster, not from its own words | Orchestrator `runtime/rooms/room-revisions.ts:94-100` | authority check | Not verified | Not in the design table |
| A member cannot be added or replaced while the Room holds a host grant, because the grant fixed its subject set | Orchestrator `runtime/rooms/room-revision-plan.ts:75-76`, `:185-187` | authority check: the host cannot authorise a session for an unapproved subject | No probe. RREV:78 covers the unsafe-key refusal only | Yes ("reject roster additions/replacements") |
| Adding or replacing is also refused at the member, replacement and roster-revision limits | Orchestrator `runtime/rooms/room-revision-plan.ts:180`; `runtime/rooms/room-limits.ts:87-100` | authority check: limits come from the approved envelope | Not verified | Not in the design table |
| A new member outside the envelope becomes a user approval instead of applying | Orchestrator `runtime/rooms/room-revision-plan.ts:189-206` | authority check | RREV:179 | Not in the design table |
| A configuration change to model, thinking, permissions, worktree, tools or skills is refused when it widens what the grant holds | Orchestrator `runtime/rooms/room-revision-plan.ts:238-250` | authority check: the grant pins each subject policy | No probe | Yes ("broader configuration") |
| A narrowing is refused while the member is mid-turn | Orchestrator `runtime/rooms/room-revision-plan.ts:259-261` | correctness constraint: narrowing applies at the next session open, so the record would claim a change the live session has not taken | No probe | Not in the design table |
| A narrowing closes the live member session before it is recorded. If the session will not close, nothing changes | Orchestrator `runtime/rooms/room-revisions.ts:190-197` | correctness constraint | RREV:89, RREV:108 | Yes ("disposes the live handle before recording the change") |
| A repeated command id is applied once, and a refusal does not use up the id | Orchestrator `runtime/rooms/room-revisions.ts:158-159` | correctness constraint | RREV:141, RREV:151 | Yes ("command identities") |
| The Conductor cannot suspend or replace itself. Retiring a Conductor needs the user | Orchestrator `runtime/rooms/room-revision-plan.ts:269`, `:288-301`, `:322-324` | authority check: the user decides who coordinates | Not verified | Not in the design table |
| A limit can be lowered by the Conductor. Raising it needs the user | Orchestrator `runtime/rooms/room-revision-plan.ts:337-339`, `:348-365` | authority check: the envelope is the approved ceiling | RREV:124 (lowering). RREV:162-222 (approval path) | Not in the design table |

## 3. Resource profiles and grants

| Restriction | Where | Class | Covered by probe | Design-table claim still true? |
| --- | --- | --- | --- | --- |
| Session tools and skills must be in the subject policy. An unknown name is a denial | Desktop `PS/validate.ts:193-201` | authority check | VAL:319-331 | Partly. The design credits `resource-profile.ts`. That file only builds the loader. The check is here |
| Permission profile is a second filter after the allowlist. An unrecognised tool is removed | Desktop `PS/permission-tools.ts:47-55` | authority check: where profile and list disagree, the profile the user saw wins | PERM:33-70 | Not in the design table |
| Only the profile-filtered tool names are enabled in the session (`noTools: 'builtin'` plus the list) | Desktop `PS/host.ts:425-431` | authority check | HBS:167 | Not in the design table |
| Skills loaded are the grant policy intersected with the request | Desktop `PS/wiring.ts:264`; `PS/resource-profile.ts:82` | authority check | Not verified (`room-skill-runtime.test.ts` exists; its intersection case was not read) | Yes ("grant-filtered") |
| Only the approved packages load extensions. Discovery is off | Desktop `PS/resource-profile.ts:72-74`; `PS/wiring.ts:248` | authority check: an unapproved plugin would add commands nobody approved | MRP:40-52 (command surface) | Yes |
| Prompt templates and themes are off for managed sessions | Desktop `PS/resource-profile.ts:76-78` | execution prescription: they add context only and grant no authority | Not verified | Yes ("Resources are grant-filtered") |
| Managed sessions get no agent-management tools | Desktop `PS/wiring.ts:276` | authority check: a member must not start agents outside the approved roster | Not verified | Not in the design table |
| Goal, Rooms, orchestrator and MCP tools are dropped from member sessions | Desktop `PS/wiring.ts:285`; `features/plugins/bridge-policy.ts:113-133`; Orchestrator `package.json:61-69` | authority check: session-kind exclusion | CONTRACT 346-379 (owner), 382-426 (Room member) | Not in the design table |
| A subject binds to one session path, written only at commit. A bound subject must open, never create | Desktop `PS/grant-store.ts:211-215`, `:271-274`; `PS/validate.ts:146-152` | correctness constraint: identity of the session | GS:154, GS:165, GS:251 | Yes ("Immutable subject/path bindings") |
| Reservation is two-phase and counted against live and lifetime caps. Pending reservations roll back at startup | Desktop `PS/grant-store.ts:109-114`, `:191-226` | correctness constraint: crash safety and no cap overshoot | GS:106-142, GS:212, GS:288, GS:348 | Yes ("atomic reservations") |
| Revocation is written before any teardown | Desktop `PS/grant-store.ts:375-383`, `:440-457` | authority check: a crash leaves the grant revoked | GS:308, GS:329 | Yes ("write-first revocation") |
| Approved subject policies are deep-copied when issued | Desktop `PS/grant-store.ts:165` | authority check: the caller cannot change a policy after approval | Not verified | Not in the design table |
| There is no way to change an issued grant. Neither the grant store nor `PersistentSessionsApi` has an amend operation | Desktop `PS/grant-store.ts` (no such method); `packages/common/src/app-runtime-persistent-sessions.ts:251-286` | execution prescription: no re-approval path, so approved configuration is frozen | No probe (an absence). A search for "amend" in those files found nothing | Yes ("There is no amendment API") |

## 4. Workflow workers

| Restriction | Where | Class | Covered by probe | Design-table claim still true? |
| --- | --- | --- | --- | --- |
| A background-agent step always gets bash, read, write, edit and sero-cli. Planner picks are added on top. The allowlist is built only for background-agent steps with the full platform policy | Orchestrator `shared/constants.ts:10`; `runtime/executors/common.ts:127-129` | execution prescription: a fixed floor and a fixed way of choosing extras | EXE:481, EXE:489 | Yes ("five baseline tools plus planner picks") |
| Platform tool policy (all, readOnly, none) filters the platform tools | Desktop `features/subagent/runtime/session-policy.ts:73-79`, `:93-116` | authority check: the caller picked the policy | PTP:18-63 | Not in the design table |
| Tools the user disabled in a context override are removed from the surface | Desktop `features/subagent/runtime/runner.ts:214`, `:221-223` | authority check | RUN:673 (Code Mode only) | Yes ("user-disabled settings") |
| Code Mode is on if the allowlist names it. With no allowlist it is on unless the user disabled it. Pi gets it only through the allowlist, then it is switched on | Desktop `features/subagent/runtime/runner.ts:217-220`, `:268`; `session-policy.ts:119-132` | authority check: allowlist and user-disabled settings decide. Because the first row of this table always builds an allowlist without codemode, a Workflow worker gets Code Mode only when the planner picks it (source reading, not run) | RUN:642-722 | Yes |
| Workflow background sessions are in memory | Desktop `features/subagent/runtime/runner.ts:258` | execution prescription: the proposal lists changing it as a non-goal, so it stays | No assertion. RUN:19 only mocks `inMemory` | Yes ("SessionManager.inMemory") |
| A step reply is parsed as text into a step outcome | Orchestrator `runtime/executors/common.ts:206` | execution prescription: text parsing is how reports travel today | EXE:30 | Yes ("Textual results are parsed") |
| A reply that does not parse is re-prompted in the same session, up to two follow-ups | Orchestrator `runtime/executors/common.ts:32`; Desktop `runner.ts:431-447` | execution prescription: each repair costs a request | EXE:373 | Yes ("repaired in the same session") |
| A success reply must carry every routing variable a later step branches on, and the delivery receipt a completion claim needs | Orchestrator `runtime/executors/common.ts:35-43` | correctness constraint: a branch must be decided and a delivery proven, not skipped | EXE:261 | Not in the design table |
| A step is limited by the Workflow's remaining wall-clock time | Orchestrator `runtime/executors/common.ts:147-148`, `:167` | authority check: the Workflow's own limit | Not verified | Not in the design table |

## 5. Goal lifecycle and event queue

| Restriction | Where | Class | Covered by probe | Design-table claim still true? |
| --- | --- | --- | --- | --- |
| A continuation starts only at the settled boundary, not at turn end | Orchestrator `extension/goal-loop.ts:4-7`, `:226` | correctness constraint: earlier boundaries start overlapping continuations | GL:165, GL:191 | Yes ("settled boundaries") |
| A queued user message cancels the continuation | Orchestrator `extension/goal-loop.ts:336-338` | authority check: the user always wins | GL:203 | Yes ("user steering") |
| An aborted turn pauses the goal | Orchestrator `extension/goal-loop.ts:309-318` | authority check: stop means stop | GL:245 | Not in the design table |
| A goal pauses when its stop tools are hidden by tool policy | Orchestrator `extension/goal-loop.ts:320-334` | authority check: a goal that cannot be stopped must not run | GL:379 | Not in the design table |
| Default limit is 25 automatic turns. The runtime ends the goal as limited at the cap | Orchestrator `shared/goal-defaults.ts:13`; `runtime/goals/goal-runtime.ts:203-209` | execution prescription (the default value only): it is an internal default the user can raise | No probe of the default. GR:50 and `extension/__tests__/goal-app.test.ts:16` pass 25 explicitly. GR:85-95 covers the cap | Yes ("automatic-turn default") |
| Three identical outcomes with no tool attempted put the goal on hold | Orchestrator `shared/goal-defaults.ts:16`; `runtime/goals/goal-transitions.ts:104-105`; `runtime/goals/goal-runtime.ts:210-215` | execution prescription: it guesses stuck work from repeated text | No probe of the hold. `ui/__tests__/goal-view.test.ts:22` checks wording only | Not in the design table |
| A wait stores a reason only. Nothing wakes it. The user resumes it | Orchestrator `runtime/goals/goal-runtime.ts:277-292`, `:311` | execution prescription: a recorded reason cannot observe a condition | GR:298, GR:354 | Yes ("Waits only retain a reason and need manual resume") |
| One goal per session, and a goal takes a session claim so no other driver holds it | Orchestrator `runtime/goals/goal-runtime.ts:101-108`, `:127-136` | correctness constraint: one driver per session | GR:254, GR:272, GR:305 | Not in the design table |
| Limits are rechecked on restart before anything resumes. A goal that cannot retake its session is held | Orchestrator `runtime/goals/goal-runtime.ts:68-85`, `:166-176` | authority check for the limits recheck, and correctness for the hold. Classed as authority check because the limits come from the user | GR:108, GL:430 | Not in the design table |
| Goal tools exist only in chat sessions | Orchestrator `package.json:64-68` | authority check | CONTRACT 323-326 (subagent), 348-379 (owner), 382-426 (Room member) | Yes ("Goals remain chat-only") |
| The Workflow pending-event queue holds ten events. At the cap the oldest is dropped with a visible warning | Orchestrator `runtime/event-queue.ts:12`, `:36-47` | correctness constraint: bounds memory, and the loss is visible | EQ:41 | Yes ("can drop its oldest event at capacity"). It is the Workflow queue, not the Goal path |

## Counts by class

Counted from the table rows above.

| Class | Count |
| --- | --- |
| authority check | 37 |
| correctness constraint | 16 |
| execution prescription | 18 |
| total | 71 |

## Differences from the design table

The source files in the five seams are unchanged between the design's inspected revision (29e56a887) and HEAD. `git diff --stat 29e56a887 HEAD` lists only OpenSpec files. Nothing moved, no constant changed and no behaviour differs. Current `wc -l`:

| File | Design says | Now |
| --- | --- | --- |
| `plugins/sero-architect-plugin/runtime/owner-actions.ts` | 485 | 485 |
| `plugins/sero-architect-plugin/runtime/owner-session.ts` | 481 | 481 |
| `plugins/sero-architect-plugin/shared/record.ts` | 497 | 497 |
| `apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/grant-store.ts` | 488 | 488 |

The counts above are for committed HEAD. The working tree copy of `shared/record.ts` is currently 500 lines because of uncommitted edits (the working tree also holds new files `shared/direct-execution.ts` and its test). Those edits are outside this map.

Two table claims are true but incomplete:

- The design credits `resource-profile.ts` with grant filtering. That file is 88 lines and only builds the resource loader. The filtering sits in `validate.ts:193-201` (tools and skills against policy), `permission-tools.ts:47-55` (profile as a second filter), `wiring.ts:264`, `:276`, `:285` (skill intersection, no agent-management tools, session-kind exclusion) and `bridge-policy.ts:113-133`.
- The design says evidence requires a linked dispatch that reported completion. The guard at `owner-actions.ts:377-379` also admits a milestone whose status is already done. It always requires a linked dispatch.

Two further details the design table does not state:

- Workflow workers always receive a tool allowlist (`common.ts:127-129`). `codemode` is not in `DEFAULT_TOOLS` (`constants.ts:10`). Under `runner.ts:217-220`, an allowlist means Code Mode loads only if the list names it. So a Workflow worker has Code Mode only when the planner picks it.
- `tool_search` is described in design Decision 3 as a Pi mechanism. A search of the Electron, plugin runtime, plugin extension and `packages/*/src` source found no use of it. Not verified against Pi itself.

## Measured versus source-derived

Everything in this map is source-derived. Each row comes from reading source lines and test names at the revision above. No test, probe or paid run was executed for this map. The probe column names which existing tests look at a claim. It does not report that they pass.

No restriction's effect on quality, cost or time has been measured. The classes are judgments from reading what each check protects. The two judgment calls with the most weight are the ten-minute watchdog and the three-identical-outcomes hold, which are classed as prescriptions because they are internal defaults rather than user approvals. Phase 0 runs are what would show whether removing any prescription helps.

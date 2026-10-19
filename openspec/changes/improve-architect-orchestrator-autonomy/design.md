# Design

## Context

See [proposal.md](proposal.md) for motivation and scope. Planning inspection used local `main` at `29e56a887dcbcb8e08992db32f97e8f1d3f7f291`, also the local `origin/main`, on 6 October 2026. Revalidate the candidate revision before implementation and each live comparison. No runtime experiment or performance comparison was run during planning.

| Existing component | Observed behavior and reuse |
| --- | --- |
| `plugins/sero-architect-plugin/runtime/owner-session.ts` | Persistent owner with granted tools, `skills: []`, current-contract restoration, usage charging and a ten-minute turn watchdog. One timeout permits a retry; a second consecutive timeout blocks. |
| `runtime/owner-actions.ts`, `shared/record.ts` in Architect | Dispatch kinds are Workflow or Room. Evidence requires a linked dispatch that reported completion. Reuse milestone states, pending operations and single-writer mutations. |
| Architect `runtime/milestone-evidence.ts`, `shared/evidence-binding.ts` | Runtime evidence, artifact freshness and current requirement/check binding already exist. Keep these checks for direct work. |
| Architect `runtime/execution-location.ts` | Saved Workspace/Worktree choice and a shared-writer guard currently recognize delegated work. Extend them to direct execution. |
| Orchestrator `runtime/executors/common.ts`, `shared/constants.ts` | Background workers get five baseline tools plus planner picks. Textual results are parsed and repaired in the same session. |
| `apps/desktop/electron/features/subagent/runtime/runner.ts` | Workflow background sessions use `SessionManager.inMemory`; Code Mode activation depends on the effective allowlist and user-disabled settings. |
| Electron `persistent-sessions/resource-profile.ts`, `grant-store.ts` | Resources are grant-filtered. Immutable subject/path bindings, atomic reservations and write-first revocation protect authority and crash recovery. There is no amendment API. |
| Orchestrator `runtime/rooms/room-revision-plan.ts`, `room-revisions.ts` | Granted Rooms reject roster additions/replacements and broader configuration. Narrowing disposes the live handle before recording the change. Revisions already have command identities and durable records. |
| Orchestrator `extension/goal-loop.ts`, `runtime/goals/goal-runtime.ts` | Goal continuation observes settled boundaries and user steering. Waits only retain a reason and need manual resume. Goals remain chat-only. |
| Architect `runtime/baseline.ts`, `apps/desktop/e2e/architect-baseline.agent.spec.ts` | Existing instrumentation can record live runs, but comparison only checks objective/criteria, the runner infers acceptance from dispatch failures, and its final comparison uses the same record twice. Existing checked-in results have incomplete cost coverage. |
| Orchestrator `runtime/event-queue.ts`, `runtime/events/` | Existing source adapters and event identities are reusable. The Workflow queue can drop its oldest event at capacity; a durable wait must not rely solely on that lossy queue. |

The main specs already allow just-in-time approaches and approved agreement-based work. This change implements missing execution mechanisms. The verification definition of "reported" and the milestone/detail links currently assume delegation; their deltas explicitly change that assumption. `architect-resilience` is clarified so independent review remains required when requested without becoming a mandatory extra agent for every task. Existing chat-only Goal and private owner-command boundaries remain intact.

## Goals / Non-Goals

**Goals:** Extend existing records, grants and schedulers with the minimum state needed for direct work, capability loading, amendments and durable waits. Make every intermediate release reviewable and attributable to one mechanism change.

**Non-Goals:** No new orchestration engine, shared autonomous driver, automatic conversion of charter projects, mandatory execution graph, broad UI redesign or global prompt rewrite. The first direct executor is the existing owner; a separate persistent worker would need a later proposal. Structured Workflow reporting remains an evaluated option, not an assumed replacement.

## Decisions

### 1. Establish a controlled comparison before changing agent guidance

Extend the existing baseline record and runner rather than introducing another evaluation service. Phase 0 compares current Architect with a tester-driven persistent single-agent candidate using existing session capabilities. This baseline does not change production acceptance. The tester's independent acceptance checks determine each candidate's outcome.

Save distinct run identities, source revision, scenario/replicate, initial workspace fingerprint, model and thinking settings for every participating agent, authorized capabilities, budget and acceptance revision. Capture interventions, repeated investigation, format-repair turns and recovery events alongside existing usage and timing. Reject comparisons whose controlled inputs differ. A failed run remains a useful outcome observation; an unfinished run remains incomplete.

Both candidates run on the same global model tier (LOW or MED) selected in the profile at run time; the run record stores the resolved model and thinking level rather than naming a model in this change, because the tier survives model turnover and the Architect candidate's delegated work already resolves through tiers. Start with two runs per strategy for each of the five scenario classes. Keep a predeclared aggregate spend/time bound and report uncertainty when the pilot cannot distinguish effects. Expand only the uncertain comparisons within an agreed evaluation budget. Acceptance checks hold the user outcome constant and do not require a particular roster. A task that explicitly requests independent review must require it for both candidates; other tasks do not gain that requirement through the evaluator.

Keep original baseline files and classifications. Fix acceptance inference and self-comparison before using the runner as evidence. Missing delegate provenance prevents a controlled strategy claim; missing usage prevents a total-cost claim. Synthetic checks validate the recorder only.

An alternative would be to assume fewer sessions are better and simplify immediately. That would confound model changes, protocol changes and execution choice, so it cannot answer the issue's performance question.

### 2. Add direct execution to the owner, with separate execution identity

Add an optional direct-execution record on a milestone alongside the existing dispatch link. It names a stable execution ID, objective run, owner subject/session, effective workspace placement, starting commit/content fingerprint, requirement revision, state and completion claim. Keep legacy dispatch shapes readable. Record an execution before tools can perform milestone effects, and serialize duplicate starts through the existing record store.

Use explicit owner actions to begin, continue and report direct work. Keep project-record changes, delegation, recovery and evidence requests behind Architect actions. Platform tools perform authorized implementation effects. Do not expose generic Goal, Room or subagent driver commands to the owner. Extend the existing workspace-writer guard so direct and delegated work cannot overlap unsafely on shared files.

Resolve Workspace or Worktree placement through existing workspace/Git services before execution. Persist the resolved directory and baseline and use it for owner file/shell tools, evidence and delivery. Do not silently edit the root workspace when Worktree was selected. Session authority must cover the resolved location, and resumption uses the saved placement rather than creating another worktree.

The existing owner wake scheduler remains the only driver. Add an explicit continuation outcome and recheck paid-start authority and current controls before the next turn. There is no mechanical progress test for direct work: a debugging turn that reads code and changes no file is indistinguishable from a stuck loop, so the user-approved budget is the only hard stop. Run metrics show the count of consecutive continuations without a workspace change so a watching user can stop waste. Reuse Goal's settled-boundary and steering principles where applicable, without attaching a Goal loop to the owner. A continuation request is not evidence of useful progress.

Report completion against the current execution identity and revision. Generalize the evidence guard to accept that report or an existing delegated report, retaining runtime-owned command/preview/diff evidence and freshness rules. Extend receipt collection to direct workspace or approved external delivery. Reuse owner usage, run spans and history; attribution links must not add a second charge for the same turn.

A separate worker would add grant, reservation, driver and handoff work before the first gap is solved. Reusing the owner is the smallest first-class path permitted by issue #620. Making a one-member Room mandatory would retain the restriction the issue identifies.

### 3. Separate authorization from loaded context

Resolve an authorized capability set from host-stored grants/policies for managed sessions and the existing effective host tool policy for structured workers. Preserve explicit user allowlists, session-kind exclusions, read-only restrictions and user-disabled tools/skills as hard constraints. Planner-selected extras control initial loading and must not be mistaken for user permission to expand authority.

Use Pi's own mechanism for Pi-level tools. Register the full authorized set when the session opens, give the tools outside the initial loadout `deferred` exposure, declare only the initial loadout, and enable Pi's `tool_search`. `tool_search` finds a deferred tool by description and declares it for the next model call, and Pi records loaded tools in the session so they stay declared after resume and compaction on that branch. The host never constructs tools mid-session, and activation needs no new command: `setActiveToolsByName` only toggles tools already registered, which is why registration at open is the whole trick. Code Mode is one such registered-inactive tool and loads the same way when authorized; nested calls still go through their own access checks. Pi's `tool_search` is off by default in SDK sessions, so each managed session kind enables it explicitly.

Skills need no discovery surface. Pi already puts skill metadata in the prompt and loads a body on read; the owner's gap is only that it is granted no skills. Phase 2 for skills is the grant change below.

`sero-cli` stays the command surface for workspace, session, VCS, app and bridged plugin commands, discovered with `sero help`. It gains no tool or skill discovery commands. A plugin that exposes one capability both as a bridged CLI command and as a custom tool is reachable twice today; that overlap is unchanged here and tracked as a follow-up issue.

In phase 2, extend new owners' initial grant proposals to include relevant skill access and supported Code Mode, subject to host clamping and explicit user approval through the existing start dialog. Keep the initial loaded selection small and record the approved capability set separately. This makes owner discovery usable before phase 3 without requiring a grant amendment.

Existing owners retain their stored approval, including an empty skill set where that is what the user approved. Expanding their access depends on phase 3's amendment API and explicit approval of the expansion; discovery must not replace their grant or session to obtain it. Do not interpret the project record or a skill's tool list as authority. Return disabled, unsupported, unavailable and denied reasons accurately. Preserve those distinctions after compaction and session reopening.

Loading every tool and skill initially would preserve access but incur unnecessary context cost. Keeping the initial selection immutable would preserve the current failure mode. Registering everything authorized and declaring little resolves both without weakening execution checks.

### 4. Amend the existing grant and reconcile the Room transaction

Extend `PersistentSessionsApi` in `packages/common/src/app-runtime-persistent-sessions.ts` with a typed amendment request/result carrying amendment identity and expected grant revision. Keep the exact bundled-app gate. Host containment compares each subject against one stored policy role, never the union of roles. Root grants without delegation require approved expansion for any authority their original approval does not contain.

Under the grant store's serialization, validate the current revision, revocation, actual catalogue, placement and live/total reservations. Persist the accepted amendment without changing the grant ID, session directory or existing subject/path bindings. Adding a subject uses the existing two-phase creation reservation. Retirement does not erase history or return lifetime consumption. Replacement creates a new subject and preserves the old one with its handover.

Use the existing Room revision command ID as the amendment identity and save pending intent before requesting the host mutation. Release or await affected live handles at safe boundaries, commit the host amendment, then update Room configuration through its durable transaction. Reopen the same bound session to apply changes where in-place updates cannot safely do so. Only report "applied" after the effective configuration is confirmed.

After restart, reconcile the pending Room revision with the host amendment before scheduling affected members. A stale revision, failed reopen or ambiguous host response produces a recoverable hold, not a new grant or silent partial configuration. Revocation remains write-first and blocks further starts. Room notifications, mailboxes, accounting and worktree ownership remain attached to the existing records.

Issuing a replacement grant would move the session directory and threaten continuity. Changing only Room JSON would claim capabilities that the host had not authorized. The amendment must therefore live in the host grant lifecycle.

### 5. Persist observable waits and distinguish limit provenance

Extend existing Architect and Goal state with optional wait registration: execution/goal identity, source kind and stable source ID, condition, deadline, control revision, observed outcome and a wake reservation/consumption marker. Initial supported sources are linked child completion, managed process exit and linked CI/check result. Use existing source adapters and runtime registries; do not accept executable predicates supplied by an agent.

Persist intent, register observation, then reconcile current source state. Durable source facts and wait records are authoritative; event delivery is a notification. Recheck them after restart or a queue overflow. A managed process that cannot be identified after restart remains uncertain and held rather than being started again. The CI source is the existing GitHub poller with its 120-second floor; the loopback webhook source is a push path only where the user has exposed it. This deliberately narrows the owner-session rule against polling: the scheduler never polls, the source adapter does, and the delta spec says so.

Reserve continuation under the existing execution lock, recheck user controls, authority and remaining limits, then start the owning driver. Reconcile an uncertain turn start before retrying. This supplies at most one active continuation; it does not promise exactly-once external side effects. A paused match stays pending, cancellation/stop/revocation invalidate it, and deadlines produce a visible failed/expired outcome.

Reuse Goal supervision and arbitration, keeping Goal continuation in its chat extension and Architect continuation in its owner scheduler. Legacy free-text Goal waits retain manual resume until a supported condition is explicitly registered; loading old records does not invent subscriptions.

Record whether a limit came from user approval or an internal default/watchdog. Preserve all limits already accepted by users, including default values shown in an approval. For future starts, expose the effective limits honestly. Replace the owner's fixed timeout behavior with bounded stall/checkpoint recovery so progressing work can continue within the user's approved envelope. Never allow an agent to raise that envelope. Goal's automatic-turn default and Workflow/Room time limits are changed only with explicit provenance and the same user controls, not deleted globally.

A reason string plus a timer cannot establish an observed condition. An entirely new global scheduler would duplicate existing lifecycle ownership. Persisted registration and reconciliation extend the current schedulers instead.

### 6. Keep reporting experiments and UI changes bounded

After phases 1–4 have been measured separately, use recorded protocol failures to evaluate a small structured reporting action against the current in-session result repair. Preserve routing outputs, artifacts, usage, evidence requests and receipt semantics. Record the recommendation. If replacement needs a new Workflow protocol or compatibility layer, propose that bounded change separately rather than adding two result systems here.

Remove a redundant prompt procedure only when its behavior is covered by existing authority/lifecycle checks and the comparison supports retaining the change. Keep failure and mixed-result records. Do not rewrite every prompt in one pass.

Reuse the existing overview, work detail, Watch work and metrics inspector. Add navigation for direct milestones and truthful registered-wait/amendment status. A useful work map can show evolving tasks without requiring an executable Workflow graph. Keep detailed capability and execution plumbing out of the overview. Prototype changed navigation/status using `sero-prototype` before production UI changes; approval concerns the concrete proposed UI, not unchanged existing views.

## Risks / Trade-offs

- Direct owner work can blur implementation and review roles. Runtime evidence stays mandatory, required independent review remains explicit, and self-checks never acquire an independent-review label.
- Grant and Room state live in different stores. Durable amendment intent, expected revisions and startup reconciliation prevent falsely applied or duplicate changes.
- Default limits may already be user-approved. Preserve existing approvals and label provenance rather than interpreting all defaults as removable watchdogs.
- A lost event or restart can leave an uncertain process or wake. Reconcile identities and source state; hold when safety cannot be established.
- More execution paths can break delivery and accounting. Use the same evidence/receipt services and canonical charge identities, with focused acceptance at those seams.
- Live comparisons consume money and vary between runs. Use a predeclared pilot budget, matched inputs, repeated pairs and honest coverage; unresolved effects remain unresolved.
- Direct work grows the owner transcript, and the owner session is also the project's coordination memory. Every later owner turn carries that implementation history until compaction, so direct work can make the rest of the project more expensive per turn. The pilot records owner tokens per turn before and after direct work so phase 1 can show whether that cost is real, and the owner guidance may need to prefer delegation for long implementations on that evidence.
- Several source files are near the 500-line limit: owner actions 485, owner session 481, record 497 and grant store 488 at the inspected revision. Extract direct-execution, amendment and wait concerns into focused modules before extending those files.

## Migration Plan

1. Phase 0 extends only baseline instrumentation and evidence records. Preserve historical measurements and publish the restriction/authority map with their actual validation status.
2. Phase 1 adds optional direct-execution fields and guarded owner actions. Existing dispatches and charter records retain their current interpretation and authority.
3. Phase 2 adds discovery/activation within existing approval; phase 3 adds versioned host amendments and Room reconciliation. Bump `@sero-ai/common` in the API-changing PR and any other published package changed by implementation.
4. Phase 4 adds wait registrations and limit provenance. Old free-text waits remain manual and existing approved limits remain binding.
5. Phase 5 completes reporting evaluation, bounded guidance changes, UI projection and docs-site updates. Measure each phase before combining mechanisms.

Use small draft PRs aligned to these phases. Keep experimental starts independently switchable for comparison and rollback using existing configuration patterns. Disabling a new path stops new scheduling but preserves its records, grants, files, costs and pending work. Rollback must use code that can read the new optional records; reverting to an unaware binary is not a safe way to handle active amendments or waits. Reconcile or hold them first, and never delete state to roll back.

## Open Questions

The pilot's aggregate spend/time budget depends on the evaluation allocation at apply time. Record it and the resolved tier models before paid runs; they do not change the capability contracts or phase order. Prompt/reporting experiments may yield no improvement, which is a valid recorded outcome.

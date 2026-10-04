## Context

See `proposal.md` for the product problem and scope. This design is required because the change crosses project authority, host session grants, execution recovery, observation and multiple UI surfaces.

Read-only inspection found usable foundations, not a need for a second agent runtime:

- Architect already has a durable single-writer record, owner contracts, dispatch identities, cumulative usage and runtime-owned evidence. Its lifecycle still gates build on a charter and defaults to milestone approvals.
- `runtime/owner-session.ts` supplies a limited owner grant; `extension/owner-tool.ts` shapes flat CLI parameters into authorized actions. The owner has no recovery or control action for linked work at all; the user-side `repair` and `retry` actions in `runtime/work-recovery-actions.ts` are Workflow-only. The shared Room registry (`packages/common/src/orchestrator-registry.ts`, `OrchestratorRoomHandle`) exposes only `inspect` and `create`, so Room pause, resume and a larger total time need new handle methods in `@sero-ai/common`.
- Desktop's persistent-session `host.ts`, `grant-store.ts`, `clamp.ts` and `validate.ts` own approval, per-subject access and session reservations. `requestGrant()` asks the user for every proposal through `clampAndApprove` (`wiring.ts`), with a 120 s timeout, and every Room start calls it (`member-grant.ts` `requestRoomGrant`). That dialog is the only repeat approval an Architect dispatch raises today. The structured-subagent path (`host.subagents.runStructured`, bound in `create-host.ts`) performs no caller, model, tool or grant check and asks the user for nothing. Room member policy is intentionally per subject, not the union of all member permissions.
- Workflow `use-live-call.ts` already consumes push events with identity-keyed observations. Room `use-room-feed.ts` combines watched records and pushed snapshots; `room-live-broadcast.ts` has independent 200 ms member throttles. `room-app-live.ts` has watch leases. Those mechanisms do not prove that real output travels through the entire SDK-to-screen path.
- `packages/common/src/run-observations.ts` carries metadata only, with `request-start`, `request-end`, `tool-start` and `tool-end` record kinds and no epoch, revision or contact timestamp. The persistent-session mapper (`live-sessions.ts`) excludes thinking deltas; the structured-subagent runner (`features/subagent/runtime/runner.ts`) forwards `thinking_delta` into live output on purpose so structured-output agents show progress. Neither can supply measured first-token timing. No heartbeat or renewal exists anywhere in the host; liveness is `reportedAt >= sessionStartedAt` with no timeout. Session files remain the durable transcript source.
- `shared/room-active-time.ts`, lifecycle stamps and restart reconciliation contain the active-time seams. Inspection located the overcount: `room-reconcile.ts` re-saves a running Room through `withRoomStatus`, and `withActiveTime` keeps the old `activeSince` when the status stays active, so the closed interval counts; nothing banks time at `dispose()` and no checkpoint runs while a Room is active. Room live text is kept only while watched (`room-observation.ts`), watch leases are keyed by Room id with no refcount (`room-app-live.ts`), and `useRoomLive` replaces its snapshot map without turn ordering. Task 5.1 and 4.5 still reproduce these at the boundary before repairing them.
- Existing main specs mandate the old four-part project page and prevent streamed output there. The `localise-live-agent-progress` change is implemented (27 of 28 tasks, merged in #592) but its deltas, including the new `live-agent-watch` capability, are not synced to main. This change replaces that placement with a separate work view while retaining the existing watch transport, and carries its three rule changes to `live-agent-watch` in a delta that can only archive after `localise-live-agent-progress` is synced.
- Ten saved Architect projects exist on the development machine, all in one profile and eight already past charter. They stay readable on the deprecated charter flow; this change adds no adoption or upgrade path.

## Goals / Non-Goals

**Goals:**

- Use the existing owner, Orchestrator and host boundaries to support goal-to-result execution without user-managed internal steps.
- Separate verbatim user intent, approved execution authority, just-in-time working interpretation, observed activity and concise presentation.
- Reduce noise and user decisions. Continue eligible work autonomously within approved limits; expose detail on request and ask only when material uncertainty or required new authority prevents safe continuation. Internal safety checks must not become more overview controls or routine approval steps.
- Review the changed intake, overview, Watch and recovery flow in an early `sero-prototype` session before production UI implementation.
- Prove the complete observation path at all levels, not just successful snapshot helpers.
- Keep legacy records readable as they are and preserve the existing workspace picker, saved work, cost limits and evidence.

**Non-Goals:**

- A new agent framework, permission system, generic event platform, transcript database, Markdown library or custom document parser.
- Containment checks, trusted linkage or reservations on the structured-subagent host path. That path asks the user for nothing today; hardening it is a separate change.
- Learned decision preferences across projects (a profile-level preference record, curation tools, inspect/correct/forget UI and owner context). Deferred to a follow-up change.
- An adoption or upgrade path for projects created under the charter flow. They keep their saved gates and the UI identifies that flow as deprecated.
- Product-defined quality/readiness tiers, a mandatory team size, preset solution template, full upfront design, compulsory research report or fixed phase/Workflows/Rooms sequence.
- Hidden reasoning, guessed token timings, invented progress, hard final-spend guarantees or automatic paid restart.
- Replacing Goal mode, Catalog, the existing metrics inspector or unrelated plugin interfaces. Goal-mode feedback keeps its existing behavior; this change's expanded coverage is Architect, Workflows and Rooms.
- Editing the saved MiniSynth project, starting its work, increasing its cap or calling its completed research Room a failed application build. The delivery proof uses a separate disposable workspace.
- Committing implementation during this planning workflow, splitting delivery into an unrelated PR, or marking PR #573 ready without a user request.

## Decisions

### 1. Keep the solution in the agent's judgment, determined just in time

The optional versioned agreement records the user's verbatim request, later instructions, explicit constraints, workspace/placement, cap, allowed actions and host-issued approval reference. It is consent to start within limits, not a predesigned solution. Do not add a quality field, readiness tier, task classifier, fixed outcome checklist or required plan to intake. Keep Architect's evolving interpretation, assumptions, plan and acceptance criteria as working material separate from user facts and authority.

The agent chooses what to do next from current input and findings, revising the approach, research, workers and checks as it learns. Retain existing phase values only for legacy compatibility/status projection; they must not define a route, a required checkpoint or a dependency graph for agreement-based work. Reuse existing `charter-only` mechanics for autonomous continuation without making the legacy word a new user-facing solution mode. Preserve optional supervised operation and user-requested planning. Runtime guards protect user-stated requirements and execution authority, not the first agent-authored design.

Put pragmatic-first behavior in owner instructions: start with the simplest practical approach that meets the request; add complexity when the user or actual evidence calls for it. This is advice for judgment, not an executable simplicity policy. The user's current instructions override it within approved authority. The agent makes reasonable choices without asking; it asks when uncertainty could materially change the user's intended result or when new authority is needed. Do not implement keyword routing, repeated-choice thresholds, a default technology/team or a forced research-before-build process.

For illustration only, a user might ask for a POC or a production-ready app. Those words are free-form task data. Architect interprets what they mean in that context; neither becomes a product category, enum, selector, fixed check suite or workflow branch. Two requests using the same label can need different solutions, and requests without either label must work equally well.

Update the owner prompt and compact wake contract together. Carry the current request, constraints, remaining authority, current working objective and findings. Long plans, research and evidence stay behind references. OpenSpec-enabled projects retain their official validation and linked changes without turning artifact order into the project's mandatory user-facing delivery route.

**Alternatives rejected:** shrinking the old charter UI while leaving its gates, or replacing it with a quality selector and template router. Both make the product choose the process instead of the agent.

### 2. One approval flow must include real host authority

Collect the free-form request, cap and workspace first; do not request a solution/quality category or full design. Non-paid draft/workspace creation may occur after the user confirms it. The final start approval must show the effective host-clamped access together with the delivery intent and cap. Paid owner/planner/research work starts only after that approval has been recorded. The existing grant dialog becomes the agreement's final consent step, not another technical charter gate. Declined approval leaves a recoverable intake record, not running work.

Extend the existing persistent-session grant store and `clampAndApprove` with a narrow project delegation policy bound to the approving user's approval reference and the Architect project. The policy covers per-role permission profiles, models/providers, tools/skills, placement, allowed actions and finite live/total session bounds. When the bundled Architect plugin requests a Room grant naming that policy, the host clamps the proposal against current catalogues as today, then checks containment in the stored policy; a contained proposal is recorded without the dialog, anything else falls back to the existing user approval. A read-only subject stays read-only even if another role may edit. Child grants stay immutable, individually identity-bound and revocable; the existing two-phase session reservations and revocation rules apply unchanged. Revoking the policy invalidates grants issued under it. The host validates the policy it stored, never a project JSON, and the exact bundled-package gate is unchanged.

The structured-subagent path is left as it is. It raises no prompt, so adding containment there would not reduce noise; it would add a gate on a path that has none today. Hardening that path is a separate change. Workflow workers, planners, direct research and verification keep calling `host.subagents.runStructured()` with the limits Architect already passes.

Owner-only grants without an approved delegation policy do not become delegation authority. Standalone Orchestrator work keeps its existing per-grant approval and host checks; this change introduces no new grant dialog for a path that did not have one. Requests outside the policy require changed user approval. External publishing and destructive/new-access actions keep their mechanical guards. Do not pass another app's owner grant to Room code or let an agent issue approvals.

**Alternative rejected:** auto-accept every grant prompt or treat an approved charter string as a grant. Both bypass the host boundary. Leaving per-roster access prompts for identical approved access would also defeat the agreed autonomous experience. Extending containment to the structured path in the same change was rejected because it triples the security blast radius without removing a single prompt.

### 3. Budget and recovery are runtime controls, not promises in prompts

Extend existing dispatch bookkeeping with outstanding allocations so concurrent work cannot each claim the full remainder. Serialize starts against available project authority; reserve an allocation before owner, research, planning, worker or verification work starts; reconcile usage and release unused allocations when the corresponding operation ends. Keep reported spend, outstanding allocations and incomplete pricing distinct. The cap remains a bound on starts, since in-flight work can incur spend before a report.

Expose one linked-work control action through Architect's owner tool and management/UI tools. Resolve it through the typed Room/Workflow registries and durable dispatch ledger. The Workflow side reuses the existing `requestOrchestratorAction` kinds (`retry`, `retry_step`, `run_next`, `use_cost_budget`, `set_armed`). The Room side needs new methods on `OrchestratorRoomHandle` in `@sero-ai/common`: `pause(roomId)`, `resume(roomId, { maxWallClockMs? })` taking a new total, and `cancel(roomId)`, each returning the resulting Room status. Add nothing beyond what the pause/stop/resume and expired-time scenarios need, and bump `@sero-ai/common`. Check ownership, actual status, finite recovery bounds, time and money separately. Safe resume/retry inside authority can run automatically. A larger approved total time or spending/access change needs the applicable user decision. Return resulting state, not just an accepted command.

Bind new runtime evidence to the user requirements and acceptance criteria it covers, the relevant requirements/check revision, preview target where applicable and artifact revision. File freshness alone is not enough. A changed criterion, check or target invalidates affected proof and acceptance; a late result for the superseded revision stays historical. Keep unaffected evidence when coverage and artifact freshness still hold. Completion accounts for every current user requirement, with unmet or unproved gaps explicit. The agent still chooses suitable checks through judgment; the runtime protects their identity, freshness and recorded coverage, not a preset checklist. Recheck within existing authority without another user decision. Keep revisions and coverage in work/evidence detail, not the overview. Preserve legacy evidence without inventing missing revision data; confirm applicability before reusing it for changed work.

For agreement-based projects, pause/stop prevents new owner turns and owned delegated scheduling through those Room methods and `set_armed`. Current turns can drain and report results; the UI shows that they are still in flight. Projects without an agreement keep their owner-only semantics; retain exact maintenance-trigger restoration. Resume reconciles terminal work first and never reopens a completed Room. An ambiguous delivery effect still requires receiver reconciliation or review, not blind replay.

**Alternative rejected:** telling the owner to promise recovery in a chat reply while it lacks a tool for the held operation.

### 4. Keep overview content small at the writing boundary

Add separate concise fields for the outcome summary, current objective/next useful result, result/check summary and directive acknowledgement. Guide the agent to write short, useful content rather than prescribe an exact character recipe for every request. Keep bounded transport/storage payloads and validate their shape, but do not force decision meaning into an arbitrary short field or turn an oversized summary into a project-phase gate. If a technical payload limit is exceeded, ask for revision or keep the full supporting document separately; never clip a safety condition or use a large brief as a fallback summary. Existing records with no new summary use saved titles, typed state and links to the full original document, not automatic paid summarization.

Use structured fields and safe JSON serialization where multiline documents cross flat CLI parameters. Add a round-trip check from the actual bridge boundary to the record for newline-rich Markdown. The transport cause of the old single-paragraph brief is not established; do not guess at a global CLI/parser repair. Keep full documents separate and reuse `MessageResponse` from `@sero-ai/ui/ai-elements/message` for their rendering. Do not infer summary sections from headings or add another renderer.

**Alternative rejected:** regex-based extraction or adding more folds around the same long plan.

### 5. Use one metadata projection and separate leased output

Extend shared observation contracts with a bounded scoped feedback snapshot. It contains producer/session/run identities where measured, semantic state, current action or wait, parent/child links, `lastActivityAt`, `contactObservedAt`, usage completeness and available limits. Missing identities/timestamps remain null. Add a transient current-session epoch and ordered revision so startup, reconnect and late events cannot revive older work. Producers are owner/planner/research session adapters, Workflow attempts/fan-out and Room members, not agent-authored status sentences.

Derive contact from state the main process already holds: a `request-start` or `tool-start` record without its end in the current session epoch means the producer is attached. No renewal timer is added unless a case is found where that state cannot be observed; if one is, the timer uses injected clocks and one shared policy. Attachment means the host execution producer holds the in-flight call; it does not prove a model provider is progressing. A quiet request shows an observed request wait, not fabricated text. Loss of the producer (runtime restart, disposed session, run timeout) makes it Last known. Known terminal facts stay terminal. Long waits remain labelled and use the existing run and tool-stall timeouts rather than being called failure from age alone.

Project and Orchestrator aggregate snapshots name concurrent work with an active count and bounded current-action summary; they never present the last worker event as the whole run. Persist meaningful status/report boundaries in existing records/indexes. Do not write an entire index or transcript for every contact update or token. Use scoped push notifications and an in-memory projection for contact state; widgets/list views can observe this metadata without watching output. On entry or reconnect, confirm attachment, obtain a snapshot and then merge newer events without losing an update between subscribe and snapshot.

Reuse existing per-step live calls, Room member broadcasters, subagent watchers and bounded live blocks for text/tool detail. Expose an authorized latest-partial snapshot from the live session registry, retaining only bounded current-turn text with its actual identity while that turn is active. Seed a newly opened Room/owner/step watcher from that snapshot; a Room buffer that is empty while unwatched cannot by itself supply text emitted before watching began. Clear the active partial after terminal handoff to existing history. Output transport remains leased and scoped to explicitly opened views. Keep the producer's bounded active-turn partial independent of those leases; closing the last watch drops subscriptions, timers and pending delivery buffers, not the latest producer snapshot. Reopening seeds that snapshot without replaying each missed event. Reuse the existing structured-subagent tracker for transient work and the persistent-session live registry for owner/member turns. Adapt Room watch leases to independent observer ownership with correct reference counting/renewal, so closing one view cannot close another and abandoned observers expire. Retain the existing independent 200 ms throttles and bounded Room text buffer unless the failing path proves a smaller change necessary. New turns reset partial output; previous replies remain labelled history, never fake current output. Include child observers under verified parent identity and release them on navigation/unmount/workspace change.

For the Architect, Workflow and Room surfaces in this change, change three `localise-live-agent-progress` rules as well as its Architect page placement: no tool does not imply writing; scoped metadata continues without an output watch rather than only start/end events; the producer's bounded current partial survives the last watch closing. This change carries them as a `live-agent-watch` delta, which can only archive after `localise-live-agent-progress` has synced that capability to main (strict validation already reports this). Keep leased text delivery and the other change's unrelated chat and Design Library scope unchanged. Reasoning text stays where it streams today: structured-subagent live output keeps it, identified as reasoning, because structured-output agents otherwise show nothing until their terminating tool call; persistent sessions keep excluding it; metadata never carries it.

Follow the real chain: SDK event → desktop session adapter → plugin observation → scoped notification/initial snapshot → renderer store/hook → live block. Cover first snapshot, quiet requests, tools, child output, parallel sources, stale events and completion. Metadata never gains prompts, raw tool payloads, secrets or reasoning. Complete saved replies remain in existing Pi session history.

**Alternative rejected:** polling every record, subscribing every list row to a transcript, using owner prose as state, or treating a heartbeat as completed work.

### 6. Repair active-time boundaries, not the symptom

Use the existing active-time helper and serialized lifecycle stamps as the source for Room limit checks and all displayed durations. Reproduce the gap at the located boundary: `reconcileRoomRecord` re-saving a running Room keeps its old `activeSince`, and `dispose()` banks nothing. Bank active time before graceful shutdown or pause. Persist a bounded active checkpoint while execution is active so abrupt shutdown cannot leave an `activeSince` that runs through the whole closed interval. Clear current activity on load, preserve confirmed banked usage and expose any uncertain final interval. Keep the existing wall-clock seeding for Rooms that predate active-time accounting, since it is shipped and tested, and label that figure as recorded before accounting began; add no migration code. The `orchestrator-run-accounting` delta in this change carries both rules so the main spec stays consistent.

The recovery dialog shows measured active usage, the old total, a proposed larger total and the unchanged spend cap. Resume sends a new total `maxMinutes`, not an increment, through the existing Rooms tool; no inline extension form. Architect uses the same registry action after the necessary decision. An expired time limit alone is not authority to increase money or access.

**Alternative rejected:** make every resume ask for more time while retaining the accounting fault, or silently reset spent time after restart.

### 7. Separate overview, work and technical inspection

Before production UI work, use `sero-prototype` to review one connected intake → overview → Watch → decision/recovery flow. Inspect current components, shared UI tokens and the closest existing prototypes first. Put the new interactive artifact under `apps/styleguide/public/prototypes/` and link it from `apps/styleguide/src/PrototypeArchive.tsx`; preserve older prototypes. The review question is whether the user can see the useful result/current work, inspect detail and answer a necessary decision without reading the internal plan. Include representative standalone Workflow/Room summaries to check the shared pattern, not a separate prototype for every row or worker type. Check quiet waits, lost observation, draining pause and saved multi-choice decisions as states of the same flow. Use simulated observations; do not spend on model calls or touch MiniSynth records. Review the served prototype with keyboard access, reduced motion, two desktop widths and accessibility/build checks. Obtain the user's approval of the UI direction before implementing section 6 of `tasks.md`; this is a development review, not a new approval step for delivered Architect projects. Record the direction in PR #573. Runtime safety work can proceed independently within the agreed scope.

Proposed overview structure, not a new document editor:

```text
MiniSynth
A small browser synth you can play.

Working · Checking keyboard input
Last activity 8s ago · Observation current
$1.32 used / $5 start cap

[Open preview]                    [Watch work]
Next: check sound and controls

[One short decision, only when needed]
[Send a note…]                    [Project menu]
```

This is one illustrative task layout, not a required solution shape or milestone sequence. The numbers above illustrate measured facts; they are not fixture values or promises. Actual absence of measurement is labelled unavailable.

The separate work surface provides live owner/worker selection and navigation to plans, research and evidence. Existing History and visual run metrics remain their own views. No older-directive column and no nested full plan in the overview. Model defaults/settings stay available without taking the primary reading path. New decisions show one question, reason, recommendation and at most two choices with their consequences; evidence opens separately. Saved decisions keep every original option, identifier, consequence and recommendation until answered, including existing three-choice research-access decisions. Do not hide a legacy choice in the optional note or replace its consent with a new approval flow. Recovery is a short hold plus a dialog, not extra fields expanding the overview.

Apply the same information ordering at all levels:

| Level | Default feedback | Detail on request |
| --- | --- | --- |
| Architect widget/list | State, current work/owner, freshness, spend, needs-you | Project overview |
| Architect overview | User goal/constraints, work/wait, result, spend, necessary decision | Watch work, plan, research, evidence, History, metrics |
| Orchestrator Home | Workspace state and current/held work summaries | Selected Workflow/Room |
| Workflow list/page | State, current step/concurrency or wait, freshness, spend/limits | Step/fan-out live view, children, plan/settings/history |
| Room list/page | State, concurrent work or hold, freshness, spend/active time | Watch, members/children, artifacts and activity |
| Step/member/child | Actual action/request/tool state and measured wait | Bounded live output and full saved history |

Keep existing navigation names, full titles, standalone creation/grants and user controls. Scope cross-app links with workspace plus record identity. Use the shared activity vocabulary and accessible words, not animation. Store shared renderer state in Zustand and layout preferences through the host layout service. Actions use registered tools through `useAppTools()`; observation uses existing authorized runtime transport. If a desktop contract changes, update React/store, preload, main and SDK/shared IPC types together.

**Alternative rejected:** a global scrolling console or more per-card folds. Detail must be available without making it mandatory.

### 8. Learned decision preferences are deferred

Reusing a user's lasting choices across Architect projects is a separate change. It needs a profile-level record, curation tools, an inspect/correct/forget surface and owner context, none of which reduces noise, widens autonomy or improves live feedback. This change adds no preference storage and no suggestion wording to prompts. Current instructions already take priority over any advice in the owner prompt.

## Risks / Trade-offs

- [Scope crosses security and UX] → Implement coherent source seams in order; do not weaken approval to simplify the UI. A single-PR release still needs each seam checked.
- [Host-approved Room grants broaden a critical API] → Keep exact bundled gating, immutable per-subject policy, parent containment, the existing atomic reservations, revocation and foreign-project tests. The structured path is untouched. Bump `@sero-ai/common` for the grant policy and Room handle contracts and any other published package changed by implementation.
- [Short summaries omit important context] → Keep full original intent/documents, validate authored summaries and preserve typed consent constraints/decisions outside prose.
- [Attachment makes stuck work look healthy] → Label contact separately, retain unchanged progress time, expose actual waits and retain the existing run and tool-stall timeouts. Never claim provider progress from host attachment.
- [Watch helpers pass while real output still fails] → Require SDK-to-screen harness coverage and bounded real-app observation, not only component mocks.
- [Abrupt shutdown cannot reveal its exact last instant] → Preserve confirmed active usage, exclude the known closed interval and label uncertainty instead of making a precise claim.
- [Agent behavior varies] → Check a usable result, permission boundaries and observable recovery, not a fixed roster, document count or transcript wording. Deterministic tests establish allowed plan changes and context precedence, not a claim that they prove model judgment.
- [New UI hides old approval] → Read legacy records without changing authority and identify the charter flow as deprecated. Verify the preserved MiniSynth approval state and completed research identity without live mutation.
- [Touched files sit at the 500 LOC cap] → `projects-actions.ts` (499), `services.ts` (497), `owner-actions.ts` (494), `room-coordinator.ts` (500), `runner.ts` (497) and Orchestrator `shared/types.ts` (496) must be split by seam before any addition; budget that in each slice.
- [Shared renderer adds code weight] → Reuse/lazy-load existing detail where supported; do not add a parallel Markdown package.

## Migration Plan

1. Deliver as stacked draft PRs per seam with PR #573 as the base: host grant policy and `@sero-ai/common` contracts; Architect runtime, budget and recovery; feedback and active time; UI. Each is reviewed on its own. Keep plugin fixes committed in `1aedb3f43`; reconcile rather than replace them.
2. Complete the early prototype and UI-direction review before replacing production views. Add optional request/authority agreements, working summaries and host delegation/feedback contracts. Missing fields mean legacy authority and unavailable current observation, not new approval. Keep old enums, identifiers, saved history and evidence readable without adding a quality enum or prescribed solution state machine.
3. Enable the new default only for newly approved delivery agreements. Projects without an agreement keep their saved charter flow, which the UI identifies as deprecated. No adoption action, no reconciliation layer and no cap change for them.
4. Wire producer feedback/recovery before replacing overview rendering. Verify autonomous approval, budget and isolation guards independently of the agent prompt.
5. Sync or archive `localise-live-agent-progress` first; only its manual app pass (task 10.3) is open. Then this change's `architect-ui`, `orchestrator-ui` and `live-agent-watch` deltas apply on top, so its text wins where both modify the same requirement. Reuse live blocks and transport, move direct research watch to the work view, and apply decision 5's rules for quiet waits, list-only metadata and retained producer snapshots. Do not restore the older inline layout, no-tool writing label, start/end-only metadata or producer-buffer deletion. Preserve unrelated chat and Design Library behavior.
6. Validate the specific scenario matrix in `tasks.md`, then the affected suites/typecheck/builds and React Doctor. Record a new disposable MiniSynth-like delivery run on `deepseek/deepseek-flash` under an explicit test approval; preserve the existing MiniSynth records. Report readiness only for the checks actually performed.
7. Rollback by stopping agreement-based scheduling and holding those projects before reverting runtime code. Do not feed approved new projects into the old charter gate or discard their authority references/usage. Restore the old UI without deleting data; any implementation rollback of public grant contracts must retain a compatible reader until active grants are safely revoked. Keep the PRs draft unless the user asks otherwise.

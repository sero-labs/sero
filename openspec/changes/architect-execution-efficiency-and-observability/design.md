## Context

See `proposal.md` for motivation and scope. This design is required because the change crosses plugin runtimes, host session adapters, persisted records and UI contracts.

The relevant current boundaries are:

| Area | Observed implementation | Consequence |
| --- | --- | --- |
| Architect owner | `runtime/owner-session.ts` opens a persistent owner and `shared/owner-contract.ts` sends a record snapshot every wake | Continuity already exists, but all milestone plans and up to five research results of 16,000 characters each can be repeated |
| Delegation | Architect `runtime/dispatch-link.ts` adds the brief and milestone plan; `runtime/services.ts` creates a Room or Workflow | Architect can duplicate planning if its assignment becomes a detailed worker plan |
| Workflow workers | Orchestrator `runtime/executors/common.ts` calls the host subagent API; the desktop subagent runner uses an in-memory session per run | Separate workers receive summaries and variables, not predecessor traces; format repair already reuses the current session |
| Workflow planning | `runtime/planner-prompt.ts` already asks for few workers; `runtime/planning-flow.ts` separately extracts triggers after planning | Prompt wording alone has not removed redundant stages; typed one-off dispatches still incur trigger inference |
| Rooms | `runtime/rooms/member-session.ts`, `room-brief.ts` and `room-context.ts` preserve member sessions, project briefs and handle compaction | Do not rebuild this continuity mechanism or turn Rooms into a fixed team template |
| Models | Architect reads global tiers; Orchestrator `runtime/host-adapter.ts` defaults structured calls to MED; steps can use explicit pins | Project defaults must reach planning and auxiliary calls, not only workers |
| Usage | `runtime/project-usage.ts` charges cumulative deltas; `AppRuntimeSubagentUsage` omits cache counters; persistent usage includes them | Keep existing budget accounting while exposing consistent detailed measurements |
| Events | Persistent-session events omit model-request identities and tool-call identities; Room telemetry records bounded wake latency | Existing aggregate data cannot produce a truthful request-level waterfall |
| UI | Architect `ui/components/TopBar.tsx` has a project controls menu; `ModelChoices.tsx` only describes current choices | Reuse that entry point without adding a telemetry dashboard to the project page |

Read-only inspection of the user's development-profile examples found inspect, implement, tests/documentation, review and finalization workers in one import-dashboard milestone. A CSV milestone already separates implementation from independent verification but adds finalization. These are diagnostic examples, not proof that every stage is wasteful. All sampled project records flag incomplete accounting. The plan makes no percentage savings claim and does not commit private records or clipboard images.

## Goals / Non-Goals

**Goals:**

- Make each delegation useful without hard-coding how many agents work or which execution mode runs first.
- Keep bounded contexts and independent evaluation, with evidence available on demand.
- Resolve model defaults once at the appropriate execution boundary and record their provenance.
- Explain a complete run through actual timed activity and conserved costs, including uncertainty.
- Make the visual design reviewable before production decisions become expensive to change.

**Non-Goals:**

- No owner-to-Workflow planning replacement, universal single-agent executor, fixed implement/review pipeline, full-trace copying or separate model allowlist.
- No removal of approval, independent verification, delivery, isolation or restart guarantees.
- No generic cross-step persistent-worker pool. Reuse existing within-attempt repair and Room sessions; cross-step continuation would require a separate authority and lifecycle design.
- No external tracing service, OpenTelemetry deployment requirement, automatic quality score, automatic accusation of wasted work or broad model benchmark suite.

## Decisions

### 1. Prototype and approval precede production work

The first implementation slice is an interactive `sero-prototype` under `apps/styleguide/public/prototypes/architect-run-observability/`, linked from `apps/styleguide/src/PrototypeArchive.tsx`. Reuse the existing `sero-architect/` prototype's useful structure, but verify it against current `ProjectPage`, `TopBar`, shared UI components and design tokens.

It must cover model settings and the inspector with sanitized, deterministic examples: initial delivery, a maintenance objective, parallel Room members, structured Workflow steps, retries, repair, approval waits, interruption, compaction and partial historical data. Charts, timeline selection, expansion, filtering and detail inspection must work rather than appear as decorative controls. Check keyboard access and both wide and narrow desktop layouts.

Stop after presenting the prototype. The user must explicitly approve it. Record that approval and any plan changes in the change artifacts and linked GitHub discussion before starting production work. If feedback changes behavior, revise the affected specifications and task sequence first. Neither this proposal nor a successful prototype build substitutes for approval.

### 2. Improve assignments and planner guidance without imposing a topology

Architect provides an objective, approved acceptance criteria, constraints, relevant decisions, evidence references and a stopping condition. Its milestone plan remains a valid approval artifact; it need not enumerate executable steps. Detailed solution planning can be delegated to a Room, whose specialists and reviewers collaborate before synthesizing findings. A Workflow designs the flow needed to execute its assigned objective. Architect judges whether the result meets that objective and can guide further work.

Refine owner and delegated planner instructions together. Separate workers should have a task-specific reason, such as independent judgment, specialist context, an authority boundary or useful concurrency. Do not force a review worker or a Conductor into every Workflow, or ban Rooms from all editing work. For implementation, avoid coupled concurrent edits unless the planner can establish independent scopes, such as unrelated refactoring work.

Allow one worker to investigate, implement and run development checks. Those checks are not independent acceptance. Independent reviewers inspect requirements and relevant files rather than inheriting the implementer's reasoning. If a reviewer changes the product, its work also needs independent judgment. Recheck named findings and directly affected behavior after repair rather than automatically repeating a broad audit. Architect retains runtime-owned evidence and acceptance.

Use existing in-session format repair and Room member continuity. Do not create a worker solely to restate a prior verified result; the final substantive step can report completion. Preserve required approval and delivery boundaries. Do not mechanically reject a plan based on worker count or turn an efficiency recommendation into authority to remove a user requirement.

### 3. Context is compact, versioned and recoverable

The owner wake contract keeps authoritative phase, overlay, budget, open decisions, unanswered directives, milestone status and the wake cause on every turn. Include the active objective's relevant details and changes. Replace repeated historical plans, reports and command output with bounded summaries and resolvable references. After compaction or a new owner grant, reconstruct current authoritative state and active work before continuing. Keep stable protocol instructions in the system prompt; put changing data in turn context.

Delegated handoffs carry approved requirements and relevant evidence, with status and freshness. Planning recommendations remain distinguishable from user approvals. Missing or stale evidence is explicitly identified; the worker can inspect the referenced source instead of trusting a truncated summary. Never silently omit authority constraints to meet a size budget. The owner's allowed directory is the project folder, not the profile's private record directory. Publish runtime-owned context projections under the project's `.sero/apps/architect/` area for its existing read tools; include revision and source identity and never treat an editable projection as authority to mutate the private record. Do not add inaccessible profile paths to prompts or reinterpret the existing status-update action as a read API.

Workflow context currently injects all variables and append-only notes. Introduce task-relevant context projections with complete variables still available through readable context artifacts in the execution workspace under normal permissions, including managed worktrees. Pure-model steps have no read tools: include all declared required inputs in their prompt rather than replacing them with unreadable references. Do not hide route variables needed to execute the step. Room decision relevance must use explicit scope or global applicability rather than display-name substring matching. A compact reference to a global decision must reach every affected member.

Keep full predecessor transcripts out of automatic handoffs. Do not add a second summarizer agent solely to prepare each handoff. Validate bounded projection behavior with synthetic large records, not only prompt-string assertions.

### 4. Project tiers are defaults, not a new authority system

Persist optional project overrides using the existing `SharedModelTierSettings` vocabulary, whose internal middle tier is `MED`. Model and thinking form one selected tier entry. Clearing an override restores inheritance. Global settings and unrelated Workflows/Rooms must not change.

Resolve each tier from project override, then global selection. Preserve explicit manual worker pins above tier defaults, subject to the existing available-model and permission checks. Preserve the existing `SERO_ARCHITECT_MODEL` owner override as an explicit environment pin and show its provenance; do not silently remove an existing override path. The model settings view must distinguish saved tier defaults from effective owner or pinned worker choices. Research and capture retain their existing owner-model relationship unless their caller explicitly selects a tier; every resolution records why that model was selected.

Architect snapshots effective tiers and a configuration revision into each new Room or Workflow creation request before planning begins. All descendant planning, trigger extraction, evaluation, recovery and execution calls use that snapshot. Resolve tiers before the global-only host fallback can choose a model. Room model catalogues and grants derive from the project snapshot, while the Room still chooses member assignments dynamically. Pair model and supported thinking choices; do not form unsupported combinations from independent unions.

The user confirmed that changes apply to future work at safe boundaries. An idle owner's next turn and new direct research/capture calls use the latest effective settings. Existing Rooms and Workflows keep their creation snapshot, including later steps, retries and their recurring runs, unless changed through existing explicit controls. A new Architect dispatch receives new defaults even within the same Architect run. Record the revision per operation, not just on the run header.

If the owner selection needs new authority, use the existing dispose/regrant path between turns and wait for explicit host approval. Preserve previous-session references, charges and history; re-prime the replacement owner from the record. Do not create two active owner drivers. Failed or declined approval leaves work held with a clear reason. Unavailable models and unsupported thinking produce actionable errors, not silent fallback to a different provider.

### 5. Typed dispatch carries context, not more management power

Extend existing Workflow/Room creation options with optional project/run correlation, model snapshot and explicit trigger intent. Persist these with the creation request so recovery reuses the same context. Keep the common planner, validation, permission and grant paths.

For caller-declared one-off work, record manual triggering without asking a model to infer it. For caller-supplied validated triggers, retain them without redundant inference. Natural-language Workflow creation with unspecified trigger intent continues to use the existing extractor. A one-off hint does not skip planning the Workflow itself. Do not add revise, override or delete authority to the typed runtime handle.

### 6. Runs describe objectives, not session lifetimes

The user confirmed one initial run covering setup/discovery through initial delivery, then one run per maintenance objective. Create the run identity before its first observable work. Link owner wakes, research, planning, dispatches, evidence and delivery to that identity. A session can span several runs; its lifetime bill is not charged again to each run.

Open a maintenance run when an event or directive starts objective triage, before its first model call. A dismissed event ends as no work needed, not a fabricated product delivery. A later accepted objective can span several milestones and dispatches. Retries, pause/resume and restart retain the run identity. Coalesced duplicate causes reuse their objective identity; do not introduce semantic deduplication by string guessing. Record explicit links when the owner combines or separates objectives.

Owner wake coalescing remains unchanged. If one call genuinely serves multiple objectives, record it once as shared project activity and link it to each affected run. Show each run's attributable cost and linked shared cost separately, without inventing a proportional allocation. Lifetime totals count the shared charge once. Maintenance watcher overhead and unassignable historical usage are similarly explicit, never silently dropped or assigned to a random objective.

Pause, budget exhaustion and errors do not mean accepted completion. Preserve the reported/verified/accepted/delivered distinctions. A run can record delivery or termination while remaining visibly incomplete in accounting until its last source settles. In-flight work after Stop remains attached to its original run and contributes late usage. Do not hide known pending work by closing its trace bar at the time the user pressed Stop.

### 7. Collect observed spans at the host, ownership at the runtimes

Use optional typed correlation metadata through the existing common runtime contracts. Architect and Orchestrator identify the semantic operation: owner wake, research, planning, Room/member, Workflow/run/step/attempt, repair, evidence or delivery. Host adapters attach model-request and tool-call observations using their actual event identities. No model is asked to narrate timing or cost.

A trace record needs stable operation/span identity, parent identity where containment is real, links for cross-agent handoffs, project/run ownership, kind, source sequence, start/end timestamps, state and usage provenance. Keep session, turn, dispatch, attempt and request identities distinct. Use request-level measured data for models and call IDs for tools; matching only by tool name fails for parallel identical tools. Separate SDK retries, Workflow retries and successful turns.

Extend subagent usage to preserve cache counters. Add host observations for request start/finish, available first-token timing, tool start/finish and compaction. The current persistent-session event adapter deliberately excludes reasoning text; keep that boundary. Read the installed Pi SDK documentation before implementing new mappings. If the provider or SDK lacks a measurement, record it as unavailable rather than deriving fictional precision from text deltas. Generation duration must not include all surrounding tool execution.

Detailed telemetry is optional for other plugin consumers and cannot grant access to another project's sessions. Propagate it across every supporting call, not just visible workers. Keep host model resolution and actual usage authoritative over planner estimates.

### 8. Accounting and time have explicit aggregation rules

Keep one charging path. Feed budget and trace summaries from the same source identities and cumulative deltas, extending the existing accounting helpers rather than independently billing every trace layer. Replayed progress and restart reconciliation are idempotent. Parent spans show inclusive totals for inspection but do not contribute a second charge when children are summed. If an aggregate includes unobserved children, keep that remainder labelled as aggregate coverage, not fabricated model calls.

Preserve reported USD and its pricing provenance. Retain input, output, cache-read and cache-write counters separately and normalize provider semantics before charting them as disjoint categories. Cached tokens are not priced as fresh input. Unpriced or interrupted calls remain incomplete. Available reasoning-token counts are optional diagnostics, not a requirement to expose reasoning content.

Elapsed time is end minus start, or now minus start for active work. Active run time is the union of observed active intervals, not the sum of all parallel worker durations. Show summed worker time separately if useful. Waits carry observed causes such as queue, approval, backoff or pause. Unobserved gaps are unknown. An approval wait concurrent with other work must not be subtracted from active time twice. Never infer a causal critical path solely from nested parent duration.

Record counters for agent starts, model requests, turns, tool calls, retries and compactions separately. These support comparing accepted outcomes before and after optimization, rather than treating fewer agents as a success metric by itself.

### 9. Profile-local storage, bounded reads and privacy

Keep project model configuration and run references in the runtime-owned project record. Store detailed run data under the active profile's Architect application directory, separate from the project list/index and hot record. Use an append-oriented, versioned event journal per run with atomic summary checkpoints, stable source watermarks and paged queries. Shared activity has one project-scoped journal or equivalent canonical record and run links. Reuse existing host app-state access and authorization; do not hard-code a development profile or absolute home path.

Recover only complete records after interruption, preserve unresolved spans and mark missing tails incomplete. Avoid a new database or server dependency. Bound in-memory buffers, coalesce usage updates, page timeline detail and virtualize large displays. Keep compact run summaries when detailed retention expires and disclose missing detail. Start with the existing explicit project deletion lifecycle for full cleanup; do not silently expire detailed runs before a retention policy has been reviewed in the prototype.

Do not duplicate prompt bodies, reasoning, raw tool arguments, secrets or full outputs into the metric journal. Keep authorized references to existing evidence/session records. On-demand detail obeys existing access checks and redaction. A tool summary needs the same treatment as tool arguments if it can contain secrets. Instrumentation failure must be visible as incomplete telemetry; it must not silently disable budget enforcement or re-execute a paid operation.

### 10. Trace-first inspector inside Architect

Open a dedicated full-width view from the project controls menu. It has a run selector, lifetime summary, compact run totals, an expandable time-aligned activity tree and a selected-activity detail panel. The timeline represents observed dynamic execution, not the planned graph. Parent bars show containment; links show handoffs without implying that the sender worked throughout the recipient's execution.

Expose Room members, Workflow steps/attempts and owner wakes, with model/tool calls available on expansion. Support time-range zoom, collapse, activity/model/failure filters, keyboard navigation and stable selection during live updates. Show retries, waits, interruptions and compactions with text or symbols as well as color. Do not color a request successful merely because its parent run ultimately recovered.

Link cumulative spend, cost-by-activity/model and token-composition charts to timeline selection. Changing filters must clearly identify whether totals cover the full run or the selection. Charts must not double-count parent and child costs. Tooltips and the detail panel show exact values, actual models/thinking and selection provenance, evidence references and accounting completeness. Missing historical spans and stale references are visible states.

Use the user's references for the waterfall, expandable tree, linked breakdowns and side-panel pattern, not their product branding or dense administrative navigation. Do not place a new event log or metrics dashboard on the main Architect page. Persist any saved layout preferences through the host layout API, never browser storage.

## Prototype outcome
The interactive prototype at `apps/styleguide/public/prototypes/architect-run-observability/` was approved on 2026-09-14. The user requested no change of behaviour, so the plan below stands. The prototype settles these presentation details for the production work.

- The inspector opens as a dedicated full-width view inside Architect. One control returns to the project page. It is not a dialog and not a separate window.
- The project controls menu carries `Models…` and `Run metrics…` as the required entry points. The page body adds one compact model-defaults summary and one run-metrics entry point beside them.
- The run selector lists the runs first, then `Project lifetime`. Lifetime scope shows a run table and one cumulative chart, not a timeline, because each run has its own time origin.
- The window control above the ruler zooms and pans by pointer, by keyboard, and by explicit Zoom in, Zoom out and Zoom to selection controls. A pointer is never required.
- An activity that serves several objectives appears as a muted row under the timeline, labelled `linked, not attributed`. It is not placed on the time axis, because it cannot be positioned against one run clock honestly.
- The selected-activity panel is a rail beside the timeline at wide width and drops below the timeline at narrow width.
- The high-span fixtures in the prototype exist for the bounded-rendering check. They are not product entries.
- The destructive menu item keeps the existing `--err` token at 4.37:1 contrast. The prototype does not change the product palette, so this stays open for a later colour decision.

Two findings from the prototype review become production test obligations. First, a model or tool call must group under the activity it serves, not into one flat total. Second, the rendered window must follow the scroll position, and a selected activity must stay inside the rendered window after any change to expansion.

## Outstanding evaluation before the efficiency guidance changes

Task 5.4 requires a bounded baseline, measured with the new metrics, for one
implementation-and-independent-review objective and one collaborative-planning
objective. The measurement instrument is built and tested
(`runtime/baseline.ts`): it records the candidate, the models that actually ran
with their selection source, the acceptance criteria held constant, cost
coverage, elapsed/active/worker/wait time and the run counters, and it refuses
a synthetic record as evidence about efficiency.

The live measurement itself is **not yet taken**. It needs model runs and a
bounded spend approval, which is a user decision and not something the
evaluation may assume. Phase 6 (tasks 6.1 to 6.5) changes owner and planner
guidance, and this task explicitly requires the baseline first, so 6.1 must not
start until the two records exist.

## Risks / Trade-offs

- Compact context can omit a needed decision. Keep mandatory authority fields, explicit applicability and resolvable evidence; test compaction and stale-reference paths.
- Prompt changes do not prove lower cost or better decisions. Use a small end-to-end comparison with acceptance held constant, alongside deterministic contract tests.
- A fresh reviewer repeats some reads by design. Measure overlap without treating independence as waste.
- Model revisions can produce mixed-model runs. Show provenance per operation and creation snapshots on existing dispatches.
- Regranting the owner starts a new transcript with reconstruction cost. Preserve history and charge it visibly; do not pretend the old session continued unchanged.
- Long runs can generate many spans. Page and virtualize details, coalesce progress and keep hot indexes compact.
- Aggregate legacy usage cannot be accurately split into past calls or objectives. Preserve known amounts as incomplete historical coverage and do not fabricate timestamps or costs.
- Third-party model timing varies. Report supported measurements with explicit unknowns; do not promise uniform first-token or reasoning data.

## Migration Plan

1. Build and obtain approval for the prototype before production changes. Amend artifacts if the approved experience changes a contract.
2. Add optional, versioned shared contracts and readers first. Old callers without project context keep current behavior; old records inherit globals and retain current budget totals.
3. Add model snapshots and run identities before dispatch, then instrument the host and aggregate observations. Preserve source IDs through restart and keep detailed telemetry separate from execution authority.
4. Populate historical views only from available records. Label unknown run attribution, cache splits and timing. Do not rewrite the private examples or claim they are complete baselines.
5. Connect the approved inspector and model controls. Validate restart, partial data, isolation and bounded rendering before enabling them for new projects.
6. Rollback must leave new journals and snapshots intact. Do not run saved project overrides on an old runtime that ignores them; require a compatible version or hold that work with an explicit reason. Telemetry can be disabled without resetting budget accounting.

## Validation Approach

Use the smallest relevant existing Architect, Orchestrator and host session suites. Add behavior tests for context recovery, model propagation and snapshot timing, permission refusal, shared-run attribution, replay-safe charging, partial history and overlapping intervals. UI tests cover menu entry, selection linkage, filters, unknowns and access checks. A bounded high-span fixture checks pagination and rendering without live models.

After prototype approval, compare a small implementation-and-independent-review task and a collaborative planning task with fixed acceptance criteria. Record candidate identity, actual model choices, cost completeness, elapsed and active time, requests, retries and outcome. Do not rerun the full resilience app suite or promise a numerical performance target from incomplete historic totals. Run root typecheck for source work and React Doctor after React changes; prototype checks follow `sero-prototype`.

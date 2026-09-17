# Requirements-to-evidence record

Task 8.4 transcription. Each requirement and scenario in the delta specs names
the test that exercises it, or the `design.md` section that records observed
evidence. Every quoted test title was confirmed present with `grep` on
2026-09-15. `NO EVIDENCE FOUND` means no test and no observed record exists;
it is written down, not filled in.

Paths are relative to the repository root. `arch/` is
`plugins/sero-architect-plugin/`, `orch/` is `plugins/sero-orchestrator-plugin/`
and `desktop/` is `apps/desktop/electron/__tests__/features/`.

## architect-model-overrides

| Requirement / scenario | Evidence |
|---|---|
| Project tier overrides inherit global defaults: one overridden tier | `arch/runtime/__tests__/model-resolution.test.ts` "uses a project override for its tier and inherits the rest from global", "keeps two projects independent" |
| Restore inheritance | `model-resolution.test.ts` "restores inheritance when the override is cleared, without touching other tiers"; `arch/runtime/__tests__/record-store.test.ts` "restores global inheritance when a project override is cleared" |
| Project selections reach all delegated model work: planning precedes workers | `model-resolution.test.ts` (dispatch snapshot) "carries only the selected tiers, each with its provenance"; `orch/runtime/__tests__/project-model-snapshot.test.ts` "sends the snapshot model and thinking on a worker call", "resolves a per-step tier from the snapshot rather than the global default" |
| Room assignment | `arch/runtime/__tests__/research-room.test.ts` "creates a Room before any charter, resumes its link and feeds durable findings to the owner once" (asserts `limits.models` derives from the project selection); `orch/runtime/__tests__/room-planner.test.ts` "holds every member to the model and effort level the machine pins" |
| Explicit selections retain precedence and provenance: manually pinned step | `project-model-snapshot.test.ts` "still lets an explicit step pin win over the snapshot" |
| Owner environment pin | `arch/runtime/__tests__/owner-session.test.ts` "keeps the environment pin above the project override"; `model-resolution.test.ts` "reports the environment pin as its own source, not as a tier" |
| Changes apply at safe boundaries: override saved during work | `arch/runtime/__tests__/integration-boundaries.test.ts` "does not change the snapshot a prepared dispatch already carries" |
| Global defaults change | `integration-boundaries.test.ts` "gives the next dispatch the new selection and the new revision"; `project-model-snapshot.test.ts` "retains the snapshot for a later attempt after the global defaults change"; `arch/runtime/__tests__/projects-actions.test.ts` "saves a tier override and says which dispatches keep the earlier revision" |
| Model settings cannot widen authority: grant declined | NO EVIDENCE FOUND. `owner-session.test.ts` "blocks the project with the reason when the user refuses the grant" covers the initial grant, not a declined regrant after an owner model change. |
| Invalid selection | `model-resolution.test.ts` "refuses an unavailable model instead of switching provider", "refuses an unsupported thinking level and lists what is supported"; `projects-actions.test.ts` "refuses an unavailable model and saves nothing", "refuses an unsupported thinking level and an unqualified model reference"; `owner-session.test.ts` "refuses an unavailable project override without switching provider", "refuses an unsupported thinking level on the project override" |

## architect-owner-session

| Requirement / scenario | Evidence |
|---|---|
| The record is the contract: paused project contract | `arch/shared/__tests__/owner-contract.test.ts` "tells a paused owner woken by a directive to reply and stop, not to dispatch" |
| Idea contains an instruction | `owner-contract.test.ts` "quotes an instruction inside the idea as task data instead of obeying it" |
| Completed research does not dominate every wake | `owner-contract.test.ts` "summarizes a finding and points at the report rather than embedding it", "caps the narrative without ever dropping an authority constraint", "bounds the plan and the evidence a milestone carries" |
| Compaction loses preceding updates | `arch/runtime/__tests__/owner-session.test.ts` "sends the contract as the first prompt of a wake and re-sends it after compaction" |

## architect-resilience

| Requirement / scenario | Evidence |
|---|---|
| Architect delegates evaluable objectives without duplicating execution plans: collaborative solution planning | `research-room.test.ts` "creates a Room before any charter, resumes its link and feeds durable findings to the owner once" |
| Structured execution follows planning | NO EVIDENCE FOUND as a test. Commit `707fa4a06` changed prompt text only and deferred verification to the task 8.2 behavioural read. `design.md` "Finding for task 6.4" is the nearest observed record and does not confirm this scenario. |
| Handoffs preserve relevant evidence without copying full traces: Room findings inform a Workflow | `arch/runtime/__tests__/dispatch-recovery.test.ts` "gives the delegate the user approvals, and only the approvals"; `arch/runtime/__tests__/research-artifact.test.ts` "attaches the path once the report is saved", "keeps the finding and records no reference when the report cannot be written" |
| Global decision affects several members | `orch/runtime/__tests__/room-brief.test.ts` "gives an unnamed decision to every member, not to nobody", "gives a decision to the member whose work it relates to, and to nobody else", "does not decide relevance by finding a name inside the sentence", "treats a decision about work nobody owns as global rather than dropping it" |
| Additional workers have a task-specific purpose: report-only finalization | NO EVIDENCE FOUND. Guidance-only change in `707fa4a06`; no test. |
| Independent refactoring scopes | NO EVIDENCE FOUND. No scope or concurrency test in `room-workspace.test.ts` or `room-lifecycle.test.ts` is tied to this scenario. |
| Efficiency preserves independent judgment: implementer's tests pass | `arch/runtime/__tests__/owner-actions.test.ts` "refuses to close a milestone on a completion claim and names the missing evidence", "does not accept old evidence or start duplicate checks while verification is running" |
| Focused repair | `owner-contract.test.ts` "supplies bounded failure diagnostics and a local repair path without granting new authority" |
| Reviewer edits the product | NO EVIDENCE FOUND. Commit `c27462faf` added guidance text only; no test asserts a reviewer's own fix still needs independent verification. |

## architect-run-observability

| Requirement / scenario | Evidence |
|---|---|
| Runs follow objectives rather than sessions: initial delivery and maintenance | `arch/runtime/__tests__/run-lifecycle.test.ts` "opens one initial run and never a second one", "covers several milestones with one maintenance run and keeps it across a restart", "opens its own run for a different objective and reuses the identity for a repeated cause", "links a later occurrence of one objective to its earlier run" |
| Interrupted run resumes | `run-lifecycle.test.ts` "covers several milestones with one maintenance run and keeps it across a restart"; `integration-boundaries.test.ts` "reports the usage it has and marks the rest incomplete rather than zero" |
| No fix is needed | `run-lifecycle.test.ts` "records a dismissed triage as no work needed, not a delivery" |
| Cross-objective costs remain explicit: one wake serves two objectives | `run-lifecycle.test.ts` "appears from both runs, is written once, and is charged once"; `arch/runtime/__tests__/run-journal.test.ts` "keeps shared activity in one project-scoped journal" |
| The timeline represents observed execution: parallel specialists | `arch/runtime/__tests__/spans.test.ts` "preserves real containment and nothing else"; `arch/runtime/__tests__/trace-summary.test.ts` "counts two workers over the same interval as one interval of active time" |
| Same tool runs concurrently | `desktop/subagent/runner.test.ts` "keeps two parallel calls to the same tool apart by their call id"; `desktop/apps/runtime/capabilities/persistent-sessions/live-sessions.test.ts` "keeps two parallel calls to the same tool apart by their call id" |
| Live update while inspecting | `arch/ui/__tests__/inspector.test.tsx` "keeps the selected row when a later read arrives" |
| Cost totals conserve reported usage: progress is delivered twice | `arch/runtime/__tests__/project-usage.test.ts` "persists live research spend, deduplicates cumulative reports and retains prior attempt cost"; `run-journal.test.ts` "ignores a repeated cumulative usage report from the same source"; `arch/runtime/__tests__/dispatch-watch.test.ts` "charges only the usage delta and wakes once for a question" |
| Parent and child selected | `trace-summary.test.ts` "reports a parent inclusive cost without rebilling its children"; `arch/ui/__tests__/charts.test.ts` "counts each cost once when the whole tree is summed" |
| Token and model details preserve provenance: provider lacks a cache split | `arch/runtime/__tests__/run-observations.test.ts` "names a counter the provider omitted instead of reporting zero"; `trace-summary.test.ts` "names a counter nothing reported as unavailable rather than zero" |
| Timing distinguishes elapsed work and waiting: two workers overlap | `trace-summary.test.ts` "counts two workers over the same interval as one interval of active time" |
| Approval waits while another worker runs | `arch/runtime/__tests__/observed-waits.test.ts` "leaves a second worker active while another operation waits for approval" |
| Charts and activity details are linked: investigate a cost increase | `inspector.test.tsx` "filters the timeline when an activity bar is chosen" |
| A filter hides most work | `charts.test.ts` "says whether it covers the whole run or a filtered view of it"; `arch/ui/__tests__/timeline.test.ts` "combines filters rather than widening when they disagree" |
| Partial history and unfinished work stay honest: legacy project | `arch/runtime/__tests__/legacy-summary.test.ts` "labels the whole amount as aggregate instead of inventing the calls behind it", "reads an unpriced or zero-spend record without turning unknown into zero coverage" |
| Stop leaves a worker running | `run-lifecycle.test.ts` "keeps a stopped run open for late in-flight work and accepts nothing"; `inspector.test.tsx` "still shows late worker activity and its usage after a Stop" |
| Observability is bounded and respects access: large run opens | `timeline.test.ts` "never renders more rows than the viewport and its overscan, at any scroll position"; `arch/runtime/__tests__/trace-query.test.ts` "returns the page when detail is asked for, and bounds it" |
| Unauthorized detail reference | `trace-query.test.ts` "returns nothing for a project the caller does not own" |
| Telemetry persistence fails | `desktop/subagent/single-run.test.ts` "never lets telemetry failure change the run" |

## architect-ui

| Requirement / scenario | Evidence |
|---|---|
| Controls: pause | `projects-actions.test.ts` "pauses without cancelling a running dispatch, and only a directive gets through"; `arch/ui/__tests__/project-controls.test.tsx` "offers Resume for paused or blocked projects, and Pause for a cap alone" |
| Open run metrics | NO EVIDENCE FOUND at the menu-click level: `project-controls.test.tsx` stubs `openInspector` and never clicks the item. The opened view is tested in `inspector.test.tsx` "asks for a summary without trace detail" and "returns to the project from the header". |
| Inspect project model defaults | NO EVIDENCE FOUND at the UI layer: `ModelSettings.tsx` has no test file. The data is tested at the runtime layer in `projects-actions.test.ts` (project model defaults). |
| Inspector interactions are accessible and preserve context: inspect without a pointer | `inspector.test.tsx` "moves the selection with the arrow keys rather than requiring a pointer", "leaves the view with Escape, the same as the back control", "returns to the project from the header", "remembers the filters in the host layout service, so returning shows them again". The keyboard-activatable row from commit `a084687ea` (Enter and Space act like a click) has no targeted test; that commit was checked by React Doctor and the existing suite only. |

## orchestrator-dispatch-handle

| Requirement / scenario | Evidence |
|---|---|
| Creation carries optional project execution context: Architect dispatch survives restart | `orch/runtime/__tests__/create-recovery.test.ts` "saves before planning, resumes the same draft after restart and reuses a completed response"; `orch/runtime/__tests__/project-context.test.ts` "saves the context before planning runs and keeps it after the plan lands"; `orch/runtime/__tests__/dispatch-handle.test.ts` "retains project attribution from a typed dispatch handle", "reuses a saved Room request across repeated handles without planning or granting again" |
| Ordinary Workflow creation | `project-context.test.ts` "leaves an ordinary caller without context unchanged", "leaves the context absent for an ordinary caller" |
| No foreign-project grant | `project-context.test.ts` "refuses a foreign project and names both projects", "refuses attribution from a workspace no project owns", "refuses an incomplete correlation", "refuses to re-attribute a saved request to another project"; `dispatch-handle.test.ts` "refuses to re-attribute a saved Room request to another project" |
| Explicit trigger intent avoids redundant inference: one-off milestone | `orch/runtime/__tests__/trigger-intent.test.ts` "does not ask a model whether a one-off milestone recurs" |
| Natural-language automation | `trigger-intent.test.ts` "still extracts natural-language recurrence when the caller leaves it unspecified"; `project-context.test.ts` "defaults to unspecified so natural-language extraction still runs" |
| Explicit maintenance triggers | `trigger-intent.test.ts` "keeps supplied triggers without rediscovering them", "treats supplied triggers without an explicit intent as supplied" |

## Gaps

Eight scenarios have no test and no observed record: a declined regrant after
a model change; structured execution following planning; report-only
finalization; independent refactoring scopes; a reviewer editing the product;
the menu wiring for `Run inspector…` and `Models…`; and the keyboard activation
of an inspector row. The five resilience scenarios are guidance-only prompt
changes that task 6.1 deferred to a behavioural assessment. The three UI items
were exercised by hand only.

## Integration regression coverage after the stack review

- Room planning and saved member configurations use the project model and thinking selection: `orch/runtime/__tests__/room-app-actions.test.ts`, "uses the project snapshot for paid Room planning and member choices". Research creation carries the selection in `arch/runtime/__tests__/research-room.test.ts`; research recovery keeps it in `research-context.test.ts`. Maintenance creation carries project context in `services.test.ts`.
- Namespaced owner environment pins preserve the full model ID and explicit thinking off: `model-resolution.test.ts`.
- Compaction retains the full active plan and brief: `owner-session.test.ts`, "sends the contract as the first prompt of a wake and re-sends it after compaction". Completed plans and historical evidence remain bounded.
- Owner and research costs enter the run journal: `owner-session.test.ts`, "journals owner deltas to their turn run even when another objective opens mid-turn", plus the Room and Workflow research completion tests. These assert the recorded amounts, including repeated observations.
- `delivery-runs.test.ts` covers receipt/acceptance ordering, repeated delivery, multiple maintenance milestones, distinct objectives, and research finishing last. `owner-actions.test.ts` covers explicit no-work-needed triage and refuses it while the objective has work. The owner names the run and supplies a reason; ordinary sleep does not close a run.

These are deterministic runtime checks. They do not establish a live efficiency improvement or close the unrelated behavioural evidence gaps above.

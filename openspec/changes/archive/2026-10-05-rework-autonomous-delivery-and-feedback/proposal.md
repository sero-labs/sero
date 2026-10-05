## Why

Architect currently makes the user manage its process: research, a large charter, repeated milestone approvals and recovery across separate views. Live feedback is also incomplete across Architect, Orchestrator Workflows and Rooms, so the user cannot reliably tell whether work is running without opening internal detail.

The agreed product model is: the user describes what they want and their limits; Architect determines and manages the solution just in time as it learns; Orchestrator runs that work reliably. Formatting the existing process is not sufficient. Reduce noise, clutter and routine decisions. Architect should continue eligible work autonomously until material uncertainty or required new authority prevents safe continuation; added internal safeguards must not become more user-facing gates.

## What Changes

- **BREAKING behavior for new projects:** replace mandatory discovery/charter and default per-milestone approvals with approval of the user's request and execution authority before paid work. This is consent to spend and act, not approval of a predefined solution. Existing projects keep their saved charter flow, which the UI identifies as deprecated; there is no adoption or upgrade path.
- Capture the user's request verbatim, stated constraints, cost/start limits, workspace and allowed actions. Architect determines and revises requirements, approach, research, tools, workers, plan, checks and recovery just in time from that input and actual findings. No solution/quality categories, phase recipes, fixed teams or compulsory complete plan before acting.
- Give Architect the instruction to start with the simplest, most pragmatic solution that fits the request. This is judgment guidance, not a runtime rule or classifier. Current user instructions take priority. Any mention of a POC or production-ready app is an example of possible user input, never an encoded product distinction.
- Make the overview a short account of the goal, current work, usable result, spend and any real decision. Put plans, research, models, evidence and history in separate inspectable views, not nested folds in the overview.
- Use judgment for reasonable unresolved choices and keep moving. Ask when uncertainty could materially change the user's intended result or when an action needs new authority. Present a short question, recommendation and consequences, not a technical report. Do not require upfront answers to every product or technical choice.
- Provide truthful, continuous feedback at every relevant level: Architect widget/list/project and work views; Orchestrator Home, Workflow list/page/steps and Room list/page/Watch/members; delegated child activity. Directly created Workflows and Rooms receive the same feedback without an Architect parent.
- Separate process contact from progress. Show a current action, observed wait/recovery, last meaningful activity and observation freshness. Never infer success, failure or progress from animation, elapsed time or saved `running` state.
- Repair the end-to-end Watch path, including first snapshots, quiet model requests, parallel runs, navigation, reconnect and lease cleanup. Keep output live on demand and metadata available without subscribing to every transcript. Reasoning text stays where it streams today: structured-subagent live output keeps it, identified as reasoning; metadata never carries it.
- Keep active-time limits honest across pause, shutdown and restart. Make holds describe draining in-flight work and offer a clear recovery action on the same run without silently raising authority.
- Preserve runtime-owned verification, user-approved spending/access/placement, host security, operation identity, saved work, OpenSpec-enabled projects and optional supervised operation. These are trust boundaries, not preset solution rules.

## Capabilities

### New Capabilities

- `live-work-feedback`: observed activity summaries and on-demand live detail across Architect, Workflows and Rooms, including freshness, scope isolation, subscription lifecycle and active-time continuity.

### Modified Capabilities

- `architect-project-record`: raw user intent, evolving working interpretation and bounded overview fields without rewriting legacy authority or adding quality categories.
- `architect-owner-session`: just-in-time judgment, pragmatic-first instruction guidance and authorized control of delegated recovery through new Room handle methods.
- `architect-budget`: approval of the start cap before any paid discovery, planning or execution.
- `architect-decisions-and-directives`: autonomous judgment within approved authority and short necessary decisions. Limit owner-authored decisions to two options while keeping every choice in saved pending decisions; the runtime's research-access question keeps its three options for projects without an agreement.
- `architect-resilience`: just-in-time investigation, useful delivery and bounded automatic recovery visible throughout the work.
- `architect-verification-gate`: agent-selected evidence tied to current requirements/checks and artifact revisions, not a preset readiness tier. Invalidate only affected proof when criteria change, retain valid evidence and keep details outside the overview without another routine approval.
- `architect-ui`: short live overview and decision views, with a separate work/watch surface rather than an expanded technical document.
- `activity-state`: current-session contact derived from open request/tool state and separate contact/progress signals instead of guessed freshness.
- `orchestrator-ui`: consistent live summaries and Watch access at Workflow and Room overview and detail levels.
- `persistent-session-allowlist`: one approved project policy stored by the persistent-session grant store, so contained Architect-linked Room grants need no repeat approval. Standalone approval flows and the structured-subagent path are unchanged.
- `orchestrator-run-accounting`: active time excludes paused and closed intervals, is checkpointed while running and reconciled on restart; pre-accounting Rooms keep their seeded figure, labelled as such.
- `live-agent-watch` (from `localise-live-agent-progress`, which must sync first): no writing label without a tool, scoped metadata without a watch, and a retained producer partial across watch close.

## Impact

- Architect shared records, lifecycle/approval rules, owner protocol/contract, management and owner tools, dispatch/recovery paths, index projection and UI. No new profile-level record; learned decision preferences are a later change.
- Orchestrator observation producers, Workflow step/live-call paths, Room session observation/broadcast/lease paths, active-time recovery and overview/detail UI.
- Desktop persistent-session grant store and approval wiring, SDK event adapters, existing scoped runtime events and subagent watch transport; `@sero-ai/common` gains the delegation policy and Room handle control methods (version bump). The structured-subagent host path is not changed. Reuse existing live and Markdown renderers; do not add a new library or a second transcript store.
- An early `sero-prototype` session for the connected intake, short overview, Watch and decision/recovery flow, with representative standalone Workflow/Room summaries. Review noise, necessary decisions and access to detail before production UI work; keep the artifact in the styleguide and obtain approval of the UI direction. This development review adds no approval step to delivered projects.
- Closest existing runtime, bridge and UI tests, plus one bounded real-app delivery proof and all-level feedback checks. Reuse valid evidence rather than add duplicate suites. Update owning READMEs, relevant user docs and cross-cutting boundaries during implementation.
- Deliver as stacked draft PRs per seam on top of PR #573 (`feat/architect-openspec-poc`): host grant policy and common contracts; Architect runtime, budget and recovery; feedback and active time; UI. Preserve the plugin fixes committed in `1aedb3f43` and the MiniSynth records. `localise-live-agent-progress` is implemented and must sync before this change archives; its transport is reused, not treated as proof of the full experience. This change's `architect-ui`, `orchestrator-ui` and `live-agent-watch` deltas then apply on top. Preserve its unrelated chat and Design Library scope.
- Several files this change must edit sit at the 500 LOC cap (`projects-actions.ts`, `services.ts`, `owner-actions.ts`, `room-coordinator.ts`, the subagent `runner.ts`, Orchestrator `shared/types.ts`); each slice splits before it adds.

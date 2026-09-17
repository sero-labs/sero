## Why

Architect delegates through Rooms and Workflows, but repeated investigation, context reconstruction and administrative model calls can add cost without improving the result. Project totals do not explain the full execution, and project owners cannot override global model tiers for all delegated work.

## What Changes

- Keep Architect responsible for choosing the execution mode, setting an evaluable objective, guiding delegated work and accepting results. Rooms dynamically plan collaborative work; Workflows plan their own structured execution, not the overall project solution.
- Reduce duplicate discovery, unnecessary workers and repeated context. Pass compact task-specific decisions and evidence references rather than full predecessor transcripts. Preserve independent review, runtime-owned evidence, permissions, budgets and dynamic execution choices.
- Add per-project LOW/MED/HIGH model and thinking overrides. Unchanged tiers inherit global settings. Apply effective selections throughout owner, planning, research, worker, repair and model-based verification calls; retain explicit manual step overrides. Saved changes apply to future work at safe boundaries, while existing Rooms and Workflows retain their defaults and grant changes require approval. Do not introduce a separate permitted-model pool.
- Record correlated execution and usage across a whole Architect run, including supporting calls, failures, waits, retries and compactions. One run covers discovery through initial delivery; each later maintenance objective has its own run. Keep project-lifetime totals and identify incomplete historical data without inventing measurements.
- Open a visual run inspector from the Architect project menu. Use an expandable execution timeline, selected-activity details and linked cost/token charts, not extra metrics panels on the main project page.
- Make a `sero-prototype` an early implementation task. Require the user's explicit approval and reconcile the design, specs and tasks before production implementation. Prototype feedback can change the plan rather than merely its presentation.

## Capabilities

### New Capabilities

- `architect-model-overrides`: Project tier inheritance, selection propagation, provenance and authority-safe changes.
- `architect-run-observability`: Durable run correlation, complete-source accounting, timing semantics and a visual run inspector.

### Modified Capabilities

- `architect-resilience`: Outcome-led dynamic delegation, compact evidence-linked handoffs, avoidance of redundant worker roles and preservation of independent judgment.
- `architect-owner-session`: Compact authoritative wake contracts with access to omitted detail and reconstruction after compaction.
- `architect-ui`: Menu access to project model settings and run observability while preserving the quiet project page.
- `orchestrator-dispatch-handle`: Carry optional project execution context through typed creation without exposing new management authority or bypassing planners and grants.

## Impact

- Architect runtime, shared records/actions and UI in `plugins/sero-architect-plugin/`.
- Workflow and Room planning, execution, model resolution and usage reporting in `plugins/sero-orchestrator-plugin/`.
- Shared runtime contracts in `packages/common/`, host subagent and persistent-session event adapters in `apps/desktop/electron/`, and affected renderer/preload/IPC contracts where required. Shared package changes may require publication.
- An early styleguide prototype and its archive entry, then the existing Architect/Orchestrator user and reference documentation.
- Existing profile-local records and workspace dispatch records remain readable. New detailed telemetry stays outside the hot project index. No mandatory remote observability service or heavyweight toolchain change is proposed.
- No fixed agent pipeline, full-transcript propagation, autonomous approval, removal of independent verification, unrelated workspace changes or rewrite of general Sero orchestration. This stage creates planning artifacts only.

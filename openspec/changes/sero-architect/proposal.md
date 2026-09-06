## Why

Sero can run chats, Workflows, Rooms, and Goals, but the user still connects their results into a project and carries its intent between runs. Sero Architect will own that continuity from a high-level idea through research, decisions, delivery, and maintenance, while remaining open to the user's direction.

## What Changes

- Add a durable project record that preserves the original request and distinguishes user requirements, Architect decisions, assumptions, evidence, and unresolved questions.
- Give Architect a tool-using owner session that can investigate, choose the next useful action, delegate bounded work through existing execution modes, and examine the result. Plans can change as evidence arrives.
- Support an ongoing two-way relationship. The user can ask, challenge, reprioritize, redirect, pause, and resume. Acknowledged direction must change the affected plan and active work.
- Present a compact current state, useful result, required input, and a way to direct Architect. Routine events and granular agent activity remain in the relevant detail views.
- Build and review an interactive `sero-prototype` early. Use that review to settle the UI and refine runtime contracts before production implementation.
- Ask the user to create a dedicated clean Sero profile and provide its location before live Architect work. Use fresh trial workspaces so old memory, sessions, schedules, graphs, or workspace app state cannot influence the evaluation.
- Connect project work to granted host and plugin capabilities without widening a worker's authority or introducing a second model runtime.
- Separate reported completion, verification, acceptance, and confirmed delivery. Continue maintenance within the project's agreed scope, authority, and budget.
- Evaluate ownership with the user's unchanged dungeon-game prompt. Architect will choose the game's direction during the trial; these artifacts do not design it.

## Capabilities

### New Capabilities

- `architect-projects`: Durable project ownership, requirement and decision provenance, discovery, planning, and project continuity.
- `architect-interaction`: Two-way direction, useful attention requests, a minimal interface, and an early prototype review.
- `architect-execution`: Bounded delegation through Sero, capability access, budget accounting, steering reconciliation, and interruption recovery.
- `architect-delivery`: Evidence-based acceptance, confirmed release, bounded maintenance, and the first complete ownership trial.

### Modified Capabilities

None. The current main spec for programmatic tool calling remains unchanged. Architect must preserve its session-authority requirements if that tool is used.

## Impact

The proposed implementation extends Orchestrator with project-specific records and coordination. It also touches managed session resources, shared host contracts, project navigation, and relevant dashboard, Board, and remote links. Existing Workflows, Rooms, Goals, and ordinary chats remain independently usable.

Reuse host app-state, Pi sessions, Git and worktrees, verification, dev servers, browser capabilities, schedules, notifications, and plugin contributions. Memory supplies reusable context; Graphify supplies code relationships. Neither becomes the authoritative project record.

The first proof is a software project through delivery and a maintenance change. This does not define the product choices for that project or promise full unattended execution while Desktop is unavailable. Cross-workspace ownership remains part of the design; a distributed scheduler, a new plugin framework, and a replacement transcript store are outside this change.

This change creates planning artifacts only. Prototype creation is the first apply-stage deliverable. Production implementation follows the explicit prototype review recorded in `tasks.md`.
